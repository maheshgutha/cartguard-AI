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
  try {
    const metrics = await proxyGet("/api/v1/metrics");
    const totalUsers = await User.countDocuments({ role: "user" });
    const totalOrders = await Order.countDocuments();
    const liveCarts = await Cart.countDocuments({ "items.0": { $exists: true } });
    res.json({ ...metrics, total_users: totalUsers, total_orders: totalOrders, live_carts: liveCarts });
  } catch (err) {
    res.status(502).json({ message: "ML service unavailable", detail: err.message });
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

export const getDemoScenarios = async (req, res) => {
  try {
    res.json(await proxyGet("/api/v1/demo/scenarios"));
  } catch (err) {
    res.status(502).json({ message: "ML service unavailable", detail: err.message });
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
    res.status(502).json({ message: "ML service unavailable", detail: err.message });
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
      headers: { "Content-Type": "application/json" }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.token) {
        cachedToken = data.token;
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
      const connResp = await fetch(`${baseUrl}/api/${wppSession}/check-connection-session`, { headers });
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
    const statusResp = await fetch(`${baseUrl}/api/${wppSession}/status-session`, { headers });
    if (statusResp.status === 200) {
      const statusData = await statusResp.json();
      const statusStr = (statusData.status || "").toUpperCase();
      
      // If QR code is present or status is in QR state
      if (statusData.qrcode) {
        return res.json({
          status: "QRCODE",
          qrcode: statusData.qrcode,
          urlcode: statusData.urlcode || null,
          message: "Scan QR Code"
        });
      }

      if (statusStr === "CONNECTED") {
        return res.json({ status: "CONNECTED", message: "Connected" });
      }

      return res.json({
        status: statusStr === "CLOSED" || statusStr === "DISCONNECTED" ? "DISCONNECTED" : statusStr || "STARTING",
        qrcode: statusData.qrcode || null,
        message: statusData.message || statusStr
      });
    }

    res.json({ status: "DISCONNECTED", message: "Session not started yet" });
  } catch (err) {
    res.status(502).json({ message: "WPPConnect server offline", error: err.message });
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

    const resp = await fetch(`${baseUrl}/api/${wppSession}/start-session`, {
      method: "POST",
      headers,
      body: JSON.stringify({ waitQrCode: true })
    });
    
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await resp.json();
      if (data.qrcode) {
        data.status = "QRCODE";
      }
      res.json(data);
    } else {
      const text = await resp.text();
      res.json({ status: "STARTING", message: text });
    }
  } catch (err) {
    res.status(502).json({ message: "WPPConnect server offline", error: err.message });
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

    const resp = await fetch(`${baseUrl}/api/${wppSession}/qrcode-session`, { headers });
    
    const contentType = resp.headers.get("content-type") || "";
    if (resp.status === 200 && contentType.includes("image")) {
      const arrayBuffer = await resp.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.setHeader("Content-Type", "image/png");
      return res.send(buffer);
    } else {
      res.status(404).send("QR code not ready yet");
    }
  } catch (err) {
    res.status(502).send("WPPConnect server offline");
  }
};
