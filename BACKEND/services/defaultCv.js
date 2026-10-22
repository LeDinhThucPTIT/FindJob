const User = require("../models/User");
const CV = require("../models/CV");
const idOf = (value) => value ? String(value) : null;

// One account field is the authoritative default. Old isDefault flags are only
// used to choose a deterministic initial value for existing accounts.
const resolveDefaultId = async (userId, snapshots) => {
  let cvs = snapshots || await CV.find({ userId }).select("_id isDefault createdAt").lean();
  for (let attempt = 0; attempt < 5; attempt++) {
    const user = await User.findById(userId).select("defaultCvId").lean();
    if (!user) throw Object.assign(new Error("Không tìm thấy tài khoản"), { status: 401 });
    if (user.defaultCvId && await CV.exists({ _id: user.defaultCvId, userId })) return idOf(user.defaultCvId);
    if (!cvs.length && !user.defaultCvId) return null;
    const sorted = [...cvs].sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) ||
      new Date(a.createdAt || 0) - new Date(b.createdAt || 0) || String(a._id).localeCompare(String(b._id)));
    const fallback = sorted[0]?._id || null;
    const updated = await User.findOneAndUpdate(
      { _id: userId, defaultCvId: user.defaultCvId || null },
      { $set: { defaultCvId: fallback } }, { returnDocument: "after" },
    ).select("defaultCvId").lean();
    if (updated && (!updated.defaultCvId || await CV.exists({ _id: updated.defaultCvId, userId }))) return idOf(updated.defaultCvId);
    cvs = await CV.find({ userId }).select("_id isDefault createdAt").lean();
  }
  throw Object.assign(new Error("Danh sách CV đang thay đổi. Vui lòng thử lại."), { status: 409 });
};
const decorate = (cv, defaultId) => ({
  ...(typeof cv.toObject === "function" ? cv.toObject() : cv), isDefault: idOf(cv._id) === defaultId,
});
const list = async (userId) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cvs = await CV.find({ userId }).sort({ updatedAt: -1, _id: -1 });
    const defaultId = await resolveDefaultId(userId, cvs);
    if (!defaultId || cvs.some((cv) => idOf(cv._id) === defaultId)) return cvs.map((cv) => decorate(cv, defaultId));
  }
  throw Object.assign(new Error("Danh sách CV đang thay đổi. Vui lòng thử lại."), { status: 409 });
};
const annotate = async (userId, cv) => decorate(cv, await resolveDefaultId(userId));
module.exports = { resolveDefaultId, list, annotate };
