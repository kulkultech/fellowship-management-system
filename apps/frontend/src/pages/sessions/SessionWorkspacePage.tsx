import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Video,
  Clock,
  ExternalLink,
  Users,
  CheckCircle2,
  FileText,
  FileCode,
  Loader2,
  X,
  PenTool,
  Eye,
  Copy,
  MessageSquare,
  Flag,
  RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DashboardLayout } from '@/components/DashboardLayout';
import { sessionService } from '@/services/sessionService';
import { useAuthStore } from '@/hooks/useAuthStore';
import {
  LiveCodeEditor,
  SupportedLanguage,
  LANGUAGE_SNIPPET_COLLECTIONS,
  SUPPORTED_LANGUAGES,
} from '@/components/sessions/LiveCodeEditor';
import {
  LOCAL_ORIGIN,
  REMOTE_ORIGIN,
  NOTES_TEXT_KEY,
  codeTextKey,
  uint8ToBase64,
  base64ToUint8,
  deterministicSeedUpdate,
  applyTextDiff,
  mapPositionThroughDelta,
} from '@/components/sessions/collab';
import { LiveWhiteboard } from '@/components/sessions/LiveWhiteboard';
import { SessionFeedbackPanel } from '@/components/sessions/SessionFeedbackPanel';
import { useSessionWorkspaceSocket, WorkspaceInitState, YjsTag } from '@/hooks/useSessionWorkspaceSocket';
import type { LogItem } from '@/components/sessions/codeRunners';
import type { AttendanceStatus } from '@/services/types';

const DEFAULT_SCRATCHPAD = `# Session Scratchpad & Key Takeaways\n\n- Topic: Microservices Architecture & Live Demos\n- Agenda:\n  1. Review distributed transactions & idempotency\n  2. Live coding session (Java backend & HTML/CSS/JS frontend)\n  3. Q&A and assignment brief\n\n### Important Links:\n- Class repo: https://github.com/kulkultech/fellowship-cohort\n- API Documentation: https://docs.fellowhire.org/api`;

// How often a browser that edited sends a compacted snapshot (and how long after the last one)
const SNAPSHOT_CHECK_MS = 2000;
const SNAPSHOT_MIN_INTERVAL_MS = 5000;

/** Keeps the newest version of each whiteboard element (Excalidraw's reconcile rule). */
function mergeWhiteboardElements(store: Map<string, any>, elements: any[]) {
  for (const el of elements) {
    if (!el?.id) continue;
    const existing = store.get(el.id);
    if (
      !existing ||
      el.version > existing.version ||
      (el.version === existing.version && el.versionNonce < existing.versionNonce)
    ) {
      store.set(el.id, el);
    }
  }
}

export const SessionWorkspacePage: React.FC = () => {
  const { orgSlug, programSlug, sessionId } = useParams<{
    orgSlug?: string;
    programSlug?: string;
    sessionId: string;
  }>();

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const isMentorOrAdmin =
    user?.role === 'mentor' || user?.role === 'org_admin' || user?.role === 'superadmin';

  // Active top navigation tab
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'editor' | 'whiteboard' | 'scratchpad' | 'feedback'>('whiteboard');
  // Live attendance drawer (for mentors)
  const [isAttendanceDrawerOpen, setIsAttendanceDrawerOpen] = useState<boolean>(false);
  // Shared document (Yjs) for the code editor and notes: concurrent edits merge instead of overwriting
  const ydocRef = useRef<Y.Doc | null>(null);
  if (!ydocRef.current) ydocRef.current = new Y.Doc();
  const ydoc = ydocRef.current;
  // Highest stored-update sequence seen per server instance; sent with snapshots for compaction
  const seenRef = useRef<Record<string, number>>({});
  const localEditsRef = useRef(false);
  const lastAckAtRef = useRef(0);
  const sendYjsUpdateRef = useRef<((update: string) => void) | null>(null);

  // Scratchpad notes (mirrors the shared notes text)
  const [scratchpadNotes, setScratchpadNotes] = useState<string>('');
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Whiteboard: every element seen so far, so the board can be rebuilt when its tab remounts
  const whiteboardStoreRef = useRef<Map<string, any>>(new Map());

  // Whiteboard sync state
  const [initialElements, setInitialElements] = useState<any[]>([]);
  const [initialAppState, setInitialAppState] = useState<any>(null);
  const [remoteWhiteboard, setRemoteWhiteboard] = useState<{
    elements: any[];
    appState?: any;
    sender?: { name: string; role: string };
  } | null>(null);

  // Code editor sync state
  const [initialLanguage, setInitialLanguage] = useState<SupportedLanguage>('java');
  const [remoteLanguageChange, setRemoteLanguageChange] = useState<{
    language: SupportedLanguage;
    sender?: { name: string; role: string };
  } | null>(null);
  const [remoteCodeRun, setRemoteCodeRun] = useState<{
    language: SupportedLanguage;
    logs: LogItem[];
    sender?: { name: string; role: string };
  } | null>(null);

  // Follow presenter mode: defaults to true for fellows/candidates, false for mentor
  const [followMentor, setFollowMentor] = useState<boolean>(!isMentorOrAdmin);

  const noteSeen = (tag?: YjsTag) => {
    if (!tag?.i) return;
    seenRef.current[tag.i] = Math.max(seenRef.current[tag.i] || 0, tag.s);
  };

  const docHasContent = (doc: Y.Doc) =>
    doc.getText(NOTES_TEXT_KEY).length > 0 ||
    SUPPORTED_LANGUAGES.some((l) => doc.getText(codeTextKey(l.id)).length > 0);

  // Applies stored workspace state from the server (on join, reconnect, or cross-instance sync)
  const applyServerState = useCallback(
    (state: WorkspaceInitState['state'] | undefined, isInitial: boolean) => {
      if (!state) return;
      const doc = ydocRef.current!;
      const hadContent = docHasContent(doc);
      const entries = state.yjs ?? [];
      for (const entry of entries) {
        Y.applyUpdate(doc, base64ToUint8(entry.u), REMOTE_ORIGIN);
        noteSeen(entry);
      }

      if (isInitial && entries.length === 0 && !hadContent) {
        // First use of this workspace: start from the saved plain text or the starter templates.
        // Seeds are deterministic, so browsers seeding at the same time end up with one copy.
        for (const lang of SUPPORTED_LANGUAGES) {
          const key = codeTextKey(lang.id);
          const content = state.code?.files?.[lang.id] || LANGUAGE_SNIPPET_COLLECTIONS[lang.id][0].code;
          if (doc.getText(key).length === 0) Y.applyUpdate(doc, deterministicSeedUpdate(key, content), 'seed');
        }
        if (doc.getText(NOTES_TEXT_KEY).length === 0) {
          Y.applyUpdate(doc, deterministicSeedUpdate(NOTES_TEXT_KEY, state.scratchpad || DEFAULT_SCRATCHPAD), 'seed');
        }
      } else if (isInitial && hadContent) {
        // Reconnected: send everything we have, in case edits were made while offline
        sendYjsUpdateRef.current?.(uint8ToBase64(Y.encodeStateAsUpdate(doc)));
      }

      const elements = state.whiteboard?.elements;
      if (elements && elements.length > 0) {
        mergeWhiteboardElements(whiteboardStoreRef.current, elements);
        setInitialElements(Array.from(whiteboardStoreRef.current.values()));
        setInitialAppState(state.whiteboard?.appState);
      }
      if (state.code?.language) {
        setInitialLanguage(state.code.language);
      }
    },
    []
  );

  // Real-time socket callbacks
  const handleInitState = useCallback(
    (data: WorkspaceInitState) => applyServerState(data.state, true),
    [applyServerState]
  );

  const handleStateSync = useCallback(
    (payload: { state: WorkspaceInitState['state'] }) => applyServerState(payload?.state, false),
    [applyServerState]
  );

  const handleYjsUpdate = useCallback((payload: { update: string; tag: YjsTag }) => {
    if (!payload?.update) return;
    Y.applyUpdate(ydocRef.current!, base64ToUint8(payload.update), REMOTE_ORIGIN);
    noteSeen(payload.tag);
  }, []);

  const handleYjsAck = useCallback((payload: { tag: YjsTag }) => {
    noteSeen(payload?.tag);
    lastAckAtRef.current = Date.now();
  }, []);

  const handleRemoteWhiteboardUpdate = useCallback(
    (payload: { elements: any[]; appState?: any }, sender: { id: string; name: string; role: string }) => {
      mergeWhiteboardElements(whiteboardStoreRef.current, payload.elements || []);
      setRemoteWhiteboard({
        elements: payload.elements,
        appState: payload.appState,
        sender,
      });
    },
    []
  );

  const handleRemoteLanguageChange = useCallback(
    (payload: { language: SupportedLanguage }, sender: { id: string; name: string; role: string }) => {
      setRemoteLanguageChange({
        language: payload.language,
        sender,
      });
    },
    []
  );

  const handleRemoteCodeRun = useCallback(
    (payload: { language: SupportedLanguage; logs: LogItem[] }, sender: { id: string; name: string; role: string }) => {
      setRemoteCodeRun({
        language: payload.language,
        logs: payload.logs,
        sender,
      });
    },
    []
  );

  const handleRemoteTabChange = useCallback(
    (payload: { tab: 'editor' | 'whiteboard' | 'scratchpad' }, sender: { id: string; name: string; role: string }) => {
      if (followMentor && (sender.role === 'mentor' || sender.role === 'org_admin' || sender.role === 'superadmin')) {
        // Don't pull a fellow away while they are writing feedback
        setActiveWorkspaceTab((current) => (current === 'feedback' ? current : payload.tab));
      }
    },
    [followMentor]
  );

  // A mentor ended or reopened the session: refresh it, and send fellows to the feedback tab
  const handleSessionStatus = useCallback(
    (payload: { ended_at?: string | null; ended_by_name?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['session-detail', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['session-feedback', sessionId] });
      if (payload.ended_at && !isMentorOrAdmin) {
        setActiveWorkspaceTab('feedback');
        toast.success(`${payload.ended_by_name || 'Your mentor'} ended the session. Please share your feedback.`);
      }
    },
    [queryClient, sessionId, isMentorOrAdmin]
  );

  // Hook for WebSocket real-time collaboration
  const {
    isConnected,
    participants,
    sendWhiteboardUpdate,
    sendLanguageChange,
    sendCodeRun,
    sendTabChange,
    sendYjsUpdate,
    sendYjsSnapshot,
  } = useSessionWorkspaceSocket({
    sessionId,
    onInitState: handleInitState,
    onWhiteboardUpdate: handleRemoteWhiteboardUpdate,
    onLanguageChange: handleRemoteLanguageChange,
    onCodeRun: handleRemoteCodeRun,
    onTabChange: handleRemoteTabChange,
    onYjsUpdate: handleYjsUpdate,
    onYjsAck: handleYjsAck,
    onStateSync: handleStateSync,
    onSessionStatus: handleSessionStatus,
  });
  sendYjsUpdateRef.current = sendYjsUpdate;

  // Broadcast this browser's edits to the shared document
  useEffect(() => {
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return;
      sendYjsUpdateRef.current?.(uint8ToBase64(update));
      localEditsRef.current = true;
    };
    ydoc.on('update', onUpdate);
    return () => ydoc.off('update', onUpdate);
  }, [ydoc]);

  // Periodically send a compacted snapshot (also stores readable text copies on the server)
  useEffect(() => {
    if (!isConnected) return;
    const timer = setInterval(() => {
      if (!localEditsRef.current || Date.now() - lastAckAtRef.current < SNAPSHOT_MIN_INTERVAL_MS) return;
      localEditsRef.current = false;
      lastAckAtRef.current = Date.now();
      const files: Record<string, string> = {};
      for (const lang of SUPPORTED_LANGUAGES) files[lang.id] = ydoc.getText(codeTextKey(lang.id)).toString();
      sendYjsSnapshot({
        update: uint8ToBase64(Y.encodeStateAsUpdate(ydoc)),
        seen: { ...seenRef.current },
        files,
        scratchpad: ydoc.getText(NOTES_TEXT_KEY).toString(),
      });
    }, SNAPSHOT_CHECK_MS);
    return () => clearInterval(timer);
  }, [isConnected, ydoc, sendYjsSnapshot]);

  // Mirror the shared notes into the textarea. Remote edits are written to the textarea right away
  // (not on the next render), so a keystroke is always diffed against what the user actually saw.
  useEffect(() => {
    const notes = ydoc.getText(NOTES_TEXT_KEY);
    const observer = (event: Y.YTextEvent, tx: Y.Transaction) => {
      const value = notes.toString();
      const textarea = notesTextareaRef.current;
      if (tx.origin !== LOCAL_ORIGIN && textarea && textarea.value !== value) {
        const focused = document.activeElement === textarea;
        const start = mapPositionThroughDelta(event.delta, textarea.selectionStart);
        const end = mapPositionThroughDelta(event.delta, textarea.selectionEnd);
        textarea.value = value;
        if (focused) textarea.setSelectionRange(start, end);
      }
      setScratchpadNotes(value);
    };
    setScratchpadNotes(notes.toString());
    notes.observe(observer);
    return () => notes.unobserve(observer);
  }, [ydoc]);


  // 1. Fetch Session Details
  const {
    data: session,
    isLoading: isLoadingSession,
    error: sessionError,
  } = useQuery({
    queryKey: ['session-detail', sessionId],
    queryFn: () => sessionService.getSessionDirect(sessionId!),
    enabled: Boolean(sessionId),
  });

  // Feedback opens only after a mentor ends the session
  const isSessionEnded = Boolean(session?.ended_at);
  useEffect(() => {
    if (session && !session.ended_at && activeWorkspaceTab === 'feedback') {
      setActiveWorkspaceTab('whiteboard');
    }
  }, [session, activeWorkspaceTab]);

  // Mentor self check-in (attendance) for this session
  const { data: mentorCheckIn } = useQuery({
    queryKey: ['mentor-check-in', sessionId],
    queryFn: () => sessionService.getMentorCheckIn(sessionId!),
    enabled: Boolean(sessionId) && isMentorOrAdmin,
    // Re-check every minute until recorded so the button opens on time
    refetchInterval: (query) => (query.state.data?.recorded ? false : 60_000),
  });
  const mentorCheckInMutation = useMutation({
    mutationFn: () => sessionService.mentorCheckIn(sessionId!),
    onSuccess: (state) => {
      queryClient.setQueryData(['mentor-check-in', sessionId], state);
      toast.success(state.status === 'late' ? 'Checked in (late)' : 'Checked in');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to check in'),
  });
  const formatClock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const endSessionMutation = useMutation({
    mutationFn: (end: boolean) => (end ? sessionService.endSession(sessionId!) : sessionService.reopenSession(sessionId!)),
    onSuccess: (updated, end) => {
      queryClient.setQueryData(['session-detail', sessionId], (old: any) => (old ? { ...old, ...updated } : updated));
      queryClient.invalidateQueries({ queryKey: ['session-feedback', sessionId] });
      if (end) {
        setActiveWorkspaceTab('feedback');
        toast.success('Session ended. Feedback is now open for fellows.');
      } else {
        toast.success('Session reopened');
      }
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to update the session'),
  });

  // Whiteboard snapshot from the session record, merged with anything already received live
  useEffect(() => {
    const elements = session?.workspace_state?.whiteboard?.elements;
    if (elements && elements.length > 0) {
      mergeWhiteboardElements(whiteboardStoreRef.current, elements);
      setInitialElements(Array.from(whiteboardStoreRef.current.values()));
      setInitialAppState(session?.workspace_state?.whiteboard?.appState);
    }
  }, [session]);

  // Rebuild the board from everything received whenever its tab is opened
  useEffect(() => {
    if (activeWorkspaceTab === 'whiteboard' && whiteboardStoreRef.current.size > 0) {
      setInitialElements(Array.from(whiteboardStoreRef.current.values()));
    }
  }, [activeWorkspaceTab]);

  // Tab switch handler
  const handleSelectTab = (tab: 'editor' | 'whiteboard' | 'scratchpad' | 'feedback') => {
    setActiveWorkspaceTab(tab);
    // Feedback is personal, so it is never shared with followers
    if (isMentorOrAdmin && tab !== 'feedback') {
      sendTabChange(tab);
    }
  };

  // Notes edits go into the shared text as minimal changes
  const handleScratchpadChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const notes = ydoc.getText(NOTES_TEXT_KEY);
    applyTextDiff(notes, notes.toString(), e.target.value);
  };

  // 2. Fetch Attendance (for mentors/admins)
  const {
    data: attendanceRoster = [],
    isLoading: isLoadingRoster,
  } = useQuery({
    queryKey: ['session-roster', session?.program_id, sessionId],
    queryFn: () =>
      session
        ? sessionService.getSessionAttendance(session.program_id, sessionId!)
        : Promise.resolve([]),
    enabled: Boolean(session && isMentorOrAdmin && isAttendanceDrawerOpen),
  });

  // Quick Attendance toggle mutation
  const updateAttendanceMutation = useMutation({
    mutationFn: ({
      applicantId,
      status,
      notes,
    }: {
      applicantId: string;
      status: AttendanceStatus;
      notes?: string;
    }) =>
      sessionService.batchUpdateAttendance(session!.program_id, sessionId!, {
        attendances: [{ applicant_id: applicantId, status, notes }],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-roster', session?.program_id, sessionId] });
      queryClient.invalidateQueries({ queryKey: ['session-detail', sessionId] });
      toast.success('Attendance updated');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update attendance');
    },
  });

  // Mark all present mutation
  const markAllPresentMutation = useMutation({
    mutationFn: () =>
      sessionService.batchUpdateAttendance(session!.program_id, sessionId!, {
        attendances: attendanceRoster.map((a) => ({
          applicant_id: a.applicant_id,
          status: 'present',
          notes: a.notes,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-roster', session?.program_id, sessionId] });
      toast.success('All fellows marked present');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update attendance');
    },
  });

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const backUrl = orgSlug && programSlug
    ? `/programs/${orgSlug}/${programSlug}/room`
    : user?.role === 'mentor'
    ? '/mentor/dashboard'
    : user?.role === 'superadmin'
    ? '/superadmin/dashboard'
    : user?.role === 'org_admin'
    ? '/admin/dashboard'
    : '/candidate/dashboard';

  const portalType =
    user?.role === 'mentor'
      ? 'mentor'
      : user?.role === 'superadmin'
      ? 'superadmin'
      : user?.role === 'org_admin'
      ? 'company_admin'
      : 'candidate';

  const roleLabel = (role: string) =>
    role === 'mentor' ? 'Mentor' : role === 'org_admin' || role === 'superadmin' ? 'Admin' : 'Fellow';

  // Left sidebar: who is currently in the workspace
  const renderParticipants = (isMinimized: boolean) => (
    <div className="space-y-3">
      <div className={`flex items-center justify-between px-1 ${isMinimized ? 'lg:hidden' : ''}`}>
        <span className="subsection-title">In this workspace</span>
        <span className="text-2xs font-bold text-slate-400">{participants.length}</span>
      </div>

      {participants.length === 0 ? (
        <p className={`px-1 meta-text ${isMinimized ? 'lg:hidden' : ''}`}>
          {isConnected ? 'Waiting for others to join…' : 'Connecting…'}
        </p>
      ) : (
        <ul className="space-y-1">
          {participants.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50 ${
                isMinimized ? 'lg:justify-center lg:px-0' : ''
              }`}
              title={`${p.name} (${roleLabel(p.role)})`}
            >
              <div className="relative shrink-0">
                <div
                  className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-white text-3xs font-extrabold"
                  style={p.avatar_color?.startsWith('#') ? { backgroundColor: p.avatar_color } : undefined}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
              </div>
              <div className={`min-w-0 ${isMinimized ? 'lg:hidden' : ''}`}>
                <div className="text-sm font-bold text-slate-900 truncate">
                  {p.name}
                  {user?.id && p.user_id === user.id && (
                    <span className="text-xs font-semibold text-slate-400"> (you)</span>
                  )}
                </div>
                <div className="meta-text">{roleLabel(p.role)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const renderLayout = (content: React.ReactNode, title?: string, subtitle?: string) => (
    <DashboardLayout
      portalType={portalType}
      title={title}
      subtitle={subtitle}
      companyName={user?.organization?.name}
      companyLogoUrl={user?.organization?.logo_url}
      candidateEmail={portalType === 'candidate' ? user?.email : undefined}
      navItems={[]}
      activeNavId=""
      onNavChange={() => {}}
      sidebarContent={renderParticipants}
    >
      {content}
    </DashboardLayout>
  );

  if (isLoadingSession) {
    return renderLayout(
      <div className="content-card p-12 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading live session workspace…</span>
      </div>
    );
  }

  if (sessionError || !session) {
    return renderLayout(
      <div className="content-card p-12 text-center space-y-3">
        <h2 className="section-title">Session not found</h2>
        <p className="text-xs text-slate-500">
          The requested fellowship session could not be retrieved or has expired.
        </p>
        <button type="button" onClick={() => navigate(backUrl)} className="btn btn-sm btn-outline">
          Return to Dashboard
        </button>
      </div>
    );
  }

  const workspaceTabs = [
    { key: 'whiteboard' as const, label: 'Whiteboard', icon: PenTool },
    { key: 'editor' as const, label: 'Code Studio', icon: FileCode },
    { key: 'scratchpad' as const, label: 'Scratchpad & Notes', icon: FileText },
    ...(isSessionEnded ? [{ key: 'feedback' as const, label: 'Feedback', icon: MessageSquare }] : []),
  ];

  return renderLayout(
    <>
      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* Center: whiteboard, code studio, and notes */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          <div className="flex items-center gap-1 flex-wrap">
            {workspaceTabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectTab(key)}
                className={`tab-pill ${activeWorkspaceTab === key ? 'tab-pill-active' : ''}`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {activeWorkspaceTab === 'editor' && (
            <LiveCodeEditor
              initialLanguage={initialLanguage}
              ydoc={ydoc}
              onLanguageChange={(lang) => {
                sendLanguageChange(lang);
              }}
              onCodeRun={(lang, logs) => {
                sendCodeRun(lang, logs);
              }}
              remoteLanguageChange={remoteLanguageChange}
              remoteCodeRun={remoteCodeRun}
            />
          )}

          {activeWorkspaceTab === 'whiteboard' && (
            <LiveWhiteboard
              sessionId={session.id}
              isMentor={isMentorOrAdmin}
              initialElements={initialElements}
              initialAppState={initialAppState}
              onElementsChange={(elements, appState) => {
                mergeWhiteboardElements(whiteboardStoreRef.current, elements);
                sendWhiteboardUpdate(elements, appState);
              }}
              remoteWhiteboardUpdate={remoteWhiteboard}
            />
          )}

          {activeWorkspaceTab === 'feedback' && <SessionFeedbackPanel sessionId={session.id} />}

          {activeWorkspaceTab === 'scratchpad' && (
            <div className="content-card space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(scratchpadNotes);
                    toast.success('Notes copied to clipboard');
                  }}
                  className="btn btn-sm btn-outline"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Notes</span>
                </button>
              </div>

              <textarea
                ref={notesTextareaRef}
                value={scratchpadNotes}
                onChange={handleScratchpadChange}
                rows={22}
                className="form-textarea bg-slate-50 rounded-2xl p-4 font-mono resize-none"
                placeholder="Type lecture notes, code snippets, or shared questions here..."
              />
            </div>
          )}
        </div>

        {/* Right: session details and actions */}
        <aside className="w-full xl:w-72 shrink-0 space-y-4 xl:sticky xl:top-28 order-first xl:order-none">
          <div className="content-card p-5 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="subsection-title">Session</span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}
                title={isConnected ? 'Live synced' : 'Connecting…'}
                aria-label={isConnected ? 'Live synced' : 'Connecting'}
              />
            </div>

            <dl className="space-y-3">
              <div>
                <dt className="meta-text font-medium">Type</dt>
                <dd className="text-xs font-bold text-slate-900 capitalize">
                  {session.session_type.replace('_', ' ')}
                </dd>
              </div>
              <div>
                <dt className="meta-text font-medium">Starts</dt>
                <dd className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {formatDateTime(session.start_time)}
                </dd>
              </div>
              {session.mentor_name && (
                <div>
                  <dt className="meta-text font-medium">Lead mentor</dt>
                  <dd className="text-xs font-bold text-slate-900">{session.mentor_name}</dd>
                </div>
              )}
              {session.ended_at && (
                <div>
                  <dt className="meta-text font-medium">Ended</dt>
                  <dd className="text-xs font-bold text-slate-900">
                    {formatDateTime(session.ended_at)}
                    {session.ended_by_name ? ` by ${session.ended_by_name}` : ''}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="content-card p-5 sm:p-5 space-y-2.5">
            {session.meeting_url && (
              <a
                href={session.meeting_url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-primary w-full"
                title="Open live video call"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Join Live Call</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {mentorCheckIn?.eligible &&
              (mentorCheckIn.recorded ? (
                <div
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold ${
                    mentorCheckIn.status === 'present'
                      ? 'text-emerald-700'
                      : mentorCheckIn.status === 'late'
                      ? 'text-amber-700'
                      : 'text-slate-600'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {mentorCheckIn.by_admin
                      ? `Attendance: ${(mentorCheckIn.status || '').charAt(0).toUpperCase()}${(mentorCheckIn.status || '').slice(1)} (set by an admin)`
                      : `Checked in${mentorCheckIn.status === 'late' ? ' late' : ''}${
                          mentorCheckIn.recorded_at ? ` at ${formatClock(mentorCheckIn.recorded_at)}` : ''
                        }`}
                  </span>
                </div>
              ) : mentorCheckIn.window_open ? (
                <button
                  type="button"
                  disabled={mentorCheckInMutation.isPending}
                  onClick={() => mentorCheckInMutation.mutate()}
                  className="btn btn-sm btn-success w-full"
                  title={`Present until ${formatClock(mentorCheckIn.late_after)}, late after that`}
                >
                  {mentorCheckInMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Check In</span>
                </button>
              ) : new Date(mentorCheckIn.opens_at).getTime() > Date.now() ? (
                <button type="button" disabled className="btn btn-sm btn-outline w-full">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Check-in opens at {formatClock(mentorCheckIn.opens_at)}</span>
                </button>
              ) : (
                <p className="meta-text text-center py-1">Check-in closed. Ask an admin to record your attendance.</p>
              ))}

            {isMentorOrAdmin && (
              <button
                type="button"
                onClick={() => setIsAttendanceDrawerOpen(true)}
                className="btn btn-sm btn-outline w-full"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Attendance</span>
              </button>
            )}

            {isMentorOrAdmin &&
              (isSessionEnded ? (
                <button
                  type="button"
                  disabled={endSessionMutation.isPending}
                  onClick={() => endSessionMutation.mutate(false)}
                  className="btn btn-sm btn-ghost w-full"
                  title="Undo ending the session; feedback closes until it is ended again"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reopen Session</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={endSessionMutation.isPending}
                  onClick={() => {
                    if (window.confirm('End this session? Fellows will be asked to give feedback.')) {
                      endSessionMutation.mutate(true);
                    }
                  }}
                  className="btn btn-sm btn-outline w-full"
                >
                  {endSessionMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
                  <span>End Session</span>
                </button>
              ))}

            <Link to={backUrl} className="btn btn-sm btn-outline w-full">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{orgSlug && programSlug ? 'Back to Program Room' : 'Back to Dashboard'}</span>
            </Link>

            {!isMentorOrAdmin && (
              <label className="flex items-center gap-2 pt-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={followMentor}
                  onChange={(e) => setFollowMentor(e.target.checked)}
                  className="rounded border-slate-300 text-kulkul-purple focus:ring-kulkul-purple w-4 h-4 cursor-pointer"
                />
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <span>Follow presenter view</span>
              </label>
            )}
          </div>
        </aside>
      </div>

      {/* Mentor In-Session Attendance Drawer */}
      {isAttendanceDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border-l border-slate-200 w-full max-w-xl h-full shadow-2xl flex flex-col justify-between p-6 space-y-4 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="section-header">
              <h3 className="section-title">Attendance</h3>
              <button
                type="button"
                onClick={() => setIsAttendanceDrawerOpen(false)}
                className="btn btn-icon-sm btn-ghost shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Actions */}
            <div className="panel-muted flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => markAllPresentMutation.mutate()}
                disabled={markAllPresentMutation.isPending}
                className="btn btn-sm btn-success"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark All Present</span>
              </button>
              <span className="text-xs font-bold text-slate-600">
                {attendanceRoster.filter((a) => a.status === 'present').length} / {attendanceRoster.length} Present
              </span>
            </div>

            {/* Roster Table */}
            <div className="data-table-wrap flex-1 overflow-y-auto">
              {isLoadingRoster ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <Loader2 className="w-7 h-7 animate-spin text-kulkul-purple" />
                  <span className="text-xs font-bold">Loading cohort roster...</span>
                </div>
              ) : attendanceRoster.length === 0 ? (
                <div className="py-20 text-center meta-text">
                  No accepted fellows found for this cohort.
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fellow</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceRoster.map((fellow) => (
                      <tr key={fellow.applicant_id} className="transition">
                        <td>
                          <div className="cell-primary">{fellow.fellow_name}</div>
                          {fellow.track_name && (
                            <div className="cell-secondary">{fellow.track_name}</div>
                          )}
                        </td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {(['present', 'late', 'absent', 'excused'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() =>
                                  updateAttendanceMutation.mutate({
                                    applicantId: fellow.applicant_id,
                                    status: st,
                                    notes: fellow.notes,
                                  })
                                }
                                className={`px-2.5 py-1 rounded-xl text-3xs font-extrabold uppercase tracking-wider transition ${
                                  fellow.status === st
                                    ? st === 'present'
                                      ? 'bg-emerald-600 text-white shadow-2xs'
                                      : st === 'late'
                                      ? 'bg-amber-500 text-white shadow-2xs'
                                      : st === 'absent'
                                      ? 'bg-rose-600 text-white shadow-2xs'
                                      : 'bg-slate-700 text-white shadow-2xs'
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>,
    session.title,
    session.description || undefined
  );
};
