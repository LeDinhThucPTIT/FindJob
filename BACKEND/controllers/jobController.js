const Job = require("../models/Job");
const Application = require("../models/Application");
const User = require("../models/User");
const Employer = require("../models/Employer");
const fs = require("fs/promises");
const mongoose = require("mongoose");
const { openJobsFilter, withApplicationCounts } = require("../services/recruitmentData");
const { pick, JOB_FIELDS, escapeRegex, positiveInteger } = require("../utils/input");

const removeRequestFiles = async (req) => {
  const files = [req.file, ...Object.values(req.files || {}).flat()].filter(Boolean);
  await Promise.all(files.map(removeUploadedFile));
};

const removeUploadedFile = async (file) => {
  if (!file?.path) return;

  try {
    await fs.unlink(file.path);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to remove uploaded CV:", error.message);
    }
  }
};

const jobController = {
  getMyApplication: async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "ID việc làm không hợp lệ" });
      const application = await Application.findOne({ job: req.params.id, candidate: req.user.id })
        .select("status createdAt updatedAt").lean();
      res.json({ isApplied: Boolean(application), application: application ? {
        id: application._id, status: application.status,
        appliedAt: application.createdAt, updatedAt: application.updatedAt,
      } : null });
    } catch (error) { next(error); }
  },
  // 1. Lấy danh sách việc làm (Có filter & phân trang)
  getJobs: async (req, res) => {
    try {
      const {
        keyword,
        location,
        category,
        experience,
        salary,
        jobType,
        sort = "newest",
        page = 1,
        limit = 6,
      } = req.query;

      let query = { status: "active", $and: [{ $or: openJobsFilter().$or }] };

      // Lọc theo keyword (tìm trong title, tên công ty, hoặc kỹ năng)
      if (keyword) {
        const regex = new RegExp(escapeRegex(keyword), "i");
        query.$or = [
          { title: regex },
          { "companySnapshot.companyName": regex },
          { skills: { $in: [regex] } },
        ];
      }

      if (location && location !== "all")
        query.location = new RegExp(escapeRegex(location), "i");
      if (category && category !== "all") query.category = category;
      if (experience && experience !== "all") query.experience = experience;
      if (jobType && jobType !== "all") query.jobType = jobType;

      // Lọc theo lương (Đầu vào VD: "15000000-25000000" hoặc "30000000-")
      if (salary && salary !== "all") {
        const [minStr, maxStr] = salary.split("-");
        const min = Number(minStr);
        const max = Number(maxStr);

        if (max) {
          query["salary.min"] = { $gte: min };
          query["salary.max"] = { $lte: max };
        } else {
          // Nếu không có max (VD: mức lương trên 30tr)
          query["salary.min"] = { $gte: min };
        }
      }

      const pageNumber = positiveInteger(page, 1, 100000);
      const limitNumber = positiveInteger(limit, 6);
      const skip = (pageNumber - 1) * limitNumber;
      const ordering = sort === "salary_desc" ? { "salary.max": -1, "salary.min": -1, _id: -1 }
        : sort === "hot" ? { views: -1, createdAt: -1, _id: -1 }
        : { createdAt: -1, _id: -1 };
      const jobs = await Job.find(query)
        .sort(ordering)
        .skip(skip)
        .limit(limitNumber);
      const total = await Job.countDocuments(query);

      let appliedJobIds = new Set();
      let savedJobIds = new Set();

      if (req.user?.role === "candidate") {
        const user = await User.findById(req.user.id).select(
          "savedJobs",
        );
        if (user) {
          savedJobIds = new Set(
            (user.savedJobs || []).map((id) => id.toString()),
          );
        }

        const applications = await Application.find({
          candidate: req.user.id,
          job: { $in: jobs.map((job) => job._id) },
        })
          .select("job")
          .lean();

        appliedJobIds = new Set(
          applications.map((application) => application.job.toString()),
        );
      }

      const countedJobs = await withApplicationCounts(jobs);
      const jobsWithFlags = countedJobs.map((job) => ({
        ...job,
        isApplied: appliedJobIds.has(job._id.toString()),
        isSaved: savedJobIds.has(job._id.toString()),
      }));

      res.status(200).json({
        data: jobsWithFlags,
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      });
    } catch (error) {
      res.status(500).json({
        message: "Lỗi khi lấy danh sách việc làm",
        error: error.message,
      });
    }
  },

  // 2. Lấy việc làm nổi bật (Hot Jobs)
  getHotJobs: async (req, res) => {
    try {
      const limit = positiveInteger(req.query.limit, 6);
      const jobs = await Job.find({ ...openJobsFilter(), hot: true })
        .sort({ createdAt: -1 })
        .limit(limit);
      res.status(200).json(await withApplicationCounts(jobs));
    } catch (error) {
      res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  },

  // 3. Lấy việc làm gợi ý
  getRecommendedJobs: async (req, res) => {
    try {
      const limit = positiveInteger(req.query.limit, 4);
      // Tạm thời lấy các job mới nhất. Sau này có thể viết thuật toán gợi ý theo User Skills
      const jobs = await Job.find(openJobsFilter())
        .sort({ views: -1, createdAt: -1 })
        .limit(limit);
      res.status(200).json(await withApplicationCounts(jobs));
    } catch (error) {
      res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  },

  // 4. Lấy chi tiết 1 việc làm
  getJobById: async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "ID việc làm không hợp lệ" });
      const previouslyApplied = req.user?.role === "candidate" && await Application.exists({ job: req.params.id, candidate: req.user.id });
      const job = await Job.findOneAndUpdate(
        { _id: req.params.id, ...(req.user?.role === "employer" ? { $or: [{ status: "active" }, { employerId: req.user.id }] } : previouslyApplied ? {} : { status: "active" }) },
        { $inc: { views: 1 } },
        { new: true },
      );

      if (!job) {
        return res.status(404).json({ message: "Không tìm thấy việc làm" });
      }

      const [jobData] = await withApplicationCounts([job]);

      // 1. In log ra để "bắt tận tay" xem req.user có gì

      // 2. Mở rộng điều kiện check role (bao gồm cả 'candidate' và 'user')
      if (
        req.user &&
        (req.user.role === "candidate" || req.user.role === "user")
      ) {
        // Lấy ID chuẩn xác (phòng trường hợp token dùng _id)
        const currentUserId = req.user.id || req.user._id;

        const [application, user] = await Promise.all([
          Application.findOne({
            job: job._id,
            candidate: currentUserId, // Dùng biến ID đã chuẩn hóa ở trên
          })
            .select("_id status")
            .lean(),
          User.findById(currentUserId).select("savedJobs").lean(),
        ]);


        jobData.isApplied = Boolean(application);
        jobData.isSaved = Boolean(
          user?.savedJobs?.some((id) => id.toString() === job._id.toString()),
        );

        if (application) {
          // Gán data cho Frontend
          jobData.currentUserApplication = {
            status: application.status,
          };
          jobData.applicationStatus = application.status;
        }
      } else {
        jobData.isApplied = false;
        jobData.isSaved = false;
      }

      res.status(200).json(jobData);
    } catch (error) {
      res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  },

  checkAlreadyApplied: async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "ID việc làm không hợp lệ" });
      const job = await Job.findById(req.params.id);
      if (!job) return res.status(404).json({ message: "Không tìm thấy việc làm" });
      if (job.status !== "active" || (job.deadline && job.deadline < new Date())) {
        return res.status(409).json({ message: "Tin tuyển dụng đã đóng hoặc hết hạn" });
      }
      const existingApp = await Application.findOne({
        job: req.params.id,
        candidate: req.user.id,
      })
        .select("_id")
        .lean();

      if (existingApp) {
        return res.status(409).json({
          success: false,
          isApplied: true,
          message: "Bạn đã ứng tuyển công việc này rồi",
        });
      }

      next();
    } catch (error) {
      res.status(500).json({
        message: "Lỗi kiểm tra trạng thái ứng tuyển",
        error: error.message,
      });
    }
  },

  // 5. Ứng tuyển việc làm
  applyJob: async (req, res) => {
    try {
      const jobId = req.params.id;
      const candidateId = req.user.id;

      // Hứng dữ liệu text từ formData (Frontend gửi lên)
      const { fullName, email, phone, coverLetter, onlineCvSnapshot } =
        req.body;
      const rawCvType = req.body.cvType;
      const cvType =
        typeof rawCvType === "string"
          ? rawCvType.trim().toLowerCase()
          : rawCvType;

      const uploadedFile =
        req.file ||
        (req.files && req.files.cv && req.files.cv[0]) ||
        (req.files && req.files.file && req.files.file[0]);

      const files = [req.file, ...Object.values(req.files || {}).flat()].filter(Boolean);
      if (files.length > 1) {
        await removeRequestFiles(req);
        return res.status(400).json({ message: "Chỉ được đính kèm một CV" });
      }
      const job = await Job.findById(jobId);
      if (!job || job.status !== "active" || (job.deadline && job.deadline < new Date())) {
        await removeRequestFiles(req);
        return res.status(409).json({ message: "Tin tuyển dụng không còn nhận hồ sơ" });
      }
      if (![fullName, email, phone].every((value) => typeof value === "string" && value.trim() && value.length <= 250) ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await removeRequestFiles(req);
        return res.status(400).json({ message: "Thông tin ứng tuyển không hợp lệ" });
      }

      // 1. Kiểm tra xem đã ứng tuyển chưa
      const existingApp = await Application.findOne({
        job: jobId,
        candidate: candidateId,
      });
      if (existingApp) {
        await removeRequestFiles(req);
        return res.status(409).json({
          success: false,
          isApplied: true,
          message: "Bạn đã ứng tuyển công việc này rồi",
        });
      }

      // 2. Chuẩn bị payload để lưu
      const applicationData = {
        job: jobId,
        candidate: candidateId,
        fullName,
        email,
        phone,
        coverLetter,
        cvType,
      };

      // 3. Xử lý logic theo loại CV
      if (cvType === "pdf") {
        if (!uploadedFile) {
          return res.status(400).json({ message: "Vui lòng đính kèm file CV" });
        }
        applicationData.pdfCvUrl = `/uploads/cvs/${uploadedFile.filename}`;
      } else if (cvType === "online") {
        if (!onlineCvSnapshot) {
          await removeRequestFiles(req);
          return res
            .status(400)
            .json({ message: "Không tìm thấy dữ liệu CV Online" });
        }
        try {
          applicationData.onlineCvSnapshot = typeof onlineCvSnapshot === "string" ? JSON.parse(onlineCvSnapshot) : onlineCvSnapshot;
        } catch {
          await removeRequestFiles(req);
          return res.status(400).json({ message: "Dữ liệu CV Online không hợp lệ" });
        }
        await removeRequestFiles(req);
      } else {
        await removeRequestFiles(req);
        return res.status(400).json({
          message:
            "Loại CV không hợp lệ. Vui lòng gửi cvType = 'pdf' hoặc 'online'.",
          receivedType: rawCvType,
        });
      }

      // 4. Lưu Application vào DB
      const application = new Application(applicationData);
      await application.save();

      res.status(201).json({
        success: true,
        isApplied: true,
        message: "Ứng tuyển thành công!",
      });
    } catch (error) {
      // Bắt lỗi Unique Index nếu bị click đúp tạo 2 request cùng lúc
      if (error.code === 11000) {
        await removeRequestFiles(req);
        return res.status(409).json({
          success: false,
          isApplied: true,
          message: "Bạn đã ứng tuyển công việc này rồi",
        });
      }
      await removeRequestFiles(req);
      res
        .status(500)
        .json({ message: "Lỗi khi ứng tuyển", error: error.message });
    }
  },

  // 6. Lưu việc làm (Yêu thích) - Có tính năng Toggle (Lưu/Hủy lưu)
  saveJob: async (req, res) => {
    try {
      const jobId = req.params.id;
      const userId = req.user.id;

      if (!mongoose.Types.ObjectId.isValid(jobId) || !(await Job.exists({ _id: jobId }))) {
        return res.status(404).json({ message: "Không tìm thấy việc làm" });
      }
      if (req.body?.saved !== undefined && typeof req.body.saved !== "boolean") {
        return res.status(400).json({ message: "Trạng thái lưu không hợp lệ" });
      }

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "Không tìm thấy ứng viên" });
      // Explicit desired state makes retries safe. Keep toggle for legacy clients.
      const isSaved = req.body?.saved !== undefined ? !req.body.saved : user.savedJobs.includes(jobId);

      if (isSaved) {
        // Nếu đã lưu rồi -> Hủy lưu
        await User.findByIdAndUpdate(userId, { $pull: { savedJobs: jobId } });
        res.status(200).json({
          success: true,
          message: "Đã bỏ lưu việc làm",
          isSaved: false,
        });
      } else {
        // Nếu chưa lưu -> Thêm vào danh sách
        await User.findByIdAndUpdate(userId, {
          $addToSet: { savedJobs: jobId },
        });
        res
          .status(200)
          .json({ success: true, message: "Đã lưu việc làm", isSaved: true });
      }
    } catch (error) {
      res
        .status(500)
        .json({ message: "Lỗi khi lưu việc làm", error: error.message });
    }
  },

  // 7. Xóa việc làm (Dành cho Employer chỉ xóa chính tin của mình)
  deleteJob: async (req, res) => {
    try {
      const jobId = req.params.id;
      const employerId = req.user.id;

      const job = await Job.findById(jobId);
      if (!job) {
        return res.status(404).json({ message: "Không tìm thấy việc làm" });
      }

      if (job.employerId.toString() !== employerId) {
        return res
          .status(403)
          .json({ message: "Bạn không có quyền xóa việc làm này" });
      }

      await Job.findByIdAndDelete(jobId);
      await Application.deleteMany({ job: jobId });
      await User.updateMany(
        { $or: [{ appliedJobs: jobId }, { savedJobs: jobId }] },
        { $pull: { appliedJobs: jobId, savedJobs: jobId } },
      );

      res
        .status(200)
        .json({ success: true, message: "Xóa việc làm thành công" });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Lỗi khi xóa việc làm", error: error.message });
    }
  },

  // 8. Tạo tin tuyển dụng mới (Dành cho Employer)
  createJob: async (req, res) => {
    try {
      // req.user.id có được là nhờ middleware verifyToken
      const employerId = req.user.id;

      // Tìm thông tin công ty đang đăng nhập
      const employer = await Employer.findById(employerId);
      if (!employer) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy thông tin nhà tuyển dụng" });
      }

      const jobData = pick(req.body, JOB_FIELDS);

      // Khởi tạo Job mới
      const newJob = new Job({
        ...jobData,
        employerId: employer._id,

        companySnapshot: {
          id: employer._id,
          companyName: employer.companyName,
          logo: employer.logo,
          size: employer.size,
          industry: employer.industry,
          verified: employer.verified,
        },
      });

      await newJob.save();

      res.status(201).json({
        success: true,
        message: "Đăng tin tuyển dụng thành công",
        data: newJob,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Lỗi tạo tin tuyển dụng", error: error.message });
    }
  },
};

module.exports = jobController;
