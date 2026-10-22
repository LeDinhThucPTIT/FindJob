const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  role: { type: String, enum: ["candidate", "employer"], required: true },
  authVersion: { type: Number, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });
module.exports = mongoose.model("AuthSession", schema);
