import axios from "axios";

// Automatically sanitize baseURL so if user enters "https://cartguard-ai-1.onrender.com" or "https://cartguard-ai-1.onrender.com/api"
// it always correctly resolves to the "/api" endpoints.
const getBaseUrl = () => {
  let url = (import.meta.env.VITE_API_URL || "/api").trim();
  url = url.replace(/\/+$/, ""); // remove trailing slashes
  if (url && url !== "/api" && !url.endsWith("/api")) {
    url = `${url}/api`;
  }
  return url || "/api";
};

const api = axios.create({
  baseURL: getBaseUrl()
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cg_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
