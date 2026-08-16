import { useEffect, useState } from "react";
import api from "../../api/axios.js";

// Helper to get the absolute API base URL for direct image fetches
const API_BASE = (() => {
  let url = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
  if (url && !url.endsWith("/api")) url = `${url}/api`;
  return url; // empty string = relative /api/...
})();

// QR image component — tries to load from the qrcode-session image endpoint.
// Shows a spinner while loading, falls back to a "not ready" message on 404.
function QrImageWithFallback({ timestamp }) {
  const [imgState, setImgState] = useState("loading"); // loading | ok | notready
  const src = `${API_BASE}/admin/whatsapp-qrcode?t=${timestamp}`;

  useEffect(() => {
    setImgState("loading");
  }, [timestamp]);

  return (
    <div style={{ width: 220, height: 220, background: "#fff", borderRadius: 8, border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
      {imgState === "loading" && (
        <>
          <div className="agent-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>QR loading…</div>
        </>
      )}
      {imgState === "ok" && (
        <img src={src} alt="WhatsApp QR" style={{ width: 220, height: 220, borderRadius: 8, display: "block" }} onError={() => setImgState("notready")} />
      )}
      {imgState === "notready" && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: 12 }}>
          ⏳ QR not ready yet<br/>WhatsApp Web is loading…<br/>Auto-retrying every 3s
        </div>
      )}
      {/* Hidden img to detect when QR image becomes available */}
      {imgState !== "ok" && (
        <img
          src={src} alt="" style={{ display: "none" }}
          onLoad={() => setImgState("ok")}
          onError={() => setImgState("notready")}
        />
      )}
    </div>
  );
}

export default function Notifications() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("whatsapp"); // "whatsapp" | "mail" | "dashboard"
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterCause, setFilterCause] = useState("");

  // WPPConnect WhatsApp connection state
  const [wppStatus, setWppStatus] = useState("DISCONNECTED");
  const [wppQrCode, setWppQrCode] = useState("");
  const [wppLoading, setWppLoading] = useState(false);
  const [qrTimestamp, setQrTimestamp] = useState(Date.now());

  const checkWppStatus = () => {
    setWppLoading(true);
    api.get("/admin/whatsapp-status")
      .then((res) => {
        const status = res.data.status || "DISCONNECTED";
        setWppStatus(status);
        if (res.data.qrcode) {
          setWppQrCode(res.data.qrcode);
        } else {
          setWppQrCode("");
        }
      })
      .catch((err) => {
        console.error("WPPConnect offline:", err);
        setWppStatus("OFFLINE");
      })
      .finally(() => setWppLoading(false));
  };

  const initWppSession = () => {
    setWppLoading(true);
    setWppStatus("STARTING");
    setWppQrCode("");
    // Fire the start-session request — don't await it (can take 15s+)
    // Polling loop below will pick up QRCODE status automatically
    api.post("/admin/whatsapp-start")
      .then((res) => {
        const status = (res.data.status || "").toUpperCase();
        if (status === "CONNECTED") {
          setWppStatus("CONNECTED");
        } else if (res.data.qrcode) {
          setWppStatus("QRCODE");
          setWppQrCode(res.data.qrcode);
        } else if (status && status !== "STARTING") {
          setWppStatus(status);
        }
        // If still STARTING, polling will handle it
      })
      .catch((err) => {
        console.error("Failed to start session:", err);
        // Don't reset to OFFLINE — keep STARTING so polling can still pick up QR
      })
      .finally(() => {
        setWppLoading(false);
      });
  };

  useEffect(() => {
    if (activeTab === "whatsapp") {
      checkWppStatus();
    }
  }, [activeTab]);

  useEffect(() => {
    let interval = null;
    const currentStatus = (wppStatus || "").toUpperCase();
    const isPollingState = ["STARTING", "INITIALIZING", "NOT_LOGGED", "QRCODE", "PAIN_CONNECTING", "NOT_INITIALIZED"].includes(currentStatus);

    if (activeTab === "whatsapp" && isPollingState) {
      interval = setInterval(() => {
        api.get("/admin/whatsapp-status")
          .then((res) => {
            const status = (res.data.status || "DISCONNECTED").toUpperCase();
            setWppStatus(status);
            if (res.data.qrcode) {
              setWppQrCode(res.data.qrcode);
            }
            // If WPPConnect says QRCODE state, bump timestamp to reload the QR image
            if (status === "QRCODE" || status === "STARTING") {
              setQrTimestamp(Date.now());
            }
          })
          .catch((err) => {
            console.error("WPPConnect polling error:", err);
          });
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab, wppStatus]);

  useEffect(() => {
    setLoading(true);
    api.get("/admin/audit-log", { params: { limit: 100, exclude_cooldown: true } })
      .then((res) => {
        setLogs(res.data.logs || res.data);
      })
      .catch((err) => console.error("Failed to load notification audits", err))
      .finally(() => setLoading(false));
  }, []);

  // Filter logs by channel, search term, date, and cause
  const filteredLogs = logs.filter((l) => {
    if (l.cooldown_active) return false;
    // Exclude decisions where no recovery action was taken
    const act = (l.action_type || "").toUpperCase();
    if (act === "DO_NOTHING" || act === "NONE" || !act) return false;

    // 1. Channel Filter — use dispatched_channels (actual sent) not agent channel (always IN_APP)
    const dispatched = Array.isArray(l.dispatched_channels)
      ? l.dispatched_channels.map((c) => c.toUpperCase())
      : [];
    // Fallback: if dispatched_channels not stored yet (old logs), use l.channel
    const agentCh = (l.channel || "").toUpperCase();

    let matchesChannel = false;
    if (activeTab === "whatsapp") {
      matchesChannel = dispatched.some((c) => c === "WHATSAPP" || c === "SMS")
        || agentCh === "WHATSAPP" || agentCh === "SMS";
    } else if (activeTab === "mail") {
      matchesChannel = dispatched.includes("EMAIL") || agentCh === "EMAIL";
    } else if (activeTab === "dashboard") {
      // In-App is always present when an action fires
      matchesChannel = dispatched.includes("IN_APP") || dispatched.length === 0 || agentCh === "IN_APP" || agentCh === "";
    }

    if (!matchesChannel) return false;

    // 2. Search Term Filter (Name, User ID, Session ID, Email)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const sessionMatches = (l.session_id || "").toLowerCase().includes(term);
      const userMatches = (l.user_id || "").toLowerCase().includes(term);
      const emailMatches = (l.full_result_json?.user_email || "").toLowerCase().includes(term);
      const nameMatches = (l.full_result_json?.user_name || "").toLowerCase().includes(term);
      if (!sessionMatches && !userMatches && !emailMatches && !nameMatches) {
        return false;
      }
    }

    // 3. Date Filter
    if (filterDate) {
      const logDateString = new Date(l.timestamp).toISOString().split("T")[0]; // YYYY-MM-DD
      if (logDateString !== filterDate) {
        return false;
      }
    }

    // 4. Root Cause Filter
    if (filterCause) {
      if ((l.root_cause || "").toUpperCase() !== filterCause.toUpperCase()) {
        return false;
      }
    }

    return true;
  });


  return (
    <div>
      <h2>Notifications Dispatcher Log</h2>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, marginBottom: 20 }}>
        Monitor automated cart recovery messages dispatched across multi-agent channels.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
        {[
          { id: "whatsapp", label: "💬 WhatsApp Messages" },
          { id: "mail", label: "✉️ Email Notifications" },
          { id: "dashboard", label: "🖥️ In-App Dashboard Alerts" },
        ].map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "8px 18px",
                background: isActive ? "var(--plum)" : "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "none",
                borderRadius: "6px 6px 0 0",
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* WhatsApp Link Scanner Widget */}
      {activeTab === "whatsapp" && (
        <div style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 20,
          marginBottom: 20,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <h3 style={{ fontSize: 15, margin: 0, color: "var(--text)" }}>📲 WPPConnect WhatsApp Link Controller</h3>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, textTransform: "uppercase",
              background: wppStatus === "CONNECTED" ? "rgba(16,185,129,0.15)" : wppStatus === "OFFLINE" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
              color: wppStatus === "CONNECTED" ? "#10B981" : wppStatus === "OFFLINE" ? "#EF4444" : "#F59E0B"
            }}>
              Status: {wppStatus}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
            Link your phone directly to the local Puppeteer-driven WPPConnect engine to automate WhatsApp text alerts.
          </p>

          {wppStatus === "OFFLINE" && (
            <div style={{ padding: 12, background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.18)", borderRadius: 8, fontSize: 12, color: "#EF4444", marginBottom: 10 }}>
              <div>⚠️ <strong>WPPConnect Server is Offline or Starting Up</strong>: The WhatsApp daemon may still be warming up on Render (can take ~30s). Click the button below to start a session when it's ready.</div>
              <button onClick={checkWppStatus} className="secondary" style={{ marginTop: 8, padding: "5px 12px", fontSize: 11, width: "auto" }}>
                🔄 Retry Connection
              </button>
            </div>
          )}

          {wppStatus === "CONNECTED" && (
            <div style={{ padding: 12, background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.18)", borderRadius: 8, fontSize: 12, color: "#10B981", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>✅ <strong>WhatsApp Connected</strong>: Session is active and authenticated. Dispatched alerts will text users directly.</span>
              <button onClick={checkWppStatus} className="secondary" style={{ padding: "5px 12px", fontSize: 11, width: "auto" }}>
                🔄 Refresh Status
              </button>
            </div>
          )}

          {(wppStatus === "DISCONNECTED" || wppStatus === "CLOSED" || wppStatus === "NOT_LOGGED" || wppStatus === "OFFLINE") && (
            <div>
              <button onClick={initWppSession} className="primary" disabled={wppLoading} style={{ padding: "10px 20px", fontSize: 13, width: "auto" }}>
                {wppLoading ? "🤖 Initializing session…" : "🔑 Start WhatsApp Link Session"}
              </button>
            </div>
          )}

          {(wppStatus === "STARTING" || wppStatus === "QRCODE") && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, background: "var(--bg-alt)", padding: 16, borderRadius: 10, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>📲 Scan WhatsApp QR Code</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
                {wppStatus === "STARTING" && !wppQrCode
                  ? "⏳ Launching Chrome + WhatsApp Web… QR code loading (up to 30s on first run)"
                  : "Open WhatsApp on your mobile device ➡️ Linked Devices ➡️ Link a Device, and scan below:"}
              </div>
              {wppQrCode ? (
                <img
                  src={wppQrCode.startsWith("data:") ? wppQrCode : `data:image/png;base64,${wppQrCode}`}
                  alt="WhatsApp Link QR Code"
                  style={{ background: "#fff", padding: 12, borderRadius: 8, width: 220, height: 220, border: "2px solid #10B981", display: "block" }}
                />
              ) : (
                <QrImageWithFallback timestamp={qrTimestamp} />
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={checkWppStatus} className="primary" style={{ padding: "8px 16px", fontSize: 12, width: "auto" }}>
                  ✅ I scanned it (Check Link)
                </button>
                <button onClick={initWppSession} className="secondary" style={{ padding: "8px 16px", fontSize: 12, width: "auto" }}>
                  🔄 Regenerate QR
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters Bar */}
      <div style={{
        display: "flex",
        gap: 12,
        marginBottom: 20,
        padding: 14,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        alignItems: "center",
        flexWrap: "wrap"
      }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>Search Recipients</label>
          <input
            type="text"
            placeholder="Search by name, email, session ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: "8px 12px", fontSize: 12.5, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", width: 160 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>Filter by Date</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{ padding: "7.5px 12px", fontSize: 12.5, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", width: 180 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>Root Cause</label>
          <select
            value={filterCause}
            onChange={(e) => setFilterCause(e.target.value)}
            style={{ padding: "8px 12px", fontSize: 12.5, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
          >
            <option value="">All Root Causes</option>
            <option value="PAYMENT_FAILURE">Payment Failure</option>
            <option value="PRICE_SENSITIVITY">Price Sensitivity</option>
            <option value="COMPARISON_SHOPPING">Comparison Shopping</option>
            <option value="CHECKOUT_FRICTION">Checkout Friction</option>
            <option value="LOW_INTENT">Low Intent</option>
            <option value="MIXED_SIGNALS">Mixed Signals</option>
          </select>
        </div>

        {(searchTerm || filterDate || filterCause) && (
          <button
            onClick={() => {
              setSearchTerm("");
              setFilterDate("");
              setFilterCause("");
            }}
            className="secondary"
            style={{ alignSelf: "flex-end", padding: "8px 16px", fontSize: 12, height: 35, width: "auto" }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
          <div className="agent-spinner" style={{ width: 24, height: 24, margin: "0 auto 12px", borderWidth: 2 }} />
          <div>Syncing notifications logs…</div>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 24px",
          background: "var(--panel)", borderRadius: 12, border: "1px solid var(--border)",
          color: "var(--text-muted)"
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>No messages found</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>No recovery incentives were triggered for this channel.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filteredLogs.map((l) => {
            const resultObj = l.full_result_json || {};
            const action = resultObj.action || {};
            const rootCause = (l.root_cause || "").toUpperCase();
            let defaultMsg = "Hi! We noticed you left items in your cart. Complete your purchase now and claim a special discount!";
            if (rootCause === "PAYMENT_FAILURE") {
              defaultMsg = "Having trouble paying? Try alternate payment methods or select Cash on Delivery to place your order successfully!";
            } else if (rootCause === "COMPARISON_SHOPPING") {
              defaultMsg = "We noticed you are comparing items! Get the best value and claim a special discount.";
            } else if (rootCause === "CHECKOUT_FRICTION") {
              defaultMsg = "Need help completing your order? Chat with us — we're here to help!";
            }

            const message = action.message || l.message || defaultMsg;
            const discount = action.discount_amount || l.discount_amount || 0;
            const dispatchedChannels = Array.isArray(l.dispatched_channels) ? l.dispatched_channels : [];
            const notifResult = l.notification_result || {};
            const channelResults = notifResult.results || {};
            const emailRes = channelResults.email || {};

            const channelBadge = (ch) => {
              const icons = { whatsapp: "💬", email: "📧", in_app: "🔔", sms: "📱" };
              const colors = {
                whatsapp: { bg: "rgba(37,211,102,0.1)", color: "#25D366" },
                email: { bg: "rgba(99,102,241,0.1)", color: "#6366F1" },
                in_app: { bg: "rgba(236,72,153,0.1)", color: "#EC4899" },
                sms: { bg: "rgba(245,158,11,0.1)", color: "#F59E0B" },
              };
              const key = ch.toLowerCase();
              const style = colors[key] || { bg: "rgba(148,163,184,0.1)", color: "var(--text-muted)" };
              const res = channelResults[key] || {};
              const status = res.status || "sent";
              const isFailed = status === "failed" || status === "error";
              return (
                <span key={ch} style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4,
                  background: isFailed ? "rgba(239,68,68,0.1)" : style.bg,
                  color: isFailed ? "#EF4444" : style.color,
                  border: `1px solid ${isFailed ? "rgba(239,68,68,0.2)" : style.color + "33"}`,
                }}>
                  {icons[key] || "📨"} {ch.toUpperCase()} {isFailed ? "✗ FAILED" : "✓"}
                </span>
              );
            };

            return (
              <div
                key={l.id}
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {/* Header info */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                        Session ID: {l.session_id}
                      </span>
                      <span style={{ fontSize: 11, background: "var(--bg-alt)", padding: "2px 8px", borderRadius: 12, color: "var(--text-secondary)" }}>
                        {l.root_cause || "摩擦流失"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      Recipient User: {l.user_id} · Audited at {new Date(l.timestamp).toLocaleString()}
                    </div>
                    {/* Dispatched Channel Badges */}
                    {dispatchedChannels.length > 0 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        {dispatchedChannels.map(channelBadge)}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {discount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(16,185,129,0.15)", color: "#10B981", padding: "3px 9px", borderRadius: 20 }}>
                        ₹{discount} OFFER
                      </span>
                    )}
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", padding: "3px 9px", borderRadius: 20,
                      background: l.outcome === "SENT" || l.outcome === "PENDING" ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.12)",
                      color: l.outcome === "SENT" || l.outcome === "PENDING" ? "#10B981" : "var(--text-muted)",
                      textTransform: "uppercase"
                    }}>
                      {l.outcome || "DISPATCHED"}
                    </span>
                  </div>
                </div>

                {/* Sub-tab specific content preview */}
                {activeTab === "whatsapp" && (

                  <div style={{
                    background: "rgba(7, 94, 84, 0.05)",
                    border: "1px solid rgba(7, 94, 84, 0.15)",
                    borderRadius: 12,
                    padding: 12,
                    maxWidth: "500px",
                    position: "relative",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#128C7E", marginBottom: 4 }}>
                      🟢 WhatsApp Message Preview
                    </div>
                    <div style={{
                      background: "var(--surface)",
                      padding: 10,
                      borderRadius: "0 8px 8px 8px",
                      fontSize: 13,
                      color: "var(--text)",
                      lineHeight: 1.5,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.15)"
                    }}>
                      {message}
                    </div>
                  </div>
                )}

                {activeTab === "mail" && (
                  <div style={{
                    background: "var(--bg-alt)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 12,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 6 }}>
                      📧 {emailRes?.sender?.includes("gmail") || emailRes?.response === "Success" ? "SMTP/Gmail Local Email Preview" : "Resend Email Template"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", borderBottom: "1px solid var(--border)", paddingBottom: 6, marginBottom: 8 }}>
                      <strong>Subject:</strong> Complete Your Purchase | CartGuard AI<br />
                      <strong>From:</strong> {emailRes?.sender || "onboarding@resend.dev"}
                    </div>
                    <div style={{
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      padding: 14,
                      borderRadius: 8,
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      lineHeight: 1.6
                    }}>
                      {message}
                      {discount > 0 && (
                        <div style={{ color: "#EF4444", fontWeight: 700, marginTop: 8 }}>
                          🎁 Save ₹{discount} with code: SAVE{discount}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "dashboard" && (
                  <div style={{
                    background: "linear-gradient(90deg, rgba(139,92,246,0.06), rgba(236,72,153,0.06))",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 12,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#EC4899", marginBottom: 6 }}>
                      🖥️ In-App Topbar Banner Alert
                    </div>
                    <div style={{
                      background: "linear-gradient(90deg, #8B5CF6, #EC4899)",
                      color: "#fff",
                      padding: "8px 16px",
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: 10
                    }}>
                      <span>🔔 {message}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
