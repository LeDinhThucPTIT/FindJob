const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, required: true },
  role: { type: String, enum: ["candidate", "employer"], required: true },
  readThrough: { type: Date, required: true },
});
schema.index({ recipient: 1, role: 1 }, { unique: true });
module.exports = mongoose.model("NotificationState", schema);
