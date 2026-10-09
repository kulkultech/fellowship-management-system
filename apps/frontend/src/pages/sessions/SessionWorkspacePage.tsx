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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
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
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'editor' | 'whiteboard' | 'scratchpad'>('whiteboard');
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
        setActiveWorkspaceTab(payload.tab);
      }
    },
    [followMentor]
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
  const handleSelectTab = (tab: 'editor' | 'whiteboard' | 'scratchpad') => {
    setActiveWorkspaceTab(tab);
    if (isMentorOrAdmin) {
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

  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-kulkul-purple" />
            <span className="text-sm font-bold">Loading Live Session Workspace...</span>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-sm border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <X className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Session Not Found</h2>
            <p className="text-xs text-slate-500">
              The requested fellowship session could not be retrieved or has expired.
            </p>
            <button
              onClick={() => navigate(backUrl)}
              className="btn btn-sm btn-outline border-slate-300 text-slate-700 hover:bg-slate-100 font-bold"
            >
              Return to Dashboard
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            to={backUrl}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-kulkul-purple transition group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            <span>
              {orgSlug && programSlug ? 'Back to Program Room' : 'Back to Dashboard'}
            </span>
          </Link>
        </div>

        {/* Standardized Header Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-bold text-kulkul-purple bg-purple-50 px-3 py-1 rounded-full border border-purple-100 uppercase tracking-wider">
                {session.session_type.replace('_', ' ')}
              </span>
              <span className="text-slate-300">&bull;</span>
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-400" />
                {formatDateTime(session.start_time)}
              </span>
              {session.mentor_name && (
                <>
                  <span className="text-slate-300">&bull;</span>
                  <span className="text-xs font-medium text-slate-500">
                    Lead: <strong className="text-slate-900 font-bold">{session.mentor_name}</strong>
                  </span>
                </>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
              {session.title}
            </h1>

            {session.description && (
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                {session.description}
              </p>
            )}

            {/* Real-time Collaboration & Presence Status */}
            <div className="flex items-center gap-3 pt-1 flex-wrap">
              {isConnected ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Live Synced</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>Connecting...</span>
                </div>
              )}

              {participants.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1.5 overflow-hidden">
                    {participants.slice(0, 6).map((p) => (
                      <div
                        key={p.id}
                        className={`inline-block h-6 w-6 rounded-full ring-2 ring-white flex items-center justify-center text-white text-3xs font-black shadow-2xs ${
                          p.avatar_color || 'bg-slate-600'
                        }`}
                        title={`${p.name} (${p.role})`}
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                    ))}
                  </div>
                  <span className="text-2xs font-bold text-slate-500">
                    {participants.length} {participants.length === 1 ? 'member connected' : 'members connected'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            {session.meeting_url && (
              <a
                href={session.meeting_url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
                title="Open live video call"
              >
                <Video className="w-4 h-4" />
                <span>Join Live Call</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {isMentorOrAdmin && (
              <button
                type="button"
                onClick={() => setIsAttendanceDrawerOpen(true)}
                className="btn btn-sm btn-outline border-slate-300 text-slate-700 hover:bg-slate-50 font-bold flex items-center gap-1.5"
              >
                <Users className="w-4 h-4 text-slate-500" />
                <span>Attendance Roster</span>
              </button>
            )}
          </div>
        </div>

        {/* Standard Tab Navigation & Follow Presenter */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-1 flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleSelectTab('whiteboard')}
              className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 ${
                activeWorkspaceTab === 'whiteboard'
                  ? 'bg-kulkul-purple text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <PenTool className="w-4 h-4" />
              <span>Whiteboard</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('editor')}
              className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 ${
                activeWorkspaceTab === 'editor'
                  ? 'bg-kulkul-purple text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>Code Studio</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('scratchpad')}
              className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 ${
                activeWorkspaceTab === 'scratchpad'
                  ? 'bg-kulkul-purple text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Scratchpad &amp; Notes</span>
            </button>
          </div>

          {!isMentorOrAdmin && (
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none px-2 py-1 rounded-xl hover:bg-slate-100 transition">
              <input
                type="checkbox"
                checked={followMentor}
                onChange={(e) => setFollowMentor(e.target.checked)}
                className="rounded border-slate-300 text-kulkul-purple focus:ring-kulkul-purple w-4 h-4 cursor-pointer"
              />
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                Follow Presenter View
              </span>
            </label>
          )}
        </div>

        {/* Main Content Area */}
        {activeWorkspaceTab === 'editor' && (
          <div className="space-y-4">
            <LiveCodeEditor
              initialLanguage={initialLanguage}
              sessionTitle={session.title}
              ydoc={ydoc}
              onLanguageChange={(lang) => {
                sendLanguageChange(lang);
              }}
              onCodeRun={(lang, logs) => {
                sendCodeRun(lang, logs);
              }}
              remoteLanguageChange={remoteLanguageChange}
              remoteCodeRun={remoteCodeRun}
              isConnected={isConnected}
            />
          </div>
        )}

        {activeWorkspaceTab === 'whiteboard' && (
          <div className="space-y-4">
            <LiveWhiteboard
              sessionId={session.id}
              sessionTitle={session.title}
              isMentor={isMentorOrAdmin}
              initialElements={initialElements}
              initialAppState={initialAppState}
              onElementsChange={(elements, appState) => {
                mergeWhiteboardElements(whiteboardStoreRef.current, elements);
                sendWhiteboardUpdate(elements, appState);
              }}
              remoteWhiteboardUpdate={remoteWhiteboard}
              isConnected={isConnected}
            />
          </div>
        )}

        {activeWorkspaceTab === 'scratchpad' && (
          <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Live Session Scratchpad &amp; Lecture Notes</h3>
                <p className="text-xs text-slate-500">
                  Shared collaborative notes for class instructions, architecture diagrams, and homework references.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isConnected && (
                  <span className="inline-flex items-center gap-1 text-2xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Synced
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(scratchpadNotes);
                    toast.success('Notes copied to clipboard');
                  }}
                  className="btn btn-sm btn-outline border-slate-200 text-slate-700 hover:bg-slate-100 font-bold"
                >
                  Copy Notes
                </button>
              </div>
            </div>

            <textarea
              ref={notesTextareaRef}
              value={scratchpadNotes}
              onChange={handleScratchpadChange}
              rows={16}
              className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded-2xl p-4 font-mono text-xs focus:outline-none focus:border-kulkul-purple resize-none"
              placeholder="Type lecture notes, code snippets, or shared questions here..."
            />
          </div>
        )}
      </main>

      <Footer />

      {/* Mentor In-Session Attendance Drawer */}
      {isAttendanceDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border-l border-slate-200 w-full max-w-xl h-full shadow-2xl flex flex-col justify-between p-6 space-y-4 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Live Attendance Check Sheet
                </span>
                <h3 className="text-lg font-black text-slate-900">{session.title}</h3>
                <p className="text-xs text-slate-500">
                  Track and verify cohort participants directly during the workshop.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAttendanceDrawerOpen(false)}
                className="btn btn-sm btn-ghost btn-circle text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => markAllPresentMutation.mutate()}
                disabled={markAllPresentMutation.isPending}
                className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 shadow-2xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark All Present</span>
              </button>
              <span className="text-xs font-bold text-slate-600">
                {attendanceRoster.filter((a) => a.status === 'present').length} / {attendanceRoster.length} Present
              </span>
            </div>

            {/* Roster Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl bg-white">
              {isLoadingRoster ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <Loader2 className="w-7 h-7 animate-spin text-kulkul-purple" />
                  <span className="text-xs">Loading cohort roster...</span>
                </div>
              ) : attendanceRoster.length === 0 ? (
                <div className="py-20 text-center text-slate-400 text-xs">
                  No accepted fellows found for this cohort.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold">
                    <tr>
                      <th className="px-4 py-3">Fellow</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendanceRoster.map((fellow) => (
                      <tr key={fellow.applicant_id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{fellow.fellow_name}</div>
                          {fellow.track_name && (
                            <div className="text-2xs text-slate-500">{fellow.track_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
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
                                className={`btn btn-xs font-bold uppercase transition ${
                                  fellow.status === st
                                    ? st === 'present'
                                      ? 'bg-emerald-600 text-white'
                                      : st === 'late'
                                      ? 'bg-amber-500 text-white'
                                      : st === 'absent'
                                      ? 'bg-rose-600 text-white'
                                      : 'bg-slate-700 text-white'
                                    : 'btn-ghost text-slate-500 hover:bg-slate-100'
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

            {/* Drawer Footer */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsAttendanceDrawerOpen(false)}
                className="btn btn-sm btn-ghost text-slate-500 hover:text-slate-800"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
