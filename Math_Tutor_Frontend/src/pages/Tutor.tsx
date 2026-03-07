import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { renderLaTeXToHTML } from '@/lib/latex';
import { Send, User, Bot, Sparkles, Mic, MicOff, Headphones, Square } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Strip LaTeX and markdown for text-to-speech
function stripForTTS(text: string): string {
  if (!text) return '';
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]+\$/g, ' ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\\\([\s\S]*?\\\)/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SpeechRecognitionAPI =
  typeof window !== 'undefined' &&
  ((window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition);

type VoiceState = 'idle' | 'listening' | 'sending' | 'speaking';

const Tutor = () => {
  const { token, user } = useAuth();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [voiceConversation, setVoiceConversation] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceSupported, setVoiceSupported] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop(): void; abort?(): void } | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoListenAfterSpeakRef = useRef(false);

  useEffect(() => {
    setVoiceSupported(Boolean(SpeechRecognitionAPI && typeof window !== 'undefined' && window.speechSynthesis));
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setVoiceState((s) => (s === 'listening' ? 'idle' : s));
  }, []);

  const stopSpeaking = useCallback(() => {
    autoListenAfterSpeakRef.current = false;
    window.speechSynthesis?.cancel();
    setVoiceState('idle');
  }, []);

  const speakAndMaybeListen = useCallback(
    (text: string) => {
      if (!text || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const plain = stripForTTS(text);
      if (!plain) return;
      const u = new SpeechSynthesisUtterance(plain);
      u.rate = 0.95;
      u.pitch = 1;
      u.onstart = () => setVoiceState('speaking');
      u.onend = () => {
        setVoiceState('idle');
        if (autoListenAfterSpeakRef.current && voiceConversation) {
          autoListenAfterSpeakRef.current = false;
          setTimeout(() => startListeningRef.current?.(), 400);
        }
      };
      window.speechSynthesis.speak(u);
    },
    [voiceConversation]
  );

  const startListeningRef = useRef<() => void>(() => {});
  const handleSendFromVoiceRef = useRef<(text: string) => void>(() => {});

  const handleSendFromVoice = useCallback(
    async (textToSend: string) => {
      if (!textToSend.trim()) return;
      stopListening();
      const userMessage: Message = { role: 'user', content: textToSend };
      setMessages((prev) => [...prev, userMessage]);
      setQuery('');
      setLoading(true);
      setVoiceState('sending');
      try {
        const response = await api.chatWithTutor(textToSend, token);
        setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
        autoListenAfterSpeakRef.current = voiceConversation;
        speakAndMaybeListen(response);
      } catch (error) {
        console.error('Failed to get response:', error);
        const errorMsg = 'Sorry, I encountered an error. Please try again.';
        setMessages((prev) => [...prev, { role: 'assistant', content: errorMsg }]);
        autoListenAfterSpeakRef.current = voiceConversation;
        speakAndMaybeListen(errorMsg);
      } finally {
        setLoading(false);
        setVoiceState('idle');
      }
    },
    [token, voiceConversation, stopListening, speakAndMaybeListen]
  );
  handleSendFromVoiceRef.current = handleSendFromVoice;

  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI || loading) return;
    const Recognition = SpeechRecognitionAPI;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (i < event.results.length - 1) transcript += ' ';
      }
      setQuery(transcript);
      if (voiceConversation && transcript.trim()) {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        const hasFinal = Array.from(event.results).some((r) => r.isFinal);
        if (hasFinal) {
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null;
            handleSendFromVoiceRef.current(transcript.trim());
          }, 1500);
        }
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        setVoiceState((s) => (s === 'listening' ? 'idle' : s));
      }
    };
    recognition.onerror = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        setVoiceState((s) => (s === 'listening' ? 'idle' : s));
      }
    };
    recognition.start();
    recognitionRef.current = recognition;
    setVoiceState('listening');
  }, [loading, voiceConversation]);
  startListeningRef.current = startListening;

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.stop?.();
    };
  }, []);

  const handleSend = async () => {
    if (!query.trim()) return;
    const textToSend = query.trim();
    const userMessage: Message = { role: 'user', content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    setQuery('');
    setLoading(true);
    try {
      const response = await api.chatWithTutor(textToSend, token);
      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
      if (voiceConversation) {
        setVoiceState('speaking');
        autoListenAfterSpeakRef.current = true;
        speakAndMaybeListen(response);
      }
    } catch (error) {
      console.error('Failed to get response:', error);
      const errorMsg = 'Sorry, I encountered an error. Please try again.';
      setMessages((prev) => [...prev, { role: 'assistant', content: errorMsg }]);
      if (voiceConversation) {
        autoListenAfterSpeakRef.current = true;
        speakAndMaybeListen(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestions = [
    "I'm struggling with geometry proofs.",
    "Can you explain modular arithmetic?",
    "How do I prepare for the RMO?",
    "What are my weakest topics?",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-5xl mx-auto">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            AI Math Tutor
          </h1>
          <p className="text-muted-foreground">
            Your personalized guide for Olympiad preparation. Ask me anything about math!
          </p>
        </div>
        {voiceSupported && (
          <Button
            variant={voiceConversation ? 'default' : 'outline'}
            size="sm"
            onClick={() => setVoiceConversation((v) => !v)}
            className="gap-2"
          >
            <Headphones className="h-4 w-4" />
            {voiceConversation ? 'Voice conversation' : 'Voice'}
          </Button>
        )}
      </div>

      <Card className="flex-1 flex flex-col min-h-0 shadow-lg border-muted">
        <CardContent className="flex-1 flex flex-col p-0 h-full">
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-8 p-8 opacity-0 animate-in fade-in duration-500">
                <div className="bg-primary/10 p-6 rounded-full">
                  <Bot className="h-16 w-16 text-primary" />
                </div>
                <div className="max-w-md space-y-2">
                  <h3 className="text-xl font-semibold">Hello, {user?.name || 'Student'}!</h3>
                  <p className="text-muted-foreground">
                    I'm here to help you strengthen your weak areas and master new concepts.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg">
                  {suggestions.map((s, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      className="h-auto py-3 px-4 text-left justify-start hover:bg-primary/5 hover:text-primary transition-colors"
                      onClick={() => setQuery(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-none'
                        : 'bg-muted/50 border border-border rounded-tl-none'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0"
                        dangerouslySetInnerHTML={{
                          __html: renderLaTeXToHTML(msg.content),
                        }}
                      />
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
                      <User className="h-5 w-5 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))
            )}
            {loading && (
              <div className="flex gap-3 justify-start animate-pulse">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div className="bg-muted/50 rounded-2xl rounded-tl-none px-5 py-3 flex items-center gap-1">
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" />
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          <div className="pt-5 pb-4 px-4 border-t bg-background/50 backdrop-blur-sm">
            {voiceConversation && voiceSupported ? (
              <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
                <div className="w-full flex items-center gap-2">
                  <Input
                    placeholder="Or type here..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 min-w-0 py-3 text-base shadow-sm bg-background"
                    disabled={loading}
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={loading || !query.trim()}
                    className="h-11 w-11 shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (voiceState === 'listening') {
                        stopListening();
                        if (query.trim()) handleSendFromVoiceRef.current(query.trim());
                      } else if (voiceState === 'speaking') {
                        stopSpeaking();
                      } else if (voiceState === 'idle' && !loading) {
                        startListening();
                      }
                    }}
                    disabled={loading || voiceState === 'sending'}
                    className={`rounded-full p-5 transition-all duration-200 flex items-center justify-center ${
                      voiceState === 'listening'
                        ? 'bg-primary/20 scale-110 animate-pulse ring-4 ring-primary/30'
                        : voiceState === 'speaking'
                          ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse'
                          : loading || voiceState === 'sending'
                            ? 'bg-muted cursor-not-allowed'
                            : 'bg-primary text-primary-foreground hover:scale-105 hover:bg-primary/90'
                    }`}
                    aria-label={
                      voiceState === 'listening' ? 'Stop listening' : 
                      voiceState === 'speaking' ? 'Stop speaking' : 'Tap to speak'
                    }
                  >
                    {voiceState === 'listening' ? (
                      <MicOff className="h-8 w-8" />
                    ) : voiceState === 'speaking' ? (
                      <Square className="h-8 w-8 fill-current" />
                    ) : (
                      <Mic className="h-8 w-8" />
                    )}
                  </button>
                  <p className="text-sm text-muted-foreground min-h-5">
                    {voiceState === 'listening' && 'Listening...'}
                    {voiceState === 'sending' && 'Thinking...'}
                    {voiceState === 'speaking' && 'Speaking... (Tap to stop)'}
                    {voiceState === 'idle' && !loading && 'Tap the mic to speak, or type above'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center max-w-4xl mx-auto gap-2">
                <Input
                  placeholder="Ask a math question..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 min-w-0 py-6 text-base shadow-sm bg-background"
                  disabled={loading}
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={loading || !query.trim()}
                  className="h-11 w-11 shrink-0 transition-transform hover:scale-105"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
            <p className="text-xs text-center text-muted-foreground mt-2">
              {voiceConversation && voiceSupported && 'Speak, then the tutor replies by voice and listens again. '}
              AI can make mistakes. Please verify important information.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Tutor;
