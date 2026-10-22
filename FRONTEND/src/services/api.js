// ===========================
// services/api.js
// ===========================

import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: tự động đính kèm token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: xử lý lỗi toàn cục
apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const publicAuth = ["/auth/login", "/auth/register", "/auth/google", "/auth/send-otp", "/auth/reset-password", "/auth/logout"].includes(error.config?.url);
    const currentToken = localStorage.getItem("token");
    const sentAuthorization = error.config?.headers?.Authorization;
    const currentRequest = currentToken ? sentAuthorization === `Bearer ${currentToken}` : !sentAuthorization;
    if (error.response?.status === 401 && !publicAuth && currentRequest) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.dispatchEvent(new Event("auth:expired"));
      window.location.href = "/login";
    }
    let data = error.response?.data;
    if (data instanceof Blob && data.type.includes("json")) {
      try { data = JSON.parse(await data.text()); } catch { /* Keep the original error. */ }
    }
    if (data && typeof data === "object" && !(data instanceof Blob)) return Promise.reject({ ...data, status: error.response.status });
    return Promise.reject(data || error);
  },
);

export default apiClient;
