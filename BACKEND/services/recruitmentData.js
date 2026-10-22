const Application = require("../models/Application");
const Job = require("../models/Job");

// These values are computed from authoritative records, never legacy counters.
const openJobsFilter = (now = new Date()) => ({
  status: "active", $or: [{ deadline: null }, { deadline: { $gte: now } }],
});

const withApplicationCounts = async (jobs) => {
  if (!jobs.length) return [];
  const counts = await Application.aggregate([
    { $match: { job: { $in: jobs.map((job) => job._id) } } },
    { $group: { _id: "$job", count: { $sum: 1 } } },
  ]);
  const byJob = new Map(counts.map((item) => [String(item._id), item.count]));
  return jobs.map((job) => {
    const value = typeof job.toObject === "function" ? job.toObject() : job;
    const applied = byJob.get(String(value._id)) || 0;
    return { ...value, applied, applications: applied };
  });
};

const withCompanyJobCounts = async (companies) => {
  if (!companies.length) return [];
  const counts = await Job.aggregate([
    { $match: { ...openJobsFilter(), employerId: { $in: companies.map((company) => company._id) } } },
    { $group: { _id: "$employerId", count: { $sum: 1 } } },
  ]);
  const byCompany = new Map(counts.map((item) => [String(item._id), item.count]));
  return companies.map((company) => ({ ...company, totalJobs: byCompany.get(String(company._id)) || 0 }));
};

const candidateApplications = async (candidateId) => {
  const applications = await Application.find({ candidate: candidateId })
    .select("job status createdAt updatedAt").populate("job").sort({ createdAt: -1 }).lean();
  return withApplicationCounts(applications.filter((application) => application.job).map((application) => ({
    ...application.job,
    isApplied: true,
    applicationId: application._id,
    applicationStatus: application.status,
    appliedAt: application.createdAt,
    applicationUpdatedAt: application.updatedAt,
  })));
};

module.exports = { openJobsFilter, withApplicationCounts, withCompanyJobCounts, candidateApplications };
