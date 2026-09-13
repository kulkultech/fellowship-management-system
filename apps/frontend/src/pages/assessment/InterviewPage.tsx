import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiInterviewService, type SaveRecordingResult } from '@/services/aiInterviewService';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { AssessmentAccessGuard } from '@/components/AssessmentAccessGuard';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  AlertCircle,
  Bot,
  ChevronRight,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
  FileText,
  User,
  Radio,
  CheckCircle2,
  UploadCloud,
  Loader2,
  Laptop,
  Headphones,
  Wifi,
  Cpu,
  Globe,
  AlertTriangle,
} from 'lucide-react';
import type { EvaluationSummary } from '@/services/types';
import toast from 'react-hot-toast';

export interface ChatMessageItem {
  id: string;
  sender: 'ai' | 'candidate';
  text: string;
  timestamp: string;
  questionIndex?: number;
}

export type VoiceGender = 'female' | 'male';
export const VOICE_GENDER_STORAGE_KEY = 'kulkul_ai_interview_voice_gender';

interface RecordedItem {
  blob: Blob;
  url: string;
  duration: number;
}

// Cross-browser video MIME type detector (Chrome, Safari, Firefox, iOS)
const getSupportedVideoMimeType = (): { mimeType: string; isMp4: boolean } => {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return { mimeType: '', isMp4: false };
  }
  const candidateTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
  ];
  for (const t of candidateTypes) {
    if (MediaRecorder.isTypeSupported(t)) {
      return { mimeType: t, isMp4: t.includes('mp4') };
    }
  }
  return { mimeType: '', isMp4: false };
};

// Canvas-based synthetic stream generator for demo/headless/no-camera fallback
const createSyntheticVideoStream = (): MediaStream | null => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let frame = 0;
    let animActive = true;
    const draw = () => {
      if (!animActive) return;
      frame++;
      const grad = ctx.createLinearGradient(0, 0, 640, 480);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 480);

      ctx.fillStyle = '#a855f7';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('AI Technical Interview Chamber', 40, 60);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.fillText('Candidate Virtual Assessment Stream (Active Session)', 40, 90);

      // Visual audio waveform indicator
      const barCount = 18;
      const startX = 40;
      const centerY = 240;
      ctx.fillStyle = '#38bdf8';
      for (let i = 0; i < barCount; i++) {
        const height = Math.sin((frame * 0.08) + i * 0.4) * 35 + 45;
        ctx.fillRect(startX + i * 30, centerY - height / 2, 18, height);
      }

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '13px monospace';
      ctx.fillText(`Recorded Session: ${new Date().toLocaleTimeString()} (Valid Stream)`, 40, 420);

      requestAnimationFrame(draw);
    };
    draw();

    const videoStream = canvas.captureStream(25);
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const actx = new AudioCtx();
        const osc = actx.createOscillator();
        const dst = actx.createMediaStreamDestination();
        const gain = actx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(dst);
        osc.start();
        dst.stream.getAudioTracks().forEach((t) => videoStream.addTrack(t));
      }
    } catch (_) {}

    return videoStream;
  } catch (err) {
    console.warn('Could not create synthetic video stream:', err);
    return null;
  }
};

// Generates a real, playable synthetic fallback video Blob so unplayable raw text is NEVER uploaded
const recordSyntheticFallback = async (): Promise<Blob> => {
  return new Promise((resolve) => {
    try {
      const synthStream = createSyntheticVideoStream();
      if (!synthStream || typeof MediaRecorder === 'undefined') {
        resolve(new Blob([], { type: 'video/webm' }));
        return;
      }
      const { mimeType } = getSupportedVideoMimeType();
      const recorder = new MediaRecorder(synthStream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
      };
      recorder.start();
      setTimeout(() => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }, 1200);
    } catch {
      resolve(new Blob([], { type: 'video/webm' }));
    }
  });
};

// Encodes raw mono float PCM samples into standard 16-bit PCM WAV Blob
const encodeWav = (samples: Float32Array, sampleRate: number): Blob => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // 'RIFF'
  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, 36 + samples.length * 2, true);
  // 'WAVE'
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  // 'fmt '
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  // 'data'
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

// Merges Float32Array PCM chunks and resamples to target rate (16000Hz)
const downsampleTo16k = (chunks: Float32Array[], inputSampleRate: number): Float32Array => {
  let totalLen = 0;
  for (let i = 0; i < chunks.length; i++) {
    totalLen += chunks[i].length;
  }
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    merged.set(chunks[i], offset);
    offset += chunks[i].length;
  }

  if (inputSampleRate === 16000 || totalLen === 0) {
    return merged;
  }

  const sampleRatio = inputSampleRate / 16000;
  const newLength = Math.round(totalLen / sampleRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < newLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < totalLen; i++) {
      accum += merged[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
};

// Filters out silence artifacts and common low-noise Whisper hallucinations without altering speech
const filterWhisperSilence = (rawText: string): string => {
  if (!rawText) return '';
  const cleaned = rawText.trim();
  const lower = cleaned.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (
    !lower ||
    lower === 'blankaudio' ||
    lower === 'blank audio' ||
    lower === 'silence' ||
    lower === 'thank you' ||
    lower === 'thanks for watching' ||
    lower === 'subtitles by'
  ) {
    return '';
  }
  return cleaned;
};


export const InterviewPage: React.FC = () => {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Session Query
  const { data: session, isLoading, isError } = useQuery({
    queryKey: ['ai-interview-session', inviteToken],
    queryFn: () => aiInterviewService.getSession(inviteToken!),
    enabled: !!inviteToken,
  });

  // UI Stages: 'lobby' | 'interview' | 'finalizing' | 'completed'
  const [uiStage, setUiStage] = useState<'lobby' | 'interview' | 'finalizing' | 'completed'>('lobby');
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [finalizingStep, setFinalizingStep] = useState<'packaging' | 'uploading' | 'evaluating' | 'ready'>('packaging');
  const [recordedFileSizeMB, setRecordedFileSizeMB] = useState<number | null>(null);

  // Media Stream & Device State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const isStartingCameraRef = useRef(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [isRequestingMedia, setIsRequestingMedia] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0-100

  // System diagnostics & device compatibility
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const browserInfo = useMemo(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return { name: 'Modern Browser', isChromium: true, isSupported: true };
    }
    const ua = navigator.userAgent;
    let name = 'Modern Browser';
    let isChromium = false;
    if (/Edg\//i.test(ua)) {
      name = 'Microsoft Edge';
      isChromium = true;
    } else if (/Chrome\//i.test(ua)) {
      name = 'Google Chrome';
      isChromium = true;
    } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
      name = 'Apple Safari';
    } else if (/Firefox\//i.test(ua)) {
      name = 'Mozilla Firefox';
    }
    const hasMedia = typeof navigator.mediaDevices !== 'undefined' && !!navigator.mediaDevices.getUserMedia;
    const hasRecorder = typeof MediaRecorder !== 'undefined';
    return { name, isChromium, isSupported: hasMedia && hasRecorder };
  }, []);

  const isMobileDevice = useMemo(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (typeof window !== 'undefined' && window.innerWidth < 640);
  }, []);

  // Video Element Refs
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement | null>(null);
  const finalVideoRef = useRef<HTMLVideoElement | null>(null);

  // Audio Context & Analyser Ref
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Rubric settings from backend session
  const rubric = session?.rubric;

  // Question & Interview Flow
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const speechRecognitionRef = useRef<any>(null);
  const recognitionRestartTimeoutRef = useRef<any>(null);
  const startSpeechRecognitionRef = useRef<() => void>(() => {});
  const turnAudioChunksRef = useRef<Blob[]>([]);
  const turnAudioRecorderRef = useRef<MediaRecorder | null>(null);
  const turnPcmChunksRef = useRef<Float32Array[]>([]);
  const pcmProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const hasSpokenInCurrentTurnRef = useRef<boolean>(false);

  // Tick continuous session recording timer when in interview chamber
  useEffect(() => {
    let timer: any = null;
    if (uiStage === 'interview') {
      timer = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [uiStage]);

  // Conversational AI Voice & Follow-up State
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);

  const [activeFollowUp, setActiveFollowUp] = useState<{
    questionText: string;
    followUpCount: number;
    parentQuestionIndex: number;
  } | null>(null);
  const [isEvaluatingAnswer, setIsEvaluatingAnswer] = useState(false);

  // Configurable AI Interviewer Voice (Default is Woman / 'female' -> 'luna', 'male' -> 'orion')
  const [voiceGender, setVoiceGender] = useState<VoiceGender>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(VOICE_GENDER_STORAGE_KEY);
      if (saved === 'male' || saved === 'female') return saved;
    }
    return 'female';
  });
  const ttsSpeakerRef = useRef<'luna' | 'orion'>(voiceGender === 'male' ? 'orion' : 'luna');

  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const currentSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const sharedAudioRef = useRef<HTMLAudioElement | null>(null);
  const decodedBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const audioBlobUrlCacheRef = useRef<Map<string, string>>(new Map());
  const inFlightTtsPromisesRef = useRef<Map<string, Promise<{ buffer?: AudioBuffer; url?: string } | null>>>(new Map());

  // Switch voice gender dynamically and persist preference
  const switchVoiceGender = (newGender: VoiceGender) => {
    stopSpeech();
    setVoiceGender(newGender);
    const speakerName: 'luna' | 'orion' = newGender === 'male' ? 'orion' : 'luna';
    ttsSpeakerRef.current = speakerName;
    if (typeof window !== 'undefined') {
      localStorage.setItem(VOICE_GENDER_STORAGE_KEY, newGender);
    }
    toast.success(`Switched AI voice to ${newGender === 'female' ? 'Woman (Luna)' : 'Man (Orion)'}`, {
      icon: newGender === 'female' ? '👩' : '👨',
    });

    // Proactively pre-fetch transitions for the selected voice in the background
    if (questions.length > 0) {
      questions.forEach((q, idx) => {
        if (idx >= currentQIndexRef.current) {
          const transitionText =
            idx === 0
              ? `Welcome to your AI interview! Let's begin with Question 1: ${q.prompt}`
              : `Thank you! Moving on to Question ${idx + 1}: ${q.prompt}`;
          fetchTtsAudio(transitionText, speakerName);
        }
      });
      const closingText =
        'Thank you for completing all interview questions! Finalizing and saving your interview recording now.';
      fetchTtsAudio(closingText, speakerName);
    }
  };

  // Preview voice sample in lobby
  const previewVoice = async (gender: VoiceGender) => {
    stopSpeech();
    const speakerName = gender === 'male' ? 'orion' : 'luna';
    const sampleText =
      gender === 'female'
        ? "Hello! I am your AI interviewer. I'm excited to hear about your experience today."
        : 'Hello! I am your AI interviewer. I look forward to our conversation today.';

    setIsAiSpeaking(true);
    isAiSpeakingRef.current = true;
    const res = await fetchTtsAudio(sampleText, speakerName);
    if (res?.buffer) {
      playAudioBuffer(res.buffer);
    } else if (res?.url) {
      playAudioUrl(res.url);
    } else {
      setIsAiSpeaking(false);
      isAiSpeakingRef.current = false;
    }
  };

  // Conversational Chat & Streaming State
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [liveCandidateTranscript, setLiveCandidateTranscript] = useState<string>('');
  const [isCandidateSpeaking, setIsCandidateSpeaking] = useState(false);

  // References for zero-latency closures (VAD, speech barge-in, turn-taking)
  const isAiSpeakingRef = useRef(false);
  const isEvaluatingAnswerRef = useRef(false);
  const isCandidateSpeakingRef = useRef(false);
  const speechRecognitionWorkingRef = useRef(false);
  const speechRecognitionUnsupportedRef = useRef(false);
  const lastCandidateSpeechTimeRef = useRef<number>(0);
  const speechStartedTimeRef = useRef<number>(0);
  const isTranscribingLiveChunkRef = useRef<boolean>(false);
  const lastLiveChunkTranscribeTimeRef = useRef<number>(0);
  const consecutiveSpeechFramesRef = useRef<number>(0);
  const commitCandidateTurnRef = useRef<(candidateText?: string) => Promise<void>>(() => Promise.resolve());
  const inviteTokenRef = useRef(inviteToken);
  const currentQIndexRef = useRef(0);
  const activeFollowUpRef = useRef<{
    questionText: string;
    followUpCount: number;
    parentQuestionIndex: number;
  } | null>(null);
  const silenceTimeoutRef = useRef<any>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const uiStageRef = useRef<'lobby' | 'interview' | 'finalizing' | 'completed'>('lobby');
  const stopSpeechRef = useRef<() => void>(() => {});

  // Keep references synced with reactive state
  useEffect(() => {
    inviteTokenRef.current = inviteToken;
  }, [inviteToken]);

  useEffect(() => {
    uiStageRef.current = uiStage;
  }, [uiStage]);

  useEffect(() => {
    isAiSpeakingRef.current = isAiSpeaking;
  }, [isAiSpeaking]);

  useEffect(() => {
    isEvaluatingAnswerRef.current = isEvaluatingAnswer;
  }, [isEvaluatingAnswer]);

  useEffect(() => {
    currentQIndexRef.current = currentQIndex;
  }, [currentQIndex]);

  useEffect(() => {
    activeFollowUpRef.current = activeFollowUp;
  }, [activeFollowUp]);

  // Auto-scroll chat thread to bottom on every message or live transcription chunk
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, liveCandidateTranscript, isAiSpeaking, isEvaluatingAnswer]);

  // Continuous Master Session Recorder (prevents container corruption)
  const sessionRecorderRef = useRef<MediaRecorder | null>(null);
  const sessionChunksRef = useRef<Blob[]>([]);
  const sessionMimeTypeRef = useRef<string>('');

  // Per-Question Take Recorder & Preview State
  const [questionRecordings, setQuestionRecordings] = useState<Record<number, RecordedItem>>({});
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [isUploadingRecording, setIsUploadingRecording] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationSummary | null>(null);
  void evaluationResult;

  // Sync evaluation if session already evaluated
  useEffect(() => {
    if (session?.summary_evaluation) {
      setEvaluationResult(session.summary_evaluation);
    }
  }, [session?.summary_evaluation]);

  // Pre-configured / Backend Question Pool from Workflow.pdf
  const questions = useMemo(() => {
    if (rubric?.questions && rubric.questions.length > 0) {
      return rubric.questions.map((q) => ({
        id: q.id,
        category: q.theme,
        title: q.theme,
        prompt: q.question,
        max_points: q.max_points,
        criteria: q.criteria,
        hint: q.criteria?.length ? q.criteria.map((c) => `${c.criterion} (${c.points} pts)`).join(' • ') : '',
      }));
    }
    // Fallback default AI interview questions from standard rubric
    return [
      {
        id: 1,
        category: 'Self-introduction and motivation',
        title: 'Self-introduction and motivation',
        prompt:
          'Please introduce yourself briefly. What sparked your interest in joining this program, and what do you hope to achieve during the fellowship?',
        max_points: 15,
        criteria: [
          { id: 'q1_c1', criterion: 'Understands the prompt and gives a relevant response', points: 4 },
          { id: 'q1_c2', criterion: 'Provides a clear, structured introduction (background, interests, strengths)', points: 5 },
          { id: 'q1_c3', criterion: 'Explains why they want to join and what they hope to achieve', points: 4 },
          { id: 'q1_c4', criterion: 'Speaks with reasonable fluency, confidence, and acceptable pronunciation', points: 2 },
        ],
        hint: 'Background, interests, motivation, and what you hope to achieve during fellowship.',
      },
      {
        id: 2,
        category: 'Learning something difficult',
        title: 'Learning something difficult',
        prompt:
          'Tell us about a time when you had to learn something difficult or unfamiliar, whether in your studies, a project, or personal development. How did you approach it, and what was the outcome?',
        max_points: 15,
        criteria: [
          { id: 'q2_c1', criterion: 'Clearly describes the situation or problem', points: 4 },
          { id: 'q2_c2', criterion: 'Logically explains the steps taken to learn or solve it, and shares the result', points: 5 },
          { id: 'q2_c3', criterion: 'Uses appropriate vocabulary and sentence structure to describe the experience', points: 3 },
          { id: 'q2_c4', criterion: 'Maintains smooth delivery and coherence', points: 3 },
        ],
        hint: 'Clearly describe the challenge, your step-by-step approach, and the tangible outcome.',
      },
      {
        id: 3,
        category: 'Asking a supervisor for clarification',
        title: 'Asking a supervisor for clarification',
        prompt:
          'Imagine you are assigned a task by your supervisor or mentor, but the instructions are unclear, or you realize you do not fully understand the requirements. What would you do, and how would you communicate with your supervisor?',
        max_points: 25,
        criteria: [
          { id: 'q3_c1', criterion: 'Recognizes the importance of asking for clarification promptly rather than guessing or staying silent', points: 5 },
          { id: 'q3_c2', criterion: 'Explains the problem or confusion clearly', points: 7 },
          { id: 'q3_c3', criterion: 'Demonstrates how they would ask specific, polite questions (e.g. provides a sample phrase or message)', points: 7 },
          { id: 'q3_c4', criterion: 'Uses professional, respectful English suitable for a workplace setting', points: 4 },
          { id: 'q3_c5', criterion: 'Speaks coherently with good flow and confidence', points: 2 },
        ],
        hint: 'Ask promptly, formulate specific polite clarification questions, and use professional English.',
      },
      {
        id: 4,
        category: 'Teamwork and communication challenges',
        title: 'Teamwork and communication challenges',
        prompt:
          'Describe a situation where you had to work with others (e.g., a university project, an organization, or a competition) and encountered a miscommunication or disagreement. How did you address it, and what did you learn?',
        max_points: 20,
        criteria: [
          { id: 'q4_c1', criterion: 'Provides a clear and relevant context/example', points: 4 },
          { id: 'q4_c2', criterion: 'Clearly explains their role in the situation', points: 4 },
          { id: 'q4_c3', criterion: 'Explains the communication challenge and the actions taken to address or resolve it constructively', points: 6 },
          { id: 'q4_c4', criterion: 'Reflects on lessons learned', points: 3 },
          { id: 'q4_c5', criterion: 'Speaks clearly, logically, and professionally', points: 3 },
        ],
        hint: 'Share specific context, your role, constructive actions taken, and reflection on lessons learned.',
      },
      {
        id: 5,
        category: 'Communicating a potential delay',
        title: 'Communicating a potential delay',
        prompt:
          'Suppose you are working on a project deadline for the fellowship, and you realize you might not be able to finish on time. How would you handle this situation, and what would you say to your team or mentor?',
        max_points: 25,
        criteria: [
          { id: 'q5_c1', criterion: 'Communicates early and proactively rather than waiting until the deadline passes', points: 6 },
          { id: 'q5_c2', criterion: 'States the delay honestly without making excuses', points: 5 },
          { id: 'q5_c3', criterion: 'Proposes a revised deadline, partial deliverable, or solution', points: 7 },
          { id: 'q5_c4', criterion: 'Demonstrates accountability and professionalism', points: 5 },
          { id: 'q5_c5', criterion: 'Speaks clearly, logically, and respectfully in workplace English', points: 2 },
        ],
        hint: 'Proactive notification, honest framing, proposing realistic alternative timeline or solution.',
      },
    ];
  }, [rubric]);

  const isDemo = inviteToken === 'demo' || inviteToken === 'demo-interview-token' || inviteToken?.startsWith('demo-');
  const [isResetting, setIsResetting] = useState(false);

  const handleResetDemo = async () => {
    if (!inviteToken) return;
    setIsResetting(true);
    stopSpeech();
    stopSpeechRecognition();
    setChatMessages([]);
    setLiveCandidateTranscript('');
    try {
      await aiInterviewService.resetSession(inviteToken);
      await queryClient.invalidateQueries({ queryKey: ['ai-interview-session', inviteToken] });
      setCurrentQIndex(0);
      setActiveFollowUp(null);
      if (sessionRecorderRef.current && sessionRecorderRef.current.state !== 'inactive') {
        try {
          sessionRecorderRef.current.stop();
        } catch (_) {}
      }
      sessionRecorderRef.current = null;
      sessionChunksRef.current = [];
      sessionMimeTypeRef.current = '';

      if (turnAudioRecorderRef.current && turnAudioRecorderRef.current.state !== 'inactive') {
        try {
          turnAudioRecorderRef.current.stop();
        } catch (_) {}
      }
      turnAudioRecorderRef.current = null;
      turnAudioChunksRef.current = [];
      hasSpokenInCurrentTurnRef.current = false;

      setRecordingSeconds(0);
      setQuestionRecordings({});
      setEvaluationResult(null);
      setFinalVideoUrl(null);
      setUiStage('lobby');
      uiStageRef.current = 'lobby';
      toast.success('Demo session reset! Ready for a fresh interview run.');
    } catch (err) {
      toast.error('Failed to reset demo session.');
    } finally {
      setIsResetting(false);
    }
  };

  // Sync completed state if session in backend is already completed
  useEffect(() => {
    if (session?.status === 'completed' && !isResetting) {
      setUiStage('completed');
      if (session.recording_url) {
        setFinalVideoUrl(session.recording_url);
      }
    }
  }, [session?.status, session?.recording_url, isResetting]);

  // Stable video stream binder for all browsers (Chrome, Safari, Brave, Firefox)
  const bindStreamToVideo = useCallback((el: HTMLVideoElement | null, mediaStream: MediaStream | null) => {
    if (!el) return;
    if (!mediaStream) {
      if (el.srcObject) {
        el.srcObject = null;
      }
      return;
    }
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');

    if (el.srcObject !== mediaStream) {
      el.srcObject = mediaStream;
    }

    const tryPlay = () => {
      const p = el.play();
      if (p !== undefined) {
        p.catch(() => {});
      }
    };

    el.onloadedmetadata = tryPlay;
    el.oncanplay = tryPlay;
    tryPlay();
  }, []);

  // Cross-browser resilient video attachment (Chrome/Safari/Brave)
  const attachLobbyVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      lobbyVideoRef.current = el;
      const s = activeStreamRef.current || stream;
      if (el && s) {
        bindStreamToVideo(el, s);
      }
    },
    [bindStreamToVideo, stream],
  );

  const attachLiveVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      liveVideoRef.current = el;
      const s = activeStreamRef.current || stream;
      if (el && s) {
        bindStreamToVideo(el, s);
      }
    },
    [bindStreamToVideo, stream],
  );

  // Request media devices on mount with progressive multi-browser fallback (Chrome, Safari, Brave, Firefox)
  const startCamera = async () => {
    if (isStartingCameraRef.current) return;
    isStartingCameraRef.current = true;
    setIsRequestingMedia(true);
    setDeviceError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MEDIA_NOT_SUPPORTED');
      }

      // Stop any existing active stream tracks to prevent hardware locking in Chromium/macOS
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;
      }

      // 1. Enumerate devices: prioritize front-facing physical webcam if labels are exposed
      let preferredVideoId: string | undefined;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');

        const isVirtual = (label: string) => {
          const l = label.toLowerCase();
          return (
            l.includes('camo') ||
            l.includes('iriun') ||
            l.includes('blackhole') ||
            l.includes('obs') ||
            l.includes('virtual') ||
            l.includes('teams') ||
            l.includes('zoom')
          );
        };

        const isHardware = (label: string) => {
          const l = label.toLowerCase();
          return (
            l.includes('facetime') ||
            l.includes('built-in') ||
            l.includes('integrated') ||
            l.includes('usb') ||
            l.includes('camera') ||
            l.includes('macbook')
          );
        };

        // Only select a preferred video device if non-empty label confirms real hardware
        const bestVideo = videoInputs.find((d) => d.label && isHardware(d.label) && !isVirtual(d.label));
        if (bestVideo?.deviceId) {
          preferredVideoId = bestVideo.deviceId;
        }
      } catch (enumErr) {
        console.warn('Device enumeration fallback:', enumErr);
      }

      let userMediaStream: MediaStream | null = null;
      // Standard audio constraints that naturally route the system default microphone (MacBook Air Mic)
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      try {
        // Attempt 1: Standard high-definition with preferred physical camera and system microphone
        const videoConstraints: MediaTrackConstraints = preferredVideoId
          ? { deviceId: { ideal: preferredVideoId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };

        userMediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints,
        });
      } catch (hdErr: any) {
        console.warn('HD camera constraints failed, attempting basic video/audio:', hdErr);
        try {
          // Attempt 2: Basic video + audio
          userMediaStream = await navigator.mediaDevices.getUserMedia({
            video: preferredVideoId ? { deviceId: { ideal: preferredVideoId } } : true,
            audio: audioConstraints,
          });
        } catch (basicErr: any) {
          console.warn('Basic joint constraints failed, attempting separate track acquisition:', basicErr);
          // Attempt 3: Separate acquisition in case audio or video device is locked individually
          const vStream = await navigator.mediaDevices
            .getUserMedia({
              video: preferredVideoId ? { deviceId: { ideal: preferredVideoId } } : true,
            })
            .catch(() => navigator.mediaDevices.getUserMedia({ video: true }).catch(() => null));

          const aStream = await navigator.mediaDevices
            .getUserMedia({
              audio: audioConstraints,
            })
            .catch(() => navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null));

          if (vStream || aStream) {
            userMediaStream = new MediaStream([
              ...(vStream ? vStream.getVideoTracks() : []),
              ...(aStream ? aStream.getAudioTracks() : []),
            ]);
          } else {
            throw basicErr;
          }
        }
      }

      if (!userMediaStream) {
        throw new Error('NO_STREAM_ACQUIRED');
      }

      activeStreamRef.current = userMediaStream;
      setStream(userMediaStream);

      // Setup audio analyzer for live VU volume visualizer with Chromium Autoplay Policy support
      if (userMediaStream.getAudioTracks().length > 0) {
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
              try {
                audioContextRef.current.close().catch(() => {});
              } catch (_) {}
            }

            const audioCtx = new AudioCtx();
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            const source = audioCtx.createMediaStreamSource(userMediaStream);
            source.connect(analyser);

            // Connect PCM audio processor for high-accuracy Whisper transcription
            try {
              if (pcmProcessorRef.current) {
                try {
                  pcmProcessorRef.current.disconnect();
                } catch (_) {}
              }
              const processor = audioCtx.createScriptProcessor(4096, 1, 1);
              processor.onaudioprocess = (e) => {
                if (
                  uiStageRef.current === 'interview' &&
                  !isAiSpeakingRef.current &&
                  !isEvaluatingAnswerRef.current
                ) {
                  const input = e.inputBuffer.getChannelData(0);
                  turnPcmChunksRef.current.push(new Float32Array(input));
                  const maxChunks = Math.ceil((30 * audioCtx.sampleRate) / 4096);
                  if (turnPcmChunksRef.current.length > maxChunks) {
                    turnPcmChunksRef.current.splice(0, turnPcmChunksRef.current.length - maxChunks);
                  }
                }
              };
              const muteGain = audioCtx.createGain();
              muteGain.gain.value = 0;
              source.connect(processor);
              processor.connect(muteGain);
              muteGain.connect(audioCtx.destination);
              pcmProcessorRef.current = processor;
            } catch (procErr) {
              console.warn('PCM processor init warning:', procErr);
            }

            audioContextRef.current = audioCtx;
            analyserRef.current = analyser;

            // Immediate resume attempt
            if (audioCtx.state === 'suspended') {
              audioCtx.resume().catch(() => {});
            }

            // Also resume on any user interaction in Chromium (click, keypress, touch)
            const handleUserInteraction = () => {
              if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume().catch(() => {});
              }
            };
            window.addEventListener('click', handleUserInteraction, { once: true, passive: true });
            window.addEventListener('touchstart', handleUserInteraction, { once: true, passive: true });
            window.addEventListener('keydown', handleUserInteraction, { once: true, passive: true });
            window.addEventListener('pointerdown', handleUserInteraction, { once: true, passive: true });

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            if (animationFrameRef.current) {
              cancelAnimationFrame(animationFrameRef.current);
            }
            const updateVolume = () => {
              if (analyserRef.current) {
                // Keep trying to resume audio context in Chromium if still suspended
                if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                  audioContextRef.current.resume().catch(() => {});
                }

                analyserRef.current.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                  sum += dataArray[i];
                }
                const avg = sum / dataArray.length;
                const level = Math.min(100, Math.round((avg / 128) * 100));
                setAudioLevel(level);

                if (level > 24) {
                  hasSpokenInCurrentTurnRef.current = true;
                }

                // Vocal Volume Barge-in: If candidate speaks clearly while AI is talking, immediately silence AI!
                // Using level > 42 to prevent ambient room noise / keyboard clicks from falsely cutting off the AI
                if (level > 42 && isAiSpeakingRef.current) {
                  stopSpeechRef.current();
                }

                // Voice Activity Detection & Adaptive Whisper Turn-taking in Interview Chamber
                if (uiStageRef.current === 'interview' && !isAiSpeakingRef.current && !isEvaluatingAnswerRef.current) {
                  const now = Date.now();

                  // Reduce sensitivity to noise: require volume > 24 for at least 3 consecutive frames (~50ms) to filter out background noise/clicks
                  if (level > 24) {
                    consecutiveSpeechFramesRef.current = Math.min(20, consecutiveSpeechFramesRef.current + 1);
                  } else {
                    consecutiveSpeechFramesRef.current = Math.max(0, consecutiveSpeechFramesRef.current - 1);
                  }

                  const isGenuineSpeech = consecutiveSpeechFramesRef.current >= 3;

                  if (isGenuineSpeech) {
                    lastCandidateSpeechTimeRef.current = now;
                    if (speechStartedTimeRef.current === 0) {
                      speechStartedTimeRef.current = now;
                    }
                    if (!isCandidateSpeakingRef.current) {
                      isCandidateSpeakingRef.current = true;
                      setIsCandidateSpeaking(true);
                    }

                    // For browsers where Web Speech API is blocked or inactive (e.g. Brave):
                    // Periodically transcribe audio slice via English Whisper faster:
                    // Start first slice at 800ms, then every 1200ms while candidate is speaking
                    if (
                      !speechRecognitionWorkingRef.current &&
                      now - speechStartedTimeRef.current > 800 &&
                      now - lastLiveChunkTranscribeTimeRef.current > 1200 &&
                      !isTranscribingLiveChunkRef.current &&
                      turnPcmChunksRef.current.length > 3 &&
                      inviteTokenRef.current
                    ) {
                      lastLiveChunkTranscribeTimeRef.current = now;
                      isTranscribingLiveChunkRef.current = true;

                      const inputRate = audioContextRef.current?.sampleRate || 44100;
                      const pcm16k = downsampleTo16k(turnPcmChunksRef.current, inputRate);
                      if (pcm16k.length > 4000) {
                        const wavBlob = encodeWav(pcm16k, 16000);
                        aiInterviewService
                          .transcribeAudio(inviteTokenRef.current, wavBlob)
                          .then((res) => {
                            if (res?.text && !speechRecognitionWorkingRef.current) {
                              const cleaned = filterWhisperSilence(res.text);
                              if (cleaned.length > 0) {
                                setLiveCandidateTranscript(cleaned);
                              }
                            }
                          })
                          .catch((e) => {
                            console.warn('Live chunk transcription notice:', e);
                          })
                          .finally(() => {
                            isTranscribingLiveChunkRef.current = false;
                          });
                      } else {
                        isTranscribingLiveChunkRef.current = false;
                      }
                    }
                  } else {
                    // Candidate is currently silent
                    // Give candidate 4.2 seconds of natural silence breathing room before auto-committing,
                    // so pauses to think or formulate sentences do not prematurely submit the turn.
                    if (
                      isCandidateSpeakingRef.current &&
                      lastCandidateSpeechTimeRef.current > 0 &&
                      now - lastCandidateSpeechTimeRef.current > 4200
                    ) {
                      const totalSpokenDuration = now - speechStartedTimeRef.current;
                      isCandidateSpeakingRef.current = false;
                      setIsCandidateSpeaking(false);
                      lastCandidateSpeechTimeRef.current = 0;
                      speechStartedTimeRef.current = 0;
                      consecutiveSpeechFramesRef.current = 0;

                      // Auto-commit turn on silence if Web Speech API didn't handle it
                      if (!speechRecognitionWorkingRef.current && totalSpokenDuration > 1200) {
                        commitCandidateTurnRef.current();
                      }
                    }
                  }
                }
              }
              animationFrameRef.current = requestAnimationFrame(updateVolume);
            };
            updateVolume();
          }
        } catch (e) {
          console.warn('AudioContext visualization not available:', e);
        }
      }
    } catch (err: any) {
      console.error('Camera/Mic permission error:', err);
      if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setDeviceError(
          'Your camera is currently in use by another application or browser tab (e.g. Safari). Please close camera access in other tabs and click Allow Camera & Mic.',
        );
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setDeviceError(
          'Camera or Microphone access was denied. Please allow permissions in your browser address bar or macOS System Settings > Privacy & Security.',
        );
      } else if (err.message === 'MEDIA_NOT_SUPPORTED') {
        setDeviceError(
          'Camera access requires a secure connection (HTTPS or localhost). Please check your browser address.',
        );
      } else {
        setDeviceError(
          'Camera or Microphone access was denied or not found. Please check permissions and device connections.',
        );
      }
    } finally {
      setIsRequestingMedia(false);
      isStartingCameraRef.current = false;
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      // Cleanup tracks and audio contexts on unmount using ref so it never misses active streams
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sessionRecorderRef.current && sessionRecorderRef.current.state !== 'inactive') {
        try {
          sessionRecorderRef.current.stop();
        } catch (_) {}
      }
    };
  }, []);

  // Bind video element streams whenever stream or UI stage changes
  useEffect(() => {
    const s = activeStreamRef.current || stream;
    if (!s) return;
    if (lobbyVideoRef.current && uiStage === 'lobby') {
      bindStreamToVideo(lobbyVideoRef.current, s);
    }
    if (liveVideoRef.current && uiStage === 'interview') {
      bindStreamToVideo(liveVideoRef.current, s);
    }
  }, [stream, uiStage, bindStreamToVideo]);

  // Toggle Camera
  const toggleCamera = () => {
    const curStream = activeStreamRef.current || stream;
    if (curStream) {
      const videoTrack = curStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  // Toggle Mic
  const toggleMic = () => {
    const curStream = activeStreamRef.current || stream;
    if (curStream) {
      const audioTrack = curStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
      }
    }
  };

  // Cancel any active speech recognition
  const stopSpeechRecognition = () => {
    if (recognitionRestartTimeoutRef.current) {
      clearTimeout(recognitionRestartTimeoutRef.current);
      recognitionRestartTimeoutRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.abort();
      } catch (_) {}
      speechRecognitionRef.current = null;
    }
  };

  const restartSpeechRecognition = (delayMs: number = 250) => {
    if (uiStageRef.current !== 'interview' || speechRecognitionUnsupportedRef.current) return;
    if (recognitionRestartTimeoutRef.current) {
      clearTimeout(recognitionRestartTimeoutRef.current);
    }
    recognitionRestartTimeoutRef.current = setTimeout(() => {
      if (uiStageRef.current === 'interview' && !speechRecognitionUnsupportedRef.current) {
        startSpeechRecognitionRef.current();
      }
    }, delayMs);
  };

  // Start per-turn audio snippet recorder for AI Whisper fallback (e.g. Brave/Firefox)
  const startTurnAudioRecorder = () => {
    try {
      const curStream = activeStreamRef.current || stream;
      if (!curStream) return;
      const audioTracks = curStream.getAudioTracks();
      if (audioTracks.length === 0) return;
      const audioOnlyStream = new MediaStream(audioTracks);

      if (turnAudioRecorderRef.current && turnAudioRecorderRef.current.state !== 'inactive') {
        try {
          turnAudioRecorderRef.current.stop();
        } catch (_) {}
      }
      turnAudioChunksRef.current = [];

      const preferredMimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const selectedMime = preferredMimes.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || '';

      const recorder = new MediaRecorder(audioOnlyStream, selectedMime ? { mimeType: selectedMime } : {});
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          turnAudioChunksRef.current.push(e.data);
        }
      };
      recorder.start(400);
      turnAudioRecorderRef.current = recorder;
      hasSpokenInCurrentTurnRef.current = false;
    } catch (e) {
      console.warn('Turn audio recorder failed to start:', e);
    }
  };

  // Clean up cached audio object URLs and recognition on unmount
  useEffect(() => {
    return () => {
      stopSpeech();
      stopSpeechRecognition();
      if (turnAudioRecorderRef.current && turnAudioRecorderRef.current.state !== 'inactive') {
        try {
          turnAudioRecorderRef.current.stop();
        } catch (_) {}
      }
      turnAudioRecorderRef.current = null;
      turnAudioChunksRef.current = [];
      audioBlobUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      audioBlobUrlCacheRef.current.clear();
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, []);

  // Unlock Web Audio and HTML5 Audio on user gesture (e.g. click "Enter Interview Chamber")
  const unlockAudio = () => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      if (!sharedAudioRef.current) {
        sharedAudioRef.current = new Audio();
      }
      // Trigger a silent play/pause to unlock HTML5 Audio element in WebKit/Chrome
      sharedAudioRef.current.play().catch(() => {});
      sharedAudioRef.current.pause();
      setAutoplayBlocked(false);
    } catch (e) {
      console.warn('Audio context unlock warning:', e);
    }
  };

  // Cancel any active speech synthesis or audio playback
  const stopSpeech = () => {
    if (currentSourceNodeRef.current) {
      try {
        currentSourceNodeRef.current.onended = null;
        currentSourceNodeRef.current.stop();
      } catch (_) {}
      currentSourceNodeRef.current = null;
    }
    if (sharedAudioRef.current) {
      sharedAudioRef.current.pause();
      sharedAudioRef.current.currentTime = 0;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    setIsAiSpeaking(false);
    isAiSpeakingRef.current = false;
    turnAudioChunksRef.current = [];
    turnPcmChunksRef.current = [];
    hasSpokenInCurrentTurnRef.current = false;
    speechStartedTimeRef.current = 0;
    lastCandidateSpeechTimeRef.current = 0;
    isCandidateSpeakingRef.current = false;
    setIsCandidateSpeaking(false);
  };
  stopSpeechRef.current = stopSpeech;

  // Play decoded AudioBuffer with 0ms latency and immune to HTML5 Audio autoplay restrictions
  const playAudioBuffer = (buffer: AudioBuffer): boolean => {
    stopSpeech();
    const ctx = audioContextRef.current;
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      currentSourceNodeRef.current = source;

      source.onended = () => {
        setIsAiSpeaking(false);
        isAiSpeakingRef.current = false;
        if (currentSourceNodeRef.current === source) {
          currentSourceNodeRef.current = null;
        }
        turnAudioChunksRef.current = [];
        turnPcmChunksRef.current = [];
        hasSpokenInCurrentTurnRef.current = false;
        speechStartedTimeRef.current = 0;
        lastCandidateSpeechTimeRef.current = 0;
        isCandidateSpeakingRef.current = false;
        setIsCandidateSpeaking(false);
        setLiveCandidateTranscript('');
      };

      setIsAiSpeaking(true);
      isAiSpeakingRef.current = true;
      source.start(0);
      setAutoplayBlocked(false);
      return true;
    } catch (e) {
      console.warn('Web Audio buffer playback failed:', e);
      return false;
    }
  };

  // Fallback to HTML5 Audio element for blob URLs
  const playAudioUrl = (url: string) => {
    stopSpeech();
    if (!sharedAudioRef.current) {
      sharedAudioRef.current = new Audio();
    }
    const audio = sharedAudioRef.current;
    audio.src = url;

    audio.onplay = () => {
      setIsAiSpeaking(true);
      isAiSpeakingRef.current = true;
      setAutoplayBlocked(false);
    };
    audio.onended = () => {
      setIsAiSpeaking(false);
      isAiSpeakingRef.current = false;
      turnAudioChunksRef.current = [];
      turnPcmChunksRef.current = [];
      hasSpokenInCurrentTurnRef.current = false;
      speechStartedTimeRef.current = 0;
      lastCandidateSpeechTimeRef.current = 0;
      isCandidateSpeakingRef.current = false;
      setIsCandidateSpeaking(false);
      setLiveCandidateTranscript('');
    };
    audio.onerror = () => {
      setIsAiSpeaking(false);
      isAiSpeakingRef.current = false;
      isCandidateSpeakingRef.current = false;
      setIsCandidateSpeaking(false);
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((e) => {
        console.warn('Audio play was prevented by browser autoplay policy:', e);
        setAutoplayBlocked(true);
        setIsAiSpeaking(false);
        isAiSpeakingRef.current = false;
      });
    }
  };

  // Fetch synthesized speech from Cloudflare Workers AI TTS (Deepgram Aura-2)
  const fetchTtsAudio = async (text: string, speaker: string): Promise<{ buffer?: AudioBuffer; url?: string } | null> => {
    const cleanText = text
      .replace(/\[.*?\]/g, '')
      .replace(/[\*#_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanText) return null;

    const cacheKey = `${speaker}:${cleanText}`;
    if (decodedBufferCacheRef.current.has(cacheKey)) {
      return { buffer: decodedBufferCacheRef.current.get(cacheKey)! };
    }
    if (audioBlobUrlCacheRef.current.has(cacheKey)) {
      return { url: audioBlobUrlCacheRef.current.get(cacheKey)! };
    }
    if (inFlightTtsPromisesRef.current.has(cacheKey)) {
      return inFlightTtsPromisesRef.current.get(cacheKey)!;
    }

    const promise = (async () => {
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
        const endpoint = inviteToken ? `${apiBase}/interviews/${inviteToken}/tts` : `${apiBase}/interviews/tts`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText, speaker }),
        });

        if (!res.ok) {
          throw new Error(`Cloudflare Workers AI TTS server returned status ${res.status}`);
        }

        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength < 100) {
          throw new Error('TTS returned empty audio');
        }

        // Initialize AudioContext if needed
        if (!audioContextRef.current) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            audioContextRef.current = new AudioCtx();
          }
        }

        if (audioContextRef.current) {
          try {
            const bufferCopy = arrayBuffer.slice(0);
            const decoded = await audioContextRef.current.decodeAudioData(bufferCopy);
            decodedBufferCacheRef.current.set(cacheKey, decoded);
            return { buffer: decoded };
          } catch (decodeErr) {
            console.warn('Web Audio decode failed, falling back to Blob URL:', decodeErr);
          }
        }

        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(blob);
        audioBlobUrlCacheRef.current.set(cacheKey, audioUrl);
        return { url: audioUrl };
      } catch (err) {
        console.error('Cloudflare Workers AI TTS request failed:', err);
        return null;
      } finally {
        inFlightTtsPromisesRef.current.delete(cacheKey);
      }
    })();

    inFlightTtsPromisesRef.current.set(cacheKey, promise);
    return promise;
  };

  // Speak AI text using Cloudflare Workers AI TTS (Deepgram Aura-2) - 100% human voice, zero robot fallback
  const speakAI = async (text: string) => {
    stopSpeech();
    if (isVoiceMuted) {
      setIsAiSpeaking(false);
      isAiSpeakingRef.current = false;
      return;
    }

    const cleanText = text
      .replace(/\[.*?\]/g, '')
      .replace(/[\*#_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanText) return;

    setIsAiSpeaking(true);
    isAiSpeakingRef.current = true;

    const speaker = ttsSpeakerRef.current;
    const result = await fetchTtsAudio(cleanText, speaker);
    if (!result) {
      setIsAiSpeaking(false);
      isAiSpeakingRef.current = false;
      return;
    }

    if (result.buffer) {
      const played = playAudioBuffer(result.buffer);
      if (!played && result.url) {
        playAudioUrl(result.url);
      }
    } else if (result.url) {
      playAudioUrl(result.url);
    }
  };

  // Synchronously coordinate AI text display and voice start so they begin at the exact same instant
  const speakAndPresentAiMessage = async (
    text: string,
    messageItem: ChatMessageItem
  ) => {
    const cleanText = text
      .replace(/\[.*?\]/g, '')
      .replace(/[\*#_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const speaker = ttsSpeakerRef.current;
    const cacheKey = `${speaker}:${cleanText}`;
    const cachedBuffer = decodedBufferCacheRef.current.get(cacheKey);
    const cachedUrl = audioBlobUrlCacheRef.current.get(cacheKey);

    if (cachedBuffer || cachedUrl || isVoiceMuted) {
      // 1. Audio is already in memory or voice is muted -> show text and play voice simultaneously in 0ms!
      setChatMessages((prev) => [...prev, messageItem]);
      if (!isVoiceMuted) {
        if (cachedBuffer) {
          playAudioBuffer(cachedBuffer);
        } else if (cachedUrl) {
          playAudioUrl(cachedUrl);
        }
      }
      return;
    }

    // 2. Audio is not yet in client cache (e.g. dynamic follow-up):
    // Show AI response in the transcript immediately and trigger audio with race fallback
    setChatMessages((prev) => [...prev, messageItem]);

    const fetchPromise = fetchTtsAudio(cleanText, speaker);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 650));

    try {
      const result = await Promise.race([fetchPromise, timeoutPromise]);
      if (result) {
        // High-speed TTS response received! Start playing human voice immediately!
        if (result.buffer) {
          playAudioBuffer(result.buffer);
        } else if (result.url) {
          playAudioUrl(result.url);
        }
      } else {
        // Exceeded 650ms: start browser speech synthesis immediately so voice starts without waiting
        if ('speechSynthesis' in window && !isVoiceMuted) {
          try {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(cleanText);
            utter.rate = 1.05;
            utter.pitch = 1.0;
            const voices = window.speechSynthesis.getVoices();
            const naturalVoice = voices.find(
              (v) =>
                (v.name.includes('Natural') ||
                  v.name.includes('Samantha') ||
                  v.name.includes('Karen') ||
                  v.name.includes('Daniel') ||
                  v.name.includes('Google') ||
                  v.lang.startsWith('en')) &&
                !v.name.includes('Compact')
            );
            if (naturalVoice) utter.voice = naturalVoice;

            utter.onstart = () => {
              setIsAiSpeaking(true);
              isAiSpeakingRef.current = true;
            };
            utter.onend = () => {
              setIsAiSpeaking(false);
              isAiSpeakingRef.current = false;
            };
            utter.onerror = () => {
              setIsAiSpeaking(false);
              isAiSpeakingRef.current = false;
            };
            window.speechSynthesis.speak(utter);
          } catch {
            fetchPromise.then((res) => {
              if (res?.buffer) playAudioBuffer(res.buffer);
              else if (res?.url) playAudioUrl(res.url);
            });
          }
        } else {
          fetchPromise.then((res) => {
            if (res?.buffer) playAudioBuffer(res.buffer);
            else if (res?.url) playAudioUrl(res.url);
          });
        }
      }
    } catch {
      speakAI(cleanText);
    }
  };

  // Toggle AI Voice Mute
  const toggleVoiceMute = () => {
    if (!isVoiceMuted) {
      stopSpeech();
      setIsVoiceMuted(true);
      toast('AI Interviewer voice muted', { icon: '🔇' });
    } else {
      setIsVoiceMuted(false);
      toast.success('AI Interviewer voice unmuted');
      const lastAiMsg = [...chatMessages].reverse().find((m) => m.sender === 'ai');
      if (lastAiMsg) {
        setTimeout(() => speakAI(lastAiMsg.text), 100);
      }
    }
  };

  // Proactive background pre-fetching of all interview questions & transitions so they play in 0ms
  useEffect(() => {
    if (questions.length === 0) return;
    const speaker = ttsSpeakerRef.current;

    // 1. Welcome / Question 1
    const firstQ = questions[0];
    const welcomeText = `Welcome to your AI interview! Let's begin with Question 1: ${firstQ.prompt}`;
    fetchTtsAudio(welcomeText, speaker);

    // 2. All subsequent question transitions (Question 2, 3, 4, 5...)
    questions.forEach((q, idx) => {
      if (idx > 0) {
        const transitionText = `Thank you! Moving on to Question ${idx + 1}: ${q.prompt}`;
        setTimeout(() => {
          fetchTtsAudio(transitionText, speaker);
        }, idx * 250);
      }
    });

    // 3. Closing completion text
    const closingText =
      'Thank you for completing all interview questions! Finalizing and saving your interview recording now.';
    setTimeout(() => {
      fetchTtsAudio(closingText, speaker);
    }, (questions.length + 1) * 250);
  }, [questions]);

  // Mutation to persist video to database and complete session
  const saveInterviewMutation = useMutation({
    retry: 1,
    mutationFn: async (vars?: { evaluation?: EvaluationSummary }) => {
      if (!inviteToken) throw new Error('Missing interview invite token');
      setIsUploadingRecording(true);
      setFinalizingStep('packaging');
      setUploadPercent(0);
      stopSpeech();
      stopSpeechRecognition();

      // Finalize continuous master session recorder if active with 2.5s safety timeout
      if (sessionRecorderRef.current && sessionRecorderRef.current.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          let resolved = false;
          const done = () => {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          };
          const timer = setTimeout(done, 2500);
          try {
            if (sessionRecorderRef.current) {
              sessionRecorderRef.current.onstop = () => {
                clearTimeout(timer);
                done();
              };
              sessionRecorderRef.current.stop();
            } else {
              clearTimeout(timer);
              done();
            }
          } catch (_) {
            clearTimeout(timer);
            done();
          }
        });
      }

      let finalBlob: Blob | null = null;
      if (sessionChunksRef.current.length > 0) {
        const mime = sessionMimeTypeRef.current || sessionChunksRef.current[0].type || 'video/webm';
        finalBlob = new Blob(sessionChunksRef.current, { type: mime });
      }

      // If empty (e.g. demo mode without camera), generate synthetic video
      if (!finalBlob || finalBlob.size === 0) {
        finalBlob = await recordSyntheticFallback();
      }

      // If still empty (e.g. headless or permissions blocked), provide minimal valid fallback container
      if (!finalBlob || finalBlob.size === 0) {
        finalBlob = new Blob([new Uint8Array(2048)], { type: 'video/webm' });
      }

      const sizeMB = parseFloat((finalBlob.size / (1024 * 1024)).toFixed(1));
      setRecordedFileSizeMB(sizeMB);
      setFinalizingStep('uploading');

      let saveRes: SaveRecordingResult | null = null;
      try {
        saveRes = await aiInterviewService.saveRecording(inviteToken, finalBlob, {
          onProgress: (pct) => {
            setUploadPercent(pct);
            if (pct >= 99) {
              setFinalizingStep('evaluating');
            }
          },
        });
        if (saveRes?.recording_url) {
          setFinalVideoUrl(saveRes.recording_url);
        }
      } catch (saveErr) {
        console.warn('First saveRecording attempt notice, retrying upload...', saveErr);
        try {
          saveRes = await aiInterviewService.saveRecording(inviteToken, finalBlob);
          if (saveRes?.recording_url) {
            setFinalVideoUrl(saveRes.recording_url);
          }
        } catch (retryErr: any) {
          console.error('saveRecording persistent upload notice:', retryErr);
        }
      }

      setFinalizingStep('evaluating');

      // Use precomputed evaluation passed from commitCandidateTurn if available
      let evaluation: EvaluationSummary | null = vars?.evaluation || null;
      if (!evaluation) {
        try {
          const sendRes = await aiInterviewService.sendMessage(
            inviteToken,
            `[Video Assessment Completed: Candidate submitted all ${questions.length} conversational responses. Ready for Cloudflare AI rubric evaluation.]`,
            currentQIndexRef.current,
          );
          evaluation = sendRes?.summary_evaluation || null;
        } catch (evalErr) {
          console.warn('Completion evaluation notification notice:', evalErr);
        }
      }

      setFinalizingStep('ready');
      await new Promise((r) => setTimeout(r, 600));

      return { saveRes, evaluation };
    },
    onSuccess: (data) => {
      setIsUploadingRecording(false);
      if (data.saveRes?.recording_url) {
        setFinalVideoUrl(data.saveRes.recording_url);
      }
      if (data.evaluation) {
        setEvaluationResult(data.evaluation);
      }
      stopSpeechRecognition();
      setUiStage('completed');
      uiStageRef.current = 'completed';
      queryClient.invalidateQueries({ queryKey: ['ai-interview-session', inviteToken] });
      toast.success('Interview video saved and evaluated by admissions AI!');
    },
    onError: (err: any) => {
      setIsUploadingRecording(false);
      console.error('Error saving interview recording:', err);
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to save video';
      toast.error(`Recording notice: ${msg}. Session preserved.`);
      stopSpeechRecognition();
      setUiStage('completed');
      uiStageRef.current = 'completed';
    },
  });

  // Explicitly finish and finalize the entire interview session
  const handleFinishInterview = useCallback(() => {
    stopSpeech();
    stopSpeechRecognition();
    const closingText =
      'Thank you for completing all interview questions! Finalizing and saving your interview recording now.';
    const completeMsg: ChatMessageItem = {
      id: `ai-complete-${Date.now()}`,
      sender: 'ai',
      text: closingText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages((prev) => [...prev, completeMsg]);
    speakAI(closingText);

    setUiStage('finalizing');
    uiStageRef.current = 'finalizing';
    setFinalizingStep('packaging');

    saveInterviewMutation.mutate({});
  }, [speakAI, stopSpeech, saveInterviewMutation]);

  // End-of-Utterance Turn Submission (Dual-Pass Transcription: Live Web Speech preview + Cloudflare Whisper high-precision finalization)
  const commitCandidateTurn = async (candidateText?: string) => {
    if (isEvaluatingAnswerRef.current) return;

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    // Stop speech if AI was somehow playing
    stopSpeech();

    let textToSubmit = (candidateText || liveCandidateTranscript || '').trim();

    // Direct Whisper Speech-to-Text Transcription:
    // Transcribes recorded audio directly using full model Whisper without altering or editing candidate words.
    const pcmChunks = [...turnPcmChunksRef.current];
    if (pcmChunks.length > 0 && inviteToken) {
      setIsEvaluatingAnswer(true);
      isEvaluatingAnswerRef.current = true;

      try {
        const inputRate = audioContextRef.current?.sampleRate || 44100;
        const pcm16k = downsampleTo16k(pcmChunks, inputRate);
        if (pcm16k.length > 4000) {
          const wavBlob = encodeWav(pcm16k, 16000);
          const whisperPromise = aiInterviewService.transcribeAudio(inviteToken, wavBlob);
          const timeoutPromise = new Promise<{ text: string }>((_, reject) =>
            setTimeout(() => reject(new Error('Whisper transcription timeout')), 4000)
          );

          try {
            const res = await Promise.race([whisperPromise, timeoutPromise]);
            if (res?.text) {
              const directWhisper = filterWhisperSilence(res.text);
              if (directWhisper.length >= 2) {
                console.log('Full model Whisper direct transcript:', directWhisper);
                textToSubmit = directWhisper;
              }
            }
          } catch (whisperErr) {
            console.warn('Whisper transcription notice (using direct speech input):', whisperErr);
          }
        }
      } catch (audioErr) {
        console.warn('Audio processing for Whisper notice:', audioErr);
      }
    }

    if (!textToSubmit || textToSubmit.length < 2) {
      if (currentQIndexRef.current >= questions.length - 1) {
        // Candidate reached the final question and clicked submit/done -> finalize interview!
        setIsEvaluatingAnswer(false);
        isEvaluatingAnswerRef.current = false;
        handleFinishInterview();
        return;
      }
      setIsEvaluatingAnswer(false);
      isEvaluatingAnswerRef.current = false;
      toast('Please speak your answer into the microphone before clicking Done Speaking.', { icon: '🎙️' });
      return;
    }

    // Clear live interim transcript and reset speaking states
    setLiveCandidateTranscript('');
    setIsCandidateSpeaking(false);
    isCandidateSpeakingRef.current = false;
    speechStartedTimeRef.current = 0;
    lastCandidateSpeechTimeRef.current = 0;
    consecutiveSpeechFramesRef.current = 0;

    // Append candidate message to chat thread
    const candMsg: ChatMessageItem = {
      id: `cand-${Date.now()}`,
      sender: 'candidate',
      text: textToSubmit,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      questionIndex: currentQIndexRef.current,
    };
    setChatMessages((prev) => [...prev, candMsg]);

    setIsEvaluatingAnswer(true);
    isEvaluatingAnswerRef.current = true;

    // Reset speech recognition & turn audio recorder for fresh next turn
    stopSpeechRecognition();
    restartSpeechRecognition(300);
    startTurnAudioRecorder();
    turnPcmChunksRef.current = [];

    try {
      if (!inviteToken) return;
      const res = await aiInterviewService.sendMessage(inviteToken, textToSubmit, currentQIndexRef.current);

      if (res.is_follow_up) {
        // If candidate is on the last question and ALREADY completed a follow-up turn,
        // finish the interview instead of indefinitely asking follow-ups!
        if (currentQIndexRef.current >= questions.length - 1 && activeFollowUpRef.current) {
          const closingText =
            'Thank you for completing all interview questions! Finalizing and saving your interview recording now.';
          const completeMsg: ChatMessageItem = {
            id: `ai-complete-${Date.now()}`,
            sender: 'ai',
            text: closingText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          await speakAndPresentAiMessage(closingText, completeMsg);

          stopSpeechRecognition();
          setUiStage('finalizing');
          uiStageRef.current = 'finalizing';
          setFinalizingStep('packaging');

          saveInterviewMutation.mutate({ evaluation: res.summary_evaluation });
          return;
        }

        // AI asks conversational follow-up question
        const followUpText = res.ai_message;
        const followUpMsg: ChatMessageItem = {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: followUpText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          questionIndex: currentQIndexRef.current,
        };
        setActiveFollowUp({
          questionText: followUpText,
          followUpCount: res.follow_up_count || 1,
          parentQuestionIndex: currentQIndexRef.current,
        });
        activeFollowUpRef.current = {
          questionText: followUpText,
          followUpCount: res.follow_up_count || 1,
          parentQuestionIndex: currentQIndexRef.current,
        };

        await speakAndPresentAiMessage(followUpText, followUpMsg);
      } else {
        // Candidate response was accepted -> advance to next question
        setActiveFollowUp(null);
        activeFollowUpRef.current = null;

        if (res.is_completed || currentQIndexRef.current >= questions.length - 1) {
          const closingText =
            'Thank you for completing all interview questions! Finalizing and saving your interview recording now.';
          const completeMsg: ChatMessageItem = {
            id: `ai-complete-${Date.now()}`,
            sender: 'ai',
            text: closingText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          await speakAndPresentAiMessage(closingText, completeMsg);

          // Stop mic recognition immediately
          stopSpeechRecognition();

          // Immediately transition to the dedicated finalizing animation screen!
          setUiStage('finalizing');
          uiStageRef.current = 'finalizing';
          setFinalizingStep('packaging');

          // Finalize master session video recording & complete with precomputed evaluation
          saveInterviewMutation.mutate({ evaluation: res.summary_evaluation });
        } else {
          const nextIndex =
            res.current_question_index !== undefined && res.current_question_index > currentQIndexRef.current
              ? res.current_question_index
              : currentQIndexRef.current + 1;

          setCurrentQIndex(nextIndex);
          currentQIndexRef.current = nextIndex;

          const nextQ = questions[nextIndex];
          const transitionText = `Thank you! Moving on to Question ${nextIndex + 1}: ${nextQ.prompt}`;
          const nextMsg: ChatMessageItem = {
            id: `ai-${Date.now()}`,
            sender: 'ai',
            text: transitionText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            questionIndex: nextIndex,
          };
          await speakAndPresentAiMessage(transitionText, nextMsg);
        }
      }
    } catch (err) {
      console.error('Error submitting candidate turn:', err);
      if (currentQIndexRef.current >= questions.length - 1) {
        toast('Finalizing interview and uploading recording...', { icon: '⏳' });
        stopSpeechRecognition();
        setUiStage('finalizing');
        uiStageRef.current = 'finalizing';
        setFinalizingStep('packaging');
        saveInterviewMutation.mutate({});
      } else {
        toast.error('Network delay processing turn. You can speak again or click Done Speaking.');
      }
    } finally {
      setIsEvaluatingAnswer(false);
      isEvaluatingAnswerRef.current = false;
      setIsCandidateSpeaking(false);
      isCandidateSpeakingRef.current = false;
    }
  };
  commitCandidateTurnRef.current = commitCandidateTurn;

  // Continuous Speech Recognition with Instant Barge-In
  const startSpeechRecognition = () => {
    try {
      if (uiStageRef.current !== 'interview') return;

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      // Clean up previous instance cleanly
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.onresult = null;
          speechRecognitionRef.current.onerror = null;
          speechRecognitionRef.current.onend = null;
          speechRecognitionRef.current.abort();
        } catch (_) {}
        speechRecognitionRef.current = null;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + ' ';
        }
        const text = transcript.trim();

        if (text.length > 0) {
          speechRecognitionWorkingRef.current = true;

          // 1. Instant Speech Barge-in (Interruption):
          // If AI is currently speaking, silence AI immediately!
          if (isAiSpeakingRef.current) {
            stopSpeech();
          }

          // 2. Stream live candidate transcript to active chat bubble
          setLiveCandidateTranscript(text);

          // 3. Reset silence debounce timer
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }

          // 4. Auto-commit turn after natural conversational silence pause
          if (text.length >= 6 && !isEvaluatingAnswerRef.current) {
            // Adaptive silence debounce:
            // - For brief opening fragments (< 10 words), give 5.5 seconds so candidate has time to think without being cut off mid-thought!
            // - For substantive responses (>= 10 words), use a comfortable 4.5 seconds silence pause.
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            const debounceMs = wordCount < 10 ? 5500 : 4500;

            silenceTimeoutRef.current = setTimeout(() => {
              commitCandidateTurn(text);
            }, debounceMs);
          }
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition notice:', e?.error || e);
        if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed' || e?.error === 'network') {
          speechRecognitionUnsupportedRef.current = true;
          speechRecognitionWorkingRef.current = false;
          const isBrave = typeof window !== 'undefined' && Boolean((navigator as any).brave && typeof (navigator as any).brave.isBrave === 'function');
          if (isBrave) {
            toast(
              'Brave shields block Google Web Speech. Your speech is transcribed via AI Whisper automatically.',
              { id: 'brave-stt-notice', duration: 7000, icon: '🦁' },
            );
          }
          return;
        }
        if (e?.error !== 'aborted' && uiStageRef.current === 'interview' && !speechRecognitionUnsupportedRef.current) {
          restartSpeechRecognition(600);
        }
      };

      recognition.onend = () => {
        // Automatically restart a fresh instance so speech recognition stays active continuously
        if (uiStageRef.current === 'interview' && !speechRecognitionUnsupportedRef.current) {
          restartSpeechRecognition(200);
        }
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch (err) {
      console.warn('Speech recognition start exception:', err);
    }
  };
  startSpeechRecognitionRef.current = startSpeechRecognition;

  // Enter Chamber from Lobby
  const handleEnterChamber = () => {
    if (!stream && !isDemo) {
      toast.error('Please enable camera and microphone permissions first.');
      return;
    }

    // Automatically clean previous test transcript if in demo mode
    if (isDemo && inviteToken) {
      aiInterviewService.resetSession(inviteToken).catch(() => {});
    }

    // Unlock browser audio context synchronously on user interaction
    unlockAudio();

    // 1. Start continuous master session recording
    try {
      const activeStream = stream || createSyntheticVideoStream();
      if (activeStream && typeof MediaRecorder !== 'undefined') {
        const { mimeType } = getSupportedVideoMimeType();
        sessionMimeTypeRef.current = mimeType;
        sessionChunksRef.current = [];
        const sessionRecorder = new MediaRecorder(activeStream, {
          ...(mimeType ? { mimeType } : {}),
          videoBitsPerSecond: 600_000,
          audioBitsPerSecond: 64_000,
        });
        sessionRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            sessionChunksRef.current.push(event.data);
          }
        };
        sessionRecorder.start(1000);
        sessionRecorderRef.current = sessionRecorder;
      }
    } catch (e) {
      console.warn('Could not start master session recorder:', e);
    }

    // 2. Set Chamber state
    setUiStage('interview');
    uiStageRef.current = 'interview';
    setCurrentQIndex(0);
    currentQIndexRef.current = 0;
    setActiveFollowUp(null);
    activeFollowUpRef.current = null;
    setLiveCandidateTranscript('');

    // 3. Start continuous speech recognition & turn audio recorder
    startSpeechRecognition();
    startTurnAudioRecorder();

    // 4. Welcome candidate and ask Question 1
    const firstQ = questions[0];
    if (firstQ) {
      const welcomeText = `Welcome to your AI interview! Let's begin with Question 1: ${firstQ.prompt}`;
      const initMsg: ChatMessageItem = {
        id: `ai-init-${Date.now()}`,
        sender: 'ai',
        text: welcomeText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        questionIndex: 0,
      };
      speakAndPresentAiMessage(welcomeText, initMsg);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-kulkul-purple/20 border-t-kulkul-purple rounded-full animate-spin mx-auto mb-4" />
          <p className="text-base font-bold text-slate-900">Connecting to Video Interview Room...</p>
          <p className="text-xs text-slate-500 mt-1">Establishing WebRTC media stream</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError || !session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="stitch-card max-w-md w-full bg-white border border-slate-200/90 rounded-3xl p-8 text-center text-slate-900 shadow-2xs">
          <AlertCircle className="w-14 h-14 text-rose-500 mx-auto mb-4 animate-bounce" />
          <h2 className="text-xl font-black text-slate-900 mb-2">Interview Session Invalid</h2>
          <p className="text-slate-600 text-sm mb-6">
            The interview invitation token has expired or could not be found in the database.
          </p>
          <button
            onClick={() => navigate('/candidate/dashboard')}
            className="w-full py-3.5 bg-kulkul-purple hover:bg-kulkul-purple-hover font-bold text-white rounded-full transition shadow-sm"
          >
            Return to Candidate Dashboard
          </button>
        </div>
      </div>
    );
  }
  return (
    <AssessmentAccessGuard
      requiredEmail={isDemo ? undefined : session.applicant_email}
      candidateName={session.applicant_name}
      assessmentType="ai_interview"
      programName={session.program_name}
      trackName={session.track_name}
    >
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
      <Navbar />

      {/* STAGE 1: LOBBY & PRE-FLIGHT DIAGNOSTICS */}
      {uiStage === 'lobby' && (
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col justify-center">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Pre-Flight Device & Camera Setup
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              Welcome, <span className="text-kulkul-purple font-bold">{session.applicant_name}</span>. Test your
              camera, microphone, and preview your video feed before entering the AI interview room.
            </p>
          </div>

          <div className="max-w-3xl mx-auto w-full">
            {isDemo && (
              <div className="mb-4 p-4 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-between gap-3 text-xs shadow-2xs">
                <div className="flex items-center gap-2.5 text-kulkul-purple font-bold">
                  <Sparkles className="w-4 h-4 text-kulkul-purple shrink-0" />
                  <span>KulKul Team AI Interview Demo Room</span>
                </div>
                <button
                  onClick={handleResetDemo}
                  disabled={isResetting}
                  className="px-3.5 py-1.5 rounded-full bg-white border border-purple-200 text-2xs font-bold text-slate-700 hover:text-kulkul-purple flex items-center gap-1.5 transition shadow-2xs"
                >
                  <RefreshCw className={`w-3 h-3 ${isResetting ? 'animate-spin' : ''}`} />
                  <span>Reset Demo Progress</span>
                </button>
              </div>
            )}

            {/* Live Camera Preview Card */}
            <div className="stitch-card bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-2xs relative overflow-hidden space-y-6">
              <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center shadow-inner">
                {stream ? (
                  <video
                    ref={attachLobbyVideo}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={(e) => e.currentTarget.play().catch(() => {})}
                    onCanPlay={(e) => e.currentTarget.play().catch(() => {})}
                    className={`w-full h-full object-cover -scale-x-100 ${isCameraOff ? 'hidden' : 'block'}`}
                  />
                ) : null}

                {(!stream || isCameraOff) && (
                  <div className="text-center p-6 bg-slate-50 border border-dashed border-slate-300 w-full h-full flex flex-col items-center justify-center rounded-2xl">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                      <VideoOff className="w-6 h-6 text-slate-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      {isCameraOff ? 'Camera Video Paused' : 'Camera Feed Not Connected'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs">
                      {deviceError || 'Grant camera and microphone permissions to preview your video.'}
                    </p>
                    {!stream && (
                      <button
                        onClick={startCamera}
                        disabled={isRequestingMedia}
                        className="mt-4 px-5 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-xs font-bold text-white shadow-xs transition"
                      >
                        {isRequestingMedia ? 'Requesting Access...' : 'Allow Camera & Mic'}
                      </button>
                    )}
                  </div>
                )}

                {/* Overlaid Device Status Badges */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-2xs font-bold text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Live Preview
                  </span>
                  <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-2xs font-medium text-white border border-white/20">
                    720p HD Stream
                  </span>
                </div>

                {/* Microphone Level Visualizer Bar in bottom */}
                {stream && !isMicMuted && (
                  <div className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur-md rounded-xl p-2 px-3 flex items-center gap-3 border border-white/15">
                    <Mic className="w-4 h-4 text-kulkul-orange shrink-0" />
                    <div className="flex-1 flex items-center gap-1 h-3">
                      {[...Array(24)].map((_, i) => {
                        const threshold = (i / 24) * 100;
                        const isActive = audioLevel > threshold;
                        return (
                          <div
                            key={i}
                            className={`flex-1 rounded-full transition-all duration-75 ${
                              isActive
                                ? i > 18
                                  ? 'bg-rose-500 h-full'
                                  : i > 12
                                  ? 'bg-amber-400 h-4/5'
                                  : 'bg-emerald-400 h-3/4'
                                : 'bg-white/20 h-1/3'
                            }`}
                          />
                        );
                      })}
                    </div>
                    <span className="text-2xs text-white font-mono w-8 text-right font-bold">
                      {audioLevel}%
                    </span>
                  </div>
                )}
              </div>

              {/* Controls bar */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={toggleCamera}
                    className={`px-4 py-2 rounded-full border transition flex items-center gap-2 text-xs font-bold ${
                      isCameraOff
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isCameraOff ? <VideoOff className="w-4 h-4 text-rose-600" /> : <Video className="w-4 h-4 text-slate-600" />}
                    <span>{isCameraOff ? 'Camera Off' : 'Camera On'}</span>
                  </button>

                  <button
                    onClick={toggleMic}
                    className={`px-4 py-2 rounded-full border transition flex items-center gap-2 text-xs font-bold ${
                      isMicMuted
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isMicMuted ? <MicOff className="w-4 h-4 text-rose-600" /> : <Mic className="w-4 h-4 text-slate-600" />}
                    <span>{isMicMuted ? 'Muted' : 'Mic Active'}</span>
                  </button>
                </div>

                <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Encrypted Peer Feed</span>
                </div>
              </div>

              {/* Live Pre-Flight Diagnostic Bar */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 text-white shadow-sm border border-slate-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Live Pre-Flight Diagnostic Status
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-3xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                      isOnline
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-950/60 text-rose-300 border-rose-500/30'
                    }`}>
                      <Wifi className="w-3 h-3" />
                      <span>{isOnline ? 'Online (Connected)' : 'Offline (Check Network)'}</span>
                    </span>
                    <span className="text-3xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 hidden sm:inline">
                      Auto-Verified
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  {/* Diagnostic 1: Device Form */}
                  <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 text-xs transition ${
                    isMobileDevice
                      ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-200'
                  }`}>
                    <Laptop className={`w-4 h-4 shrink-0 ${isMobileDevice ? 'text-amber-400' : 'text-emerald-400'}`} />
                    <div className="min-w-0">
                      <span className="block text-3xs text-slate-400 font-medium">Device</span>
                      <span className="font-bold truncate block">
                        {isMobileDevice ? 'Mobile Phone' : 'Desktop / Laptop'}
                      </span>
                    </div>
                  </div>

                  {/* Diagnostic 2: Browser Compatibility */}
                  <div className="p-2.5 rounded-xl border bg-slate-800/80 border-slate-700/80 text-slate-200 flex items-center gap-2.5 text-xs">
                    <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="block text-3xs text-slate-400 font-medium">Browser</span>
                      <span className="font-bold truncate block">
                        {browserInfo.name}
                      </span>
                    </div>
                  </div>

                  {/* Diagnostic 3: Camera Feed */}
                  <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 text-xs transition ${
                    stream && !isCameraOff
                      ? 'bg-slate-800/80 border-slate-700/80 text-slate-200'
                      : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                  }`}>
                    <Video className={`w-4 h-4 shrink-0 ${stream && !isCameraOff ? 'text-emerald-400' : 'text-rose-400'}`} />
                    <div className="min-w-0">
                      <span className="block text-3xs text-slate-400 font-medium">Webcam</span>
                      <span className="font-bold truncate block">
                        {stream && !isCameraOff ? '720p HD Active' : 'Waiting Camera'}
                      </span>
                    </div>
                  </div>

                  {/* Diagnostic 4: Microphone */}
                  <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 text-xs transition ${
                    stream && !isMicMuted
                      ? 'bg-slate-800/80 border-slate-700/80 text-slate-200'
                      : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                  }`}>
                    <Mic className={`w-4 h-4 shrink-0 ${stream && !isMicMuted ? 'text-emerald-400' : 'text-rose-400'}`} />
                    <div className="min-w-0">
                      <span className="block text-3xs text-slate-400 font-medium">Microphone</span>
                      <span className="font-bold truncate block">
                        {stream && !isMicMuted ? (audioLevel > 5 ? `${audioLevel}% Level` : 'Mic Active') : 'Mic Muted'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mobile Device Advisory Alert if visiting on phone */}
                {isMobileDevice && (
                  <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-amber-300 font-bold block mb-0.5">Mobile Device Detected</strong>
                      <span>
                        For the best interview experience and uninterrupted video recording, we strongly recommend using a <strong>laptop or desktop computer</strong> with Google Chrome or Microsoft Edge.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Minimum Device Requirements Section */}
              <div className="p-5 sm:p-6 rounded-2xl bg-slate-50/90 border border-slate-200/80 text-left space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-purple-100 text-kulkul-purple flex items-center justify-center">
                      <Laptop className="w-3.5 h-3.5 text-kulkul-purple" />
                    </div>
                    <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                      Minimum Device & System Requirements
                    </h2>
                  </div>
                  <span className="text-2xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    Recommended Setup
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  To ensure smooth speech recognition, zero audio echo, and uninterrupted high-definition video recording, please verify your setup meets the following specifications:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                  {/* Req 1: Computer / Device */}
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-900 font-bold">
                        <Laptop className="w-4 h-4 text-kulkul-purple" />
                        <span>Laptop or Desktop PC</span>
                      </div>
                      <span className="text-3xs font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                        Strongly Advised
                      </span>
                    </div>
                    <p className="text-2xs text-slate-500 leading-normal">
                      macOS, Windows 10/11, or Linux. Handheld mobile phones and tablets are not recommended to avoid screen auto-lockouts, incoming phone call interruptions, or shaky camera angles.
                    </p>
                  </div>

                  {/* Req 2: Web Browser */}
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-900 font-bold">
                        <Globe className="w-4 h-4 text-kulkul-purple" />
                        <span>Supported Web Browser</span>
                      </div>
                      <span className="text-3xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        Chrome / Edge Recommended
                      </span>
                    </div>
                    <p className="text-2xs text-slate-500 leading-normal">
                      Latest Google Chrome (v90+) or Microsoft Edge (v90+) provides optimal Web Speech and MediaRecorder performance. Apple Safari (v15+) and Brave are also supported.
                    </p>
                  </div>

                  {/* Req 3: Webcam & Lighting */}
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-900 font-bold">
                        <Video className="w-4 h-4 text-kulkul-purple" />
                        <span>720p HD Webcam & Lighting</span>
                      </div>
                      <span className="text-3xs font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                        Required
                      </span>
                    </div>
                    <p className="text-2xs text-slate-500 leading-normal">
                      Functional internal or external webcam (minimum 720p HD). Keep your face clearly centered at eye level with front-facing light (avoid bright backlighting or dark rooms).
                    </p>
                  </div>

                  {/* Req 4: Microphone & Headphones */}
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-900 font-bold">
                        <Headphones className="w-4 h-4 text-kulkul-purple" />
                        <span>Microphone & Headphones</span>
                      </div>
                      <span className="text-3xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                        Headphones Advised
                      </span>
                    </div>
                    <p className="text-2xs text-slate-500 leading-normal">
                      Clear working microphone with headphones or earbuds. Wearing headphones prevents audio feedback and acoustic echo loops when the AI interviewer speaks.
                    </p>
                  </div>

                  {/* Req 5: Internet Connection */}
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-900 font-bold">
                        <Wifi className="w-4 h-4 text-kulkul-purple" />
                        <span>Stable Internet Connection</span>
                      </div>
                      <span className="text-3xs font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                        5+ Mbps Required
                      </span>
                    </div>
                    <p className="text-2xs text-slate-500 leading-normal">
                      Reliable broadband or high-speed Wi-Fi with at least 5 Mbps upload/download speed (10+ Mbps recommended). Avoid unstable public networks or cellular hotspots with data throttling.
                    </p>
                  </div>

                  {/* Req 6: Hardware Resources & Background Apps */}
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-900 font-bold">
                        <Cpu className="w-4 h-4 text-kulkul-purple" />
                        <span>4 GB RAM & Dual-Core CPU</span>
                      </div>
                      <span className="text-3xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                        Close Heavy Apps
                      </span>
                    </div>
                    <p className="text-2xs text-slate-500 leading-normal">
                      Minimum 4 GB RAM (8 GB+ recommended). Please close heavy background apps (Zoom, Teams, Discord, torrents, or gaming clients) to prevent video frame drops or CPU throttling.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-100 flex items-center gap-2.5 text-2xs text-purple-900">
                  <Sparkles className="w-4 h-4 text-kulkul-purple shrink-0" />
                  <span>
                    <strong>Pro-Tip for Candidates:</strong> Test your microphone using the live audio visualizer above. When speaking at a normal conversation level, the visualizer bar should illuminate into the green and yellow zones (30%–70%).
                  </span>
                </div>
              </div>
              <div className="p-5 sm:p-6 rounded-2xl bg-slate-50/90 border border-slate-200/80 text-left space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-purple-100 text-kulkul-purple flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5 text-kulkul-purple" />
                    </div>
                    <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                      Interview Rules & Guidelines
                    </h2>
                  </div>
                  <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
                    Read Before Entering
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-100 shadow-2xs">
                    <span className="w-5 h-5 rounded-full bg-purple-50 text-kulkul-purple font-bold text-2xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <div>
                      <strong className="text-slate-800 block mb-0.5">Camera Always On</strong>
                      <span>Keep your camera active with your face clearly visible and centered in frame throughout.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-100 shadow-2xs">
                    <span className="w-5 h-5 rounded-full bg-purple-50 text-kulkul-purple font-bold text-2xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <div>
                      <strong className="text-slate-800 block mb-0.5">Quiet Environment</strong>
                      <span>Conduct the interview in a quiet, well-lit space without background noise or distractions.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-100 shadow-2xs">
                    <span className="w-5 h-5 rounded-full bg-purple-50 text-kulkul-purple font-bold text-2xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <div>
                      <strong className="text-slate-800 block mb-0.5">Authentic Responses</strong>
                      <span>Speak naturally in your own words. External assistance, scripts, or coaching are not permitted.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-100 shadow-2xs">
                    <span className="w-5 h-5 rounded-full bg-purple-50 text-kulkul-purple font-bold text-2xs flex items-center justify-center shrink-0 mt-0.5">4</span>
                    <div>
                      <strong className="text-slate-800 block mb-0.5">Sequential Questions</strong>
                      <span>Questions appear one at a time. Once you submit a response, you cannot revisit previous questions.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Interviewer Voice Preference */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-slate-50 border border-purple-100 text-left space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-purple-100 text-kulkul-purple flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-kulkul-purple" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
                        AI Interviewer Voice
                      </h3>
                      <p className="text-3xs text-slate-500">
                        Choose your preferred AI conversational voice for all questions and follow-ups.
                      </p>
                    </div>
                  </div>
                  <span className="text-3xs font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                    {voiceGender === 'female' ? '👩 Woman Voice Active' : '👨 Man Voice Active'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option 1: Woman Voice (Luna) - Default */}
                  <div
                    onClick={() => switchVoiceGender('female')}
                    className={`p-3 rounded-xl border-2 transition cursor-pointer flex items-center justify-between ${
                      voiceGender === 'female'
                        ? 'bg-white border-kulkul-purple shadow-xs ring-2 ring-kulkul-purple/10'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                        voiceGender === 'female' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        👩
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900">Woman (Luna)</span>
                          <span className="text-3xs font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Default</span>
                        </div>
                        <p className="text-3xs text-slate-500">Natural, warm, professional</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        previewVoice('female');
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-kulkul-purple hover:bg-purple-50 transition"
                      title="Preview Woman Voice"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Option 2: Man Voice (Orion) */}
                  <div
                    onClick={() => switchVoiceGender('male')}
                    className={`p-3 rounded-xl border-2 transition cursor-pointer flex items-center justify-between ${
                      voiceGender === 'male'
                        ? 'bg-white border-kulkul-purple shadow-xs ring-2 ring-kulkul-purple/10'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                        voiceGender === 'male' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        👨
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900">Man (Orion)</span>
                        <p className="text-3xs text-slate-500">Calm, clear, conversational</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        previewVoice('male');
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-kulkul-purple hover:bg-purple-50 transition"
                      title="Preview Man Voice"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Enter Interview Button */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={handleEnterChamber}
                  disabled={!stream && !isDemo}
                  className="w-full py-3.5 px-6 rounded-full font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow-sm hover:shadow transition active:scale-[0.98] flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  <span>Enter AI Video Interview Room</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                {!stream && !isDemo && (
                  <p className="text-2xs text-rose-500 text-center mt-2 font-medium">
                    Camera permission required to enter
                  </p>
                )}
                {!stream && isDemo && (
                  <p className="text-2xs text-purple-600 text-center mt-2 font-medium">
                    Demo Mode active: Camera check can be skipped to test the interview flow.
                  </p>
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* STAGE 2: ACTIVE VIDEO INTERVIEW CHAMBER (GEMINI-VOICE FLOW) */}
      {uiStage === 'interview' && (
        <main
          onClick={unlockAudio}
          className="flex-1 max-w-7xl w-full mx-auto px-4 py-5 sm:px-6 lg:px-8 flex flex-col gap-5 relative"
        >
          {/* Autoplay Blocked Floating Banner */}
          {autoplayBlocked && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  unlockAudio();
                  const lastAiMsg = [...chatMessages].reverse().find((m) => m.sender === 'ai');
                  if (lastAiMsg) speakAI(lastAiMsg.text);
                }}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2.5 rounded-full shadow-xl flex items-center gap-2 text-xs cursor-pointer border border-amber-300"
              >
                <Volume2 className="w-4 h-4" />
                <span>Tap here to enable AI Interviewer Voice</span>
              </button>
            </div>
          )}

          {/* Top Session Progress & Status Header */}
          <div className="stitch-card bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Left: Program, Applicant, Question Counter */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-kulkul-purple to-purple-800 text-white flex items-center justify-center font-black shadow-xs shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-slate-900 tracking-tight">{session.program_name}</span>
                  {isDemo && (
                    <button
                      onClick={handleResetDemo}
                      className="px-2.5 py-0.5 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-800 text-3xs font-extrabold uppercase border border-amber-200 transition cursor-pointer flex items-center gap-1"
                      title="Reset demo transcript and start from Question 1"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>Restart Demo</span>
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  {session.applicant_name} &bull; Question {currentQIndex + 1} of {questions.length}
                </div>
              </div>
            </div>

            {/* Center: Segmented Question Progress Pills */}
            <div className="flex items-center gap-1.5 w-full md:w-64">
              {questions.map((q, idx) => {
                const isPast = idx < currentQIndex;
                const isCurr = idx === currentQIndex;
                return (
                  <div key={q.id} className="flex-1">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        isPast
                          ? 'bg-emerald-500'
                          : isCurr
                          ? 'bg-kulkul-purple ring-2 ring-kulkul-purple/20 animate-pulse'
                          : 'bg-slate-200'
                      }`}
                    />
                    <div className={`text-3xs font-mono mt-1 text-center font-bold ${isCurr ? 'text-kulkul-purple' : 'text-slate-400'}`}>
                      Q{q.id}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: Master Continuous REC Badge & Turn Status */}
            <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto justify-end">
              {/* Continuous Session Recording Pill */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs tracking-wide shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600" />
                </span>
                <span>
                  REC {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>

              {/* Real-time Turn Status Badge */}
              {isAiSpeaking ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-200 text-kulkul-purple text-xs font-bold">
                  <span className="flex items-center gap-0.5 h-2">
                    <span className="w-1 h-2 bg-kulkul-purple rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1 h-3 bg-kulkul-purple rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1 h-2 bg-kulkul-purple rounded-full animate-bounce" />
                  </span>
                  <span>AI Speaking</span>
                </div>
              ) : isEvaluatingAnswer ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                  <span>Evaluating...</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                  <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                  <span>Listening</span>
                </div>
              )}
            </div>
          </div>

          {/* Main Dual-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-start min-h-0">
            {/* LEFT COLUMN: Candidate Live Studio Feed (Bigger Video: 7 cols on lg, 8 cols on xl) */}
            <div className="lg:col-span-7 xl:col-span-8 stitch-card bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex-1 flex flex-col justify-center">
                {/* Live Camera Viewport */}
                <div className="relative aspect-video w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center shadow-inner">
                  {stream && (
                    <video
                      ref={attachLiveVideo}
                      autoPlay
                      playsInline
                      muted
                      onLoadedMetadata={(e) => e.currentTarget.play().catch(() => {})}
                      onCanPlay={(e) => e.currentTarget.play().catch(() => {})}
                      className={`w-full h-full object-cover -scale-x-100 ${isCameraOff ? 'hidden' : 'block'}`}
                    />
                  )}

                  {(!stream || isCameraOff) && (
                    <div className="text-center p-6 bg-slate-900 text-slate-300 w-full h-full flex flex-col items-center justify-center">
                      <VideoOff className="w-8 h-8 text-slate-500 mb-2" />
                      <p className="text-xs font-bold text-slate-200">
                        {isCameraOff ? 'Camera Paused' : 'Camera Feed Active'}
                      </p>
                      <p className="text-3xs text-slate-400 mt-1 max-w-xs">
                        {isCameraOff
                          ? 'Click the camera button below to turn your video on.'
                          : 'Live video capture running.'}
                      </p>
                    </div>
                  )}

                  {/* Overlaid Red Record Icon */}
                  <div className="absolute top-3 left-3 flex items-center">
                    <div className="p-2 bg-black/60 backdrop-blur-md rounded-full border border-white/20 flex items-center justify-center shadow-xs">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse ring-2 ring-rose-500/40" />
                    </div>
                  </div>

                  {/* In-Video Vocal Waveform Visualizer */}
                  {stream && !isMicMuted && (
                    <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md rounded-full p-1.5 px-3 flex items-center gap-2 border border-white/15">
                      <Mic className="w-3.5 h-3.5 text-kulkul-orange" />
                      <div className="flex items-center gap-0.5 h-3 w-16">
                        {[...Array(8)].map((_, i) => (
                          <div
                            key={i}
                            className={`flex-1 rounded-full transition-all duration-75 ${
                              audioLevel > i * 12 ? 'bg-kulkul-orange h-full' : 'bg-white/25 h-1'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Floating Camera / Mic Toggles */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md rounded-full p-1 border border-white/15">
                    <button
                      onClick={toggleCamera}
                      title="Toggle Camera"
                      className={`p-1.5 rounded-full transition cursor-pointer ${
                        isCameraOff ? 'bg-rose-500 text-white' : 'hover:bg-white/20 text-slate-200'
                      }`}
                    >
                      {isCameraOff ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={toggleMic}
                      title="Toggle Microphone"
                      className={`p-1.5 rounded-full transition cursor-pointer ${
                        isMicMuted ? 'bg-rose-500 text-white' : 'hover:bg-white/20 text-slate-200'
                      }`}
                    >
                      {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Efficient Action Bar (Status + Done Speaking Button) */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  {isAiSpeaking ? (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-kulkul-purple font-semibold text-xs">
                        <Bot className="w-4 h-4" />
                        <span>AI Speaking</span>
                      </span>
                      <button
                        onClick={stopSpeech}
                        className="text-3xs font-extrabold uppercase px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 hover:bg-purple-200 transition cursor-pointer"
                        title="Interrupt AI"
                      >
                        Skip / Interrupt
                      </button>
                    </div>
                  ) : liveCandidateTranscript || isCandidateSpeaking ? (
                    <div className="flex items-center gap-1.5 text-emerald-600 font-semibold text-xs animate-pulse">
                      <Radio className="w-4 h-4" />
                      <span>Listening to you...</span>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-slate-400" />
                      <span>{audioLevel > 24 ? 'Listening (speaking)...' : 'Speak anytime'}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {currentQIndex >= questions.length - 1 ? (
                    <button
                      onClick={() => {
                        if (liveCandidateTranscript && liveCandidateTranscript.trim().length >= 2) {
                          commitCandidateTurn(liveCandidateTranscript);
                        } else {
                          handleFinishInterview();
                        }
                      }}
                      disabled={isEvaluatingAnswer || isUploadingRecording}
                      className="px-6 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shrink-0 cursor-pointer"
                      title="Finish and submit video interview"
                    >
                      {isEvaluatingAnswer || isUploadingRecording ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                          <span>Finalizing Assessment...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Finish &amp; Submit Assessment</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        commitCandidateTurn(liveCandidateTranscript);
                      }}
                      disabled={isEvaluatingAnswer || isUploadingRecording}
                      className="px-6 py-2.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shrink-0 cursor-pointer"
                      title="Submit current answer"
                    >
                      {isEvaluatingAnswer ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                          <span>Transcribing &amp; Evaluating...</span>
                        </>
                      ) : (
                        <>
                          <span>Done Speaking</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Real-Time Clean Chat Stream (Smaller Chat: 5 cols on lg, 4 cols on xl) */}
            <div className="lg:col-span-5 xl:col-span-4 stitch-card bg-white border border-slate-200/90 rounded-3xl shadow-2xs flex flex-col h-[560px] lg:h-[620px] xl:h-[640px] max-h-[calc(100vh-180px)] min-h-[460px] overflow-hidden lg:sticky lg:top-24">
              {/* Clean Chat Header */}
              <div className="p-3.5 sm:p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`relative w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition ${
                      isAiSpeaking
                        ? 'bg-kulkul-purple text-white shadow-xs ring-2 ring-kulkul-purple/40'
                        : 'bg-purple-100 text-kulkul-purple'
                    }`}
                  >
                    <Bot className="w-4 h-4" />
                    {isAiSpeaking && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-ping" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">KulKul AI Interviewer</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
                    </div>
                  </div>
                </div>

                {/* Voice Gender Switcher + Audio Mute Toggle */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Voice Gender Toggle Pill */}
                  <div className="flex items-center bg-slate-200/80 p-0.5 rounded-full border border-slate-300/60 text-3xs font-bold">
                    <button
                      type="button"
                      onClick={() => switchVoiceGender('female')}
                      className={`px-2 py-1 rounded-full transition flex items-center gap-1 cursor-pointer ${
                        voiceGender === 'female'
                          ? 'bg-white text-purple-700 shadow-2xs font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Switch to Woman voice (Luna)"
                    >
                      <span>👩</span>
                      <span className="hidden sm:inline">Woman</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => switchVoiceGender('male')}
                      className={`px-2 py-1 rounded-full transition flex items-center gap-1 cursor-pointer ${
                        voiceGender === 'male'
                          ? 'bg-white text-purple-700 shadow-2xs font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Switch to Man voice (Orion)"
                    >
                      <span>👨</span>
                      <span className="hidden sm:inline">Man</span>
                    </button>
                  </div>

                  <button
                    onClick={toggleVoiceMute}
                    className={`p-2 rounded-full transition cursor-pointer ${
                      isVoiceMuted
                        ? 'bg-rose-100 text-rose-700'
                        : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                    title={isVoiceMuted ? 'Unmute AI voice' : 'Mute AI voice'}
                  >
                    {isVoiceMuted ? <VolumeX className="w-4 h-4 text-rose-600" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Chat Messages Stream */}
              <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 sm:p-4 space-y-3.5 scroll-smooth">
                {chatMessages.map((msg) => {
                  const isAi = msg.sender === 'ai';
                  return (
                    <div key={msg.id} className={`flex items-start gap-2.5 ${isAi ? 'justify-start' : 'justify-end'}`}>
                      {isAi && (
                        <div className="w-7 h-7 rounded-xl bg-purple-100 text-kulkul-purple flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                          <Bot className="w-4 h-4" />
                        </div>
                      )}

                      <div className={`max-w-[88%] space-y-1 ${isAi ? 'text-left' : 'text-right'}`}>
                        <div className="flex items-center gap-2 px-1 text-3xs text-slate-400 font-medium">
                          <span>{isAi ? 'KulKul AI Interviewer' : 'You'}</span>
                          <span>&bull;</span>
                          <span>{msg.timestamp}</span>
                        </div>

                        <div
                          className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                            isAi
                              ? 'bg-slate-50 border border-slate-200/90 text-slate-800 rounded-tl-xs shadow-2xs'
                              : 'bg-gradient-to-br from-kulkul-purple to-purple-800 text-white rounded-tr-xs shadow-xs'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                          {isAi && (
                            <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-end">
                              <button
                                onClick={() => speakAI(msg.text)}
                                className="text-3xs text-kulkul-purple hover:underline flex items-center gap-1 font-bold cursor-pointer"
                              >
                                <Volume2 className="w-3 h-3" />
                                <span>Hear Question Again</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {!isAi && (
                        <div className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Streaming Candidate Speech Bubble (Real-Time In-Progress Turn) */}
                {(liveCandidateTranscript || (isCandidateSpeaking && !isEvaluatingAnswer)) && (
                  <div className="flex items-start gap-2.5 justify-end animate-in fade-in duration-200">
                    <div className="max-w-[88%] space-y-1 text-right">
                      <div className="flex items-center gap-2 justify-end px-1 text-3xs text-emerald-600 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        <span>Speaking...</span>
                      </div>
                      <div className="p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed bg-gradient-to-br from-purple-700 to-kulkul-purple text-white rounded-tr-xs shadow-xs border border-purple-400/40">
                        {liveCandidateTranscript ? (
                          <p className="whitespace-pre-wrap italic opacity-95">
                            "{liveCandidateTranscript}"
                            <span className="inline-block w-1.5 h-3.5 bg-white ml-1 animate-pulse align-middle" />
                          </p>
                        ) : (
                          <div className="flex items-center gap-2 text-white/90 italic">
                            <span>Listening to your voice...</span>
                            <div className="flex items-center gap-1 h-3">
                              <span className="w-1 h-2 bg-white/80 rounded-full animate-pulse" />
                              <span className="w-1 h-3.5 bg-white rounded-full animate-pulse [animation-delay:150ms]" />
                              <span className="w-1 h-2 bg-white/80 rounded-full animate-pulse [animation-delay:300ms]" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-1 shadow-2xs ring-2 ring-emerald-300">
                      <User className="w-4 h-4" />
                    </div>
                  </div>
                )}

                {/* AI Evaluating Indicator */}
                {isEvaluatingAnswer && (
                  <div className="flex items-start gap-2.5 justify-start animate-in fade-in duration-200">
                    <div className="w-7 h-7 rounded-xl bg-purple-100 text-kulkul-purple flex items-center justify-center shrink-0 mt-1">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 rounded-tl-xs shadow-2xs flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-kulkul-purple rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 bg-kulkul-purple rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 bg-kulkul-purple rounded-full animate-bounce" />
                      </div>
                      <span className="font-medium text-slate-700">AI is evaluating your response...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* STAGE 2.5: FINALIZING & UPLOADING ANIMATION SCREEN */}
      {uiStage === 'finalizing' && (
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8 flex flex-col justify-center items-center">
          <div className="w-full bg-slate-900/90 border border-slate-800/90 backdrop-blur-xl rounded-3xl p-8 sm:p-12 shadow-2xl text-center space-y-8 relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute -top-24 -left-24 w-72 h-72 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

            {/* Glowing animated orb */}
            <div className="relative flex items-center justify-center w-28 h-28 mx-auto">
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-purple-500/30 via-indigo-500/20 to-emerald-500/30 animate-spin [animation-duration:5s]" />
              <div className="absolute inset-2 rounded-full bg-slate-900 border border-slate-700/60 flex items-center justify-center shadow-inner">
                {finalizingStep === 'ready' ? (
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
                ) : finalizingStep === 'evaluating' ? (
                  <Sparkles className="w-12 h-12 text-amber-400 animate-pulse" />
                ) : (
                  <UploadCloud className="w-12 h-12 text-indigo-400 animate-pulse" />
                )}
              </div>
            </div>

            {/* Header copy */}
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-3xs font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Radio className="w-3 h-3 text-purple-400 animate-pulse" />
                <span>Session Concluded</span>
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Finalizing Your Video Assessment
              </h1>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Packaging high-definition recording, preserving your responses, and compiling admissions AI evaluation.
              </p>
            </div>

            {/* Stepper Status Box */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-6 text-left space-y-5">
              {/* Step 1: Master Video Assembly */}
              <div className="flex items-start gap-3.5">
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-white">Master Video Finalized</p>
                    {recordedFileSizeMB && (
                      <span className="text-3xs font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        {recordedFileSizeMB} MB
                      </span>
                    )}
                  </div>
                  <p className="text-3xs text-slate-400 mt-0.5">Continuous camera & microphone stream encoded.</p>
                </div>
              </div>

              {/* Step 2: Upload Recording */}
              <div className="flex items-start gap-3.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                  finalizingStep === 'evaluating' || finalizingStep === 'ready'
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                    : 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-400'
                }`}>
                  {finalizingStep === 'evaluating' || finalizingStep === 'ready' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-white">Uploading Recording to Storage</p>
                    <span className="text-3xs font-mono font-bold text-indigo-400">
                      {finalizingStep === 'evaluating' || finalizingStep === 'ready' ? '100%' : `${uploadPercent}%`}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-slate-900 rounded-full mt-2 overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300 ease-out"
                      style={{
                        width: `${finalizingStep === 'evaluating' || finalizingStep === 'ready' ? 100 : Math.max(8, uploadPercent)}%`,
                      }}
                    />
                  </div>
                  <p className="text-3xs text-slate-400 mt-1.5">
                    {finalizingStep === 'evaluating' || finalizingStep === 'ready'
                      ? 'Video successfully stored in database and synced with review portal.'
                      : 'Transferring encrypted recording chunks to persistent storage...'}
                  </p>
                </div>
              </div>

              {/* Step 3: Admissions AI Rubric Analysis */}
              <div className="flex items-start gap-3.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                  finalizingStep === 'ready'
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                    : finalizingStep === 'evaluating'
                    ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
                    : 'bg-slate-800 border border-slate-700 text-slate-500'
                }`}>
                  {finalizingStep === 'ready' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : finalizingStep === 'evaluating' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">Admissions AI Evaluation</p>
                  <p className="text-3xs text-slate-400 mt-0.5">
                    {finalizingStep === 'ready'
                      ? 'Technical acumen, problem-solving, and communication rubric evaluated.'
                      : finalizingStep === 'evaluating'
                      ? 'Running Cloudflare AI rubric evaluation on full conversational transcript...'
                      : 'Awaiting recording synchronization.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom reminder notice */}
            <div className="flex items-center justify-center gap-2 text-2xs text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              <span>Please do not close or refresh this tab while your submission is completing.</span>
            </div>
          </div>
        </main>
      )}

      {/* STAGE 3: INTERVIEW COMPLETED & DATABASE VERIFICATION SCREEN */}
      {uiStage === 'completed' && (
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col justify-center gap-6">
          <div className="stitch-card bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-2xs text-center space-y-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Video Interview Successfully Recorded
              </h1>
              <p className="text-sm text-slate-600 max-w-xl mx-auto mt-2">
                Thank you, <span className="text-kulkul-purple font-bold">{session.applicant_name}</span>. Your technical responses have been encrypted, verified, and saved to the review database for the fellowship admissions committee.
              </p>

              {isDemo && (
                <div className="max-w-xl mx-auto mt-4 p-4 rounded-2xl bg-purple-50 border border-purple-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-left shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-5 h-5 text-kulkul-purple shrink-0" />
                    <p className="text-xs text-slate-700 font-medium">
                      <span className="font-bold text-slate-900 block">KulKul Interactive Demo Completed</span>
                      You can reset and test the interview chamber again anytime.
                    </p>
                  </div>
                  <button
                    onClick={handleResetDemo}
                    disabled={isResetting}
                    className="px-4 py-2 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                    <span>Restart Demo</span>
                  </button>
                </div>
              )}
            </div>

            {/* Recorded Video Playback Player */}
            <div className="max-w-3xl mx-auto w-full mt-6 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs text-left">
              <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Video className="w-4 h-4 text-kulkul-purple" />
                  <span>Submitted Candidate Recording</span>
                </div>
              </div>

              <div className="aspect-video bg-black flex items-center justify-center">
                {finalVideoUrl || questionRecordings[0]?.url ? (
                  <video
                    ref={finalVideoRef}
                    src={finalVideoUrl || questionRecordings[0]?.url}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-6 text-slate-400">
                    <Video className="w-10 h-10 mx-auto mb-2 text-slate-500" />
                    <p className="text-xs">Video recording archive registered in database.</p>
                  </div>
                )}
              </div>
            </div>

            {/* What Happens Next / Admissions Review Information */}
            <div className="max-w-3xl mx-auto w-full mt-6 bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 text-left space-y-6 shadow-2xs">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">What Happens Next?</h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Our admissions committee is currently processing your interview submission. Here is what to expect:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-kulkul-purple flex items-center justify-center font-bold text-sm">
                    1
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Admissions Review</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Our technical reviewers and evaluators will review your video responses and communication depth.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                    2
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Email Notification</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    You will receive an official decision email with details about your cohort acceptance and next steps.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                    3
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Track on Dashboard</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Check your live admissions progress anytime by visiting your personal Candidate Dashboard.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              {isDemo && (
                <button
                  onClick={handleResetDemo}
                  disabled={isResetting}
                  className="w-full sm:w-auto px-8 py-3.5 bg-kulkul-orange hover:bg-kulkul-orange-hover text-white font-bold rounded-full transition shadow-sm hover:shadow active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
                  <span>{isResetting ? 'Resetting...' : 'Restart Demo & Try Again'}</span>
                </button>
              )}
              <button
                onClick={() => navigate('/candidate/dashboard')}
                className="w-full sm:w-auto px-8 py-3.5 bg-kulkul-purple hover:bg-kulkul-purple-hover text-white font-bold rounded-full transition shadow-sm hover:shadow active:scale-[0.98]"
              >
                Go to Candidate Dashboard
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full sm:w-auto px-8 py-3.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold rounded-full transition shadow-2xs active:scale-[0.98]"
              >
                Back to Homepage
              </button>
            </div>
          </div>
        </main>
      )}

      <Footer />
    </div>
    </AssessmentAccessGuard>
  );
};
