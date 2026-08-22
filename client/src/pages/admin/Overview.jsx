import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";
import api from "../../api/axios.js";

const COLORS = ["#4f46e5", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

const Overview = () => {
  const [data, setData] = useState(null);
  const [liveSessions, setLiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [errorStatus, setErrorStatus] = useState(null);

  const load = () => {
    api.get("/admin/overview")
      .then((res) => {
        setData(res.data);
        setErrorStatus(null);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Overview fetch error:", err);
        if (err.response?.status === 401) {
          setErrorStatus(401);
        }
        setLoading(false);
      });
    api.get("/admin/live-sessions")
      .then((res) => setLiveSessions(res.data))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000); // real-time polling
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) return <p style={{ padding: "20px" }}>Loading metrics...</p>;
  if (errorStatus === 401 || (!data && errorStatus === 401)) {
    return (
      <div style={{ padding: "30px", background: "var(--panel)", borderRadius: "12px", border: "1px solid var(--border)", margin: "20px 0" }}>
        <h3 style={{ color: "#ef4444", margin: "0 0 10px" }}>🔒 Admin Session Expired or Unauthorized (401)</h3>
        <p style={{ color: "var(--text-muted)", marginBottom: "20px", fontSize: "14px" }}>
          Your local session token has expired or is signed for a different account. Please log in with your Admin credentials to access the Dashboard.
        </p>
        <button
          onClick={() => {
            localStorage.removeItem("cg_token");
            localStorage.removeItem("cg_user");
            window.location.href = "/login";
          }}
          style={{
            padding: "10px 20px",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Log In as Admin →
        </button>
      </div>
    );
  }
  if (!data) return <p style={{ padding: "20px", color: "#ef4444" }}>Unable to load metrics. Retrying connection...</p>;

  const causeData = Object.entries(data.cause_distribution || {}).map(([name, value]) => ({ name, value }));
  const actionData = Object.entries(data.action_distribution || {}).map(([name, value]) => ({ name, value }));

  return (
    <div>
      {data.ml_service_offline && (
        <div style={{
          background: "rgba(245, 158, 11, 0.12)",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          color: "#d97706",
          padding: "12px 16px",
          borderRadius: "10px",
          marginBottom: "20px",
          fontSize: "13px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "10px"
        }}>
          <span style={{ fontSize: "18px" }}>⚠️</span>
          <div>
            <div><strong>Python ML Service is Offline or Starting Up</strong></div>
            <div style={{ fontSize: "12px", fontWeight: 400, marginTop: "2px" }}>
              Displaying live database counts (Registered Users, Orders, Live Carts). ML metrics will auto-update when active.
            </div>
          </div>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi"><span>{data.total_sessions ?? 0}</span>Total Sessions</div>
        <div className="kpi"><span>{data.high_risk_sessions ?? 0}</span>High Risk</div>
        <div className="kpi"><span>{typeof data.recovery_rate === "number" ? `${Math.round(data.recovery_rate * 100)}%` : data.recovery_rate ?? "0%"}</span>Recovery Rate</div>
        <div className="kpi"><span>₹{data.total_discount_inr ?? 0}</span>Total Discounts</div>
        <div className="kpi"><span>{data.avg_latency_ms ?? 0} ms</span>Avg Latency</div>
        <div className="kpi"><span>{data.total_users ?? 0}</span>Registered Users</div>
        <div className="kpi"><span>{data.total_orders ?? 0}</span>Orders Placed</div>
        <div className="kpi"><span>{data.live_carts ?? 0}</span>Live Carts (real-time)</div>
      </div>

      <div className="chart-row">
        <div className="chart-box">
          <h3>Root Cause Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={causeData} dataKey="value" nameKey="name" outerRadius={90} label>
                {causeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-box">
          <h3>Action Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={actionData}>
              <XAxis dataKey="name" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#4f46e5" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <h3>Live Carts (auto-refreshing every 5s)</h3>
      <table className="admin-table">
        <thead>
          <tr><th>User</th><th>Session</th><th>Items</th><th>Cart Value</th><th>Risk</th><th>Level</th></tr>
        </thead>
        <tbody>
          {liveSessions.map((c) => (
            <tr key={c._id}>
              <td>{c.user?.name} ({c.user?.email})</td>
              <td>{c.sessionId}</td>
              <td>{c.items.length}</td>
              <td>₹{c.items.reduce((s, i) => s + i.price * i.quantity, 0)}</td>
              <td>{(c.lastRiskScore * 100).toFixed(0)}%</td>
              <td><span className={`badge badge-${c.lastRiskLevel?.toLowerCase()}`}>{c.lastRiskLevel}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Overview;
