const CV = require("../models/CV");
const User = require("../models/User");
const defaultCv = require("../services/defaultCv");
const { pick } = require("../utils/input");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const mongoose = require("mongoose");
const { renderCreatedCVHtml } = require("../utils/cvTemplate");

let globalBrowser = null;
const getBrowser = async () => {
  if (!globalBrowser || !globalBrowser.isConnected()) {
    globalBrowser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return globalBrowser;
};

const cvController = {
  // Lấy danh sách CV
  getCVList: async (req, res) => {
    try {
      const cvs = await defaultCv.list(req.user.id);
      res.status(200).json(cvs);
    } catch (error) {
      res.status(error.status || 500).json({ message: "Lỗi khi lấy danh sách CV", error });
    }
  },

  // Lấy chi tiết 1 CV theo ID
  getCVById: async (req, res) => {
    try {
      const cv = await CV.findOne({
        _id: req.params.id,
        userId: req.user.id,
      });
      if (!cv) return res.status(404).json({ message: "Không tìm thấy CV" });
      res.status(200).json(await defaultCv.annotate(req.user.id, cv));
    } catch (error) {
      res
        .status(error.status || 500)
        .json({ message: "Lỗi khi lấy thông tin CV", error: error.message });
    }
  },

  // Tạo CV mới từ Builder
  createCV: async (req, res) => {
    try {
      const { name, template, data } = req.body;

      const newCV = new CV({
        userId: req.user.id,
        name: name || "CV Mới",
        template: template || "modern",
        type: "created",
        isDefault: false,
        data,
      });

      const savedCV = await newCV.save();
      res.status(201).json(await defaultCv.annotate(req.user.id, savedCV));
    } catch (error) {
      res.status(error.status || 500).json({ message: "Lỗi khi tạo CV", error });
    }
  },

  // Cập nhật CV Builder
  updateCV: async (req, res) => {
    try {
      const updatedCV = await CV.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { $set: pick(req.body, ["name", "template", "data"]) },
        { new: true, runValidators: true },
      );
      if (!updatedCV)
        return res.status(404).json({ message: "Không tìm thấy CV" });
      res.status(200).json(await defaultCv.annotate(req.user.id, updatedCV));
    } catch (error) {
      res.status(error.status || 500).json({ message: "Lỗi khi cập nhật", error });
    }
  },

  // Upload CV file có sẵn
  uploadCV: async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "Vui lòng chọn file" });


      const fileUrl = `${req.protocol}://${req.get("host")}/uploads/cvs/${req.file.filename}`;

      const newCV = new CV({
        userId: req.user.id,
        name: req.file.originalname.replace(/\.[^/.]+$/, ""), // Xóa đuôi file
        type: "uploaded",
        isDefault: false,
        fileUrl: fileUrl, // URL trả về cho frontend
        fileName: req.file.filename,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });

      const savedCV = await newCV.save();
      res.status(201).json(await defaultCv.annotate(req.user.id, savedCV));
    } catch (error) {
      res.status(error.status || 500).json({ message: "Lỗi khi upload file", error });
    }
  },

  // Xóa CV
  deleteCV: async (req, res) => {
    try {
      const cv = await CV.findOneAndDelete({
        _id: req.params.id,
        userId: req.user.id,
      });
      if (!cv) return res.status(404).json({ message: "CV không tồn tại" });

      // Xóa file vật lý trong ổ cứng nếu là CV upload
      if (cv.type === "uploaded" && cv.fileName) {
        const filePath = path.join(__dirname, "../uploads/cvs", cv.fileName);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }

      await User.updateOne({ _id: req.user.id, defaultCvId: cv._id }, { $set: { defaultCvId: null } });
      await defaultCv.resolveDefaultId(req.user.id);
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(error.status || 500).json({ message: "Lỗi khi xóa", error });
    }
  },

  // Set Default
  setDefaultCV: async (req, res) => {
    try {
      const target = await CV.findOne({ _id: req.params.id, userId: req.user.id });
      if (!target) return res.status(404).json({ message: "Không tìm thấy CV" });
      const account = await User.findOneAndUpdate({ _id: req.user.id }, { $set: { defaultCvId: target._id } }, { returnDocument: "after" });
      if (!account) return res.status(401).json({ message: "Không tìm thấy tài khoản" });
      if (!(await CV.exists({ _id: target._id, userId: req.user.id }))) {
        await defaultCv.resolveDefaultId(req.user.id);
        return res.status(404).json({ message: "CV vừa được xóa. Vui lòng chọn CV khác." });
      }
      res.status(200).json(await defaultCv.annotate(req.user.id, target));
    } catch (error) {
      res.status(error.status || 500).json({ message: "Lỗi set mặc định", error });
    }
  },

  // Tải CV (Tăng view/download và tạo PDF)
  downloadCV: async (req, res) => {
    let page;

    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "ID CV không hợp lệ" });
      }

      const cv = await CV.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { $inc: { downloads: 1 } },
        { new: true },
      );

      if (!cv) return res.status(404).json({ message: "Không tìm thấy CV" });

      // Trả về file có sẵn nếu là CV upload
      if (cv.type === "uploaded") {
        const uploadedPath = path.join(
          __dirname,
          "../uploads/cvs",
          cv.fileName,
        );
        if (!fs.existsSync(uploadedPath)) {
          return res
            .status(404)
            .json({ message: "File CV không tồn tại trên máy chủ" });
        }

        const downloadName = `${cv.name.replace(/\.[^/.]+$/, "")}${path.extname(cv.fileName)}`;
        return res.download(uploadedPath, downloadName, (err) => {
          if (err && !res.headersSent) {
            console.error(err);
            return res.status(500).json({
              message: "Lỗi khi tải file CV",
              error: err.message || err,
            });
          }
        });
      }

      // Sinh PDF nếu là CV Builder (Sử dụng Singleton Puppeteer Browser)
      const htmlContent = renderCreatedCVHtml(cv);
      const browser = await getBrowser();
      page = await browser.newPage();
      await page.setViewport({
        width: 1200,
        height: 1600,
        deviceScaleFactor: 1,
      });
      await page.emulateMediaType("screen");

      await page.setContent(htmlContent, { waitUntil: "networkidle0" });
      await page.waitForSelector(".page", { visible: true, timeout: 5000 });
      await page.evaluate(async () => {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
      });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      });

      const outputFilename = `${cv.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${outputFilename}"`,
      );
      res.setHeader("Content-Length", pdfBuffer.length);
      return res.status(200).send(pdfBuffer);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        res.status(500).json({
          message: "Lỗi sinh file PDF",
          error: error.message || error,
        });
      }
    } finally {
      if (page) {
        await page.close().catch((err) => console.error("Error closing page:", err));
      }
    }
  },
};

module.exports = cvController;
