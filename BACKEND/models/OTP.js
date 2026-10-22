const { default: mongoose } = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    otp: {
      type: String,
      required: true,
    },
    attempts: { type: Number, default: 0 },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 300, // OTP expires after 5 minutes
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("OTP", otpSchema);
