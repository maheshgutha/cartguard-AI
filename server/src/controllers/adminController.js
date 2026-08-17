import fetch from "node-fetch";
import Cart from "../models/Cart.js";
import Order from "../models/Order.js";
import User from "../models/User.js";

const ML_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

const proxyGet = async (path) => {
  const resp = await fetch(`${ML_URL}${path}`);
  if (!resp.ok) throw new Error(`ML service ${path} responded ${resp.status}`);
  return resp.json();
};

const proxyPost = async (path, body) => {
  const resp = await fetch(`${ML_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!resp.ok) throw new Error(`ML service ${path} responded ${resp.status}`);
  return resp.json();
};

// GET /api/admin/overview -- KPIs matching the old Streamlit Overview tab
export const getOverview = async (req, res) => {
  let metrics = {
    total_sessions: 0,
    high_risk_sessions: 0,
    actions_taken: 0,
    do_nothing_count: 0,
    do_nothing_rate: 0,
    total_discount_inr: 0,
    avg_discount: 0,
    avg_discount_per_action_inr: 0,
    p95_latency_ms: 0,
    recovery_rate: 0,
    total_ai_cost_inr: 0,
    cost_per_decision_inr: 0,
    avg_latency_ms: 0,
    avg_risk_score: 0,
    cause_distribution: {},
    action_distribution: {},
    ml_service_offline: true,
  };

  try {
    const mlMetrics = await proxyGet("/api/v1/metrics");
    metrics = { ...mlMetrics, ml_service_offline: false };
  } catch (err) {
    console.warn("[AdminController] ML service offline during getOverview:", err.message);
  }

  try {
    const totalUsers = await User.countDocuments({ role: "user" });
    const totalOrders = await Order.countDocuments();
    const liveCarts = await Cart.countDocuments({ "items.0": { $exists: true } });
    res.json({ ...metrics, total_users: totalUsers, total_orders: totalOrders, live_carts: liveCarts });
  } catch (err) {
    res.status(500).json({ message: "Database query error", detail: err.message });
  }
};

// GET /api/admin/live-sessions -- real-time cart/risk view (replaces manual "Score a Session")
export const getLiveSessions = async (req, res) => {
  const carts = await Cart.find({ "items.0": { $exists: true } })
    .populate("user", "name email")
    .sort({ lastActivity: -1 })
    .limit(100);
  res.json(carts);
};

export const scoreSession = async (req, res) => {
  try {
    const result = await proxyPost("/api/v1/score", req.body);
    res.json(result);
  } catch (err) {
    res.status(502).json({ message: "ML service unavailable", detail: err.message });
  }
};

export const scoreBatch = async (req, res) => {
  try {
    const result = await proxyPost("/api/v1/score/batch", req.body);
    res.json(result);
  } catch (err) {
    res.status(502).json({ message: "ML service unavailable", detail: err.message });
  }
};

const FALLBACK_DEMO_SCENARIOS = [
  {
    name: "payment_failure",
    description: "Complex Payment Failure: 2 failed UPI attempts, high time on payment page, high cart value",
    expected: "ALTERNATE_PAYMENT_GUIDANCE"
  },
  {
    name: "comparison_shopping",
    description: "Comparison Shopping: 12 views, heavy category/tab switching, no checkout",
    expected: "SOCIAL_PROOF_NUDGE"
  },
  {
    name: "friction_abandonment",
    description: "Checkout Friction: repeated form errors, back navigations, no payment attempt",
    expected: "CHECKOUT_ASSISTANCE"
  }
];

export const getDemoScenarios = async (req, res) => {
  try {
    res.json(await proxyGet("/api/v1/demo/scenarios"));
  } catch (err) {
    res.json({ scenarios: FALLBACK_DEMO_SCENARIOS, ml_service_offline: true });
  }
};

export const runDemoScenario = async (req, res) => {
  try {
    res.json(await proxyPost(`/api/v1/demo/run/${req.params.scenarioName}`));
  } catch (err) {
    res.status(502).json({ message: "ML service unavailable", detail: err.message });
  }
};

export const getUpliftSimulation = async (req, res) => {
  try {
    const n = req.query.n_sessions || 10000;
    res.json(await proxyGet(`/api/v1/uplift/simulate?n_sessions=${n}`));
  } catch (err) {
    res.status(502).json({ message: "ML service unavailable", detail: err.message });
  }
};

export const getAuditLog = async (req, res) => {
  try {
    const { limit = 100, session_id, exclude_cooldown } = req.query;
    const qs = new URLSearchParams({
      limit,
      ...(session_id ? { session_id } : {}),
      ...(exclude_cooldown ? { exclude_cooldown: "true" } : {})
    }).toString();
    res.json(await proxyGet(`/api/v1/audit?${qs}`));
  } catch (err) {
    res.json({ logs: [], count: 0, ml_service_offline: true, message: "ML service offline" });
  }
};

export const getAllOrdersAdmin = async (req, res) => {
  const orders = await Order.find().populate("user", "name email").sort({ createdAt: -1 });
  res.json(orders);
};

let cachedToken = null;

const getWppToken = async (baseUrl, session) => {
  const envToken = process.env.WPPCONNECT_TOKEN;
  if (envToken) return envToken;

  if (cachedToken) return cachedToken;

  const secretKey = "THISISMYSECURETOKEN"; // WPPConnect default secret key
  try {
    const resp = await fetch(`${baseUrl}/api/${session}/${secretKey}/generate-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000)
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.token) {
        cachedToken = data.token;
        setTimeout(() => { cachedToken = null; }, 3600000); // expire after 1h
        return cachedToken;
      }
    }
  } catch (err) {
    console.error("Failed to generate WPPConnect token:", err.message);
  }
  return "";
};

export const getWhatsAppStatus = async (req, res) => {
  const wppUrl = process.env.WPPCONNECT_API_URL || "http://127.0.0.1:21465";
  const wppSession = process.env.WPPCONNECT_SESSION || "cartguard";

  try {
    const baseUrl = wppUrl.replace(/\/+$/, "");
    const token = await getWppToken(baseUrl, wppSession);
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // 1. Check actual authentication/online state
    try {
      const connResp = await fetch(`${baseUrl}/api/${wppSession}/check-connection-session`, { headers, signal: AbortSignal.timeout(3500) });
      if (connResp.status === 200) {
        const connData = await connResp.json();
        if (connData.status === true) {
          return res.json({ status: "CONNECTED", message: "Connected" });
        }
      }
    } catch {
      // Continue to check status-session
    }

    // 2. Fetch session status to see if QR code is generated
    const statusResp = await fetch(`${baseUrl}/api/${wppSession}/status-session`, { headers, signal: AbortSignal.timeout(3500) });
    if (statusResp.status === 200) {
      const statusData = await statusResp.json();
      const statusStr = (statusData.status || "").toUpperCase();
      let qrCode = statusData.qrcode || null;

      // If status-session didn't return qrcode directly, check qrcode-session
      if (!qrCode && (statusStr === "QRCODE" || statusStr === "STARTING" || statusStr === "INITIALIZING" || statusStr === "NOT_LOGGED" || statusStr === "CLOSED")) {
        try {
          const qrResp = await fetch(`${baseUrl}/api/${wppSession}/qrcode-session`, { headers, signal: AbortSignal.timeout(3000) });
          if (qrResp.ok) {
            const qrType = qrResp.headers.get("content-type") || "";
            if (qrType.includes("json")) {
              const qrData = await qrResp.json();
              qrCode = qrData.qrcode || null;
            } else if (qrType.includes("image")) {
              const buf = await qrResp.arrayBuffer();
              qrCode = `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
            }
          }
        } catch {
          // ignore
        }
      }

      if (qrCode) {
        return res.json({
          status: "QRCODE",
          qrcode: qrCode,
          urlcode: statusData.urlcode || null,
          message: "Scan QR Code"
        });
      }

      if (statusStr === "CONNECTED") {
        return res.json({ status: "CONNECTED", message: "Connected" });
      }

      return res.json({
        status: statusStr === "CLOSED" || statusStr === "DISCONNECTED" ? "DISCONNECTED" : statusStr || "STARTING",
        qrcode: null,
        message: statusData.message || statusStr
      });
    }

    // statusResp status is not 200 — session likely doesn't exist yet
    return res.json({ status: "DISCONNECTED", message: "Session not started" });

  } catch (err) {
    res.json({ status: "OFFLINE", message: "WPPConnect server offline", error: err.message });
  }
};

export const startWhatsAppSession = async (req, res) => {
  const wppUrl = process.env.WPPCONNECT_API_URL || "http://127.0.0.1:21465";
  const wppSession = process.env.WPPCONNECT_SESSION || "cartguard";

  try {
    const baseUrl = wppUrl.replace(/\/+$/, "");
    const token = await getWppToken(baseUrl, wppSession);
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Use waitQrCode: false so start-session returns immediately (Chromium launch takes 30-60s)
    // The frontend polling loop calls status-session every 3s to detect when QR is ready
    const resp = await fetch(`${baseUrl}/api/${wppSession}/start-session`, {
      method: "POST",
      headers,
      body: JSON.stringify({ waitQrCode: false }),
      signal: AbortSignal.timeout(10000)
    });
    
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await resp.json();
      if (data.qrcode) {
        data.status = "QRCODE";
      } else if (!data.status || data.status === "STARTING" || data.status === "CLOSED") {
        data.status = "STARTING";
      }
      res.json(data);
    } else {
      const text = await resp.text();
      res.json({ status: "STARTING", message: text });
    }
  } catch (err) {
    // If request times out or errors, return STARTING (not OFFLINE)
    // The session may still be launching in the background
    const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
    if (isTimeout) {
      res.json({ status: "STARTING", message: "Session is starting up. QR code generating…" });
    } else {
      res.json({ status: "OFFLINE", message: "WPPConnect server offline", error: err.message });
    }
  }
};

export const getWhatsAppQRCode = async (req, res) => {
  const wppUrl = process.env.WPPCONNECT_API_URL || "http://127.0.0.1:21465";
  const wppSession = process.env.WPPCONNECT_SESSION || "cartguard";

  try {
    const baseUrl = wppUrl.replace(/\/+$/, "");
    const token = await getWppToken(baseUrl, wppSession);
    const headers = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const resp = await fetch(`${baseUrl}/api/${wppSession}/qrcode-session`, { headers, signal: AbortSignal.timeout(5000) });
    
    const contentType = resp.headers.get("content-type") || "";
    if (resp.status === 200) {
      if (contentType.includes("image")) {
        const arrayBuffer = await resp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.setHeader("Content-Type", "image/png");
        return res.send(buffer);
      } else if (contentType.includes("json")) {
        const data = await resp.json();
        if (data.qrcode) {
          const base64Str = data.qrcode.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Str, "base64");
          res.setHeader("Content-Type", "image/png");
          return res.send(buffer);
        }
      }
    }
    // Return 204 No Content instead of 404 error so Axios/DevTools doesn't log console errors
    res.status(204).end();
  } catch (err) {
    res.status(204).end();
  }
};
