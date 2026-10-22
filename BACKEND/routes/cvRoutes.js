// ===========================
// routes/cvRoutes.js
// Quản lý các endpoint liên quan đến CV
// ===========================

const express = require("express");
const router = express.Router();
const rateLimit = require("../middleware/rateLimit");
const scoreLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, key: (req) => req.user.id });

// Import Controller
const cvController = require("../controllers/cvController");
const cvscoreController = require("../controllers/cvscoreController");

// LƯU Ý 1: Đổi cách import thành dạng destructuring để lấy đúng hàm upload CV
// (Đảm bảo tên file là "../middleware/upload" hay "../middleware/uploadMiddleware" khớp với dự án của bạn)
const { uploadCv } = require("../middleware/upload");

const {
  verifyToken,
  isEmployer,
  isCandidate,
} = require("../middleware/authMiddleware");

// ==========================================
// Tải CV yêu cầu xác thực và chỉ cho phép chủ sở hữu
// ==========================================

// Tải CV về máy hoặc xuất file PDF trực tiếp
router.get("/:id/download", verifyToken, isCandidate, cvController.downloadCV);
router.post("/:id/download", verifyToken, isCandidate, cvController.downloadCV);

// ==========================================
// PRIVATE ROUTES (Bắt buộc phải có Token và phải là [ỨNG VIÊN])
// ==========================================

// Chấm điểm CV AI (Cần đăng nhập)
router.post("/score", verifyToken, isCandidate, scoreLimit, cvscoreController.scoreCV);

const extractUpload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
const extractLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, key: (req) => req.user.id });
router.post('/extract', verifyToken, isCandidate, extractLimit, extractUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Vui lòng chọn file CV.' });
    const result = await require('../services/cvExtraction').extractCv(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (error) { next(error); }
});

// Lấy danh sách toàn bộ CV của ứng viên đang đăng nhập
router.get("/", verifyToken, isCandidate, cvController.getCVList);

// Lấy chi tiết 1 CV theo ID
router.get("/:id", verifyToken, isCandidate, cvController.getCVById);

// Tạo một CV mới từ giao diện Builder (Lưu dạng dữ liệu JSON)
router.post("/", verifyToken, isCandidate, cvController.createCV);

// Upload file CV có sẵn (PDF, DOC, DOCX)
// LƯU Ý 3: Đổi từ `upload.single` thành `uploadCv.single`
router.post(
  "/upload",
  verifyToken,
  isCandidate,
  uploadCv.single("file"), // Frontend gửi form-data phải dùng key là "file"
  cvController.uploadCV,
);

// Đặt một CV làm mặc định để tham gia ứng tuyển nhanh
router.patch(
  "/:id/default",
  verifyToken,
  isCandidate,
  cvController.setDefaultCV,
);

// Chỉnh sửa/Cập nhật nội dung dữ liệu của CV Builder
router.patch("/:id", verifyToken, isCandidate, cvController.updateCV);

// Xóa bỏ CV
router.delete("/:id", verifyToken, isCandidate, cvController.deleteCV);

module.exports = router;
