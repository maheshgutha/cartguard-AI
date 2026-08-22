import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios.js";
import { useCart } from "../../context/CartContext.jsx";
import useHeartbeat from "../../hooks/useHeartbeat.js";

const CATEGORIES = ["All", "Electronics", "Footwear", "Fashion", "Home & Kitchen", "Fitness"];

const CATEGORY_FALLBACKS = {
  "Electronics": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80",
  "Footwear": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
  "Fashion": "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80",
  "Home & Kitchen": "https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=600&q=80",
  "Fitness": "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?auto=format&fit=crop&w=600&q=80",
};

const Store = () => {
  useHeartbeat();
  const { updateCartState } = useCart();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    api
      .get("/products", {
        params: { search, category: category === "All" ? undefined : category },
      })
      .then((res) => setProducts(res.data));
  }, [search, category]);

  const addToCart = async (productId) => {
    const { data } = await api.post("/cart/add", { productId, quantity: 1 });
    updateCartState(data.cart);
    alert("Added to cart");
  };

  return (
    <div className="page">
      <div className="hero-strip">
        <h1>Shop</h1>
      </div>
      <div className="store-filters">
        <input
          className="search-box"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="product-grid">
        {products.map((p) => (
          <div className="product-card" key={p._id}>
            <Link to={`/product/${p._id}`}>
              <img
                src={p.image}
                alt={p.name}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = CATEGORY_FALLBACKS[p.category] || CATEGORY_FALLBACKS["Electronics"];
                }}
              />
              <h3>{p.name}</h3>
            </Link>
            <p className="category">{p.category} · {p.qualityTier}</p>
            <p className="price">₹{p.price}</p>
            <button onClick={() => addToCart(p._id)}>Add to Cart</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Store;