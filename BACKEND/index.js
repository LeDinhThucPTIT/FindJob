require("dotenv").config();
const express = require("express");
const path = require("path");
const app = express();
const port = process.env.PORT || 5000;
const connectDB = require("./config/db");
const cors = require("cors");
const { getJwtSecret } = require("./config/security");
const { verifyToken } = require("./middleware/authMiddleware");
const { getCvFile } = require("./controllers/fileController");
getJwtSecret();
app.disable("x-powered-by");

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  process.env.CLIENT_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Cho phép các request không có origin (ví dụ như Postman, cURL) hoặc nằm trong danh sách được phép
    if (
      !origin ||
      allowedOrigins.includes(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error("CORS Policy: Origin không được phép kết nối"));
    }
  },
  credentials: true,
};

app.use(cors({ ...corsOptions, exposedHeaders: ["Content-Disposition"] }));

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self' http://localhost:5000 ws://localhost:5000; img-src 'self' data: blob: https://ui-avatars.com",
  );
  next();
});
// Phục vụ tệp CV upload trong thư mục uploads/cvs
app.get("/uploads/cvs/:filename", verifyToken, getCvFile);
app.use("/uploads/img", express.static(path.join(__dirname, "uploads/img")));

// Routes
const routes = require("./routes");
routes(app);

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("Global Error Handler:", err.message || err);
  const status = err.name === "ValidationError" || err.name === "CastError" ? 400 :
    err.code === "LIMIT_FILE_SIZE" ? 413 : err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: status >= 500 ? "Lỗi máy chủ nội bộ" : err.message,
  });
});

// Start server
connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
  });
});
