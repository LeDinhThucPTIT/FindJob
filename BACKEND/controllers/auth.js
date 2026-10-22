const { candidateApplications, withApplicationCounts } = require("../services/recruitmentData");
// controllers/authController.js
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { getJwtSecret } = require("../config/security");
const { issueSession, accountModel, replacePassword } = require("../services/sessions");
const AuthSession = require("../models/AuthSession");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const Employer = require("../models/Employer");
const OTP = require("../models/OTP");
const { OAuth2Client } = require("google-auth-library");
// Hàm tạo Token dùng chung
// ==========================================
// REGISTER - Đăng ký
// ==========================================
exports.register = async (req, res) => {
  try {
    const { name, companyName, email, phone, password, role } = req.body;
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof password !== "string" || password.length < 8 || password.length > 128) {
      return res.status(400).json({ message: "Email không hợp lệ hoặc mật khẩu chưa đủ 8–128 ký tự." });
    }

    // 1. Kiểm tra dữ liệu đầu vào
    if ((!name && !companyName) || !email || !password || !phone) {
      return res
        .status(400)
        .json({ message: "Vui lòng điền đầy đủ thông tin" });
    }

    // Kiểm tra email tồn tại ở CẢ 2 BẢNG (User và Employer) để tránh xung đột
    const existingUser = await User.findOne({ email });
    const existingEmployer = await Employer.findOne({ email });
    if (existingUser || existingEmployer) {
      return res.status(400).json({
        message: "Email này đã được sử dụng trong hệ thống.",
      });
    }

    // 2. Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let newUser;
    let token;

    // 3. Phân luồng đăng ký dựa vào Role
    if (role === "employer") {
      newUser = new Employer({
        companyName: companyName || name,
        email,
        phone,
        password: hashedPassword,
        role: "employer",
      });

      await newUser.save();
      token = await issueSession(newUser);
    } else {
      newUser = new User({
        name,
        email,
        phone,
        password: hashedPassword,
        role: "candidate",
      });

      await newUser.save();
      token = await issueSession(newUser);
    }

    // 4. Trả về kết quả cho Frontend
    res.status(201).json({
      success: true,
      message: "Đăng ký thành công!",
      token,
      user: {
        id: newUser._id,
        name: newUser.name || newUser.companyName,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        avatar: newUser.avatar || null,
        logo: newUser.logo || null,
      },
    });
  } catch (error) {
    console.error("Lỗi đăng ký:", error);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại sau." });
  }
};

// ==========================================
// LOGIN - Đăng nhập
// ==========================================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập email và mật khẩu" });
    }

    // 1. Tìm trong bảng User trước
    let user = await User.findOne({ email });
    let isEmployer = false;

    // 2. Nếu không thấy, tìm tiếp bên bảng Employer
    if (!user) {
      user = await Employer.findOne({ email });
      isEmployer = true;
    }

    // 3. Nếu tìm cả 2 bảng đều không có
    if (!user) {
      return res
        .status(404)
        .json({ message: "Email không tồn tại trong hệ thống" });
    }

    // 4. Kiểm tra mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Sai mật khẩu" });
    }

    // 5. Tạo token và trả về
    const token = await issueSession(user);

    res.status(200).json({
      success: true,
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user._id,
        name: user.name || user.companyName,
        email: user.email,
        role: user.role,
        avatar: !isEmployer ? user.avatar : undefined,
        logo: isEmployer ? user.logo : undefined,
      },
    });
  } catch (error) {
    console.error("Lỗi đăng nhập:", error);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại sau." });
  }
};

// ==========================================
// LOGIN WITH GOOGLE - Đăng nhập với Google
// ==========================================
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "postmessage",
);
exports.loginWithGoogle = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code)
      return res.status(400).json({ message: "Thiếu mã xác thực từ frontend" });

    // 1. Đổi code lấy token và thông tin từ Google
    const { tokens } = await googleClient.getToken(code);
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    // Google trả về name, email, picture
    const { email, name, picture } = ticket.getPayload();

    // 2. Kiểm tra Database
    let user = await User.findOne({ email });

    if (!user) {
      // 3. TẠO MỚI (Đã sửa để khớp hoàn toàn với userSchema của bạn)

      const randomPassword =
        await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);

      user = await User.create({
        name: name,
        email: email,
        password: randomPassword,
        avatar: picture,
        role: "candidate",
      });
    }

    // 4. Cấp JWT của hệ thống (Sử dụng _id của MongoDB)
    const systemToken = await issueSession(user);

    // 5. Trả kết quả về Frontend
    return res.status(200).json({
      message: "Đăng nhập Google thành công",
      token: systemToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Lỗi xác thực Google:", error.message);
    return res
      .status(500)
      .json({ message: "Quá trình xác thực Google thất bại" });
  }
};

// ==========================================
// GET PROFILE - Lấy thông tin cá nhân
// ==========================================
exports.getProfile = async (req, res) => {
  try {
    if (!req.user?.id || !req.user?.role) {
      return res.status(401).json({ message: "Token không hợp lệ" });
    }

    // Candidate => lấy từ bảng User
    if (req.user.role === "candidate") {
      const user = await User.findById(req.user.id)
        .select("-password -authVersion")
        .populate("savedJobs")
        .lean();

      if (!user) {
        return res.status(404).json({ message: "Không tìm thấy candidate" });
      }

      [user.appliedJobs, user.savedJobs] = await Promise.all([
        candidateApplications(req.user.id), withApplicationCounts(user.savedJobs),
      ]);
      return res.status(200).json({ user });
    }

    // Employer => lấy từ bảng Employer
    if (req.user.role === "employer") {
      const employer = await Employer.findById(req.user.id)
        .select("-password -authVersion")
        .lean();

      if (!employer) {
        return res.status(404).json({ message: "Không tìm thấy employer" });
      }

      return res.status(200).json({ user: employer });
    }

    return res.status(403).json({ message: "Role không hợp lệ" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Lỗi lấy thông tin profile", error: error.message });
  }
};

// ==========================================
// UPDATE PROFILE - Cập nhật thông tin cá nhân
// ==========================================
exports.updateProfile = async (req, res) => {
  try {
    const {
      name,
      companyName,
      phone,
      headline,
      location,
      experience,
      education,
      skills,
      bio,
      linkedin,
      github,
    } = req.body;

    const targetName = name || companyName;
    if (!targetName) {
      return res.status(400).json({ message: "Tên là bắt buộc!" });
    }

    const updateData = {
      name: targetName,
      companyName: targetName,
      phone,
      headline,
      location,
      experience,
      education,
      skills: Array.isArray(skills) ? skills : [],
      bio,
      linkedin,
      github,
    };

    let updatedAccount;
    if (req.user.role === "employer") {
      updatedAccount = await Employer.findByIdAndUpdate(
        req.user.id,
        { $set: updateData },
        { new: true, runValidators: true },
      ).select("-password -authVersion");
    } else {
      updatedAccount = await User.findByIdAndUpdate(
        req.user.id,
        { $set: updateData },
        { new: true, runValidators: true },
      ).select("-password -authVersion");
    }

    if (!updatedAccount) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy người dùng để cập nhật!" });
    }

    return res.status(200).json(updatedAccount);
  } catch (error) {
    console.error("Lỗi updateProfile:", error);
    return res.status(500).json({ message: "Lỗi server khi lưu hồ sơ!" });
  }
};

// ==========================================
// CHANGE PASSWORD - Đổi mật khẩu
// ==========================================
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmNewPassword } = req.body;

    if (typeof oldPassword !== "string" || !oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập đầy đủ các trường mật khẩu!" });
    }

    if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
      return res
        .status(400)
        .json({ message: "Mật khẩu mới phải có 8–128 ký tự!" });
    }

    if (confirmNewPassword && newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: "Mật khẩu xác nhận không khớp!" });
    }

    const user = await accountModel(req.user.role).findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng!" });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Mật khẩu hiện tại không chính xác!" });
    }

    const salt = await bcrypt.genSalt(10);
    const updated = await replacePassword(user, await bcrypt.hash(newPassword, salt));
    if (!updated) return res.status(409).json({ message: "Mật khẩu vừa được thay đổi. Vui lòng đăng nhập lại." });

    return res.status(200).json({ message: "Đổi mật khẩu thành công!" });
  } catch (error) {
    console.error("Lỗi changePassword:", error);
    return res.status(500).json({ message: "Lỗi server khi đổi mật khẩu!" });
  }
};

// ==========================================
// UPDATE AVATAR - Cập nhật ảnh đại diện / Logo
// ==========================================
exports.updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng chọn một file ảnh!" });
    }

    const protocol = req.protocol;
    const host = req.get("host");
    const fileUrl = `${protocol}://${host}/uploads/img/${req.file.filename}`;

    let updatedAccount;

    if (req.user.role === "candidate") {
      updatedAccount = await User.findByIdAndUpdate(
        req.user.id,
        { avatar: fileUrl },
        { new: true },
      ).select("-password -authVersion");
    } else if (req.user.role === "employer") {
      updatedAccount = await Employer.findByIdAndUpdate(
        req.user.id,
        { logo: fileUrl },
        { new: true },
      ).select("-password -authVersion");
    } else {
      return res.status(403).json({ message: "Quyền truy cập không hợp lệ!" });
    }

    if (!updatedAccount) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy tài khoản để cập nhật!" });
    }

    return res.status(200).json({
      message: "Cập nhật ảnh thành công!",

      avatarUrl:
        req.user.role === "employer"
          ? updatedAccount.logo
          : updatedAccount.avatar,
      user: updatedAccount,
    });
  } catch (error) {
    console.error("Lỗi updateAvatar:", error);
    return res
      .status(500)
      .json({ message: "Lỗi server khi cập nhật ảnh đại diện!" });
  }
};

// ==========================================
// FORGOT PASSWORD - Quên mật khẩu
// ==========================================

exports.sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Vui lòng nhập email!" });
    }

    // Kiểm tra email tồn tại trong hệ thống (cả User và Employer)
    const user = await User.findOne({ email });
    const employer = await Employer.findOne({ email });
    if (!user && !employer) {
      return res.status(200).json({
        success: true,
        message: "Nếu email tồn tại, mã xác thực sẽ được gửi đến bạn.",
      });
    }

    // Tạo OTP mới
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHmac("sha256", getJwtSecret()).update(otp).digest("hex");

    // Lưu OTP vào cơ sở dữ liệu
    await OTP.findOneAndUpdate({ email }, {
      otp: otpHash, attempts: 0, createdAt: new Date(),
    }, { upsert: true, runValidators: true });

    // Gửi OTP qua email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Mã OTP xác thực",
      text: `Mã OTP của bạn là: ${otp}. Mã này sẽ hết hạn sau 5 phút.`,
    });
    res.status(200).json({
      success: true,
      message: "Nếu email tồn tại, mã xác thực sẽ được gửi đến bạn.",
    });
  } catch (error) {
    console.error("Lỗi sendOTP:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi gửi OTP. Vui lòng thử lại sau.",
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (typeof email !== "string" || typeof otp !== "string" || !/^\d{6}$/.test(otp) ||
        typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({
        success: false,
        message: "Thông tin không hợp lệ. Mật khẩu mới phải có 8–128 ký tự.",
      });
    }
    const activeFilter = { email, createdAt: { $gt: new Date(Date.now() - 300000) }, attempts: { $lt: 5 } };
    const otpRecord = await OTP.findOneAndUpdate(activeFilter, { $inc: { attempts: 1 } }, { new: true });
    const otpHash = crypto.createHmac("sha256", getJwtSecret()).update(otp).digest("hex");
    if (!otpRecord || otpRecord.otp !== otpHash) {
      return res.status(400).json({
        success: false,
        message: "Mã OTP không hợp lệ hoặc đã hết hạn.",
      });
    }
    // Xác thực thành công, tiến hành đổi mật khẩu
    let user = await User.findOne({ email });
    let isEmployer = false;
    if (!user) {
      user = await Employer.findOne({ email });
      isEmployer = true;
    }

    if (!user) return res.status(400).json({ message: "Mã OTP không hợp lệ hoặc đã hết hạn." });
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    // Consume atomically: simultaneous requests cannot reuse the same code.
    const consumed = await OTP.findOneAndDelete({
      _id: otpRecord._id, otp: otpHash, createdAt: activeFilter.createdAt,
    });
    if (!consumed) return res.status(400).json({ message: "Mã OTP không hợp lệ hoặc đã hết hạn." });
    const updated = await replacePassword(user, hashedPassword);
    if (!updated) return res.status(409).json({ message: "Mật khẩu vừa được thay đổi. Vui lòng yêu cầu mã OTP mới." });

    // Xóa OTP sau khi đổi mật khẩu thành công

    return res.status(200).json({
      success: true,
      message: "Đổi mật khẩu thành công!",
    });
  } catch (error) {
    console.error("Lỗi resetPassword:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi đổi mật khẩu. Vui lòng thử lại sau.",
    });
  }
};

exports.logout = async (req, res) => {
  await AuthSession.deleteOne({ _id: req.user.sid, account: req.user.id, role: req.user.role });
  res.json({ success: true, message: "Đã đăng xuất phiên hiện tại." });
};
