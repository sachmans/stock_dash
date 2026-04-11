/**
 * Kora Chat Interface
 * AI-powered portfolio Q&A assistant.
 * Uses the built-in LLM with portfolio context injection.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle,
  Send,
  X,
  Bot,
  User,
  Loader2,
  Sparkles,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface KoraChatProps {
  portfolioContext: string;
}

/* ─── Quick Prompts ─── */
const QUICK_PROMPTS = [
  'How is my portfolio performing?',
  'Should I hold or sell BRNT?',
  'What are the risks in my positions?',
  'Analyze my USD/CHF exposure',
  'What is the gold outlook?',
  'Summarize market sentiment',
];

/* ─── Main Component ─── */
export default function KoraChat({ portfolioContext }: KoraChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! I'm Kora, your portfolio AI assistant. I have full context on your positions, watchlist, and market data. Ask me anything about your portfolio, market analysis, or trading strategies.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chatMutation = trpc.stock.koraChat.useMutation();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const history = messages
        .filter(m => m.id !== 'welcome')
        .slice(-10)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const response = await chatMutation.mutateAsync({
        message: text.trim(),
        portfolioContext,
        history,
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response?.reply || "I'm sorry, I couldn't process that request. Please try again.",
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I encountered an error processing your request. Please try again in a moment.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25 flex items-center justify-center text-white hover:shadow-cyan-500/40 transition-shadow"
          >
            <MessageCircle className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#0a0f1a] animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed z-50 ${
              isMaximized
                ? 'inset-4'
                : 'bottom-6 right-6 w-[400px] h-[560px]'
            } flex flex-col rounded-2xl overflow-hidden border border-secondary/30 shadow-2xl shadow-black/40`}
            style={{ background: 'linear-gradient(145deg, #0d1321 0%, #0a0f1a 100%)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary/20 bg-secondary/5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    Kora
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  </div>
                  <div className="text-[10px] text-muted-foreground/60">Portfolio AI Assistant</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-1.5 rounded-md hover:bg-secondary/30 transition-colors text-muted-foreground/60 hover:text-muted-foreground"
                >
                  {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-md hover:bg-secondary/30 transition-colors text-muted-foreground/60 hover:text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                    msg.role === 'assistant'
                      ? 'bg-gradient-to-br from-cyan-500/20 to-blue-600/20'
                      : 'bg-primary/20'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <Bot className="h-3.5 w-3.5 text-cyan-400" />
                    ) : (
                      <User className="h-3.5 w-3.5 text-primary" />
                    )}
                  </div>
                  <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 ${
                    msg.role === 'assistant'
                      ? 'bg-secondary/10 border border-secondary/20 text-foreground'
                      : 'bg-primary/15 border border-primary/20 text-foreground'
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    <div className="text-[9px] text-muted-foreground/30 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2.5"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-cyan-400" />
                  </div>
                  <div className="bg-secondary/10 border border-secondary/20 rounded-xl px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts */}
            {messages.length <= 2 && !isTyping && (
              <div className="px-4 pb-2">
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="text-[10px] px-2.5 py-1 rounded-full bg-secondary/10 border border-secondary/20 text-muted-foreground/70 hover:text-foreground hover:bg-secondary/20 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="px-4 pb-4 pt-2 border-t border-secondary/20">
              <div className="flex items-center gap-2 bg-secondary/10 border border-secondary/20 rounded-xl px-3 py-2 focus-within:border-primary/30 transition-colors">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Kora about your portfolio..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
                  disabled={isTyping}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isTyping}
                  className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
                >
                  {isTyping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
