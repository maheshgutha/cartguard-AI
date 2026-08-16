import Cart from "../models/Cart.js";
import User from "../models/User.js";

const ML_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

export const startCartScheduler = () => {
  console.log("[Scheduler] Cart analysis scheduler initialized (every 10 minutes)");

  // Run first analysis 5 seconds after startup, and then every 10 minutes
  setTimeout(analyzeCarts, 5000);
  setInterval(analyzeCarts, 10 * 60 * 1000);
};

const analyzeCarts = async () => {
  console.log(`[Scheduler] Starting periodic cart analysis run at ${new Date().toISOString()}`);
  try {
    // 1. Find all active carts
    const carts = await Cart.find({ items: { $exists: true, $not: { $size: 0 } } })
      .populate("user")
      .populate("items.product");

    console.log(`[Scheduler] Found ${carts.length} active carts to analyze.`);

    for (const cart of carts) {
      if (!cart.user) {
        continue;
      }

      // Calculate dwell time in seconds since last activity
      const now = new Date();
      const lastAct = new Date(cart.lastActivity || cart.updatedAt || cart.createdAt);
      const dwellTime = Math.max(0, Math.floor((now.getTime() - lastAct.getTime()) / 1000));

      const cartValue = cart.items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
      const userSegment = cart.user.role === "admin" ? "VIP" : "REGULAR";

      // 2. Build SessionData payload for the orchestrator
      const payload = {
        session_id: cart.sessionId,
        user_id: cart.user._id.toString(),
        user_name: cart.user.name,
        cart_value: cartValue,
        original_cart_value: cartValue,
        
        session_duration: dwellTime,
        product_views: cart.productViews || 0,
        tab_switches: cart.tabSwitches || 0,
        payment_failures: cart.paymentFailures || 0,
        form_field_errors: cart.formFieldErrors || 0,
        
        user_segment: userSegment,
        user_email: cart.user.email,
        user_phone: cart.user.phone || "",
        email_opt_in: true,
        whatsapp_opt_in: true,
        sms_opt_in: true,
        
        cart_items: cart.items.map(item => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          specifications: item.product ? Object.fromEntries(item.product.specifications || new Map()) : {}
        }))
      };

      console.log(`[Scheduler] Analyzing cart for user ${cart.user.email} (Session: ${cart.sessionId})`);

      try {
        const resp = await fetch(`${ML_URL}/api/v1/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!resp.ok) {
          console.error(`[Scheduler] ML service responded ${resp.status} for session ${cart.sessionId}`);
          continue;
        }

        const result = await resp.json();
        console.log(`[Scheduler] Scored session ${cart.sessionId}. Risk: ${result.risk_level} (${result.risk_score}). Action: ${result.action?.action_type}`);

        // Update the MERN DB with risk level and recovery offer
        await Cart.findByIdAndUpdate(cart._id, {
          lastRiskScore: result.risk_score,
          lastRiskLevel: result.risk_level,
          recoveryOffer: {
            actionType: result.action?.action_type || "",
            channel: result.action?.channel || "",
            message: result.action?.message || "",
            discountAmount: result.action?.discount_amount || 0
          }
        });
      } catch (err) {
        console.error(`[Scheduler] Failed to process scoring for session ${cart.sessionId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Error in periodic cart analysis run:", err.message);
  }
};
