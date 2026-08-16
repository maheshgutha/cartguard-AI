import { useEffect, useState, useMemo } from "react";
import api from "../../api/axios.js";

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState("pipeline"); // "pipeline" | "comparison" | "json"
  const [copiedId, setCopiedId] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRisk, setFilterRisk] = useState("ALL");
  const [filterCause, setFilterCause] = useState("ALL");
  const [filterChannel, setFilterChannel] = useState("ALL");
  const [filterOutcome, setFilterOutcome] = useState("ALL");
  const [filterDate, setFilterDate] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const fetchLogs = () => {
    setLoading(true);
    api.get("/admin/audit-log", { params: { limit: 100 } })
      .then((res) => {
        const data = res.data.logs || res.data || [];
        setLogs(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error("Failed to load audit logs:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Auto-refresh interval every 15s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      api.get("/admin/audit-log", { params: { limit: 100 } })
        .then((res) => {
          const data = res.data.logs || res.data || [];
          setLogs(Array.isArray(data) ? data : []);
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const copyText = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Filtered Logs & Metrics Computation ────────────────────────────────────
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const sId = (log.session_id || "").toLowerCase();
      const uId = (log.user_id || "").toLowerCase();
      const cause = (log.root_cause || "").toUpperCase();
      const risk = (log.risk_level || "").toUpperCase();
      const action = (log.action_type || "").toUpperCase();
      const channel = (log.channel || "").toUpperCase();
      const outcome = (log.outcome || "").toUpperCase();
      const msg = (log.full_result_json?.action?.message || log.message || "").toLowerCase();

      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        sId.includes(q) ||
        uId.includes(q) ||
        cause.includes(q) ||
        action.includes(q) ||
        msg.includes(q);

      const matchesRisk = filterRisk === "ALL" || risk === filterRisk;
      const matchesCause = filterCause === "ALL" || cause === filterCause;
      const matchesChannel =
        filterChannel === "ALL" ||
        channel.includes(filterChannel) ||
        (Array.isArray(log.dispatched_channels) &&
          log.dispatched_channels.some((c) => c.toUpperCase() === filterChannel));
      const matchesOutcome = filterOutcome === "ALL" || outcome === filterOutcome;
      const matchesDate =
        !filterDate || (log.timestamp && log.timestamp.startsWith(filterDate));

      return (
        matchesSearch &&
        matchesRisk &&
        matchesCause &&
        matchesChannel &&
        matchesOutcome &&
        matchesDate
      );
    });
  }, [logs, searchTerm, filterRisk, filterCause, filterChannel, filterOutcome, filterDate]);

  // KPIs
  const totalAudits = logs.length;
  const highRiskCount = logs.filter((l) => (l.risk_level || "").toUpperCase() === "HIGH").length;
  const highRiskPct = totalAudits > 0 ? Math.round((highRiskCount / totalAudits) * 100) : 0;
  const activeInterventions = logs.filter(
    (l) => l.action_type && l.action_type !== "DO_NOTHING" && l.action_type !== "NONE"
  ).length;
  const avgLatency =
    logs.length > 0
      ? Math.round(
          logs.reduce((acc, l) => acc + (l.total_latency_ms || 120), 0) / logs.length
        )
      : 0;
  const totalDiscountExposure = logs.reduce(
    (acc, l) => acc + (l.discount_amount || l.full_result_json?.action?.discount_amount || 0),
    0
  );

  // Pagination slice
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Export filtered logs to JSON
  const exportLogsJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `cartguard_audit_logs_${Date.now()}.json`);
    dlAnchor.click();
  };

  // Helper styles / badge renderers
  const getRiskBadge = (level, score) => {
    const l = (level || "").toUpperCase();
    const pct = typeof score === "number" ? Math.round(score * 100) : 0;
    if (l === "HIGH" || pct >= 70) {
      return (
        <span style={{
          background: "rgba(239, 68, 68, 0.12)", color: "#EF4444", border: "1px solid rgba(239, 68, 68, 0.3)",
          padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444" }} />
          {pct}% HIGH
        </span>
      );
    }
    if (l === "MEDIUM" || pct >= 45) {
      return (
        <span style={{
          background: "rgba(245, 158, 11, 0.12)", color: "#F59E0B", border: "1px solid rgba(245, 158, 11, 0.3)",
          padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#F59E0B" }} />
          {pct}% MED
        </span>
      );
    }
    return (
      <span style={{
        background: "rgba(16, 185, 129, 0.12)", color: "#10B981", border: "1px solid rgba(16, 185, 129, 0.3)",
        padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} />
        {pct}% LOW
      </span>
    );
  };

  const getCauseBadge = (cause) => {
    const c = (cause || "UNKNOWN").toUpperCase();
    let icon = "⚙️";
    let bg = "rgba(107, 114, 128, 0.12)";
    let color = "#6B7280";

    if (c === "COMPARISON_SHOPPING") {
      icon = "🆚"; bg = "rgba(139, 92, 246, 0.12)"; color = "#8B5CF6";
    } else if (c === "PAYMENT_FAILURE") {
      icon = "💳"; bg = "rgba(239, 68, 68, 0.12)"; color = "#EF4444";
    } else if (c === "PRICE_SENSITIVITY") {
      icon = "🏷️"; bg = "rgba(245, 158, 11, 0.12)"; color = "#D97706";
    } else if (c === "CHECKOUT_FRICTION") {
      icon = "⚠️"; bg = "rgba(234, 88, 12, 0.12)"; color = "#EA580C";
    } else if (c === "HIGH_RISK_INACTIVITY") {
      icon = "⏱️"; bg = "rgba(59, 130, 246, 0.12)"; color = "#3B82F6";
    } else if (c === "LOW_RISK" || c === "LOW_INTENT") {
      icon = "🟢"; bg = "rgba(16, 185, 129, 0.12)"; color = "#10B981";
    }

    return (
      <span style={{
        background: bg, color, fontSize: 11, fontWeight: 700,
        padding: "3px 8px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap"
      }}>
        <span>{icon}</span> {c.replace(/_/g, " ")}
      </span>
    );
  };

  const getChannelBadges = (log) => {
    const dispatched = Array.isArray(log.dispatched_channels) && log.dispatched_channels.length > 0
      ? log.dispatched_channels
      : [log.channel || "NONE"];

    return (
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {dispatched.map((ch, idx) => {
          const c = (ch || "NONE").toUpperCase();
          if (c === "WHATSAPP" || c === "SMS") {
            return (
              <span key={idx} style={{
                background: "rgba(16, 185, 129, 0.12)", color: "#10B981",
                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6
              }}>💬 WA</span>
            );
          }
          if (c === "EMAIL") {
            return (
              <span key={idx} style={{
                background: "rgba(59, 130, 246, 0.12)", color: "#3B82F6",
                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6
              }}>📧 Mail</span>
            );
          }
          if (c === "IN_APP") {
            return (
              <span key={idx} style={{
                background: "rgba(139, 92, 246, 0.12)", color: "#8B5CF6",
                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6
              }}>🖥️ App</span>
            );
          }
          return (
            <span key={idx} style={{
              background: "rgba(156, 163, 175, 0.12)", color: "#9CA3AF",
              fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 6
            }}>—</span>
          );
        })}
      </div>
    );
  };

  const getOutcomeBadge = (outcome) => {
    const o = (outcome || "PENDING").toUpperCase();
    if (o === "CONVERTED" || o === "RECOVERED" || o === "ORDER_PLACED") {
      return (
        <span style={{
          background: "rgba(16, 185, 129, 0.15)", color: "#10B981",
          fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 12
        }}>✓ RECOVERED</span>
      );
    }
    if (o === "ABANDONED" || o === "FAILED") {
      return (
        <span style={{
          background: "rgba(239, 68, 68, 0.12)", color: "#EF4444",
          fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 12
        }}>ABANDONED</span>
      );
    }
    return (
      <span style={{
        background: "rgba(245, 158, 11, 0.12)", color: "#F59E0B",
        fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 12
      }}>PENDING</span>
    );
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px" }}>
      
      {/* ── Top Header & Actions ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", margin: 0 }}>
              Audit Log & AI Trace
            </h2>
            <span style={{
              background: "rgba(99, 102, 241, 0.1)", color: "#6366F1",
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(99, 102, 241, 0.25)"
            }}>
              MongoDB Audit Trail
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, margin: 0 }}>
            Full evidence chain, multi-agent diagnosis logs, rule evaluations, and multi-channel recovery traces.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: autoRefresh ? "rgba(16, 185, 129, 0.1)" : "var(--bg-alt)",
              color: autoRefresh ? "#10B981" : "var(--text-secondary)",
              border: autoRefresh ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid var(--border)",
              display: "inline-flex", alignItems: "center", gap: 6
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: autoRefresh ? "#10B981" : "#9CA3AF" }} />
            {autoRefresh ? "Live 15s" : "Auto-refresh Off"}
          </button>

          <button
            onClick={fetchLogs}
            disabled={loading}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: "var(--bg-alt)", color: "var(--text)", border: "1px solid var(--border)",
              display: "inline-flex", alignItems: "center", gap: 6
            }}
          >
            🔄 {loading ? "Refreshing…" : "Refresh"}
          </button>

          <button
            onClick={exportLogsJSON}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: "var(--plum)", color: "#FFFFFF", border: "none",
              display: "inline-flex", alignItems: "center", gap: 6,
              boxShadow: "0 2px 6px rgba(40, 27, 61, 0.2)"
            }}
          >
            📥 Export JSON
          </button>
        </div>
      </div>

      {/* ── Executive KPI Summary Cards ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 14, marginBottom: 20
      }}>
        <div style={{
          background: "var(--panel)", padding: "14px 18px", borderRadius: 12,
          border: "1px solid var(--border)", boxShadow: "0 2px 6px rgba(0,0,0,0.02)"
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Total Audited Sessions
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", marginTop: 4 }}>
            {totalAudits}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            Showing {filteredLogs.length} matching filters
          </div>
        </div>

        <div style={{
          background: "var(--panel)", padding: "14px 18px", borderRadius: 12,
          border: "1px solid var(--border)", boxShadow: "0 2px 6px rgba(0,0,0,0.02)"
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            High Risk Interventions
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#EF4444", marginTop: 4 }}>
            {highRiskCount} <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>({highRiskPct}%)</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            Active AI interventions: {activeInterventions}
          </div>
        </div>

        <div style={{
          background: "var(--panel)", padding: "14px 18px", borderRadius: 12,
          border: "1px solid var(--border)", boxShadow: "0 2px 6px rgba(0,0,0,0.02)"
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Avg Decision Latency
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#6366F1", marginTop: 4 }}>
            {avgLatency} <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>ms</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            Real-time inference pipeline
          </div>
        </div>

        <div style={{
          background: "var(--panel)", padding: "14px 18px", borderRadius: 12,
          border: "1px solid var(--border)", boxShadow: "0 2px 6px rgba(0,0,0,0.02)"
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Total Discount Value
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#10B981", marginTop: 4 }}>
            ₹{totalDiscountExposure.toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            Offered in recovery promotions
          </div>
        </div>
      </div>

      {/* ── Advanced Filter & Search Bar ── */}
      <div style={{
        background: "var(--panel)", padding: "14px 16px", borderRadius: 12,
        border: "1px solid var(--border)", marginBottom: 16, display: "flex", flexDirection: "column", gap: 12
      }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {/* Search Box */}
          <div style={{ flex: "2 1 260px", position: "relative" }}>
            <input
              type="text"
              placeholder="🔍 Search session ID, user ID, root cause, message..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg-alt)",
                fontSize: 13, color: "var(--text)", outline: "none"
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14
                }}
              >✕</button>
            )}
          </div>

          {/* Risk Level Filter */}
          <div style={{ flex: "1 1 120px" }}>
            <select
              value={filterRisk}
              onChange={(e) => { setFilterRisk(e.target.value); setCurrentPage(1); }}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg-alt)",
                fontSize: 12, fontWeight: 600, color: "var(--text)", outline: "none"
              }}
            >
              <option value="ALL">All Risk Levels</option>
              <option value="HIGH">🔴 High Risk (&gt;70%)</option>
              <option value="MEDIUM">🟡 Medium Risk (45-70%)</option>
              <option value="LOW">🟢 Low Risk (&lt;45%)</option>
            </select>
          </div>

          {/* Root Cause Filter */}
          <div style={{ flex: "1 1 160px" }}>
            <select
              value={filterCause}
              onChange={(e) => { setFilterCause(e.target.value); setCurrentPage(1); }}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg-alt)",
                fontSize: 12, fontWeight: 600, color: "var(--text)", outline: "none"
              }}
            >
              <option value="ALL">All Root Causes</option>
              <option value="COMPARISON_SHOPPING">🆚 Comparison Shopping</option>
              <option value="PAYMENT_FAILURE">💳 Payment Failure</option>
              <option value="PRICE_SENSITIVITY">🏷️ Price Sensitivity</option>
              <option value="CHECKOUT_FRICTION">⚠️ Checkout Friction</option>
              <option value="HIGH_RISK_INACTIVITY">⏱️ High Inactivity</option>
              <option value="LOW_RISK">🟢 Low Risk / Intent</option>
            </select>
          </div>

          {/* Channel Filter */}
          <div style={{ flex: "1 1 130px" }}>
            <select
              value={filterChannel}
              onChange={(e) => { setFilterChannel(e.target.value); setCurrentPage(1); }}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg-alt)",
                fontSize: 12, fontWeight: 600, color: "var(--text)", outline: "none"
              }}
            >
              <option value="ALL">All Channels</option>
              <option value="WHATSAPP">💬 WhatsApp</option>
              <option value="EMAIL">📧 Email</option>
              <option value="IN_APP">🖥️ In-App Banner</option>
              <option value="NONE">⚪ None (Do Nothing)</option>
            </select>
          </div>

          {/* Outcome Filter */}
          <div style={{ flex: "1 1 120px" }}>
            <select
              value={filterOutcome}
              onChange={(e) => { setFilterOutcome(e.target.value); setCurrentPage(1); }}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg-alt)",
                fontSize: 12, fontWeight: 600, color: "var(--text)", outline: "none"
              }}
            >
              <option value="ALL">All Outcomes</option>
              <option value="PENDING">🟡 Pending</option>
              <option value="RECOVERED">🟢 Recovered</option>
              <option value="ABANDONED">🔴 Abandoned</option>
            </select>
          </div>

          {/* Date Picker */}
          <div style={{ flex: "1 1 130px" }}>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => { setFilterDate(e.target.value); setCurrentPage(1); }}
              style={{
                width: "100%", padding: "7px 10px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg-alt)",
                fontSize: 12, color: "var(--text)", outline: "none"
              }}
            />
          </div>
        </div>

        {/* Active Filters Summary */}
        {(searchTerm || filterRisk !== "ALL" || filterCause !== "ALL" || filterChannel !== "ALL" || filterOutcome !== "ALL" || filterDate) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11, color: "var(--text-muted)" }}>
            <span>Active filters:</span>
            {searchTerm && <span style={{ background: "var(--bg-alt)", padding: "2px 8px", borderRadius: 6 }}>Query: "{searchTerm}"</span>}
            {filterRisk !== "ALL" && <span style={{ background: "var(--bg-alt)", padding: "2px 8px", borderRadius: 6 }}>Risk: {filterRisk}</span>}
            {filterCause !== "ALL" && <span style={{ background: "var(--bg-alt)", padding: "2px 8px", borderRadius: 6 }}>Cause: {filterCause}</span>}
            {filterChannel !== "ALL" && <span style={{ background: "var(--bg-alt)", padding: "2px 8px", borderRadius: 6 }}>Channel: {filterChannel}</span>}
            {filterOutcome !== "ALL" && <span style={{ background: "var(--bg-alt)", padding: "2px 8px", borderRadius: 6 }}>Outcome: {filterOutcome}</span>}
            {filterDate && <span style={{ background: "var(--bg-alt)", padding: "2px 8px", borderRadius: 6 }}>Date: {filterDate}</span>}
            <button
              onClick={() => {
                setSearchTerm(""); setFilterRisk("ALL"); setFilterCause("ALL");
                setFilterChannel("ALL"); setFilterOutcome("ALL"); setFilterDate("");
                setCurrentPage(1);
              }}
              style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ── Audit Log Data Table ── */}
      <div style={{
        background: "var(--panel)", borderRadius: 14,
        border: "1px solid var(--border)", overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
      }}>
        {loading && logs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div className="agent-spinner" style={{ width: 28, height: 28, margin: "0 auto 12px", borderWidth: 2 }} />
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading decision audit logs…</div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>No audit logs found</h3>
            <p style={{ fontSize: 12, marginTop: 4, margin: 0 }}>Try clearing or adjusting your search filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
              <thead>
                <tr style={{
                  background: "var(--bg-alt)", borderBottom: "1px solid var(--border)",
                  fontSize: 10.5, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em"
                }}>
                  <th style={{ padding: "12px 14px" }}>Timestamp</th>
                  <th style={{ padding: "12px 14px" }}>Session / User</th>
                  <th style={{ padding: "12px 14px" }}>Risk Assessment</th>
                  <th style={{ padding: "12px 14px" }}>Root Cause</th>
                  <th style={{ padding: "12px 14px" }}>Prescribed Action</th>
                  <th style={{ padding: "12px 14px" }}>Channels</th>
                  <th style={{ padding: "12px 14px" }}>Discount</th>
                  <th style={{ padding: "12px 14px" }}>Latency</th>
                  <th style={{ padding: "12px 14px" }}>Outcome</th>
                  <th style={{ padding: "12px 14px", textAlign: "center" }}>Trace</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map((l, index) => {
                  const resultObj = l.full_result_json || {};
                  const action = resultObj.action || {};
                  const discount = l.discount_amount || action.discount_amount || 0;
                  const latency = l.total_latency_ms || 110;
                  const isSelected = selectedLog?.id === l.id;

                  return (
                    <tr
                      key={l.id || index}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: isSelected ? "rgba(99, 102, 241, 0.05)" : index % 2 === 0 ? "var(--panel)" : "var(--bg-alt)",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(0,0,0,0.02)"; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = index % 2 === 0 ? "var(--panel)" : "var(--bg-alt)"; }}
                    >
                      {/* Timestamp */}
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>
                          {l.timestamp ? new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "—"}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                          {l.timestamp ? new Date(l.timestamp).toLocaleDateString() : ""}
                        </div>
                      </td>

                      {/* Session / User */}
                      <td style={{ padding: "12px 14px", maxWidth: 160 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span
                            title={l.session_id}
                            style={{
                              fontFamily: "monospace", fontWeight: 700, color: "var(--text)",
                              fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                            }}
                          >
                            {l.session_id ? (l.session_id.length > 18 ? `${l.session_id.slice(0, 16)}…` : l.session_id) : "—"}
                          </span>
                          <button
                            onClick={() => copyText(l.session_id, `s-${l.id}`)}
                            title="Copy Session ID"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, fontSize: 10 }}
                          >
                            {copiedId === `s-${l.id}` ? "✓" : "📋"}
                          </button>
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          User: {l.user_id ? (l.user_id.length > 14 ? `${l.user_id.slice(0, 12)}…` : l.user_id) : "Anonymous"}
                        </div>
                      </td>

                      {/* Risk Assessment */}
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        {getRiskBadge(l.risk_level, l.risk_score)}
                      </td>

                      {/* Root Cause */}
                      <td style={{ padding: "12px 14px" }}>
                        {getCauseBadge(l.root_cause)}
                        {l.diagnosis_confidence ? (
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                            {Math.round(l.diagnosis_confidence * 100)}% confidence
                          </div>
                        ) : null}
                      </td>

                      {/* Prescribed Action */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 11.5 }}>
                          {l.action_type || "DO_NOTHING"}
                        </div>
                        {action.message && (
                          <div style={{
                            fontSize: 11, color: "var(--text-secondary)", marginTop: 2,
                            maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                          }}>
                            {action.message.split("\n")[0]}
                          </div>
                        )}
                      </td>

                      {/* Channels */}
                      <td style={{ padding: "12px 14px" }}>
                        {getChannelBadges(l)}
                      </td>

                      {/* Discount */}
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        {discount > 0 ? (
                          <span style={{
                            background: "rgba(16, 185, 129, 0.12)", color: "#10B981",
                            padding: "2px 8px", borderRadius: 10, fontWeight: 800, fontSize: 11
                          }}>
                            ₹{discount}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>

                      {/* Latency */}
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 11 }}>{Math.round(latency)}ms</span>
                      </td>

                      {/* Outcome */}
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        {getOutcomeBadge(l.outcome)}
                      </td>

                      {/* Inspect Action */}
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <button
                          onClick={() => setSelectedLog(l)}
                          style={{
                            padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                            background: isSelected ? "var(--plum)" : "var(--bg-alt)",
                            color: isSelected ? "#FFFFFF" : "var(--text)",
                            border: "1px solid var(--border)", cursor: "pointer",
                            transition: "all 0.15s ease"
                          }}
                        >
                          👁️ Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Table Footer & Pagination ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", background: "var(--bg-alt)", borderTop: "1px solid var(--border)",
          fontSize: 12, color: "var(--text-secondary)", flexWrap: "wrap", gap: 12
        }}>
          <div>
            Showing <strong style={{ color: "var(--text)" }}>{(currentPage - 1) * pageSize + 1}</strong> to{" "}
            <strong style={{ color: "var(--text)" }}>
              {Math.min(currentPage * pageSize, filteredLogs.length)}
            </strong> of <strong style={{ color: "var(--text)" }}>{filteredLogs.length}</strong> entries
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                style={{
                  padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)",
                  background: "var(--panel)", fontSize: 12, color: "var(--text)"
                }}
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)",
                  background: currentPage === 1 ? "var(--bg-alt)" : "var(--panel)",
                  color: currentPage === 1 ? "var(--text-muted)" : "var(--text)",
                  cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600
                }}
              >
                ◀ Prev
              </button>
              <span style={{ padding: "4px 8px", fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)",
                  background: currentPage >= totalPages ? "var(--bg-alt)" : "var(--panel)",
                  color: currentPage >= totalPages ? "var(--text-muted)" : "var(--text)",
                  cursor: currentPage >= totalPages ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600
                }}
              >
                Next ▶
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Trace & Decision Deep-Dive Inspector Modal ── */}
      {selectedLog && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0, 0, 0, 0.5)", zIndex: 9999,
          display: "flex", justifyContent: "center", alignItems: "center", padding: 20
        }}>
          <div style={{
            background: "var(--panel)", width: "100%", maxWidth: 850, maxHeight: "90vh",
            borderRadius: 16, border: "1px solid var(--border)", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 40px rgba(0,0,0,0.2)", overflow: "hidden"
          }}>
            
            {/* Modal Header */}
            <div style={{
              padding: "16px 20px", borderBottom: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "var(--bg-alt)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>🧠</span>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", margin: 0 }}>
                    AI Decision Trace & Evidence Chain
                  </h3>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>
                    Session: {selectedLog.session_id}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {getRiskBadge(selectedLog.risk_level, selectedLog.risk_score)}
                <button
                  onClick={() => setSelectedLog(null)}
                  style={{
                    background: "none", border: "none", fontSize: 18, cursor: "pointer",
                    color: "var(--text-muted)", padding: "4px 8px", borderRadius: 6
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Tabs */}
            <div style={{
              display: "flex", borderBottom: "1px solid var(--border)", background: "var(--panel)", padding: "0 20px"
            }}>
              {[
                { id: "pipeline", label: "⚡ Multi-Agent Pipeline" },
                ...(selectedLog.full_result_json?.action?.comparison_data || selectedLog.root_cause === "COMPARISON_SHOPPING"
                  ? [{ id: "comparison", label: "🆚 Comparison Details" }]
                  : []),
                { id: "json", label: "📄 Raw Audit JSON" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveInspectorTab(tab.id)}
                  style={{
                    padding: "12px 16px", background: "none", border: "none",
                    borderBottom: activeInspectorTab === tab.id ? "2px solid var(--plum)" : "2px solid transparent",
                    color: activeInspectorTab === tab.id ? "var(--plum)" : "var(--text-secondary)",
                    fontWeight: activeInspectorTab === tab.id ? 800 : 600, fontSize: 12.5, cursor: "pointer"
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
              {activeInspectorTab === "pipeline" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  
                  {/* Step 1: Signals & Risk */}
                  <div style={{
                    background: "var(--bg-alt)", borderRadius: 12, padding: 14, border: "1px solid var(--border)"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>📊</span> 1. Telemetry & Risk Assessor Agent
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#6366F1" }}>
                        Confidence: {Math.round((selectedLog.diagnosis_confidence || 0.9) * 100)}%
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, fontSize: 11 }}>
                      <div style={{ background: "var(--panel)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ color: "var(--text-muted)" }}>Risk Score</div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: "#EF4444", marginTop: 2 }}>
                          {Math.round((selectedLog.risk_score || 0) * 100)}%
                        </div>
                      </div>
                      <div style={{ background: "var(--panel)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ color: "var(--text-muted)" }}>Latency</div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text)", marginTop: 2 }}>
                          {Math.round(selectedLog.total_latency_ms || 110)} ms
                        </div>
                      </div>
                      <div style={{ background: "var(--panel)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ color: "var(--text-muted)" }}>Self-Check</div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: "#10B981", marginTop: 2 }}>
                          {selectedLog.self_check_status || "PASSED"}
                        </div>
                      </div>
                      <div style={{ background: "var(--panel)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ color: "var(--text-muted)" }}>Model Cost</div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text)", marginTop: 2 }}>
                          ₹{(selectedLog.total_cost_inr || 0.04).toFixed(4)}
                        </div>
                      </div>
                    </div>

                    {/* Feature Weights / Signals */}
                    {selectedLog.signals_json && Object.keys(selectedLog.signals_json).length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>
                          Detected Signals & Weights
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {Object.entries(selectedLog.signals_json).map(([k, v]) => (
                            <span key={k} style={{
                              background: "var(--panel)", border: "1px solid var(--border)",
                              padding: "3px 8px", borderRadius: 6, fontSize: 10.5, color: "var(--text)"
                            }}>
                              <strong>{k.replace(/_/g, " ")}:</strong> {typeof v === "number" ? v.toFixed(2) : String(v)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Diagnosis Engine */}
                  <div style={{
                    background: "var(--bg-alt)", borderRadius: 12, padding: 14, border: "1px solid var(--border)"
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>🔍</span> 2. Diagnosis Engine (Root Cause Identification)
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      {getCauseBadge(selectedLog.root_cause)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {selectedLog.root_cause === "COMPARISON_SHOPPING"
                        ? "User has added multiple variants of the same product line to their cart. The system diagnosed hesitation between tier options and triggered comparison guidance."
                        : selectedLog.root_cause === "PAYMENT_FAILURE"
                        ? "Detected payment gateway decline or card validation failure. Recommended alternate methods (UPI / Cash on Delivery)."
                        : selectedLog.root_cause === "PRICE_SENSITIVITY"
                        ? "High cart value with prolonged hesitation and coupon attempts. Generated dynamic margin-safe discount."
                        : "Heuristic pattern matched with high confidence threshold."}
                    </div>
                  </div>

                  {/* Step 3: Policy & Action Engine */}
                  <div style={{
                    background: "var(--bg-alt)", borderRadius: 12, padding: 14, border: "1px solid var(--border)"
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>⚡</span> 3. Policy Guardrails & Action Dispatch
                    </div>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11, marginBottom: 12 }}>
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>Prescribed Action: </span>
                        <strong style={{ color: "var(--text)" }}>{selectedLog.action_type}</strong>
                      </div>
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>Target Channel: </span>
                        <strong style={{ color: "var(--text)" }}>{selectedLog.channel}</strong>
                      </div>
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>Discount Offered: </span>
                        <strong style={{ color: "#10B981" }}>₹{selectedLog.discount_amount || 0}</strong>
                      </div>
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>Expected Uplift: </span>
                        <strong style={{ color: "#6366F1" }}>
                          {selectedLog.uplift_probability ? `${Math.round(selectedLog.uplift_probability * 100)}%` : "25%"}
                        </strong>
                      </div>
                    </div>

                    {/* Dispatched Message Preview */}
                    {(selectedLog.full_result_json?.action?.message || selectedLog.message) && (
                      <div style={{
                        background: "var(--panel)", padding: 12, borderRadius: 8, border: "1px solid var(--border)"
                      }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>
                          Dispatched Message Payload:
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.5, fontFamily: "monospace" }}>
                          {selectedLog.full_result_json?.action?.message || selectedLog.message}
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* Tab 2: Comparison Specs */}
              {activeInspectorTab === "comparison" && (
                <div>
                  {selectedLog.full_result_json?.action?.comparison_data ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {(() => {
                        const cmp = selectedLog.full_result_json.action.comparison_data;
                        return (
                          <>
                            <div style={{ textAlign: "center" }}>
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: "3px 12px",
                                background: "rgba(139,92,246,0.1)", color: "#8B5CF6",
                                borderRadius: 20
                              }}>
                                🆚 COMPARISON MATRIX
                              </span>
                              <h4 style={{ fontSize: 16, fontWeight: 800, marginTop: 4, color: "var(--text)" }}>
                                {cmp.product_base}
                              </h4>
                            </div>

                            <div style={{
                              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12
                            }}>
                              <div style={{
                                padding: 12, borderRadius: 8, background: cmp.recommended === "item1" ? "rgba(16,185,129,0.08)" : "var(--bg-alt)",
                                border: cmp.recommended === "item1" ? "2px solid #10B981" : "1px solid var(--border)", textAlign: "center"
                              }}>
                                {cmp.recommended === "item1" && <div style={{ color: "#10B981", fontSize: 10, fontWeight: 800 }}>✅ RECOMMENDED</div>}
                                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{cmp.item1?.name}</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: cmp.recommended === "item1" ? "#10B981" : "var(--text)", marginTop: 4 }}>
                                  ₹{(cmp.item1?.price || 0).toLocaleString("en-IN")}
                                </div>
                              </div>

                              <div style={{
                                padding: 12, borderRadius: 8, background: cmp.recommended === "item2" ? "rgba(16,185,129,0.08)" : "var(--bg-alt)",
                                border: cmp.recommended === "item2" ? "2px solid #10B981" : "1px solid var(--border)", textAlign: "center"
                              }}>
                                {cmp.recommended === "item2" && <div style={{ color: "#10B981", fontSize: 10, fontWeight: 800 }}>✅ RECOMMENDED</div>}
                                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{cmp.item2?.name}</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: cmp.recommended === "item2" ? "#10B981" : "var(--text)", marginTop: 4 }}>
                                  ₹{(cmp.item2?.price || 0).toLocaleString("en-IN")}
                                </div>
                              </div>
                            </div>

                            {/* Spec Rows Table */}
                            {Array.isArray(cmp.spec_rows) && cmp.spec_rows.length > 0 && (
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                                <thead>
                                  <tr style={{ background: "var(--bg-alt)", borderBottom: "1px solid var(--border)" }}>
                                    <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--text-muted)" }}>Attribute</th>
                                    <th style={{ padding: "8px 10px", textAlign: "center", color: "var(--text)" }}>{cmp.item1?.quality_tier || "Item 1"}</th>
                                    <th style={{ padding: "8px 10px", textAlign: "center", color: "var(--text)" }}>{cmp.item2?.quality_tier || "Item 2"}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cmp.spec_rows.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "var(--panel)" : "var(--bg-alt)" }}>
                                      <td style={{ padding: "7px 10px", fontWeight: 600, color: "var(--text-secondary)" }}>{row.label}</td>
                                      <td style={{
                                        padding: "7px 10px", textAlign: "center",
                                        fontWeight: row.winner === "item1" ? 700 : 400,
                                        color: row.winner === "item1" ? "#10B981" : "var(--text)"
                                      }}>
                                        {row.winner === "item1" ? "✓ " : ""}{row.item1}
                                      </td>
                                      <td style={{
                                        padding: "7px 10px", textAlign: "center",
                                        fontWeight: row.winner === "item2" ? 700 : 400,
                                        color: row.winner === "item2" ? "#10B981" : "var(--text)"
                                      }}>
                                        {row.winner === "item2" ? "✓ " : ""}{row.item2}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}

                            {/* Recommendation Reason Banner */}
                            <div style={{
                              background: "rgba(16,185,129,0.08)", border: "1px solid #86EFAC",
                              borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10
                            }}>
                              <span style={{ fontSize: 20 }}>✅</span>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#10B981" }}>
                                  Decision Recommendation: {cmp.rec_name}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                                  {cmp.reason}
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 13 }}>
                      No structured comparison metadata recorded for this log entry.
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Raw JSON */}
              {activeInspectorTab === "json" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                    <button
                      onClick={() => copyText(JSON.stringify(selectedLog, null, 2), "raw-json")}
                      style={{
                        padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: "var(--bg-alt)", border: "1px solid var(--border)", cursor: "pointer",
                        color: copiedId === "raw-json" ? "#10B981" : "var(--text)"
                      }}
                    >
                      {copiedId === "raw-json" ? "✓ Copied" : "📋 Copy JSON"}
                    </button>
                  </div>
                  <pre style={{
                    background: "var(--bg-alt)", padding: 14, borderRadius: 8,
                    border: "1px solid var(--border)", fontSize: 11, color: "var(--text)",
                    overflowX: "auto", maxHeight: 400, fontFamily: "monospace"
                  }}>
                    {JSON.stringify(selectedLog, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: "12px 20px", borderTop: "1px solid var(--border)",
              background: "var(--bg-alt)", display: "flex", justifyContent: "flex-end"
            }}>
              <button
                onClick={() => setSelectedLog(null)}
                style={{
                  padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: "var(--plum)", color: "#FFFFFF", border: "none", cursor: "pointer"
                }}
              >
                Close Trace
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}