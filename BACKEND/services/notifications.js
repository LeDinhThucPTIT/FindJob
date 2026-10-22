const mongoose = require("mongoose");
const Application = require("../models/Application");
const Job = require("../models/Job");
const NotificationRead = require("../models/NotificationRead");
const NotificationState = require("../models/NotificationState");

const STATUS_LABELS = { new: "Đã gửi hồ sơ", reviewing: "Đang xem xét", interviewed: "Phỏng vấn", offered: "Đã offer", rejected: "Từ chối" };
const recipientFilter = (user) => ({ recipient: new mongoose.Types.ObjectId(user.id), role: user.role });

// Derive events from applications, so sending a notification cannot fail after
// an application has already been committed. Only the latest status is shown.
const eventPipeline = async (user) => {
  const candidate = user.role === "candidate";
  const filter = candidate ? { candidate: new mongoose.Types.ObjectId(user.id) } : {
    job: { $in: (await Job.find({ employerId: user.id }).select("_id").lean()).map((job) => job._id) },
  };
  const applicationId = { $toString: "$_id" };
  const jobId = { $toString: "$job._id" };
  const base = { applicationId: "$_id", jobId: "$job._id" };
  const submission = candidate ? {
    ...base, eventId: { $concat: [applicationId, ":submitted"] }, type: "application_submitted",
    title: "Đã gửi hồ sơ ứng tuyển", message: { $concat: ["Bạn đã ứng tuyển vị trí ", "$job.title", "."] },
    path: { $concat: ["/jobs/", jobId] }, createdAt: "$createdAt",
  } : {
    ...base, eventId: { $concat: [applicationId, ":received"] }, type: "application_received",
    title: "Hồ sơ ứng tuyển mới", message: { $concat: ["$fullName", " đã ứng tuyển vị trí ", "$job.title", "."] },
    path: { $concat: ["/employer/dashboard?tab=applications&jobId=", jobId, "&applicationId=", applicationId] }, createdAt: "$createdAt",
  };
  const statusLabel = { $switch: { branches: Object.entries(STATUS_LABELS).map(([key, label]) => ({ case: { $eq: ["$status", key] }, then: label })), default: "Đã cập nhật" } };
  const status = {
    ...base, eventId: { $concat: [applicationId, ":status:", { $toString: { $ifNull: ["$statusVersion", 0] } }] },
    type: "application_status", title: "Hồ sơ ứng tuyển được cập nhật",
    message: { $concat: ["Vị trí ", "$job.title", ": ", statusLabel, "."] },
    path: { $concat: ["/jobs/", jobId] }, createdAt: { $ifNull: ["$statusUpdatedAt", "$createdAt"] },
  };
  return [
    { $match: filter },
    { $lookup: { from: Job.collection.name, localField: "job", foreignField: "_id", as: "job" } },
    { $unwind: "$job" },
    { $project: { events: candidate ? { $concatArrays: [[submission], { $cond: [
      { $or: [{ $ne: ["$status", "new"] }, { $gt: [{ $ifNull: ["$statusVersion", 0] }, 0] }] }, [status], [],
    ] }] } : [submission] } },
    { $unwind: "$events" }, { $replaceRoot: { newRoot: "$events" } },
  ];
};

const listNotifications = async (user, page, limit) => {
  const recipient = recipientFilter(user);
  const state = await NotificationState.findOne(recipient).lean();
  const pipeline = await eventPipeline(user);
  const [result] = await Application.aggregate([
    ...pipeline,
    { $lookup: { from: NotificationRead.collection.name, let: { event: "$eventId" }, pipeline: [
      { $match: { ...recipient, $expr: { $eq: ["$eventId", "$$event"] } } }, { $project: { readAt: 1 } },
    ], as: "receipt" } },
    { $set: { isRead: { $or: [
      { $gt: [{ $size: "$receipt" }, 0] }, { $lte: ["$createdAt", state?.readThrough || new Date(0)] },
    ] } } },
    { $unset: "receipt" },
    { $facet: {
      items: [{ $sort: { createdAt: -1, eventId: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }],
      total: [{ $count: "count" }], unread: [{ $match: { isRead: false } }, { $count: "count" }],
    } },
  ]);
  return { items: result?.items || [], total: result?.total[0]?.count || 0, unreadCount: result?.unread[0]?.count || 0, page, limit };
};

const markRead = async (user, eventId) => {
  const pipeline = await eventPipeline(user);
  const [event] = await Application.aggregate([...pipeline, { $match: { eventId } }, { $limit: 1 }]);
  if (!event) return false;
  const filter = { ...recipientFilter(user), eventId };
  try {
    await NotificationRead.updateOne(filter, { $setOnInsert: { readAt: new Date() } }, { upsert: true });
  } catch (error) { if (error.code !== 11000) throw error; }
  return true;
};

const markAllRead = async (user) => {
  const filter = recipientFilter(user);
  const update = { $max: { readThrough: new Date() } };
  try { await NotificationState.updateOne(filter, update, { upsert: true }); }
  catch (error) {
    if (error.code !== 11000) throw error;
    await NotificationState.updateOne(filter, update);
  }
};

module.exports = { listNotifications, markRead, markAllRead };
