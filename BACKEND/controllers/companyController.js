const { withCompanyJobCounts } = require("../services/recruitmentData");
// ===========================
// controllers/companyController.js
// Dùng Employer làm Company luôn
// ===========================

const Employer = require("../models/Employer");
const { PUBLIC_COMPANY_FIELDS, escapeRegex, positiveInteger } = require("../utils/input");

const companyController = {
  // [GET] Lấy danh sách filter động
  getFilters: async (req, res) => {
    try {
      const industries = await Employer.distinct("industry");
      const locations = await Employer.distinct("location");

      res.status(200).json({
        industries,
        locations,
      });
    } catch (error) {
      console.error("Lỗi getFilters:", error);

      res.status(500).json({
        message: "Lỗi server khi lấy bộ lọc",
        error: error.message,
      });
    }
  },

  // [GET] Danh sách công ty
  getCompanies: async (req, res) => {
    try {
      const { keyword, industry, location, page = 1, limit = 12 } = req.query;

      let query = {};

      // SEARCH
      if (keyword) {
        query.$or = [
          {
            companyName: {
              $regex: escapeRegex(keyword),
              $options: "i",
            },
          },
          {
            industry: {
              $regex: escapeRegex(keyword),
              $options: "i",
            },
          },
        ];
      }

      // FILTER
      if (industry) {
        query.industry = industry;
      }

      if (location) {
        query.location = {
          $regex: escapeRegex(location),
          $options: "i",
        };
      }

      // PAGINATION
      const pageNumber = positiveInteger(page, 1, 100000);
      const limitNumber = positiveInteger(limit, 12);

      const skip = (pageNumber - 1) * limitNumber;

      // QUERY
      const [companiesDb, total] = await Promise.all([
        Employer.find(query).select(PUBLIC_COMPANY_FIELDS)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNumber)
          .lean(),

        Employer.countDocuments(query),
      ]);

      // FORMAT
      const countedCompanies = await withCompanyJobCounts(companiesDb);
      const formattedCompanies = countedCompanies.map((c) => ({
        ...c,
        id: c._id,
        name: c.companyName,
        jobs: c.totalJobs,
      }));

      res.status(200).json({
        companies: formattedCompanies,
        total,
        page: pageNumber,
        totalPages: Math.ceil(total / limitNumber),
      });
    } catch (error) {
      console.error("Lỗi getCompanies:", error);

      res.status(500).json({
        message: "Lỗi server khi lấy danh sách",
        error: error.message,
      });
    }
  },

  // [GET] Chi tiết công ty
  getCompanyById: async (req, res) => {
    try {
      const { id } = req.params;

      const company = await Employer.findById(id).select(PUBLIC_COMPANY_FIELDS).lean();

      if (!company) {
        return res.status(404).json({
          message: "Không tìm thấy công ty này",
        });
      }

      // FORMAT
      company.id = company._id;
      company.name = company.companyName;
      const [counted] = await withCompanyJobCounts([company]);
      company.totalJobs = counted.totalJobs;
      company.jobs = counted.totalJobs;

      res.status(200).json(company);
    } catch (error) {
      console.error("Lỗi getCompanyById:", error);

      res.status(500).json({
        message: "Lỗi server khi lấy chi tiết công ty",
        error: error.message,
      });
    }
  },
};

module.exports = companyController;
