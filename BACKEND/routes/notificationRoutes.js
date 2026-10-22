const router = require("express").Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { positiveInteger } = require("../utils/input");
const notifications = require("../services/notifications");
router.use(verifyToken, (req, res, next) => {
  if (!["candidate", "employer"].includes(req.user.role)) return res.status(403).json({ message: "Không có quyền xem thông báo" });
  next();
});
router.get("/", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await notifications.listNotifications(req.user, positiveInteger(req.query.page, 1, 100000), positiveInteger(req.query.limit, 10, 30)));
});
router.patch("/read-all", async (req, res) => {
  await notifications.markAllRead(req.user);
  res.json({ success: true });
});
router.patch("/:eventId/read", async (req, res) => {
  if (!/^[a-f\d]{24}:(submitted|received|status:\d+)$/i.test(req.params.eventId)) return res.status(400).json({ message: "Thông báo không hợp lệ" });
  if (!(await notifications.markRead(req.user, req.params.eventId))) return res.status(404).json({ message: "Không tìm thấy thông báo" });
  res.json({ success: true });
});
module.exports = router;
