// ===========================
// Context và hook quản lý trạng thái đăng nhập
// ===========================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { message } from "antd";
import authService from "../services/authService";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const clearSession = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }, []);

  // Khôi phục session từ localStorage và verify với Backend
  useEffect(() => {
    const initAuth = async () => {
      // Remove private notes/status caches written by older releases.
      for (let index = localStorage.length - 1; index >= 0; index--) {
        const key = localStorage.key(index);
        if (key?.startsWith("applicationNote:") || key?.startsWith("applicationStatus:")) localStorage.removeItem(key);
      }
      const token = localStorage.getItem("token");
      const savedUser = localStorage.getItem("user");

      if (token && savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        }
      }

      if (token) {
        try {
          const data = await authService.getProfile();
          if (localStorage.getItem("token") !== token) { setLoading(false); return; }

          const profileUser = data?.user ?? data;
          if (profileUser) {
            setUser(profileUser);
            localStorage.setItem("user", JSON.stringify(profileUser));
          }
        } catch (error) {
          if (localStorage.getItem("token") === token && error.status === 401) clearSession();
        }
      }

      setLoading(false);
    };

    initAuth();
    const syncSession = (event) => {
      if (event.key === "token" && !event.newValue) setUser(null);
      if (event.key === "user") {
        try { setUser(event.newValue && localStorage.getItem("token") ? JSON.parse(event.newValue) : null); }
        catch { clearSession(); }
      }
    };
    window.addEventListener("storage", syncSession);
    window.addEventListener("auth:expired", clearSession);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("auth:expired", clearSession);
    };
  }, [clearSession]);

  const login = useCallback(async (credentials) => {
    // Controller ở backend trả về { success, message, token, user }
    const { token, user: userData } = await authService.login(credentials);

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);

    return userData;
  }, []);

  const register = useCallback(async (userData) => {
    const { token, user: newUser } = await authService.register(userData);

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(newUser));
    setUser(newUser);

    return newUser;
  }, []);

  const loginWithGoogle = useCallback(async (code) => {
    const { token, user: userData } = await authService.loginWithGoogle(code);
    if (!token || !userData) throw new Error("Phản hồi đăng nhập không hợp lệ");
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem("token");
    let revoked = false;
    try {
      await authService.logout();
      revoked = true;
    } catch (err) {
      revoked = err.status === 401;
    } finally {
      if (localStorage.getItem("token") === token) clearSession();
      if (revoked) message.success("Đã đăng xuất thành công");
      else message.warning("Đã xóa phiên trên thiết bị. Chưa thu hồi được phiên trên máy chủ.");
    }
  }, [clearSession]);

  const updateUser = useCallback((updatedData) => {
    setUser((prevUser) => {
      if (!prevUser || !localStorage.getItem("token")) return prevUser;
      const changes = typeof updatedData === "function" ? updatedData(prevUser) : updatedData;
      const newUser = { ...prevUser, ...changes };
      localStorage.setItem("user", JSON.stringify(newUser));
      return newUser;
    });
  }, []);

  const isAuthenticated = !!user;
  const isEmployer = user?.role === "employer";
  const isCandidate = user?.role === "candidate";

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated,
        isEmployer,
        isCandidate,
        login,
        loginWithGoogle,
        register,
        logout,
        clearSession,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth phải được dùng trong AuthProvider");
  return context;
};

export default useAuth;
