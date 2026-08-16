import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import api from "../api/axios.js";
import { useAuth } from "./AuthContext.jsx";

const CartContext = createContext(null);

// How often (ms) to automatically re-score the cart in the background.
// Set to 5 min so: cooldown expires at 9 min → next heartbeat at 10 min → notification fires.
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const CartProvider = ({ children }) => {
  const { user } = useAuth();
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(false);
  const heartbeatRef = useRef(null);

  const fetchCart = useCallback(async () => {
    if (!user || user.role !== "user") {
      setCart(null);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/cart");
      setCart(data);
    } catch (err) {
      console.error("Failed to fetch cart", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  // ── Background heartbeat: re-scores the cart every 5 minutes ──────────────
  // This ensures notifications are re-sent ~10 min after the last one
  // (cooldown = 9 min, heartbeat fires at 5 and 10 min → next notification at 10 min).
  useEffect(() => {
    if (!user || user.role !== "user") {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    const sendHeartbeat = async () => {
      try {
        const { data } = await api.post("/cart/heartbeat");
        // If the heartbeat triggered a recovery offer, update cart state
        if (data?.risk?.action?.action_type && data.risk.action.action_type !== "DO_NOTHING") {
          // Re-fetch cart so the recovery banner updates
          fetchCart();
        }
        console.debug("[CartGuard] Heartbeat fired — cart re-scored");
      } catch (err) {
        console.debug("[CartGuard] Heartbeat failed (silent)", err?.message);
      }
    };

    // Clear any existing interval first
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);

    // Start a new interval
    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Also fire once shortly after login (after 30s) in case cart was idle
    const warmup = setTimeout(sendHeartbeat, 30_000);

    return () => {
      clearInterval(heartbeatRef.current);
      clearTimeout(warmup);
      heartbeatRef.current = null;
    };
  }, [user, fetchCart]);

  const updateCartState = (newCart) => {
    setCart(newCart);
  };

  const sendTelemetrySignal = async (signal) => {
    if (!user || user.role !== "user") return null;
    try {
      const { data } = await api.post("/cart/signal", { signal });
      setCart(data.cart);
      return data;
    } catch (err) {
      console.error("Failed to send telemetry", err);
      return null;
    }
  };

  const cartCount = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <CartContext.Provider value={{ cart, loading, fetchCart, updateCartState, cartCount, sendTelemetrySignal }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
