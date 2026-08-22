import { useState, useEffect, useRef } from "react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function ChatbotWidget() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pulse, setPulse] = useState(false);
  const scrollRef = useRef(null);

  // Set role-appropriate initial welcome message
  useEffect(() => {
    if (isAdmin) {
      setMessages([
        {
          sender: "bot",
          text: `Hi ${user?.name || "Admin"}! 🚀 I am your CartGuard AI Product Copilot. Ask me anything about ML risk scores, platform telemetry, active sessions, or system architecture!`
        }
      ]);
    } else {
      setMessages([
        {
          sender: "bot",
          text: `Hi ${user?.name || "there"}! 🤖 I am your CartGuard checkout assistant. Having trouble with payments, need discount info, or want to compare products? Ask me anything!`
        }
      ]);
    }
  }, [isAdmin, user?.name]);

  // Automatically pulse/giggle the chatbot trigger button if payment failures or errors occur!
  useEffect(() => {
    const handleSignal = () => {
      setPulse(true);
      setTimeout(() => setPulse(false), 5000);
    };

    window.addEventListener("chatbot-pulse-trigger", handleSignal);
    return () => window.removeEventListener("chatbot-pulse-trigger", handleSignal);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const handleSend = async (textToSend) => {
    const msgText = textToSend || input;
    if (!msgText.trim()) return;

    if (!textToSend) setInput("");
    setMessages((prev) => [...prev, { sender: "user", text: msgText }]);
    setLoading(true);

    try {
      const { data } = await api.post("/cart/chat", { message: msgText });
      setMessages((prev) => [...prev, { sender: "bot", text: data.reply }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: isAdmin
            ? "CartGuard Copilot service is temporarily reconnecting..."
            : "Checkout assistance is temporarily unavailable. Please try Cash on Delivery (COD) if you encounter payment blocks!"
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleChipClick = (phrase) => {
    handleSend(phrase);
  };

  if (!user) {
    return null;
  }

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, fontFamily: "inherit" }}>
      {/* Floating Chat Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={pulse ? "animate-bounce" : ""}
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: isAdmin
              ? "linear-gradient(135deg, #0F172A, #3B82F6)"
              : "linear-gradient(135deg, #6f42c1, #8B5CF6)",
            color: "white",
            border: "none",
            boxShadow: isAdmin
              ? "0 4px 16px rgba(59,130,246,0.5)"
              : "0 4px 16px rgba(111,66,193,0.4)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            transition: "all 0.3s ease",
            animation: pulse ? "agent-pulse 1.2s infinite" : "none",
          }}
        >
          {isAdmin ? "🚀" : "💬"}
        </button>
      )}

      {/* Chat Window Box */}
      {isOpen && (
        <div
          style={{
            width: 380,
            height: 500,
            background: "var(--panel, #ffffff)",
            border: isAdmin ? "1px solid #3B82F6" : "1px solid var(--border, #e2e8f0)",
            borderRadius: 16,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "fadeInUp 0.25s ease-out",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 20px",
              background: isAdmin
                ? "linear-gradient(135deg, #0F172A, #1E293B)"
                : "linear-gradient(135deg, #6f42c1, #8B5CF6)",
              color: "white",
              display: "flex",
              justifyContent: "between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{isAdmin ? "🚀" : "🤖"}</span>
              <div>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                  {isAdmin ? "CartGuard Product Copilot" : "CartGuard Assistant"}
                </h4>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: isAdmin ? "#38BDF8" : "#10B981",
                      display: "inline-block"
                    }}
                  />
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)" }}>
                    {isAdmin ? "Executive Copilot Mode" : "Ready to help"}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "white",
                fontSize: 18,
                cursor: "pointer",
                padding: 4,
                marginLeft: "auto",
              }}
            >
              ✕
            </button>
          </div>

          {/* Messages Feed */}
          <div
            style={{
              flex: 1,
              padding: 16,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: "var(--panel-bg, #f8fafc)",
            }}
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                  maxWidth: "82%",
                  background:
                    m.sender === "user"
                      ? isAdmin
                        ? "#2563EB"
                        : "#6f42c1"
                      : "var(--panel, #ffffff)",
                  color: m.sender === "user" ? "white" : "var(--text, #1e293b)",
                  border: m.sender === "user" ? "none" : "1px solid var(--border, #e2e8f0)",
                  padding: "10px 14px",
                  borderRadius: m.sender === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  background: "var(--panel, #ffffff)",
                  border: "1px solid var(--border, #e2e8f0)",
                  padding: "10px 14px",
                  borderRadius: "14px 14px 14px 2px",
                  fontSize: 12,
                  color: "var(--text-muted, #64748b)",
                }}
              >
                {isAdmin ? "Analyzing platform telemetry..." : "Typing assistant response..."}
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          {/* Quick Helper Chips */}
          <div
            style={{
              padding: "8px 12px",
              background: "var(--panel-bg, #f8fafc)",
              borderTop: "1px solid var(--border, #e2e8f0)",
              display: "flex",
              gap: 6,
              overflowX: "auto",
              scrollbarWidth: "none",
            }}
          >
            {isAdmin ? (
              <>
                <button
                  onClick={() => handleChipClick("Explain CartGuard AI system architecture")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    background: "var(--panel, #ffffff)",
                    border: "1px solid #3B82F6",
                    fontSize: 11,
                    cursor: "pointer",
                    color: "#2563EB",
                    whiteSpace: "nowrap",
                  }}
                >
                  ⚡ Architecture
                </button>
                <button
                  onClick={() => handleChipClick("How does the ML Ensemble risk model work?")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    background: "var(--panel, #ffffff)",
                    border: "1px solid #3B82F6",
                    fontSize: 11,
                    cursor: "pointer",
                    color: "#2563EB",
                    whiteSpace: "nowrap",
                  }}
                >
                  🎯 ML Risk Scoring
                </button>
                <button
                  onClick={() => handleChipClick("Show summary of recent audit decision logs")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    background: "var(--panel, #ffffff)",
                    border: "1px solid #3B82F6",
                    fontSize: 11,
                    cursor: "pointer",
                    color: "#2563EB",
                    whiteSpace: "nowrap",
                  }}
                >
                  📊 Audit Telemetry
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleChipClick("Why is my card/UPI failing?")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    background: "var(--panel, #ffffff)",
                    border: "1px solid var(--border, #e2e8f0)",
                    fontSize: 11,
                    cursor: "pointer",
                    color: "#6f42c1",
                    whiteSpace: "nowrap",
                  }}
                >
                  💳 Payment Failures
                </button>
                <button
                  onClick={() => handleChipClick("Are there any active coupons?")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    background: "var(--panel, #ffffff)",
                    border: "1px solid var(--border, #e2e8f0)",
                    fontSize: 11,
                    cursor: "pointer",
                    color: "#6f42c1",
                    whiteSpace: "nowrap",
                  }}
                >
                  🎁 Coupon Codes
                </button>
                <button
                  onClick={() => handleChipClick("Compare specs of items in my cart")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    background: "var(--panel, #ffffff)",
                    border: "1px solid var(--border, #e2e8f0)",
                    fontSize: 11,
                    cursor: "pointer",
                    color: "#6f42c1",
                    whiteSpace: "nowrap",
                  }}
                >
                  📊 Compare Products
                </button>
              </>
            )}
          </div>

          {/* Input Area */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            style={{
              display: "flex",
              borderTop: "1px solid var(--border, #e2e8f0)",
              padding: 8,
              background: "var(--panel, #ffffff)",
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isAdmin
                  ? "Ask Copilot about ML models, telemetry, architecture..."
                  : "Ask about alternative payments or specs..."
              }
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: 13,
                padding: "8px 12px",
                background: "transparent",
                color: "var(--text, #1e293b)",
              }}
            />
            <button
              type="submit"
              style={{
                background: isAdmin ? "#2563EB" : "#6f42c1",
                color: "white",
                border: "none",
                borderRadius: 8,
                padding: "6px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
