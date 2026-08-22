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

    const resp = await fetch(`${ML_URL}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, context })
    });
    if (!resp.ok) throw new Error(`ML service responded ${resp.status}`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ message: "Chat service unavailable", detail: err.message });
  }
};

export default { getCart, addToCart, updateCartItem, removeFromCart, trackSignal, heartbeat, goodbye, getUserNotifications, chat };


