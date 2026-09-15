import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from "framer-motion";
import type { Easing } from "framer-motion";
import { Mic, PhoneOff, Pause, Play, Loader2 } from "lucide-react";
import { WS_URL } from "@/lib/config";
import { Button } from "@/components/ui/button";
import MediaHandler from "@/Services/mediaHandler";
import { useInterview } from "@/hooks/useInterview";
import { toast } from "sonner";
import { SEO } from "@/components/seo/SEO";
import { apiClient } from "@/api/client";

type SessionState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'paused';

const Interview = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const assessmentId = searchParams.get('assessmentId');
  const navigate = useNavigate();

  const { data: interview, error: queryError, refetch: fetchInterview } = useInterview(id || '');

  const [error, setError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [elapsed, setElapsed] = useState(0);
  
  const mediaRef = useRef(new MediaHandler());
  const socketRef = useRef<WebSocket | null>(null);
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const intentionalCloseRef = useRef(false); // true when user pauses/ends — don't reconnect

  useEffect(() => {
    if (queryError) {
      setError("Failed to load interview. Please try again or check the URL.");
    }
  }, [queryError]);

  useEffect(() => {
    return () => {
      mediaRef.current.stopAudio();
      mediaRef.current.stopAudioPlayback();
      if (socketRef.current) socketRef.current.close();
      if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Timer logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (sessionState === 'listening' || sessionState === 'speaking') {
      interval = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionState]);

  // Polling logic for question updates when active
  useEffect(() => {
    if (sessionState === 'listening' || sessionState === 'speaking') {
      pollIntervalRef.current = setInterval(() => fetchInterview(), 5000);
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [sessionState, fetchInterview]);


  function connectSocket() {
    return new Promise<void>((resolve, reject) => {
      // Pass assessmentId so server knows this is a verification interview
      const wsUrl = assessmentId
        ? `${WS_URL}?id=${id}&assessmentId=${assessmentId}`
        : `${WS_URL}?id=${id}`;
      socketRef.current = new WebSocket(wsUrl);
      receiveAudioData();

      socketRef.current.onopen = () => {
        reconnectAttemptRef.current = 0; // reset on successful connection
        resolve();
      };
      socketRef.current.onerror = (err) => reject(err);
      socketRef.current.onclose = () => {
        // If user intentionally paused or ended, do not reconnect
        if (intentionalCloseRef.current) return;

        // Unexpected drop — attempt reconnect with backoff
        const MAX_RETRIES = 3;
        const attempt = reconnectAttemptRef.current;

        if (attempt < MAX_RETRIES) {
          reconnectAttemptRef.current += 1;
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          toast.warning(`Connection dropped. Reconnecting... (${attempt + 1}/${MAX_RETRIES})`);
          setSessionState('connecting');

          setTimeout(async () => {
            try {
              await connectSocket();
              await sendAudioData();
              setSessionState('listening');
            } catch {
              // Will trigger onclose again which will retry or give up
            }
          }, delay);
        } else {
          toast.error('Connection lost. Please pause and resume to try again.');
          setSessionState('idle');
          reconnectAttemptRef.current = 0;
        }
      };
    });
  }

  function arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  async function sendAudioData() {
    await mediaRef.current.startAudio((pcmBuffer: ArrayBuffer) => {
      if (socketRef.current?.readyState === WebSocket.OPEN && sessionState !== 'paused') {
        const base64 = arrayBufferToBase64(pcmBuffer);
        socketRef.current.send(JSON.stringify({ type: "audio", data: base64 }));
      }
    });
  }

  function receiveAudioData() {
    if (!socketRef.current) return;
    socketRef.current.onmessage = (event) => {
      const message = JSON.parse(event.data);

      // Server-triggered auto-complete (3-question verification limit reached)
      if (message.type === "interview_auto_complete") {
        console.log("[Interview] Auto-complete received from server");
        mediaRef.current.stopAudio();
        mediaRef.current.stopAudioPlayback();
        socketRef.current = null;
        if (assessmentId) {
          navigate(`/assessment/${assessmentId}/progress`);
        } else {
          navigate(`/result/${id}`);
        }
        return;
      }

      const content = message.serverContent;
      const parts = content?.modelTurn?.parts || [];

      let hasAudio = false;

      for (const part of parts) {
        if (part?.inlineData) {
          try {
            hasAudio = true;
            const base64 = part.inlineData.data;
            const binary = atob(base64);
            console.log(`[WS][IN] inlineData found | decoded bytes=${binary.length}`);
            const bytes = new Uint8Array(binary.length);

            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            mediaRef.current.playAudio(bytes.buffer);
          } catch (err) {
            console.error("[WS][IN] Failed to decode inlineData chunk:", err);
          }
        }
      }

      if (hasAudio) {
        setSessionState('speaking');
        if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
        speakingTimeoutRef.current = setTimeout(() => {
          setSessionState((prev) => (prev === 'speaking' ? 'listening' : prev));
        }, 1500); // Revert to listening after 1.5s of no audio chunks
      }
    };
  }

  const toggleInterview = async () => {
    if (sessionState === 'idle' || sessionState === 'paused') {
      intentionalCloseRef.current = false; // allow reconnect
      try {
        setSessionState('connecting');
        await mediaRef.current.initializeAudio();
        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
          await connectSocket();
          await sendAudioData();
        }
        setSessionState('listening');
      } catch (err) {
        console.error("Connection failed", err);
        toast.error('Failed to connect. Check your microphone and try again.');
        setSessionState('idle');
      }
    } else {
      // Intentional pause — mark so onclose doesn't trigger reconnect
      intentionalCloseRef.current = true;
      setSessionState('paused');
      mediaRef.current.stopAudio();
      mediaRef.current.stopAudioPlayback();
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    }
  };

  const finishInterview = async () => {
    intentionalCloseRef.current = true; // don't reconnect on end
    mediaRef.current.stopAudio();
    mediaRef.current.stopAudioPlayback();
    if (socketRef.current) socketRef.current.close();
    
    if (assessmentId) {
      try {
        await apiClient.post(`/agent/assess/${assessmentId}/interview-complete`, { interviewId: id });
      } catch (err) {
        console.error("Failed to mark assessment complete", err);
      }
      navigate(`/assessment/${assessmentId}/progress`);
    } else {
      navigate(`/result/${id}`);
    }
  };

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    );
  }

  if (!interview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Waveform logic based on state
  const bars = 15;
  const getBarAnimation = (index: number) => {
    if (sessionState === 'idle' || sessionState === 'paused') {
      return { height: 4 };
    }
    if (sessionState === 'connecting') {
      return { height: [4, 12, 4], transition: { repeat: Infinity, duration: 1, delay: index * 0.1 } };
    }
    if (sessionState === 'listening') {
      // Very soft, subtle animation for listening
      return { height: [6, 12, 6], transition: { repeat: Infinity, duration: 2.5, delay: index * 0.2, ease: 'easeInOut' as Easing } };
    }
    if (sessionState === 'speaking') {
      // Fast, animated waveform for AI speaking
      const heights = [10, 24, 40, 16, 32, 12, 28, 48, 20, 36, 14, 26, 44, 18, 30];
      const h = heights[index % heights.length];
      return { height: [h * 0.4, h, h * 0.4], transition: { repeat: Infinity, duration: 0.6 + Math.random() * 0.4, delay: Math.random() * 0.2 } };
    }
  };

  const stateText = {
    idle: "READY TO START",
    connecting: "CONNECTING...",
    listening: "LISTENING",
    speaking: "AI SPEAKING",
    paused: "PAUSED"
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const questions = interview?.interview?.questions || [];
  const questionCount = Math.max(1, questions.length);
  // Default to a prompt if no questions have been recorded yet, or show the latest recorded question text.
  let displayedQuestionText = "Please begin when you are ready. I will adapt to your responses.";
  if (questions.length > 0 && questions[questions.length - 1].question) {
    displayedQuestionText = questions[questions.length - 1].question;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Immersive Cyber-Acoustic Studio Background */}
      <div 
        className="fixed inset-0 pointer-events-none -z-10 bg-cover bg-center bg-no-repeat transition-opacity duration-700"
        style={{ backgroundImage: `url('/backgrounds/interview-studio-dark.jpg')` }}
      />
      <div className="fixed inset-0 pointer-events-none -z-10 bg-background/80 backdrop-blur-[2px]" />

      <SEO title="Interview in Progress" noindex />
      {/* Immersive Central Card */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-3xl rounded-[2rem] border border-border/70 bg-card/90 backdrop-blur-xl shadow-2xl overflow-hidden relative"
      >
        <div className="absolute top-4 sm:top-6 left-4 sm:left-6 right-4 sm:right-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 z-10">
          <div className="flex items-center gap-3 bg-background/50 backdrop-blur-md px-4 py-2 rounded-full border border-border w-full sm:w-auto justify-center sm:justify-start">
            <div className={`w-2 h-2 rounded-full ${sessionState === 'listening' ? 'bg-primary animate-pulse' : sessionState === 'speaking' ? 'bg-blue-500 animate-pulse' : 'bg-muted-foreground'}`} />
            <span className="text-xs font-bold tracking-wider text-muted-foreground">
              {stateText[sessionState]}
            </span>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            {/* Subtle Progress Indicator */}
            {(sessionState !== 'idle' && sessionState !== 'paused' && sessionState !== 'connecting') && (
              <span className="text-sm font-medium text-muted-foreground bg-background/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-border">
                Question {questionCount} of 6
              </span>
            )}
            
            {/* Subtle Timer */}
            <div className="bg-background/50 backdrop-blur-md px-4 py-2 rounded-full border border-border text-sm font-mono font-medium text-foreground w-[72px] text-center">
              {formatTime(elapsed)}
            </div>
          </div>
        </div>

        <div className="pt-32 pb-24 px-8 text-center flex flex-col items-center justify-center bg-gradient-to-b from-card to-muted/10 relative">
          
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-10 relative">
            <AnimatePresence>
              {(sessionState === 'listening' || sessionState === 'connecting') && (
                <motion.div 
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 rounded-full border border-primary bg-primary/20"
                />
              )}
            </AnimatePresence>
            <Mic className={`w-10 h-10 ${sessionState === 'idle' || sessionState === 'paused' ? 'text-muted-foreground' : 'text-primary'}`} />
          </div>

          {/* Dynamic Question Text */}
          <h3 className="text-2xl sm:text-3xl font-semibold mb-12 max-w-xl text-foreground min-h-[80px]">
            {sessionState === 'idle' 
              ? "Please begin when you are ready. I will adapt to your responses."
              : displayedQuestionText}
          </h3>
          
          {/* Dynamic Waveform */}
          <div className="flex items-center gap-1.5 h-16">
            {Array.from({ length: bars }).map((_, i) => (
              <motion.div 
                key={i}
                animate={getBarAnimation(i)}
                className={`w-2 rounded-full ${sessionState === 'speaking' ? 'bg-blue-500/80' : sessionState === 'idle' || sessionState === 'paused' ? 'bg-border' : 'bg-primary/80'}`}
                style={{ minHeight: '4px' }}
              />
            ))}
          </div>

        </div>

        {/* Controls */}
        <div className="bg-muted/30 border-t border-border p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 mt-4 sm:mt-0">
          <Button 
            onClick={toggleInterview}
            size="lg"
            variant={sessionState === 'idle' || sessionState === 'paused' ? 'default' : 'outline'}
            className={`h-16 w-16 rounded-full p-0 flex items-center justify-center transition-all ${sessionState === 'idle' || sessionState === 'paused' ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:scale-105' : 'bg-background hover:bg-muted'}`}
            disabled={sessionState === 'connecting'}
          >
            {sessionState === 'connecting' ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : sessionState === 'idle' || sessionState === 'paused' ? (
              <Play className="w-6 h-6 ml-1" />
            ) : (
              <Pause className="w-6 h-6" />
            )}
          </Button>

          <Button 
            onClick={finishInterview}
            size="lg"
            variant="destructive"
            className="h-14 sm:h-16 px-6 sm:px-8 rounded-full text-base font-semibold shadow-lg shadow-destructive/20 hover:scale-105 transition-all w-full sm:w-auto"
          >
            <PhoneOff className="w-5 h-5 mr-2" />
            End Interview
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default Interview;
