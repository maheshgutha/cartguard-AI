import { useEffect, useState } from "react";
import api from "../../api/axios.js";

// ── Comparison Table Card ──────────────────────────────────────────────────
function ComparisonCard({ cmp }) {
  const { product_base, item1, item2, spec_rows = [], recommended, reason, rec_name, price_diff, price_diff_pct } = cmp;
  const recIsItem1 = recommended === "item1";

  // Split rows by section
  const overviewRows = spec_rows.filter(r => r.section === "overview");
  const specDetailRows = spec_rows.filter(r => r.section === "specs");
  // Rows with no section tag → treat as spec detail (backward-compat)
  const legacyRows = spec_rows.filter(r => !r.section);
  const allSpecRows = [...specDetailRows, ...legacyRows];

  const tier1 = item1.quality_tier || item1.name?.split(" - ").pop() || "Option A";
  const tier2 = item2.quality_tier || item2.name?.split(" - ").pop() || "Option B";

  const colStyle = (isRec) => ({
    flex: 1,
    padding: "12px 10px",
    background: isRec ? "rgba(16,185,129,0.08)" : "var(--panel)",
    borderRadius: 10,
    border: isRec ? "2px solid rgba(16,185,129,0.45)" : "1.5px solid var(--border)",
    position: "relative",
    minWidth: 0,
    textAlign: "center",
  });

  const badgeStyle = {
    position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)",
    background: "#10B981", color: "#fff", fontSize: 10, fontWeight: 800,
    padding: "2px 10px", borderRadius: 20, whiteSpace: "nowrap",
  };

  const SectionHeader = ({ label }) => (
    <div style={{
      fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase",
      letterSpacing: "0.08em", padding: "6px 10px", background: "var(--bg-alt)",
      borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
    }}>{label}</div>
  );

  const SpecRow = ({ row, idx }) => {
    const i1wins = row.winner === "item1";
    const i2wins = row.winner === "item2";
    return (
      <div style={{
        display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr",
        padding: "7px 10px",
        background: idx % 2 === 0 ? "var(--panel)" : "var(--bg-alt)",
        borderTop: "1px solid var(--border)", alignItems: "start", gap: 4,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          {row.label}
        </span>
        <span style={{
          fontSize: 11, textAlign: "center", lineHeight: 1.4, wordBreak: "break-word",
          fontWeight: i1wins ? 700 : 400,
          color: i1wins ? "#10B981" : "var(--text-secondary)",
        }}>
          {i1wins ? "✓ " : ""}{row.item1}
        </span>
        <span style={{
          fontSize: 11, textAlign: "center", lineHeight: 1.4, wordBreak: "break-word",
          fontWeight: i2wins ? 700 : 400,
          color: i2wins ? "#10B981" : "var(--text-secondary)",
        }}>
          {i2wins ? "✓ " : ""}{row.item2}
        </span>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Header ── */}
      <div style={{ textAlign: "center" }}>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "3px 12px",
          background: "rgba(139,92,246,0.1)", color: "#8B5CF6",
          borderRadius: 20, letterSpacing: "0.04em"
        }}>🆚 COMPARISON</span>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginTop: 6 }}>{product_base}</div>
      </div>

      {/* ── Two item hero columns ── */}
      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        <div style={colStyle(recIsItem1)}>
          {recIsItem1 && <span style={badgeStyle}>✅ Best Pick</span>}
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{tier1}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: recIsItem1 ? "#10B981" : "var(--text)" }}>
            ₹{(item1.price || 0).toLocaleString("en-IN")}
          </div>
          {item1.rating != null && (
            <div style={{ fontSize: 11, color: "#F59E0B", marginTop: 3 }}>⭐ {item1.rating}/5</div>
          )}
          {item1.value_score != null && (
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
              Value Score: {item1.value_score}
            </div>
          )}
        </div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, color: "var(--text-muted)", minWidth: 24,
        }}>VS</div>

        <div style={colStyle(!recIsItem1)}>
          {!recIsItem1 && <span style={badgeStyle}>✅ Best Pick</span>}
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{tier2}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: !recIsItem1 ? "#10B981" : "var(--text)" }}>
            ₹{(item2.price || 0).toLocaleString("en-IN")}
          </div>
          {item2.rating != null && (
            <div style={{ fontSize: 11, color: "#F59E0B", marginTop: 3 }}>⭐ {item2.rating}/5</div>
          )}
          {item2.value_score != null && (
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
              Value Score: {item2.value_score}
            </div>
          )}
        </div>
      </div>

      {/* ── Comparison Table ── */}
      {(overviewRows.length > 0 || allSpecRows.length > 0) && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>

          {/* Table column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr",
            background: "var(--bg-alt)", padding: "6px 10px",
            fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            <span>Attribute</span>
            <span style={{ textAlign: "center" }}>{tier1}</span>
            <span style={{ textAlign: "center" }}>{tier2}</span>
          </div>

          {/* Overview section */}
          {overviewRows.length > 0 && (
            <>
              <SectionHeader label="📊 Overview" />
              {overviewRows.map((row, idx) => <SpecRow key={idx} row={row} idx={idx} />)}
            </>
          )}

          {/* Product specs section */}
          {allSpecRows.length > 0 && (
            <>
              <SectionHeader label="🔧 Product Specifications" />
              {allSpecRows.map((row, idx) => <SpecRow key={idx} row={row} idx={idx} />)}
            </>
          )}
        </div>
      )}

      {/* ── Recommendation Banner ── */}
      <div style={{
        background: "rgba(16,185,129,0.08)", border: "1.5px solid rgba(16,185,129,0.35)",
        borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 10,
      }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>✅</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#10B981" }}>
            Our Recommendation: {rec_name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>{reason}</div>
          {price_diff > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              💰 You save ₹{price_diff.toLocaleString("en-IN")} ({price_diff_pct}% less)
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function UserNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    api.get("/cart/notifications")
      .then((res) => {
        const logs = res.data.logs || res.data || [];
        const activeNotifs = logs.filter(n => {
          if (n.cooldown_active) return false;
          const actionType = n.action_type || n.full_result_json?.action?.action_type || "";
          return actionType && actionType !== "DO_NOTHING" && actionType !== "NONE";
        });
        setNotifications(activeNotifs);
      })
      .catch((err) => console.error("Failed to load notifications", err))
      .finally(() => setLoading(false));
  }, []);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const extractPromoCode = (message) => {
    const match = (message || "").match(/SAVE\d+/i);
    return match ? match[0].toUpperCase() : null;
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Your Notifications</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, margin: 0 }}>
          View recovery alerts and active coupons sent to your account.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div className="agent-spinner" style={{ width: 24, height: 24, margin: "0 auto 12px", borderWidth: 2 }} />
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading messages…</div>
        </div>
      ) : notifications.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 24px",
          background: "var(--panel)", borderRadius: 14, border: "1px solid var(--border)",
          color: "var(--text-muted)"
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔔</div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: 0 }}>All caught up!</h3>
          <p style={{ fontSize: 12, marginTop: 4, margin: 0 }}>You don't have any notifications at the moment.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {notifications.map((n) => {
            const resultObj = n.full_result_json || {};
            const action = resultObj.action || {};
            const rootCause = (n.root_cause || "").toUpperCase();

            // Try to get comparison_data from multiple places
            const cmpData =
              action.comparison_data ||
              n.comparison_data ||
              resultObj.comparison_data ||
              null;

            let defaultMsg = "Hi! We noticed you left items in your cart. Complete your purchase now and claim a special discount!";
            if (rootCause === "PAYMENT_FAILURE") {
              defaultMsg = "Having trouble paying? Try alternate payment methods or select Cash on Delivery to place your order successfully!";
            } else if (rootCause === "COMPARISON_SHOPPING") {
              defaultMsg = "We noticed you are comparing items! Get the best value and claim a special discount.";
            } else if (rootCause === "CHECKOUT_FRICTION") {
              defaultMsg = "Need help completing your order? Chat with us — we're here to help!";
            }

            const message = action.message || n.message || defaultMsg;
            const discount = action.discount_amount || n.discount_amount || 0;
            const code = extractPromoCode(message) || (discount > 0 ? `SAVE${discount}` : null);
            const isComparison = rootCause === "COMPARISON_SHOPPING" && cmpData;

            return (
              <div
                key={n.id}
                style={{
                  background: "var(--panel)",
                  border: isComparison ? "1.5px solid rgba(139,92,246,0.3)" : "1px solid var(--border)",
                  borderRadius: 14,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                }}
              >
                {/* Meta / channel badges */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {(Array.isArray(n.dispatched_channels) && n.dispatched_channels.length > 0
                      ? n.dispatched_channels
                      : [n.channel || "IN_APP"]
                    ).map((ch, idx) => {
                      const c = ch.toUpperCase();
                      return (
                        <span key={idx} style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
                          background: c === "EMAIL" ? "rgba(59,130,246,0.15)" : c === "WHATSAPP" || c === "SMS" ? "rgba(16,185,129,0.15)" : "rgba(139,92,246,0.15)",
                          color: c === "EMAIL" ? "#3B82F6" : c === "WHATSAPP" || c === "SMS" ? "#10B981" : "#8B5CF6",
                        }}>
                          {c === "EMAIL" ? "📧 Email" : c === "WHATSAPP" || c === "SMS" ? "💬 WhatsApp" : "🖥️ In-App Alert"}
                        </span>
                      );
                    })}
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>
                      {new Date(n.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {discount > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981" }}>
                      🎁 ₹{discount} Saved
                    </span>
                  )}
                </div>

                {/* Body: comparison card OR plain text */}
                {isComparison ? (
                  <ComparisonCard cmp={cmpData} />
                ) : (
                  <div style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {message}
                  </div>
                )}

                {/* Promo code box */}
                {code && !isComparison && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "var(--bg-alt)", borderRadius: 8, padding: "10px 14px",
                    border: "1px dashed var(--border)", marginTop: 4,
                  }}>
                    <div>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", display: "block" }}>PROMO CODE</span>
                      <strong style={{ fontSize: 14, color: "var(--text)", letterSpacing: "0.05em" }}>{code}</strong>
                    </div>
                    <button
                      onClick={() => copyToClipboard(code, n.id)}
                      style={{
                        padding: "6px 14px", fontSize: 11, width: "auto",
                        background: copiedId === n.id ? "#10B981" : "var(--plum)",
                        color: copiedId === n.id ? "#fff" : "var(--accent)",
                        border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600,
                      }}
                    >
                      {copiedId === n.id ? "✓ Copied" : "📋 Copy Code"}
                    </button>
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
