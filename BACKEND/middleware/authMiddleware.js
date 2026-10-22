// ===========================
// middleware/authMiddleware.js
// ===========================

const { validateSession } = require("../services/sessions");
const isTokenError = (error) => ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(error.name);

exports.verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "Vui lòng đăng nhập để tiếp tục." });
  try {
    const user = await validateSession(header.slice(7));
    if (!user) return res.status(401).json({ message: "Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại." });
    req.user = user;
    next();
  } catch (error) {
    if (isTokenError(error)) return res.status(401).json({ message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    next(error);
  }
};

// Middleware phân quyền: Dành riêng cho Nhà tuyển dụng

exports.isEmployer = (req, res, next) => {
  // Lúc này req.user đã có sẵn nhờ hàm verifyToken chạy trước đó
  if (!req.user || req.user.role !== "employer") {
    return res.status(403).json({
      success: false,
      message:
        "Bạn không có quyền truy cập. Tính năng này chỉ dành cho Nhà tuyển dụng.",
    });
  }
  next();
};

exports.optionalAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  try {
    const user = await validateSession(header.slice(7));
    if (user) req.user = user;
    next();
  } catch (error) {
    if (isTokenError(error)) return next();
    next(error);
  }
};

//Middleware phân quyền: Dành riêng cho Ứng viên (Candidate)

exports.isCandidate = (req, res, next) => {
  if (!req.user || req.user.role !== "candidate") {
    return res.status(403).json({
      success: false,
      message:
        "Bạn không có quyền truy cập. Tính năng này chỉ dành cho Ứng viên.",
    });
  }
  next();
};
