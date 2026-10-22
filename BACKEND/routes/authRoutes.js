const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/auth");
const { verifyToken } = require("../middleware/authMiddleware");
const rateLimit = require("../middleware/rateLimit");
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 150 }));
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const otpLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

const { uploadImage } = require("../middleware/upload");

// dang nhap
router.post("/login", loginLimit, AuthController.login);

router.post("/google", AuthController.loginWithGoogle);
router.post("/logout", verifyToken, AuthController.logout);

// dang ky
router.post("/register", AuthController.register);

// lay thong tin nguoi dung
router.get("/profile", verifyToken, AuthController.getProfile);

// cap nhat thong tin nguoi dung
router.patch("/profile", verifyToken, AuthController.updateProfile);

// doi mat khau
router.put("/change-password", verifyToken, AuthController.changePassword);

// cap nhat avatar
router.post(
  "/update-avatar",
  verifyToken, // Bước 1: Kiểm tra xem token có hợp lệ không
  uploadImage.single("avatar"), // Bước 2: Xử lý file ảnh và lưu vào thư mục img
  AuthController.updateAvatar, // Bước 3: Cập nhật đường dẫn ảnh vào Database
);

// xac thuc OTP
router.post("/send-otp", otpLimit, AuthController.sendOTP);

// doi mat khau voi otp
router.post("/reset-password", loginLimit, AuthController.resetPassword);

module.exports = router;
