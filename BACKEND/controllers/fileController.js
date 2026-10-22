const path = require("path");
const CV = require("../models/CV");
const Application = require("../models/Application");

exports.getCvFile = async (req, res, next) => {
  try {
    const { filename } = req.params;
    if (!/^cv-[\w-]+\.(pdf|doc|docx)$/i.test(filename)) {
      return res.status(404).json({ message: "Không tìm thấy file CV" });
    }
    let allowed = false;
    if (req.user.role === "candidate") {
      allowed = Boolean(await CV.exists({ userId: req.user.id, fileName: filename })) ||
        Boolean(await Application.exists({ candidate: req.user.id, pdfCvUrl: `/uploads/cvs/${filename}` }));
    } else if (req.user.role === "employer") {
      const applications = await Application.find({ pdfCvUrl: `/uploads/cvs/${filename}` })
        .populate("job", "employerId");
      allowed = applications.some((app) => app.job?.employerId?.toString() === req.user.id);
    }
    if (!allowed) return res.status(404).json({ message: "Không tìm thấy file CV" });
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(filename, { root: path.join(__dirname, "../uploads/cvs") }, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
};
