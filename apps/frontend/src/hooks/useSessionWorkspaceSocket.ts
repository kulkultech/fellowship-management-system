import { useEffect, useRef, useState, useCallback } from 'react';
import type { SupportedLanguage } from '@/components/sessions/LiveCodeEditor';
import type { LogItem } from '@/components/sessions/codeRunners';

export interface WorkspaceParticipant {
  id: string;
  user_id: string;
  name: string;
  role: string;
  avatar_color: string;
  joined_at: string;
}

export interface WorkspaceInitState {
  my_id: string;
  state: {
    whiteboard?: {
      elements?: any[];
      appState?: any;
    };
    code?: {
      language: SupportedLanguage;
      files: Record<string, string>;
      last_logs?: LogItem[];
    };
    scratchpad?: string;
    /** Stored Yjs updates that rebuild the shared code and notes document */
    yjs?: YjsEntry[];
  };
  participants: WorkspaceParticipant[];
}

export interface YjsTag {
  i: string;
  s: number;
}

export interface YjsEntry extends YjsTag {
  u: string;
}

export interface UseSessionWorkspaceSocketProps {
  sessionId?: string;
  user?: {
    id?: string;
    name?: string;
    role?: string;
    email?: string;
  } | null;
  onInitState?: (data: WorkspaceInitState) => void;
  onWhiteboardUpdate?: (
    payload: { elements: any[]; appState?: any },
    sender: { id: string; name: string; role: string }
  ) => void;
  onCodeUpdate?: (
    payload: { language: SupportedLanguage; code: string },
    sender: { id: string; name: string; role: string }
  ) => void;
  onLanguageChange?: (
    payload: { language: SupportedLanguage },
    sender: { id: string; name: string; role: string }
  ) => void;
  onCodeRun?: (
    payload: { language: SupportedLanguage; logs: LogItem[] },
    sender: { id: string; name: string; role: string }
  ) => void;
  onScratchpadUpdate?: (
    payload: { notes: string },
    sender: { id: string; name: string; role: string }
  ) => void;
  onTabChange?: (
    payload: { tab: 'editor' | 'whiteboard' | 'scratchpad' },
    sender: { id: string; name: string; role: string }
  ) => void;
  /** A shared-document update from another participant */
  onYjsUpdate?: (payload: { update: string; tag: YjsTag }) => void;
  /** A stored snapshot was acknowledged; its tag marks updates everyone has */
  onYjsAck?: (payload: { tag: YjsTag }) => void;
  /** Newer state merged from another backend instance */
  onStateSync?: (payload: { state: WorkspaceInitState['state'] }) => void;
}

export function useSessionWorkspaceSocket({
  sessionId,
  onInitState,
  onWhiteboardUpdate,
  onCodeUpdate,
  onLanguageChange,
  onCodeRun,
  onScratchpadUpdate,
  onTabChange,
  onYjsUpdate,
  onYjsAck,
  onStateSync,
}: UseSessionWorkspaceSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [myClientId, setMyClientId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<WorkspaceParticipant[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // False once the page leaves the session, so an intentional close never triggers a reconnect
  const shouldReconnectRef = useRef(true);

  // Store latest callbacks in refs to avoid re-triggering connection on callback changes
  const callbacksRef = useRef({
    onInitState,
    onWhiteboardUpdate,
    onCodeUpdate,
    onLanguageChange,
    onCodeRun,
    onScratchpadUpdate,
    onTabChange,
    onYjsUpdate,
    onYjsAck,
    onStateSync,
  });

  useEffect(() => {
    callbacksRef.current = {
      onInitState,
      onWhiteboardUpdate,
      onCodeUpdate,
      onLanguageChange,
      onCodeRun,
      onScratchpadUpdate,
      onTabChange,
      onYjsUpdate,
      onYjsAck,
      onStateSync,
    };
  });

  const getWebSocketUrl = useCallback(() => {
    if (!sessionId) return '';

    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    let baseWs: string;

    if (/^https?:\/\//i.test(apiBase)) {
      baseWs = apiBase.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
    } else {
      const loc = window.location;
      const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      baseWs = `${proto}//${loc.host}${apiBase.startsWith('/') ? '' : '/'}${apiBase}`;
    }

    // Identity comes from the auth cookie sent with the WebSocket request
    return `${baseWs.replace(/\/+$/, '')}/sessions/${sessionId}/ws`;
  }, [sessionId]);

  const handleServerMessage = useCallback((msg: any) => {
    const sender = {
      id: msg.sender_id || '',
      name: msg.sender_name || '',
      role: msg.sender_role || '',
    };

    switch (msg.type) {
      case 'init_state': {
        const payload: WorkspaceInitState = msg.payload;
        if (payload?.my_id) {
          setMyClientId(payload.my_id);
        }
        if (payload?.participants) {
          setParticipants(payload.participants);
        }
        callbacksRef.current.onInitState?.(payload);
        break;
      }

      case 'participant_joined':
      case 'participant_left':
      case 'participants_update': {
        if (msg.payload?.participants) {
          setParticipants(msg.payload.participants);
        }
        break;
      }

      case 'whiteboard_update':
        callbacksRef.current.onWhiteboardUpdate?.(msg.payload, sender);
        break;
      case 'code_update':
        callbacksRef.current.onCodeUpdate?.(msg.payload, sender);
        break;
      case 'language_change':
        callbacksRef.current.onLanguageChange?.(msg.payload, sender);
        break;
      case 'code_run':
        callbacksRef.current.onCodeRun?.(msg.payload, sender);
        break;
      case 'scratchpad_update':
        callbacksRef.current.onScratchpadUpdate?.(msg.payload, sender);
        break;
      case 'tab_change':
        callbacksRef.current.onTabChange?.(msg.payload, sender);
        break;
      case 'yjs_update':
        callbacksRef.current.onYjsUpdate?.(msg.payload);
        break;
      case 'yjs_ack':
        callbacksRef.current.onYjsAck?.(msg.payload);
        break;
      case 'state_sync':
        callbacksRef.current.onStateSync?.(msg.payload);
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (!sessionId || typeof window === 'undefined') return;

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    const wsUrl = getWebSocketUrl();
    if (!wsUrl) return;

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        setLastSyncTime(new Date());
      };

      ws.onclose = () => {
        // Ignore sockets that were replaced or closed on purpose
        if (socketRef.current !== ws) return;
        setIsConnected(false);
        socketRef.current = null;
        if (!shouldReconnectRef.current) return;

        // Auto-reconnect with exponential backoff
        const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, timeout);
      };

      ws.onerror = () => {
        // Socket error handled by onclose
      };

      ws.onmessage = (event) => {
        setLastSyncTime(new Date());
        // The server batches queued messages into one frame, separated by newlines
        const lines = String(event.data).split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: any;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          handleServerMessage(msg);
        }
      };
    } catch {
      // connection error
    }
  }, [sessionId, getWebSocketUrl, handleServerMessage]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        const ws = socketRef.current;
        socketRef.current = null;
        ws.close();
      }
    };
  }, [connect]);

  // Send message helper
  const sendMessage = useCallback((type: string, payload: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type,
          payload,
        })
      );
      setLastSyncTime(new Date());
    }
  }, []);

  const sendWhiteboardUpdate = useCallback(
    (elements: any[], appState?: any) => {
      sendMessage('whiteboard_update', {
        elements,
        appState: appState
          ? {
              viewBackgroundColor: appState.viewBackgroundColor,
              theme: appState.theme,
            }
          : undefined,
      });
    },
    [sendMessage]
  );

  const sendCodeUpdate = useCallback(
    (language: SupportedLanguage, code: string) => {
      sendMessage('code_update', {
        language,
        code,
      });
    },
    [sendMessage]
  );

  const sendLanguageChange = useCallback(
    (language: SupportedLanguage) => {
      sendMessage('language_change', {
        language,
      });
    },
    [sendMessage]
  );

  const sendCodeRun = useCallback(
    (language: SupportedLanguage, logs: LogItem[]) => {
      sendMessage('code_run', {
        language,
        logs,
      });
    },
    [sendMessage]
  );

  const sendScratchpadUpdate = useCallback(
    (notes: string) => {
      sendMessage('scratchpad_update', {
        notes,
      });
    },
    [sendMessage]
  );

  const sendYjsUpdate = useCallback(
    (update: string) => {
      sendMessage('yjs_update', { update });
    },
    [sendMessage]
  );

  const sendYjsSnapshot = useCallback(
    (payload: { update: string; seen: Record<string, number>; files: Record<string, string>; scratchpad: string }) => {
      sendMessage('yjs_snapshot', payload);
    },
    [sendMessage]
  );

  const sendTabChange = useCallback(
    (tab: 'editor' | 'whiteboard' | 'scratchpad') => {
      sendMessage('tab_change', {
        tab,
      });
    },
    [sendMessage]
  );

  return {
    isConnected,
    myClientId,
    participants,
    lastSyncTime,
    sendWhiteboardUpdate,
    sendCodeUpdate,
    sendLanguageChange,
    sendCodeRun,
    sendScratchpadUpdate,
    sendTabChange,
    sendYjsUpdate,
    sendYjsSnapshot,
  };
}
