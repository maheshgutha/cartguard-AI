import fetch from "node-fetch";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";

const ML_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

const getOrCreateCart = async (user) => {
  let cart = await Cart.findOne({ user: user._id });
  if (!cart) {
    cart = await Cart.create({
      user: user._id,
      sessionId: `SES-${user._id.toString().slice(-6).toUpperCase()}-${Date.now()}`,
      items: [],
    });
  }
  return cart;
};

const scoreCartWithML = async (cart, user) => {
  await cart.populate("items.product");

  // If any product reference is null/orphaned (e.g. after db re-seed), resolve by name
  for (const item of cart.items) {
    if (!item.product || !item.product.specifications || (item.product.specifications instanceof Map && item.product.specifications.size === 0)) {
      const found = await Product.findOne({ name: item.name });
      if (found) {
        item.product = found;
      }
    }
  }

  const cartValue = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const sessionDurationSec = (Date.now() - new Date(cart.sessionStart).getTime()) / 1000;

  const payload = {
    session_id: cart.sessionId,
    user_id: user._id.toString(),
    session_duration: sessionDurationSec,
    product_views: cart.productViews,
    cart_adds: cart.items.length,
    cart_value: cartValue,
    tab_switches: cart.tabSwitches,
    payment_failures: cart.paymentFailures,
    form_field_errors: cart.formFieldErrors,
    user_email: user.email,
    user_phone: user.phone,
    email_opt_in: true,
    whatsapp_opt_in: true,
    sms_opt_in: true,
    cart_items: cart.items.map(i => {
      const prod = i.product;
      let specs = {};
      if (prod && prod.specifications) {
        if (prod.specifications instanceof Map || typeof prod.specifications.get === "function") {
          specs = Object.fromEntries(prod.specifications);
        } else {
          specs = prod.specifications;
        }
      }
      return {
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        rating: prod ? (prod.rating ?? null) : null,
        quality_tier: prod ? (prod.qualityTier ?? null) : null,
        specifications: specs
      };
    }),
  };

  try {
    const resp = await fetch(`${ML_URL}/api/v1/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`ML service responded ${resp.status}`);
    const result = await resp.json();
    cart.lastRiskScore = result.risk_score ?? 0;
    cart.lastRiskLevel = result.risk_level ?? "LOW";

    const action = result.action || {};
    const type = action.action_type || action.action;
    if (type && type !== "DO_NOTHING" && !result.cooldown_active) {
      cart.recoveryOffer = {
        actionType: type,
        channel: action.channel || "IN_APP",
        message: action.message || "",
        discountAmount: action.discount_amount || 0
      };
    } else {
      cart.recoveryOffer = undefined;
    }

    await cart.save();
    return result;
  } catch (err) {
    // ML service offline shouldn't break the storefront
    return { error: "ml_service_unavailable", detail: err.message };
  }
};

export const getCart = async (req, res) => {
  const cart = await getOrCreateCart(req.user);
  res.json(cart);
};
const getProductIdStr = (productField) => {
  if (!productField) return "";
  return productField._id ? productField._id.toString() : productField.toString();
};

export const addToCart = async (req, res) => {
  let { productId, quantity = 1 } = req.body;
  if (productId && typeof productId === "object") {
    productId = productId._id;
  }
  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: "Product not found" });

  const cart = await getOrCreateCart(req.user);
  const existing = cart.items.find((i) => getProductIdStr(i.product) === productId.toString());
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({
      product: product._id,
      name: product.name,
      price: product.price,
      image: product.image,
      quantity,
    });
  }
  cart.lastActivity = new Date();
  await cart.save();

  const risk = await scoreCartWithML(cart, req.user);
  res.json({ cart, risk });
};

export const updateCartItem = async (req, res) => {
  let { productId, quantity } = req.body;
  if (productId && typeof productId === "object") {
    productId = productId._id;
  }
  const cart = await getOrCreateCart(req.user);
  const item = cart.items.find((i) => getProductIdStr(i.product) === productId.toString());
  if (!item) return res.status(404).json({ message: "Item not in cart" });

  if (quantity <= 0) {
    cart.items = cart.items.filter((i) => getProductIdStr(i.product) !== productId.toString());
  } else {
    item.quantity = quantity;
  }
  cart.lastActivity = new Date();
  await cart.save();

  const risk = await scoreCartWithML(cart, req.user);
  res.json({ cart, risk });
};

export const removeFromCart = async (req, res) => {
  const cart = await getOrCreateCart(req.user);
  cart.items = cart.items.filter((i) => getProductIdStr(i.product) !== req.params.productId);
  cart.lastActivity = new Date();
  await cart.save();

  const risk = await scoreCartWithML(cart, req.user);
  res.json({ cart, risk });
};

// Called by the frontend to report behavioral signals: tab switches, payment
// failures, form errors, product views -- these feed the real-time risk model.
export const trackSignal = async (req, res) => {
  const { signal } = req.body; // "product_view" | "tab_switch" | "payment_failure" | "form_error"
  const cart = await getOrCreateCart(req.user);

  if (signal === "product_view") cart.productViews += 1;
  else if (signal === "tab_switch") cart.tabSwitches += 1;
  else if (signal === "payment_failure") cart.paymentFailures += 1;
  else if (signal === "form_error") cart.formFieldErrors += 1;

  cart.lastActivity = new Date();
  await cart.save();

  const risk = await scoreCartWithML(cart, req.user);
  res.json({ cart, risk });
};

export const heartbeat = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user);
    cart.lastActivity = new Date();
    await cart.save();

    // Re-score the cart on every heartbeat so time-based notifications fire
    // automatically after the cooldown expires (even without user interaction)
    let risk = null;
    if (cart.items && cart.items.length > 0) {
      risk = await scoreCartWithML(cart, req.user);
    }

    res.json({ ok: true, lastActivity: cart.lastActivity, risk });
  } catch (err) {
    res.status(500).json({ message: "Heartbeat failed", detail: err.message });
  }
};

export const goodbye = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user);
    // Push lastActivity 10 minutes into the past — user appears INACTIVE immediately
    cart.lastActivity = new Date(Date.now() - 10 * 60 * 1000);
    await cart.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Goodbye failed", detail: err.message });
  }
};

export const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const resp = await fetch(`${ML_URL}/api/v1/audit?limit=50&user_id=${userId}&exclude_cooldown=true`);
    if (!resp.ok) throw new Error(`ML service responded ${resp.status}`);
    const data = await resp.json();
    res.json(data.logs || data);
  } catch (err) {
    res.status(502).json({ message: "Failed to fetch user notifications", detail: err.message });
  }
};

export const chat = async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const cart = await getOrCreateCart(req.user);
    await cart.populate("items.product");

    let adminStats = null;
    if (req.user.role === "admin") {
      try {
        const auditResp = await fetch(`${ML_URL}/api/v1/audit?limit=10`);
        if (auditResp.ok) {
          const auditData = await auditResp.json();
          adminStats = {
            totalAuditLogs: auditData.count || 0,
            recentLogs: (auditData.logs || []).slice(0, 5).map(l => ({
              sessionId: l.session_id,
              riskLevel: l.risk_level,
              riskScore: l.risk_score,
              action: l.action?.action_type
            }))
          };
        }
      } catch (e) {}
    }
    
    const context = {
      user_role: req.user.role || "user",
      user_name: req.user.name,
      admin_stats: adminStats,
      sessionId: sessionId || cart.sessionId,
      cart_value: cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      cart_items: cart.items.map(i => ({
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        specifications: i.product ? Object.fromEntries(i.product.specifications || new Map()) : {}
      })),
      payment_failures: cart.paymentFailures,
      form_field_errors: cart.formFieldErrors
    };

    // Try calling Python ML service if available
    try {
      const resp = await fetch(`${ML_URL}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context }),
        timeout: 5000
      });
      if (resp.ok) {
        const data = await resp.json();
        let replyText = data.reply || data.text || "";
        // Clean any raw JSON string accidental dumps
        if (replyText.startsWith("{") && replyText.endsWith("}")) {
          try {
            const parsed = JSON.parse(replyText);
            replyText = parsed.message || parsed.action_message || parsed.recommendation || "I am here to assist you with your CartGuard order!";
          } catch (_) {}
        }
        if (replyText && !replyText.includes("root_cause")) {
          return res.json({ reply: replyText });
        }
      }
    } catch (_) {
      // Offline fallback below
    }

    // Smart Conversational Project Knowledge Engine (Works 100% on Vercel)
    const msgLower = (message || "").lowerCase ? message.toLowerCase().trim() : String(message).toLowerCase().trim();
    const isUserAdmin = req.user.role === "admin";
    let reply = "";

    if (msgLower === "hi" || msgLower === "hello" || msgLower === "hey" || msgLower === "hola") {
      reply = isUserAdmin
        ? `Hello ${req.user.name || "Admin"}! 🚀 I am your CartGuard AI Product Copilot. Ask me anything about ML risk scores, platform telemetry, active sessions, or system architecture!`
        : `Hi ${req.user.name || "there"}! 🤖 I am your CartGuard assistant. How can I help you with your order, products, or payment questions today?`;
    } else if (msgLower.includes("frequent") || msgLower.includes("popular") || msgLower.includes("best sell") || msgLower.includes("top buy") || msgLower.includes("buyed") || msgLower.includes("bought")) {
      reply = "🔥 **Top Frequently Bought Products on CartGuard AI**:\n\n1. 🎧 **Wireless Headphones (Pro & Elite)** - Features active ANC, planar drivers & 60-hr battery.\n2. 👟 **Running Shoes (Standard+ & Pro)** - Engineered mesh, carbon fiber plate & responsive cushion.\n3. 🍳 **Non-Stick Cookware Set (Premium & Elite)** - 5-ply copper core with ceramic diamond non-stick.\n4. 🧘 **Yoga Mat (Pro & Elite)** - High-density eco natural rubber & laser alignment grid.\n5. 👕 **Cotton T-Shirt (Premium & Pro)** - 100% Supima & Egyptian long-staple cotton.";
    } else if (msgLower.includes("architect") || msgLower.includes("stack") || msgLower.includes("built") || msgLower.includes("tech") || msgLower.includes("code")) {
      if (isUserAdmin) {
        reply = "⚡ **CartGuard AI Platform Architecture**:\n\n- **Frontend**: React 18 + Vite + Tailwind CSS (hosted on Vercel).\n- **Storefront Server**: Node.js + Express + Mongoose for auth, cart state, & payments.\n- **ML Intelligence Engine**: Python FastAPI microservice running CatBoost, XGBoost & Random Forest ensemble models for real-time risk scoring.\n- **Notification Pipeline**: SendGrid, Twilio (SMS & WhatsApp), Nodemailer SMTP & WPPConnect local engine.\n- **Database**: MongoDB Atlas (`cartguard` database).";
      } else {
        reply = "CartGuard AI is an advanced e-commerce platform built with modern web technologies, real-time risk evaluation, and instant customer checkout support.";
      }
    } else if (msgLower.includes("risk") || msgLower.includes("ml") || msgLower.includes("model") || msgLower.includes("score") || msgLower.includes("uplift")) {
      if (isUserAdmin) {
        reply = "🎯 **CartGuard ML Risk Scoring System**:\n\nOur ensemble ML model evaluates 20+ real-time behavioral signals (session duration, hesitation, product views, tab switches, payment failures & form errors). It computes a risk score (0-100%) and categorizes sessions into **LOW**, **MEDIUM**, **HIGH**, or **CRITICAL** risk to trigger targeted recovery interventions.";
      } else {
        reply = "Our system continuously monitors checkout friction to offer instant discount codes or payment assistance whenever you face checkout difficulty.";
      }
    } else if (msgLower.includes("pay") || msgLower.includes("fail") || msgLower.includes("card") || msgLower.includes("upi") || msgLower.includes("debit")) {
      reply = "💳 **Payment Troubleshooting**:\n\nIf your UPI or Card transaction failed or got declined, we strongly recommend trying another UPI app (GPay, PhonePe, Paytm) or selecting **Cash on Delivery (COD)** at checkout for 100% guaranteed order success!";
    } else if (msgLower.includes("coupon") || msgLower.includes("discount") || msgLower.includes("offer") || msgLower.includes("promo") || msgLower.includes("code")) {
      reply = "🎁 **Discounts & Coupon Codes**:\n\nYou can view and copy active discount coupon codes (like **SAVE150**) directly from the **Notifications** tab at the top of your page. Paste the code at checkout to claim your savings!";
    } else if (msgLower.includes("ship") || msgLower.includes("deliv") || msgLower.includes("time") || msgLower.includes("dispatch")) {
      reply = "🚚 **Shipping & Delivery Policy**:\n\nWe offer **FREE Standard Shipping** on all orders above ₹1,000 across India. Standard delivery takes 2 to 3 business days, and express delivery arrives in 24 hours.";
    } else if (msgLower.includes("compare") || msgLower.includes("spec") || msgLower.includes("feature") || msgLower.includes("difference")) {
      reply = "📊 **Product Specs & Comparison**:\n\nAll products on CartGuard AI feature 10 distinct quality tiers (from Economy to Elite). Elite tier items feature premium materials (e.g. 5-ply copper core, Supima cotton, natural rubber, 60-hr battery) and extended warranties.";
    } else if (msgLower.includes("stat") || msgLower.includes("log") || msgLower.includes("telemetry") || msgLower.includes("audit") || msgLower.includes("session")) {
      if (isUserAdmin) {
        reply = "📊 **Platform Telemetry & Audit Summary**:\n\nYou can view live user sessions, real-time cart abandonments, recovery rates, average latency (~186ms), and decision audit logs directly in your Admin Dashboard under **Overview**, **Live Carts**, and **Audit Log** tabs.";
      } else {
        reply = "I am your CartGuard Shopping Assistant. I can help you with products, order status, shipping, discounts, and payment troubleshooting. Administrative system telemetry is restricted to store owners.";
      }
    } else {
      reply = isUserAdmin
        ? "I am your CartGuard AI Product Copilot. Ask me about system architecture, ML risk models, live cart abandonments, top products, or platform telemetry!"
        : "I am your CartGuard Shopping Assistant! Ask me about top-selling products, specifications, discount coupon codes, shipping, or payment troubleshooting.";
    }

    res.json({ reply });
  } catch (err) {
    res.json({ reply: "I am here to assist you with your CartGuard AI experience. How can I help you today?" });
  }
};

export default { getCart, addToCart, updateCartItem, removeFromCart, trackSignal, heartbeat, goodbye, getUserNotifications, chat };


