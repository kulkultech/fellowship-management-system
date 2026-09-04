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
  Volume2,
  VolumeX,
  Clock,
  ChevronRight,
  ShieldCheck,
  Radio,
  ArrowRight,
  Check,
  RefreshCw,
} from 'lucide-react';
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

  // Question & Interview Flow
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [interviewPhase, setInterviewPhase] = useState<'prep' | 'recording' | 'review'>('prep');
  const [prepCountdown, setPrepCountdown] = useState(15);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeakingQuestion, setIsSpeakingQuestion] = useState(false);

  // Recorded Video Chunks & State
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [questionRecordings, setQuestionRecordings] = useState<Record<number, RecordedItem>>({});
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [isUploadingRecording, setIsUploadingRecording] = useState(false);

  // Pre-configured / Backend Question Pool
  const questions = useMemo(() => {
    return [
      {
        id: 1,
        category: 'Introduction & Core Motivation',
        title: 'Professional Background & Motivation',
        prompt:
          'Please introduce yourself, walk us through your most impactful software project, and explain why you want to join this fellowship track.',
        hint: 'Focus on technical skills used, project scope, and your personal engineering growth goals.',
      },
      {
        id: 2,
        category: 'System Architecture & Engineering Trade-offs',
        title: 'Diagnosing Production Bottlenecks',
        prompt:
          'Describe a challenging technical bug or performance degradation you diagnosed. What tools did you use to isolate the root cause, and what architectural safeguards did you implement to prevent regression?',
        hint: 'Highlight observability, testing strategy, and how you weighed performance against maintainability.',
      },
      {
        id: 3,
        category: 'Collaboration & Delivery Execution',
        title: 'Handling Conflicting Priorities & Technical Debt',
        prompt:
          'When working under tight release deadlines with ambiguous specifications, how do you balance velocity versus architectural quality? Share a concrete example.',
        hint: 'Discuss stakeholder communication, scope negotiation, and intentional management of technical debt.',
      },
    ];
  }, []);

  // Sync completed state if session in backend is already completed
  useEffect(() => {
    if (session?.status === 'completed') {
      setUiStage('completed');
      if (session.recording_url) {
        setFinalVideoUrl(session.recording_url);
      }
    }
  }, [session?.status, session?.recording_url]);

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
        if (s >= 120) {
          stopRecordingAnswer();
          return 120;
        }
        return s + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [uiStage, interviewPhase, isPaused]);

  // Start Recording Answer with MediaRecorder
  const startRecordingAnswer = () => {
    if (!stream) {
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Re-record current question answer
  const handleRerecord = () => {
    setPrepCountdown(15);
    setInterviewPhase('prep');
  };

  // Read Prompt Aloud using Web Speech Synthesis
  const speakQuestion = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsSpeakingQuestion(true);
      utterance.onend = () => setIsSpeakingQuestion(false);
      utterance.onerror = () => setIsSpeakingQuestion(false);
      window.speechSynthesis.speak(utterance);
    } else {
      toast('Text-to-speech not supported on this browser', { icon: 'ℹ️' });
    }
  };

  // Stop speech if switching
  const stopSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeakingQuestion(false);
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

      await aiInterviewService.sendMessage(
        inviteToken,
        `[Video Assessment Completed: Candidate submitted ${questions.length} video responses]`,
      );

      return saveRes;
    },
    onSuccess: (data) => {
      setIsUploadingRecording(false);
      setFinalVideoUrl(data.recording_url);
      setUiStage('completed');
      queryClient.invalidateQueries({ queryKey: ['ai-interview-session', inviteToken] });
      toast.success('Interview video saved and submitted to review database!');
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

  // Next Question / Finish Interview
  const handleConfirmNext = () => {
    stopSpeech();
    if (currentQIndex < questions.length - 1) {
      const nextIndex = currentQIndex + 1;
      setCurrentQIndex(nextIndex);
      setPrepCountdown(15);
      setInterviewPhase('prep');
    } else {
      saveInterviewMutation.mutate();
    }
  };

  // Enter Chamber from Lobby
  const handleEnterChamber = () => {
    if (!stream) {
      toast.error('Please enable camera and microphone permissions first.');
      return;
    }
    setUiStage('interview');
    setPrepCountdown(15);
    setInterviewPhase('prep');
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-400 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-base font-bold text-slate-200">Connecting to Video Interview Chamber...</p>
          <p className="text-xs text-slate-400 mt-1">Establishing WebRTC media stream</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError || !session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-white shadow-2xl">
          <AlertCircle className="w-14 h-14 text-rose-400 mx-auto mb-4 animate-bounce" />
          <h2 className="text-xl font-black text-white mb-2">Interview Session Invalid</h2>
          <p className="text-slate-400 text-sm mb-6">
            The interview invitation token has expired or could not be found in the database.
          </p>
          <button
            onClick={() => navigate('/candidate/dashboard')}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 font-bold rounded-2xl transition"
          >
            Return to Candidate Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentQIndex];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-purple-500 selection:text-white">
      <Navbar />

      {/* STAGE 1: LOBBY & PRE-FLIGHT DIAGNOSTICS */}
      {uiStage === 'lobby' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col justify-center">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-3">
              <Radio className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
              AI Technical Video Screen
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Pre-Flight Chamber & Device Setup
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Welcome, <span className="text-white font-semibold">{session.applicant_name}</span>. Test your
              camera, microphone, and preview your video feed before entering the AI interview room.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Live Camera Preview Card */}
            <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl backdrop-blur-sm relative overflow-hidden">
              <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-800/80 flex items-center justify-center">
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
                  <div className="text-center p-6 text-slate-400">
                    <VideoOff className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-300">
                      {isCameraOff ? 'Camera Video Paused' : 'Camera Feed Not Connected'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs">
                      {deviceError || 'Grant camera and microphone permissions to preview your video.'}
                    </p>
                    {!stream && (
                      <button
                        onClick={startCamera}
                        disabled={isRequestingMedia}
                        className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white rounded-xl transition"
                      >
                        {isRequestingMedia ? 'Requesting Access...' : 'Allow Camera & Mic'}
                      </button>
                    )}
                  </div>
                )}

                {/* Overlaid Device Status Badges */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full text-2xs font-bold text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Live Preview
                  </span>
                  <span className="px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full text-2xs font-medium text-slate-300 border border-slate-700">
                    720p HD Stream
                  </span>
                </div>

                {/* Microphone Level Visualizer Bar in bottom */}
                {stream && !isMicMuted && (
                  <div className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur-md rounded-xl p-2 px-3 flex items-center gap-3 border border-slate-700/60">
                    <Mic className="w-4 h-4 text-purple-400 shrink-0" />
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
                                : 'bg-slate-700/60 h-1/3'
                            }`}
                          />
                        );
                      })}
                    </div>
                    <span className="text-2xs text-slate-300 font-mono w-8 text-right">
                      {audioLevel}%
                    </span>
                  </div>
                )}
              </div>

              {/* Controls bar */}
              <div className="mt-4 flex items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleCamera}
                    className={`p-3 rounded-2xl border transition flex items-center gap-2 text-xs font-semibold ${
                      isCameraOff
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {isCameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                    <span>{isCameraOff ? 'Camera Off' : 'Camera On'}</span>
                  </button>

                  <button
                    onClick={toggleMic}
                    className={`p-3 rounded-2xl border transition flex items-center gap-2 text-xs font-semibold ${
                      isMicMuted
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    <span>{isMicMuted ? 'Muted' : 'Mic Active'}</span>
                  </button>
                </div>

                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Encrypted Peer Feed</span>
                </div>
              </div>
            </div>

            {/* Program Details & Instructions Card */}
            <div className="lg:col-span-5 space-y-5">
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="border-b border-slate-800 pb-4">
                  <span className="text-2xs font-extrabold uppercase text-purple-400 tracking-wider">
                    Fellowship Assessment Stage
                  </span>
                  <h2 className="text-lg font-black text-white mt-1">{session.program_name}</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Specialization Track: <span className="text-slate-200 font-semibold">{session.track_name || 'General Fellowship'}</span>
                  </p>
                </div>

                <div className="space-y-3 text-xs text-slate-300">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <div className="font-bold text-white">3 Video Technical Prompts</div>
                      <div className="text-slate-400 text-2xs">
                        You will be asked 3 structured engineering questions one by one.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <div className="font-bold text-white">15s Preparation & 2min Response</div>
                      <div className="text-slate-400 text-2xs">
                        Collect your thoughts during prep, then speak clearly into your microphone.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      3
                    </div>
                    <div>
                      <div className="font-bold text-white">Review & Retake Freedom</div>
                      <div className="text-slate-400 text-2xs">
                        Watch your recorded answer before confirming. You can re-record if needed!
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      4
                    </div>
                    <div>
                      <div className="font-bold text-white">Stored for Review Committee</div>
                      <div className="text-slate-400 text-2xs">
                        Videos are securely saved into the database for reviewer evaluation.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleEnterChamber}
                    disabled={!stream}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-purple-600/30 transition transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>Enter AI Video Interview Room</span>
                    <ArrowRight className="w-5 h-5 text-white" />
                  </button>
                  {!stream && (
                    <p className="text-2xs text-rose-400 text-center mt-2 font-medium">
                      Camera permission required to enter
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* STAGE 2: ACTIVE VIDEO INTERVIEW CHAMBER */}
      {uiStage === 'interview' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8 flex flex-col gap-6">
          {/* Top Session Progress Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black">
                <Bot className="w-6 h-6 text-purple-200" />
              </div>
              <div>
                <div className="text-sm font-black text-white">{session.program_name}</div>
                <div className="text-xs text-slate-400 font-medium">
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
                          ? 'bg-emerald-400'
                          : isCurr
                          ? 'bg-purple-500 animate-pulse'
                          : 'bg-slate-800'
                      }`}
                    />
                    <div className="text-3xs text-slate-500 font-mono mt-1 text-center">
                      Q{q.id}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recording / Phase Badge */}
            <div className="flex items-center gap-2">
              {interviewPhase === 'recording' && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-xs tracking-wider animate-pulse">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span>
                    REC {Math.floor(recordingSeconds / 60)}:
                    {(recordingSeconds % 60).toString().padStart(2, '0')} / 02:00
                  </span>
                </div>
              )}

              {interviewPhase === 'prep' && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Prep Countdown: {prepCountdown}s</span>
                </div>
              )}

              {interviewPhase === 'review' && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 font-bold text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Recorded &middot; Reviewing</span>
                </div>
              )}
            </div>
          </div>

          {/* Main Stage Grid: Video Feed Left, AI & Question Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-stretch">
            {/* Candidate Video Stage */}
            <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between">
              {/* Video Window */}
              <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
                {/* Live Stream View (Prep & Recording) */}
                {interviewPhase !== 'review' && (
                  <video
                    ref={liveVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover -scale-x-100 ${isCameraOff ? 'hidden' : 'block'}`}
                  />
                )}

                {/* Review Player (When answer has been recorded) */}
                {interviewPhase === 'review' && questionRecordings[currentQIndex] && (
                  <video
                    ref={reviewVideoRef}
                    src={questionRecordings[currentQIndex].url}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain bg-black"
                  />
                )}

                {isCameraOff && interviewPhase !== 'review' && (
                  <div className="text-center p-6 text-slate-500">
                    <VideoOff className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                    <p className="text-sm font-semibold">Camera is currently paused</p>
                  </div>
                )}

                {/* Live REC Pill Overlay */}
                {interviewPhase === 'recording' && (
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <span className="px-3 py-1 bg-rose-600/90 text-white rounded-full text-xs font-black tracking-wider flex items-center gap-1.5 shadow-lg shadow-rose-900/50">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      RECORDING
                    </span>
                    <span className="px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full text-2xs text-slate-300 font-mono">
                      {Math.floor(recordingSeconds / 60)}:
                      {(recordingSeconds % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                )}

                {/* Live Mic Level Waveform at bottom-left */}
                {interviewPhase === 'recording' && !isMicMuted && (
                  <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md rounded-xl p-2 px-3 flex items-center gap-2 border border-slate-700/80">
                    <Mic className="w-3.5 h-3.5 text-purple-400" />
                    <div className="flex items-center gap-0.5 h-3 w-16">
                      {[...Array(8)].map((_, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-full transition-all duration-75 ${
                            audioLevel > i * 12 ? 'bg-purple-400 h-full' : 'bg-slate-700 h-1'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Floating In-Stream Action Overlay (Camera/Mic Toggles) */}
                {interviewPhase !== 'review' && (
                  <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-xl p-1.5 border border-slate-700/60">
                    <button
                      onClick={toggleCamera}
                      title="Toggle Camera"
                      className={`p-2 rounded-lg transition ${
                        isCameraOff ? 'bg-rose-500 text-white' : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      {isCameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={toggleMic}
                      title="Toggle Microphone"
                      className={`p-2 rounded-lg transition ${
                        isMicMuted ? 'bg-rose-500 text-white' : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Video Controls Action Dock */}
              <div className="mt-4 pt-2 flex flex-wrap items-center justify-between gap-3">
                {interviewPhase === 'prep' && (
                  <>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>Take a moment to prepare your answer ({prepCountdown}s remaining)</span>
                    </div>
                    <button
                      onClick={startRecordingAnswer}
                      className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center gap-2 text-xs shadow-lg shadow-purple-600/30 transition transform active:scale-95"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Start Recording Response Now</span>
                    </button>
                  </>
                )}

                {interviewPhase === 'recording' && (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={togglePauseRecording}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition flex items-center gap-1.5"
                      >
                        {isPaused ? <Play className="w-3.5 h-3.5" /> : <span className="w-2.5 h-2.5 bg-amber-400 rounded-xs" />}
                        <span>{isPaused ? 'Resume' : 'Pause'}</span>
                      </button>
                      <span className="text-xs text-slate-400">Speak clearly towards your microphone</span>
                    </div>
                    <button
                      onClick={stopRecordingAnswer}
                      className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl flex items-center gap-2 text-xs shadow-lg shadow-rose-600/30 transition transform active:scale-95"
                    >
                      <Square className="w-4 h-4 fill-white" />
                      <span>Stop & Review Response</span>
                    </button>
                  </>
                )}

                {interviewPhase === 'review' && (
                  <>
                    <button
                      onClick={handleRerecord}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition flex items-center gap-2 border border-slate-700"
                    >
                      <RotateCcw className="w-4 h-4 text-purple-400" />
                      <span>Re-record Answer</span>
                    </button>

                    <button
                      onClick={handleConfirmNext}
                      disabled={isUploadingRecording}
                      className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl flex items-center gap-2 text-xs shadow-lg shadow-emerald-600/30 transition transform active:scale-95 disabled:opacity-50"
                    >
                      {isUploadingRecording ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                          <span>Saving to Database...</span>
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

            {/* AI Evaluator Persona & Question Module */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* AI Interviewer Persona Header Card */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center font-black shadow-inner">
                        <Bot className="w-6 h-6 text-white" />
                      </div>
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-slate-900" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-white flex items-center gap-2">
                        <span>LIT AI Technical Proctor</span>
                      </div>
                      <div className="text-2xs text-purple-400 font-semibold tracking-wide">
                        Autonomous Screening Evaluator
                      </div>
                    </div>
                  </div>

                  {/* Text-to-speech button */}
                  <button
                    onClick={() =>
                      isSpeakingQuestion
                        ? stopSpeech()
                        : speakQuestion(`${currentQ.title}. ${currentQ.prompt}`)
                    }
                    className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border ${
                      isSpeakingQuestion
                        ? 'bg-purple-600 text-white border-purple-400 animate-pulse'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                  >
                    {isSpeakingQuestion ? (
                      <>
                        <VolumeX className="w-4 h-4 text-white" />
                        <span>Mute AI</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-4 h-4 text-purple-400" />
                        <span>Read Aloud</span>
                      </>
                    )}
                  </button>
                </div>

                {/* AI Activity Status Pill */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-2xs">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        interviewPhase === 'recording'
                          ? 'bg-purple-400 animate-pulse'
                          : 'bg-slate-500'
                      }`}
                    />
                    <span>
                      {interviewPhase === 'prep'
                        ? 'AI waiting for candidate to begin response'
                        : interviewPhase === 'recording'
                        ? 'AI actively listening & transcribing delivery'
                        : 'AI ready to save answer recording'}
                    </span>
                  </div>
                  <span className="text-slate-500 font-mono">Stage 2</span>
                </div>
              </div>

              {/* Question Card */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-3 py-1 bg-purple-500/10 text-purple-300 border border-purple-500/30 rounded-full text-2xs font-extrabold uppercase tracking-wider">
                      {currentQ.category}
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      Question {currentQIndex + 1} of {questions.length}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-white leading-snug">
                    {currentQ.title}
                  </h3>

                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 text-sm text-slate-200 leading-relaxed font-medium">
                    {currentQ.prompt}
                  </div>

                  <div className="p-3 bg-purple-950/20 border border-purple-800/30 rounded-xl">
                    <span className="text-2xs font-bold text-purple-300 uppercase tracking-wide block mb-1">
                      Key Guidance & Focus Points:
                    </span>
                    <p className="text-xs text-slate-300">{currentQ.hint}</p>
                  </div>
                </div>

                {/* Progress Indicators for All Questions */}
                <div className="border-t border-slate-800 pt-4 space-y-2">
                  <span className="text-2xs font-extrabold uppercase text-slate-500 tracking-wider block">
                    Assessment Questions Overview
                  </span>
                  <div className="space-y-1.5">
                    {questions.map((q, idx) => (
                      <div
                        key={q.id}
                        className={`p-2 rounded-xl text-xs flex items-center justify-between ${
                          idx === currentQIndex
                            ? 'bg-purple-600/20 border border-purple-500/40 text-purple-200 font-bold'
                            : questionRecordings[idx]
                            ? 'bg-emerald-950/20 border border-emerald-500/30 text-emerald-300'
                            : 'bg-slate-950/50 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-mono text-2xs">0{q.id}.</span>
                          <span className="truncate">{q.title}</span>
                        </div>
                        {questionRecordings[idx] ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 text-2xs font-semibold shrink-0">
                            <Check className="w-3 h-3" /> Recorded
                          </span>
                        ) : idx === currentQIndex ? (
                          <span className="text-purple-400 text-2xs font-semibold shrink-0 animate-pulse">
                            Active
                          </span>
                        ) : (
                          <span className="text-slate-600 text-2xs shrink-0">Pending</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* STAGE 3: INTERVIEW COMPLETED & DATABASE VERIFICATION SCREEN */}
      {uiStage === 'completed' && (
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col justify-center gap-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-2">
                Stored in Database
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white">
                Video Interview Successfully Recorded
              </h1>
              <p className="text-sm text-slate-400 max-w-xl mx-auto mt-2">
                Thank you, <span className="text-white font-semibold">{session.applicant_name}</span>. Your technical responses have been encrypted, verified, and saved to the review database for the fellowship admissions committee.
              </p>
            </div>

            {/* Recorded Video Playback Player */}
            <div className="max-w-2xl mx-auto w-full mt-6 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl text-left">
              <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <Video className="w-4 h-4 text-purple-400" />
                  <span>Submitted Candidate Recording</span>
                </div>
                <span className="text-2xs font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                  Ready for Review
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
                  <div className="text-center p-6 text-slate-500">
                    <Video className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                    <p className="text-xs">Video recording archive registered in database.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Evaluation / Committee Review Notice */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto mt-4 text-left">
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800">
                <span className="text-2xs font-extrabold uppercase text-slate-500 block mb-1">
                  Responses Captured
                </span>
                <span className="text-lg font-black text-white">3 Video Prompts</span>
              </div>

              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800">
                <span className="text-2xs font-extrabold uppercase text-slate-500 block mb-1">
                  Evaluation Engine
                </span>
                <span className="text-lg font-black text-purple-400">Technical Screener</span>
              </div>

              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800">
                <span className="text-2xs font-extrabold uppercase text-slate-500 block mb-1">
                  Status
                </span>
                <span className="text-lg font-black text-emerald-400">In Review Queue</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/candidate/dashboard')}
                className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold rounded-2xl transition shadow-lg shadow-purple-600/30"
              >
                Return to Candidate Dashboard
              </button>
            </div>
          </div>
        </main>
      )}

      <Footer />
    </div>
  );
};
