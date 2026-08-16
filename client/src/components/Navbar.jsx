import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useCart } from "../context/CartContext.jsx";

const Navbar = () => {
  const { user, logout } = useAuth();
  const { cartCount, cart } = useCart();
  const navigate = useNavigate();

  return (
    <>
      {cart?.recoveryOffer?.message && (
        <div style={{
          background: "linear-gradient(90deg, #8B5CF6, #EC4899)",
          color: "#fff",
          textAlign: "center",
          padding: "8px 16px",
          fontSize: "12.5px",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          boxShadow: "0 2px 10px rgba(139, 92, 246, 0.25)",
          animation: "slideDown 0.3s ease",
          width: "100%",
          boxSizing: "border-box",
        }}>
          <span>
            🔔 {cart.recoveryOffer.message.split("\n")[0]}{cart.recoveryOffer.message.includes("\n") ? " (View comparison details in your cart below)" : ""}
          </span>
          {cart.recoveryOffer.discountAmount > 0 && (
            <span style={{
              background: "rgba(255,255,255,0.2)",
              padding: "2px 8px",
              borderRadius: "20px",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              applied
            </span>
          )}
        </div>
      )}

      <nav className="navbar">
        <Link to="/" className="brand">
          <span className="logo-badge">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
          </span>
          CARTGUARD AI
        </Link>
        <div className="nav-links">
          {user?.role === "user" && (
            <>
              <Link to="/">Shop</Link>
              <Link to="/notifications" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                Notifications
                {cart?.recoveryOffer?.message && (
                  <span className="notification-badge-dot" style={{
                    width: 7, height: 7, background: "#EF4444", borderRadius: "50%",
                    boxShadow: "0 0 0 2px rgba(239, 68, 68, 0.4)",
                    animation: "pulse-dot 1.5s infinite"
                  }}></span>
                )}
              </Link>
              <Link to="/cart" className="nav-cart-wrapper">
                Cart
                {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </Link>
            </>
          )}
          {user?.role === "admin" && <Link to="/admin">Admin dashboard</Link>}
          {user ? (
            <button
              className="btn-link"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Log out ({user.name})
            </button>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/register" className="nav-cta">Sign up</Link>
            </>
          )}
        </div>
      </nav>
    </>
  );
};

export default Navbar;