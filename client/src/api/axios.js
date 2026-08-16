import axios from "axios";

// In production (Vercel), VITE_API_URL points to the deployed Node Express backend (e.g. https://cartguard-server.onrender.com/api)
// In local development, falls back to "/api" via Vite proxy (http://localhost:5000)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api"
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cg_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
