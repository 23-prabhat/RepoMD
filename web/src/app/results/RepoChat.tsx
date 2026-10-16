"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, ArrowUp } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";

interface Message {
  role: "user" | "bot";
  text: string;
}

interface RepoChatProps {
  repoFullName: string;
  analysis: AnalysisResult;
}

const EXAMPLE_CHIPS = [
  "What is the entry point?",
  "Which files handle auth?",
  "What architecture pattern is used?",
];

export default function RepoChat({ repoFullName, analysis }: RepoChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, repoFullName, analysis }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "bot", text: data.reply ?? "No response." }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Sorry, I couldn't process that. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const hasUnread = messages.length > 0 && !open;

  return (
    <>
      <style>{`
        @keyframes chat-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes msg-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dot-pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        .chat-panel {
          animation: chat-slide-up 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .msg-fade {
          animation: msg-fade-in 0.18s ease both;
        }
        .dot-1 { animation: dot-pulse 1.2s ease-in-out infinite 0s; }
        .dot-2 { animation: dot-pulse 1.2s ease-in-out infinite 0.2s; }
        .dot-3 { animation: dot-pulse 1.2s ease-in-out infinite 0.4s; }
        @keyframes fab-glow {
          0%, 100% { box-shadow: 0 4px 20px rgba(245,158,11,0.4); }
          50%      { box-shadow: 0 4px 30px rgba(245,158,11,0.65), 0 0 40px rgba(245,158,11,0.2); }
        }
        .fab-pulse { animation: fab-glow 2.5s ease-in-out infinite; }
        @keyframes chat-spring-open {
          0%   { opacity: 0; transform: translateY(24px) scale(0.92); }
          60%  { opacity: 1; transform: translateY(-6px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .chat-panel {
          animation: chat-spring-open 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 12,
        }}
      >
        {/* Chat panel */}
        {open && (
          <div
            className="chat-panel"
            style={{
              width: 380,
              height: 520,
              background: "rgba(14,16,23,0.82)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: 16,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(245,158,11,0.08), 0 0 60px rgba(245,158,11,0.06)",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                borderBottom: "1px solid rgba(245,158,11,0.12)",
                background: "rgba(245,158,11,0.04)",
                flexShrink: 0,
              }}
            >
              <MessageCircle size={15} style={{ color: "rgb(245,158,11)" }} />
              <span
                style={{
                  flex: 1,
                  fontFamily: "var(--font-geist-mono)",
                  fontSize: 11,
                  letterSpacing: "0.07em",
                  color: "rgb(245,158,11)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {repoFullName}
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.35)",
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                  alignItems: "center",
                  borderRadius: 4,
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
                aria-label="Close chat"
              >
                <X size={15} />
              </button>
            </div>

            {/* Messages area */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(245,158,11,0.2) transparent",
              }}
            >
              {messages.length === 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 16,
                    marginTop: 24,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "rgba(245,158,11,0.1)",
                      border: "1px solid rgba(245,158,11,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MessageCircle size={20} style={{ color: "rgb(245,158,11)" }} />
                  </div>
                  <p
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontSize: 13,
                      textAlign: "center",
                      lineHeight: 1.6,
                      fontFamily: "var(--font-geist-mono)",
                      maxWidth: 260,
                    }}
                  >
                    Ask me anything about {repoFullName}…
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                    {EXAMPLE_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        onClick={() => setInput(chip)}
                        style={{
                          background: "rgba(245,158,11,0.06)",
                          border: "1px solid rgba(245,158,11,0.18)",
                          borderRadius: 999,
                          color: "rgba(245,158,11,0.8)",
                          fontSize: 11,
                          fontFamily: "var(--font-geist-mono)",
                          padding: "5px 11px",
                          cursor: "pointer",
                          transition: "background 0.15s, border-color 0.15s",
                          letterSpacing: "0.02em",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.12)";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(245,158,11,0.35)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.06)";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(245,158,11,0.18)";
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className="msg-fade"
                  style={{
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  {msg.role === "user" ? (
                    <div
                      style={{
                        maxWidth: "78%",
                        background: "rgba(245,158,11,0.15)",
                        border: "1px solid rgba(245,158,11,0.25)",
                        borderRadius: "14px 14px 4px 14px",
                        padding: "8px 13px",
                        fontSize: 13,
                        color: "rgba(255,255,255,0.9)",
                        lineHeight: 1.55,
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.text}
                    </div>
                  ) : (
                    <div
                      style={{
                        maxWidth: "84%",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: "14px 14px 14px 4px",
                        padding: "10px 13px",
                        fontSize: 12.5,
                        color: "rgba(255,255,255,0.75)",
                        lineHeight: 1.65,
                        fontFamily: "var(--font-geist-mono)",
                        wordBreak: "break-word",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {msg.text}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: "14px 14px 14px 4px",
                      padding: "12px 16px",
                      display: "flex",
                      gap: 5,
                      alignItems: "center",
                    }}
                  >
                    <span className="dot-1" style={{ width: 6, height: 6, borderRadius: "50%", background: "rgb(245,158,11)", display: "inline-block" }} />
                    <span className="dot-2" style={{ width: 6, height: 6, borderRadius: "50%", background: "rgb(245,158,11)", display: "inline-block" }} />
                    <span className="dot-3" style={{ width: 6, height: 6, borderRadius: "50%", background: "rgb(245,158,11)", display: "inline-block" }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input row */}
            <div
              style={{
                padding: "10px 12px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this repo…"
                disabled={loading}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  padding: "9px 13px",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.85)",
                  outline: "none",
                  fontFamily: "inherit",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(245,158,11,0.4)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: "none",
                  background: input.trim() && !loading ? "rgb(245,158,11)" : "rgba(245,158,11,0.2)",
                  color: input.trim() && !loading ? "#000" : "rgba(245,158,11,0.4)",
                  cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "background 0.15s, color 0.15s",
                }}
                aria-label="Send message"
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        )}

        {/* FAB button */}
        <button
          onClick={() => setOpen((v) => !v)}
          className={open ? "" : "fab-pulse"}
          style={{
            position: "relative",
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: open ? "rgba(245,158,11,0.85)" : "rgb(245,158,11)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.15s, background 0.15s",
            color: "#000",
          }}
          onMouseEnter={(e) => {
            if (!open) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.06)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
          aria-label="Toggle repo chat"
        >
          {open ? <X size={22} /> : <MessageCircle size={22} />}
          {hasUnread && (
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#ef4444",
                border: "2px solid #0e1017",
              }}
            />
          )}
        </button>
      </div>
    </>
  );
}
