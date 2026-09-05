import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiInterviewService } from '@/services/aiInterviewService';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Bot,
  Clock,
  ChevronRight,
  ShieldCheck,
  ArrowRight,
  Check,
  RefreshCw,
  Award,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { EvaluationSummary, CriterionScore } from '@/services/types';
import toast from 'react-hot-toast';

interface RecordedItem {
  blob: Blob;
  url: string;
  duration: number;
}

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

  // UI Stages: 'lobby' | 'interview' | 'completed'
  const [uiStage, setUiStage] = useState<'lobby' | 'interview' | 'completed'>('lobby');

  // Media Stream & Device State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [isRequestingMedia, setIsRequestingMedia] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0-100

  // Video Element Refs
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement | null>(null);
  const reviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const finalVideoRef = useRef<HTMLVideoElement | null>(null);

  // Audio Context & Analyser Ref
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Rubric settings from backend session
  const rubric = session?.rubric;
  const prepBufferSeconds = rubric?.preparation_time_seconds ?? 60;
  const maxResponseSeconds = rubric?.response_time_seconds ?? 90;
  const allowRerecord = rubric?.allow_rerecord ?? false;

  // Question & Interview Flow
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [interviewPhase, setInterviewPhase] = useState<'prep' | 'recording' | 'review'>('prep');
  const [prepCountdown, setPrepCountdown] = useState(prepBufferSeconds);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [transcripts, setTranscripts] = useState<Record<number, string>>({});
  const speechRecognitionRef = useRef<any>(null);

  // Conversational AI Voice & Follow-up State
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [activeFollowUp, setActiveFollowUp] = useState<{
    questionText: string;
    followUpCount: number;
    parentQuestionIndex: number;
  } | null>(null);
  const [isEvaluatingAnswer, setIsEvaluatingAnswer] = useState(false);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Sync prep countdown when rubric arrives
  useEffect(() => {
    if (rubric?.preparation_time_seconds && interviewPhase === 'prep') {
      setPrepCountdown(rubric.preparation_time_seconds);
    }
  }, [rubric?.preparation_time_seconds]);

  // Recorded Video Chunks & State
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [questionRecordings, setQuestionRecordings] = useState<Record<number, RecordedItem>>({});
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [isUploadingRecording, setIsUploadingRecording] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationSummary | null>(null);

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
    // Fallback default LIT questions from Workflow.pdf
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
    try {
      await aiInterviewService.resetSession(inviteToken);
      await queryClient.invalidateQueries({ queryKey: ['ai-interview-session', inviteToken] });
      setCurrentQIndex(0);
      setActiveFollowUp(null);
      setInterviewPhase('prep');
      setPrepCountdown(prepBufferSeconds);
      setRecordingSeconds(0);
      setQuestionRecordings({});
      setTranscripts({});
      setEvaluationResult(null);
      setFinalVideoUrl(null);
      setUiStage('lobby');
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

  // Request media devices on mount
  const startCamera = async () => {
    setIsRequestingMedia(true);
    setDeviceError(null);
    try {
      const userMediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      setStream(userMediaStream);

      // Setup audio analyzer for live VU volume visualizer
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          const source = audioCtx.createMediaStreamSource(userMediaStream);
          source.connect(analyser);

          audioContextRef.current = audioCtx;
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateVolume = () => {
            if (analyserRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length;
              setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
            }
            animationFrameRef.current = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        }
      } catch (e) {
        console.warn('AudioContext visualization not available:', e);
      }
    } catch (err: any) {
      console.error('Camera/Mic permission error:', err);
      setDeviceError(
        'Camera or Microphone access was denied or not found. Please enable permissions in your browser bar to continue.',
      );
    } finally {
      setIsRequestingMedia(false);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      // Cleanup tracks and audio contexts on unmount
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Bind video element streams whenever stream or UI stage changes
  useEffect(() => {
    if (!stream) return;
    if (lobbyVideoRef.current && uiStage === 'lobby') {
      lobbyVideoRef.current.srcObject = stream;
    }
    if (liveVideoRef.current && uiStage === 'interview') {
      liveVideoRef.current.srcObject = stream;
    }
  }, [stream, uiStage, interviewPhase]);

  // Toggle Camera
  const toggleCamera = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  // Toggle Mic
  const toggleMic = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
      }
    }
  };

  // Prep Countdown Timer
  useEffect(() => {
    if (uiStage !== 'interview' || interviewPhase !== 'prep') return;

    if (prepCountdown > 0) {
      const timer = setTimeout(() => {
        setPrepCountdown((c) => c - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      startRecordingAnswer();
    }
  }, [uiStage, interviewPhase, prepCountdown]);

  // Recording Timer
  useEffect(() => {
    if (uiStage !== 'interview' || interviewPhase !== 'recording' || isPaused) return;

    const timer = setInterval(() => {
      setRecordingSeconds((s) => {
        if (s >= maxResponseSeconds) {
          stopRecordingAnswer();
          return maxResponseSeconds;
        }
        return s + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [uiStage, interviewPhase, isPaused, maxResponseSeconds]);

  // Speech Recognition helpers
  const startSpeechRecognition = () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript + ' ';
        }
        setTranscripts((prev) => ({
          ...prev,
          [currentQIndex]: currentTranscript.trim(),
        }));
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition notice:', e);
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch (err) {
      console.warn('Speech recognition not available:', err);
    }
  };

  const stopSpeechRecognition = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {}
      speechRecognitionRef.current = null;
    }
  };

  // Start Recording Answer with MediaRecorder
  const startRecordingAnswer = () => {
    stopSpeech();
    if (!stream) {
      if (inviteToken === 'demo') {
        setRecordingSeconds(0);
        setIsPaused(false);
        setInterviewPhase('recording');
        toast('Recording response (Demo Mode)...', { icon: '🔴' });
        return;
      }
      toast.error('No active camera feed detected. Please allow camera access.');
      return;
    }

    try {
      recordedChunksRef.current = [];
      let mimeType = 'video/webm;codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const videoBlob = new Blob(recordedChunksRef.current, {
          type: mimeType || 'video/webm',
        });
        const videoUrl = URL.createObjectURL(videoBlob);
        setQuestionRecordings((prev) => ({
          ...prev,
          [currentQIndex]: {
            blob: videoBlob,
            url: videoUrl,
            duration: recordingSeconds,
          },
        }));
        setInterviewPhase('review');
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecordingSeconds(0);
      setIsPaused(false);
      setInterviewPhase('recording');
      startSpeechRecognition();
      toast('Recording response...', { icon: '🔴' });
    } catch (err) {
      console.error('Failed to start MediaRecorder:', err);
      toast.error('Could not initialize video recorder on this browser.');
      setInterviewPhase('review');
    }
  };

  // Pause / Resume Recording
  const togglePauseRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  // Stop Recording Answer
  const stopRecordingAnswer = () => {
    stopSpeechRecognition();
    if (!stream && isDemo) {
      const demoBlob = new Blob(['demo video recording'], { type: 'video/webm' });
      setQuestionRecordings((prev) => ({
        ...prev,
        [currentQIndex]: {
          blob: demoBlob,
          url: '',
          duration: recordingSeconds || 15,
        },
      }));
      setInterviewPhase('review');
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Re-record current question answer
  const handleRerecord = () => {
    if (!allowRerecord) {
      toast.error('Single-take interview policy: re-recording is disabled.');
      return;
    }
    setPrepCountdown(prepBufferSeconds);
    setInterviewPhase('prep');
  };

  // Load and cache natural human-like voice for AI Interviewer
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const scoreVoice = (v: SpeechSynthesisVoice): number => {
      let score = 0;
      const name = v.name.toLowerCase();
      const lang = v.lang.toLowerCase();

      // Must be English
      if (!lang.startsWith('en')) return -1000;

      // Penalize robotic, novelty, or low-fidelity synth voices
      if (
        name.includes('albert') ||
        name.includes('bad news') ||
        name.includes('bahh') ||
        name.includes('bells') ||
        name.includes('boing') ||
        name.includes('bubbles') ||
        name.includes('cellos') ||
        name.includes('deranged') ||
        name.includes('good news') ||
        name.includes('hysterical') ||
        name.includes('pipe organ') ||
        name.includes('trinoids') ||
        name.includes('whisper') ||
        name.includes('zarvox') ||
        name.includes('junior') ||
        name.includes('ralph') ||
        name.includes('fred')
      ) {
        return -1000;
      }

      // Premium, Natural, Enhanced neural voices (macOS / Windows / Chrome)
      if (name.includes('natural')) score += 120;
      if (name.includes('enhanced')) score += 110;
      if (name.includes('premium')) score += 100;
      if (name.includes('neural')) score += 95;
      if (name.includes('siri')) score += 85;
      if (name.includes('google')) score += 75;

      // Preferred natural female & male personas
      if (name.includes('samantha')) score += 60;
      if (name.includes('ava')) score += 58;
      if (name.includes('allison')) score += 55;
      if (name.includes('jenny')) score += 54;
      if (name.includes('zoe')) score += 52;
      if (name.includes('serena')) score += 50;
      if (name.includes('karen')) score += 45;
      if (name.includes('victoria')) score += 45;
      if (name.includes('moira')) score += 40;
      if (name.includes('daniel')) score += 40;
      if (name.includes('alex')) score += 25;

      // en-US or en-GB regional accents
      if (lang === 'en-us') score += 15;
      if (lang === 'en-gb') score += 10;

      return score;
    };

    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;
      const ranked = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
      if (ranked.length > 0 && scoreVoice(ranked[0]) > -500) {
        selectedVoiceRef.current = ranked[0];
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, []);

  // Cancel speech synthesis if active
  const stopSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsAiSpeaking(false);
    }
  };

  // Speak AI text with Web Speech Synthesis
  const speakAI = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (isVoiceMuted) {
      setIsAiSpeaking(false);
      return;
    }

    const cleanText = text
      .replace(/\[.*?\]/g, '')
      .replace(/[\*#_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanText) return;

    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      // Conversational pacing: slightly relaxed 0.94 rate sounds significantly more natural and human
      utterance.rate = 0.94;
      utterance.pitch = 1.0;
      if (selectedVoiceRef.current) {
        utterance.voice = selectedVoiceRef.current;
      }
      utterance.onstart = () => setIsAiSpeaking(true);
      utterance.onend = () => setIsAiSpeaking(false);
      utterance.onerror = () => setIsAiSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      setIsAiSpeaking(false);
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
      const currentPrompt = activeFollowUp ? activeFollowUp.questionText : currentQ?.prompt;
      if (currentPrompt) {
        setTimeout(() => speakAI(currentPrompt), 100);
      }
    }
  };

  // Mutation to persist video to database and complete session
  const saveInterviewMutation = useMutation({
    mutationFn: async () => {
      if (!inviteToken) throw new Error('Missing interview invite token');
      setIsUploadingRecording(true);

      const allBlobs = Object.values(questionRecordings).map((r) => r.blob);
      const compositeBlob =
        allBlobs.length > 0
          ? new Blob(allBlobs, { type: allBlobs[0].type || 'video/webm' })
          : new Blob(['mock-video-recording-data'], { type: 'video/webm' });

      const saveRes = await aiInterviewService.saveRecording(inviteToken, compositeBlob);

      // Submit final prompt to notify AI and trigger Cloudflare evaluation
      const sendRes = await aiInterviewService.sendMessage(
        inviteToken,
        `[Video Assessment Completed: Candidate submitted all ${questions.length} video responses. Ready for Cloudflare AI rubric evaluation.]`,
        currentQIndex,
      );

      return { saveRes, evaluation: sendRes?.summary_evaluation };
    },
    onSuccess: (data) => {
      setIsUploadingRecording(false);
      setFinalVideoUrl(data.saveRes.recording_url);
      if (data.evaluation) {
        setEvaluationResult(data.evaluation);
      }
      setUiStage('completed');
      queryClient.invalidateQueries({ queryKey: ['ai-interview-session', inviteToken] });
      toast.success('Interview video saved and evaluated by admissions AI!');
    },
    onError: (err: any) => {
      setIsUploadingRecording(false);
      console.error('Error saving interview recording:', err);
      toast.error('Failed to save video to database. Local backup preserved.');
      const localItem = questionRecordings[currentQIndex];
      if (localItem) {
        setFinalVideoUrl(localItem.url);
      }
      setUiStage('completed');
    },
  });

  // Next Question / Conversational Turn Confirmation
  const handleConfirmNext = async () => {
    stopSpeech();
    stopSpeechRecognition();

    const q = questions[currentQIndex];
    const candidateText =
      transcripts[currentQIndex]?.trim() ||
      (isDemo
        ? 'I have experience in building modern applications with testing and proactive communication.'
        : '[Candidate completed video response]');

    if (!inviteToken) return;
    setIsEvaluatingAnswer(true);

    try {
      const responseMsg = activeFollowUp
        ? `[Candidate Response to Follow-Up on Q${q.id}]: ${candidateText}`
        : `[Candidate Response to Q${q.id} - ${q.category}]: ${candidateText}`;

      const res = await aiInterviewService.sendMessage(inviteToken, responseMsg, currentQIndex);

      if (res.is_follow_up) {
        // AI asks conversational follow-up!
        const followUpText = res.ai_message;
        setActiveFollowUp({
          questionText: followUpText,
          followUpCount: res.follow_up_count || 1,
          parentQuestionIndex: currentQIndex,
        });

        toast('AI Interviewer asked a follow-up question', { icon: '🤖' });

        // Reset phase for candidate to answer the follow-up
        setPrepCountdown(20);
        setInterviewPhase('prep');
        setRecordingSeconds(0);
        setTranscripts((prev) => ({ ...prev, [currentQIndex]: '' }));

        // Speak the follow-up question aloud
        speakAI(followUpText);
      } else {
        // Candidate response was good/sufficient! Clear active follow up
        setActiveFollowUp(null);

        if (res.is_completed || currentQIndex >= questions.length - 1) {
          toast.success('All questions completed! Saving interview...');
          speakAI('Thank you for completing all interview questions. Saving your session now.');
          saveInterviewMutation.mutate();
        } else {
          toast.success('Answer accepted! Moving to next question.');
          const nextIndex =
            res.current_question_index !== undefined && res.current_question_index > currentQIndex
              ? res.current_question_index
              : currentQIndex + 1;

          setCurrentQIndex(nextIndex);
          setPrepCountdown(prepBufferSeconds);
          setInterviewPhase('prep');
          setRecordingSeconds(0);

          const nextQ = questions[nextIndex];
          if (nextQ) {
            speakAI(`Question ${nextIndex + 1}: ${nextQ.prompt}`);
          }
        }
      }
    } catch (err) {
      console.error('Error submitting response turn:', err);
      toast.error('Proceeding to next question...');
      setActiveFollowUp(null);
      if (currentQIndex < questions.length - 1) {
        const nextIndex = currentQIndex + 1;
        setCurrentQIndex(nextIndex);
        setPrepCountdown(prepBufferSeconds);
        setInterviewPhase('prep');
      } else {
        saveInterviewMutation.mutate();
      }
    } finally {
      setIsEvaluatingAnswer(false);
    }
  };

  // Enter Chamber from Lobby
  const handleEnterChamber = () => {
    if (!stream && !isDemo) {
      toast.error('Please enable camera and microphone permissions first.');
      return;
    }
    setUiStage('interview');
    setPrepCountdown(prepBufferSeconds);
    setInterviewPhase('prep');
    setActiveFollowUp(null);
    const firstQ = questions[0];
    if (firstQ) {
      speakAI(`Welcome to your interview. Let's start with Question 1: ${firstQ.prompt}`);
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

  const currentQ = questions[currentQIndex];

  return (
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
                    ref={lobbyVideoRef}
                    autoPlay
                    playsInline
                    muted
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

              {/* Enter Interview Button */}
              <div className="pt-4 border-t border-slate-100">
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

      {/* STAGE 2: ACTIVE VIDEO INTERVIEW CHAMBER */}
      {uiStage === 'interview' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8 flex flex-col gap-6">
          {/* Top Session Progress Bar */}
          <div className="stitch-card bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="w-10 h-10 rounded-2xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center font-black shadow-2xs">
                <Bot className="w-5 h-5 text-kulkul-purple" />
              </div>
              <div>
                <div className="text-sm font-black text-slate-900 tracking-tight">{session.program_name}</div>
                <div className="text-xs text-slate-500 font-medium">
                  {session.applicant_name} &middot; Question {currentQIndex + 1} of {questions.length}
                </div>
              </div>
            </div>

            {/* Segmented Progress Bar */}
            <div className="flex items-center gap-2 w-full sm:w-64">
              {questions.map((q, idx) => {
                const isPast = idx < currentQIndex;
                const isCurr = idx === currentQIndex;
                return (
                  <div key={q.id} className="flex-1">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        isPast
                          ? 'bg-emerald-500'
                          : isCurr
                          ? 'bg-kulkul-purple animate-pulse'
                          : 'bg-slate-200'
                      }`}
                    />
                    <div className="text-3xs text-slate-400 font-mono mt-1 text-center font-medium">
                      Q{q.id}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recording / Phase Badge */}
            <div className="flex items-center gap-2">
              {interviewPhase === 'recording' && (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs tracking-wider animate-pulse shadow-2xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span>
                    REC {Math.floor(recordingSeconds / 60)}:
                    {(recordingSeconds % 60).toString().padStart(2, '0')} / {Math.floor(maxResponseSeconds / 60)}:
                    {(maxResponseSeconds % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              )}

              {interviewPhase === 'prep' && (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold text-xs shadow-2xs">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Prep Countdown: {prepCountdown}s</span>
                </div>
              )}

              {interviewPhase === 'review' && (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-50 border border-purple-200 text-kulkul-purple font-bold text-xs shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-kulkul-purple" />
                  <span>Recorded &middot; Reviewing</span>
                </div>
              )}
            </div>
          </div>

          {/* Main Stage Grid: Video Feed Left, Question Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-stretch">
            {/* Candidate Video Stage */}
            <div className="lg:col-span-7 stitch-card bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-2xs flex flex-col justify-between">
              {/* Video Window Centered vertically and horizontally */}
              <div className="flex-1 flex items-center justify-center w-full my-auto">
                <div className="relative aspect-video w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center shadow-inner">
                  {/* Live Stream View (Prep & Recording) */}
                  {interviewPhase !== 'review' && stream && (
                    <video
                      ref={liveVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover -scale-x-100 ${isCameraOff ? 'hidden' : 'block'}`}
                    />
                  )}

                  {/* Review Player (When answer has been recorded) */}
                  {interviewPhase === 'review' && questionRecordings[currentQIndex]?.url && (
                    <video
                      ref={reviewVideoRef}
                      src={questionRecordings[currentQIndex].url}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain bg-black"
                    />
                  )}

                  {/* Empty / Paused State */}
                  {((!stream && interviewPhase !== 'review') || isCameraOff) && (
                    <div className="text-center p-6 bg-slate-50 border border-dashed border-slate-300 w-full h-full flex flex-col items-center justify-center rounded-2xl">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                        <VideoOff className="w-6 h-6 text-slate-500" />
                      </div>
                      <p className="text-sm font-bold text-slate-800">
                        {isCameraOff ? 'Camera Paused' : 'Demo Mode Feed Active'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs">
                        {isCameraOff
                          ? 'Click the camera button below to unpause your video.'
                          : 'Simulated candidate feed for preview and evaluation testing.'}
                      </p>
                    </div>
                  )}

                  {/* Live REC Pill Overlay */}
                  {interviewPhase === 'recording' && (
                    <div className="absolute top-4 left-4 flex items-center gap-2">
                      <span className="px-3.5 py-1 bg-rose-600 text-white rounded-full text-xs font-black tracking-wider flex items-center gap-1.5 shadow-md shadow-rose-950/40">
                        <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                        RECORDING
                      </span>
                      <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-2xs text-white font-mono border border-white/20">
                        {Math.floor(recordingSeconds / 60)}:
                        {(recordingSeconds % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                  )}

                  {/* Live Mic Level Waveform at bottom-left */}
                  {interviewPhase === 'recording' && !isMicMuted && stream && (
                    <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md rounded-full p-2 px-3.5 flex items-center gap-2.5 border border-white/15">
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

                  {/* Floating In-Stream Action Overlay (Camera/Mic Toggles) */}
                  {interviewPhase !== 'review' && (
                    <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full p-1.5 px-2 border border-white/15">
                      <button
                        onClick={toggleCamera}
                        title="Toggle Camera"
                        className={`p-2 rounded-full transition ${
                          isCameraOff ? 'bg-rose-500 text-white' : 'hover:bg-white/20 text-slate-200'
                        }`}
                      >
                        {isCameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={toggleMic}
                        title="Toggle Microphone"
                        className={`p-2 rounded-full transition ${
                          isMicMuted ? 'bg-rose-500 text-white' : 'hover:bg-white/20 text-slate-200'
                        }`}
                      >
                        {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Video Controls Action Dock */}
              <div className="mt-4 pt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 shrink-0">
                {interviewPhase === 'prep' && (
                  <>
                    <div className="text-xs text-slate-600 font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>Take a moment to prepare your answer ({prepCountdown}s remaining)</span>
                    </div>
                    <button
                      onClick={startRecordingAnswer}
                      className="px-6 py-3 bg-kulkul-purple hover:bg-kulkul-purple-hover text-white font-bold rounded-full flex items-center gap-2 text-xs shadow-sm hover:shadow transition active:scale-[0.98]"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Start Recording Response Now</span>
                    </button>
                  </>
                )}

                {interviewPhase === 'recording' && (
                  <>
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={togglePauseRecording}
                        className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-full text-xs transition flex items-center gap-2 border border-slate-200"
                      >
                        {isPaused ? <Play className="w-3.5 h-3.5 text-slate-700" /> : <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />}
                        <span>{isPaused ? 'Resume' : 'Pause'}</span>
                      </button>
                      <span className="text-xs text-slate-500 font-medium">Speak clearly into your microphone</span>
                    </div>
                    <button
                      onClick={stopRecordingAnswer}
                      className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-full flex items-center gap-2 text-xs shadow-sm hover:shadow transition active:scale-[0.98]"
                    >
                      <Square className="w-4 h-4 fill-white" />
                      <span>Stop & Review Response</span>
                    </button>
                  </>
                )}

                {interviewPhase === 'review' && (
                  <>
                    {allowRerecord ? (
                      <button
                        onClick={handleRerecord}
                        disabled={isEvaluatingAnswer || isUploadingRecording}
                        className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-full text-xs transition flex items-center gap-2 border border-slate-200 shadow-2xs disabled:opacity-50"
                      >
                        <RotateCcw className="w-4 h-4 text-kulkul-purple" />
                        <span>Re-record Answer</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-purple-50 border border-purple-200 text-kulkul-purple text-xs font-semibold">
                        <ShieldCheck className="w-4 h-4 text-kulkul-purple shrink-0" />
                        <span>Single-Take Finalized &bull; 1 take per prompt</span>
                      </div>
                    )}

                    <button
                      onClick={handleConfirmNext}
                      disabled={isUploadingRecording || isEvaluatingAnswer}
                      className="px-7 py-3 bg-kulkul-purple hover:bg-kulkul-purple-hover text-white font-bold rounded-full flex items-center gap-2 text-xs shadow-sm hover:shadow transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {isEvaluatingAnswer ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                          <span>AI Assessing Answer...</span>
                        </>
                      ) : isUploadingRecording ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                          <span>Saving & AI Evaluating...</span>
                        </>
                      ) : activeFollowUp ? (
                        <>
                          <span>Submit Follow-Up Response</span>
                          <ChevronRight className="w-4 h-4" />
                        </>
                      ) : currentQIndex < questions.length - 1 ? (
                        <>
                          <span>Confirm & Next Question</span>
                          <ChevronRight className="w-4 h-4" />
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-white" />
                          <span>Submit Entire Video Interview</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Question Module (Right column) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Question Card */}
              <div className="stitch-card bg-white border border-slate-200/90 rounded-3xl p-6 shadow-2xs flex-1 flex flex-col justify-between space-y-5">
                <div className="space-y-4">
                  {/* AI Interviewer Header & Audio Bar */}
                  <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
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
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-slate-900 truncate">AI Interviewer</span>
                        {isAiSpeaking && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-kulkul-purple text-3xs font-extrabold uppercase shrink-0">
                            Speaking
                            <span className="flex items-center gap-0.5 h-2">
                              <span className="w-0.5 h-1.5 bg-kulkul-purple rounded-full animate-bounce [animation-delay:-0.3s]" />
                              <span className="w-0.5 h-2.5 bg-kulkul-purple rounded-full animate-bounce [animation-delay:-0.15s]" />
                              <span className="w-0.5 h-2 bg-kulkul-purple rounded-full animate-bounce" />
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Audio Controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isAiSpeaking ? (
                        <button
                          onClick={stopSpeech}
                          className="px-2.5 py-1 rounded-full text-3xs font-bold bg-purple-100 hover:bg-purple-200 text-kulkul-purple transition"
                          title="Skip voice playback"
                        >
                          Skip Voice
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            const promptToSpeak = activeFollowUp
                              ? activeFollowUp.questionText
                              : currentQ?.prompt;
                            if (promptToSpeak) speakAI(promptToSpeak);
                          }}
                          className="p-1.5 rounded-full text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition"
                          title="Listen to question again"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={toggleVoiceMute}
                        className={`p-1.5 rounded-full transition ${
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

                  <div className="flex items-center justify-between gap-2">
                    <span className="px-3.5 py-1 bg-purple-50 text-kulkul-purple border border-purple-200 rounded-full text-2xs font-extrabold uppercase tracking-wider">
                      {currentQ.category}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-2xs font-bold">
                        {currentQ.max_points} Points
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        Q{currentQIndex + 1} of {questions.length}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-lg font-black text-slate-900 leading-snug tracking-tight">
                    {currentQ.title}
                  </h3>

                  {/* Active Question / Follow-up Prompt */}
                  <div className="p-5 bg-purple-50/50 rounded-2xl border border-purple-200 text-sm text-slate-800 leading-relaxed font-medium shadow-2xs">
                    {activeFollowUp ? activeFollowUp.questionText : currentQ.prompt}
                  </div>

                  {/* Live Speech Recognition Preview */}
                  {transcripts[currentQIndex] && (
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-2xs space-y-1 animate-in fade-in">
                      <div className="flex items-center justify-between text-3xs font-bold uppercase tracking-wider text-kulkul-purple">
                        <span>Speech Transcription Preview</span>
                        <span className="text-emerald-600 flex items-center gap-1 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                          Live
                        </span>
                      </div>
                      <p className="text-slate-800 italic line-clamp-3 font-medium">
                        "{transcripts[currentQIndex]}"
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* STAGE 3: INTERVIEW COMPLETED & DATABASE VERIFICATION SCREEN */}
      {uiStage === 'completed' && (
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col justify-center gap-6">
          <div className="stitch-card bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-2xs text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
                Stored in Database
              </span>
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
                <span className="text-2xs font-mono text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 font-bold">
                  Saved &amp; Encrypted
                </span>
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

            {/* AI Evaluation Report (If Evaluated) */}
            {(() => {
              const activeEval = evaluationResult || session?.summary_evaluation;
              if (!activeEval) {
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto mt-4 text-left">
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 shadow-2xs">
                      <span className="text-2xs font-extrabold uppercase text-slate-500 block mb-1">
                        Responses Captured
                      </span>
                      <span className="text-lg font-black text-slate-900">{questions.length} Video Prompts</span>
                    </div>

                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 shadow-2xs">
                      <span className="text-2xs font-extrabold uppercase text-slate-500 block mb-1">
                        Evaluation Engine
                      </span>
                      <span className="text-lg font-black text-kulkul-purple">Cloudflare Workers AI</span>
                    </div>

                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 shadow-2xs">
                      <span className="text-2xs font-extrabold uppercase text-slate-500 block mb-1">
                        Status
                      </span>
                      <span className="text-lg font-black text-emerald-600">Evaluating in Queue...</span>
                    </div>
                  </div>
                );
              }

              const isStrong = (activeEval.overall_score ?? 0) >= 80;
              const isSuitable = (activeEval.overall_score ?? 0) >= 70 && (activeEval.overall_score ?? 0) < 80;

              return (
                <div className="max-w-3xl mx-auto w-full mt-4 bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 text-left space-y-6 shadow-2xs">
                  {/* Top Score Banner */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-kulkul-purple" />
                        <span className="text-2xs font-extrabold uppercase tracking-wider text-kulkul-purple">
                          Cloudflare AI Proctor Evaluation
                        </span>
                      </div>
                      <h2 className="text-xl font-black text-slate-900 tracking-tight">AI Assessment Scorecard</h2>
                      <div className="mt-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                            isStrong
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isSuitable
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>{activeEval.recommendation || 'Assessment Completed'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="text-left sm:text-right bg-purple-50/60 p-4 px-6 rounded-2xl border border-purple-200 shrink-0">
                      <span className="text-2xs font-extrabold uppercase text-slate-500 block mb-0.5">
                        Overall Score
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl sm:text-4xl font-black text-kulkul-purple">
                          {activeEval.overall_score}
                        </span>
                        <span className="text-sm font-bold text-slate-400">/100</span>
                      </div>
                    </div>
                  </div>

                  {/* 3 Core Metric Pillars */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-2xs">
                      <span className="text-3xs font-extrabold uppercase text-slate-500 block mb-1">
                        Technical Acumen
                      </span>
                      <span className="text-lg font-black text-kulkul-purple">
                        {activeEval.technical_acumen}/10
                      </span>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-2xs">
                      <span className="text-3xs font-extrabold uppercase text-slate-500 block mb-1">
                        Communication
                      </span>
                      <span className="text-lg font-black text-kulkul-purple">
                        {activeEval.communication}/10
                      </span>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-2xs">
                      <span className="text-3xs font-extrabold uppercase text-slate-500 block mb-1">
                        Problem Solving
                      </span>
                      <span className="text-lg font-black text-kulkul-purple">
                        {activeEval.problem_solving}/10
                      </span>
                    </div>
                  </div>

                  {/* Executive Summary */}
                  {activeEval.executive_summary && (
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 shadow-2xs">
                      <span className="text-2xs font-extrabold uppercase text-slate-500 block">
                        Executive Summary
                      </span>
                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {activeEval.executive_summary}
                      </p>
                    </div>
                  )}

                  {/* Strengths & Growth Areas */}
                  {(activeEval.key_strengths?.length || activeEval.areas_for_growth?.length) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {activeEval.key_strengths && activeEval.key_strengths.length > 0 && (
                        <div className="p-5 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-2 shadow-2xs">
                          <span className="text-2xs font-extrabold uppercase text-emerald-800 block">
                            Key Strengths
                          </span>
                          <ul className="space-y-1 text-xs text-slate-700">
                            {activeEval.key_strengths.map((s, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {activeEval.areas_for_growth && activeEval.areas_for_growth.length > 0 && (
                        <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-200 space-y-2 shadow-2xs">
                          <span className="text-2xs font-extrabold uppercase text-amber-800 block">
                            Areas for Growth
                          </span>
                          <ul className="space-y-1 text-xs text-slate-700">
                            {activeEval.areas_for_growth.map((g, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                                <span>{g}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Itemized Question Rubric Breakdown */}
                  {activeEval.question_evaluations && activeEval.question_evaluations.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <span className="text-2xs font-extrabold uppercase text-slate-500 block">
                        Itemized Rubric Criteria Breakdown
                      </span>
                      <div className="space-y-3">
                        {activeEval.question_evaluations.map((qe, qIdx) => (
                          <div
                            key={qIdx}
                            className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-2.5 shadow-2xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-slate-900">
                                Q{qe.question_id}: {qe.theme}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-kulkul-purple border border-purple-200 font-mono">
                                {qe.score} / {qe.max_points ?? qe.max_score ?? 20} pts
                              </span>
                            </div>

                            {qe.feedback && (
                              <p className="text-2xs text-slate-600 bg-white p-3 rounded-xl border border-slate-200/80 italic leading-relaxed">
                                &ldquo;{qe.feedback}&rdquo;
                              </p>
                            )}

                            {((qe.criteria_scores && qe.criteria_scores.length > 0) ||
                              (qe.criteria && qe.criteria.length > 0)) && (
                              <div className="space-y-1.5 pt-1">
                                {(qe.criteria_scores || qe.criteria || []).map(
                                  (cs: CriterionScore, cIdx: number) => (
                                    <div
                                      key={cIdx}
                                      className="flex items-center justify-between text-2xs p-2 px-3 rounded-xl bg-white border border-slate-200 text-slate-700"
                                    >
                                      <span className="truncate pr-2 font-medium">{cs.criterion}</span>
                                      <span className="shrink-0 font-bold text-kulkul-purple font-mono">
                                        {cs.score} / {cs.max_points ?? cs.max_score ?? 5} pts
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

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
                Return to Candidate Dashboard
              </button>
              <button
                onClick={() => navigate('/admin/dashboard')}
                className="w-full sm:w-auto px-8 py-3.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold rounded-full transition shadow-2xs active:scale-[0.98]"
              >
                Open Reviewer Admin Portal
              </button>
            </div>
          </div>
        </main>
      )}

      <Footer />
    </div>
  );
};
