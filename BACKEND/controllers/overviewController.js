const Job = require("../models/Job");
const Employer = require("../models/Employer");
const User = require("../models/User");
const { openJobsFilter } = require("../services/recruitmentData");
const { vietnamDayStart } = require("../utils/reportingDates");

exports.getOverview = async (req, res, next) => {
  try {
    const now = new Date();
    const open = openJobsFilter(now);
    const [totalJobs, totalCompanies, totalCandidates, verifiedCompanies, newJobsToday, categories, companies] = await Promise.all([
      Job.countDocuments(open), Employer.countDocuments(), User.countDocuments({ role: "candidate" }),
      Employer.countDocuments({ verified: true }),
      Job.countDocuments({ ...open, createdAt: { $gte: vietnamDayStart(now) } }),
      Job.aggregate([
        { $match: open }, { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } }, { $limit: 8 },
        { $project: { _id: 0, key: "$_id", label: "$_id", count: 1 } },
      ]),
      Job.aggregate([
        { $match: open }, { $group: { _id: "$employerId", jobs: { $sum: 1 } } },
        { $lookup: { from: Employer.collection.name, localField: "_id", foreignField: "_id", as: "company" } },
        { $unwind: "$company" }, { $sort: { jobs: -1, _id: 1 } }, { $limit: 6 },
        { $project: { _id: 1, jobs: 1, companyName: "$company.companyName", logo: "$company.logo" } },
      ]),
    ]);
    res.json({ stats: { totalJobs, totalCompanies, totalCandidates, verifiedCompanies, newJobsToday }, categories, companies });
  } catch (error) { next(error); }
};
