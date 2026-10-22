const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
process.env.JWT_SECRET = "test-only-secret-that-is-never-used-in-production";

const Employer = require("../models/Employer");
const CV = require("../models/CV");
const Job = require("../models/Job");
const User = require("../models/User");
const Application = require("../models/Application");
const OTP = require("../models/OTP");
const AuthSession = require("../models/AuthSession");
const company = require("../controllers/companyController");
const employer = require("../controllers/employerController");
const cv = require("../controllers/cvController");
const job = require("../controllers/jobController");
const auth = require("../controllers/auth");
const files = require("../controllers/fileController");
const { verifyToken } = require("../middleware/authMiddleware");
const rateLimit = require("../middleware/rateLimit");
const candidateId = "507f1f77bcf86cd799439011";
const jobId = "507f1f77bcf86cd799439012";
const employerId = "507f1f77bcf86cd799439013";
const response = () => ({
  statusCode: 200, headers: {},
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  setHeader(key, value) { this.headers[key] = value; },
});

test("public company details never serialize account fields", async (t) => {
  t.mock.method(Job, "aggregate", async () => []);
  const record = { companyName: "Demo", password: "hash", email: "private@example.com", role: "employer" };
  t.mock.method(Employer, "findById", () => ({ select(fields) {
    const selected = Object.fromEntries(Object.entries(record).filter(([key]) => fields.split(" ").includes(key)));
    return { lean: async () => selected };
  } }));
  const res = response();
  await company.getCompanyById({ params: { id: employerId } }, res);
  assert.equal(res.body.companyName, "Demo");
  for (const key of ["password", "email", "role"]) assert.equal(Object.hasOwn(res.body, key), false);
});

test("company updates cannot change role, password, verification or counters", async (t) => {
  t.mock.method(Employer, "findByIdAndUpdate", (id, update, options) => {
    assert.equal(id, employerId);
    assert.deepEqual(update, { $set: { companyName: "Updated" } });
    assert.equal(options.runValidators, true);
    return { select: async () => ({ companyName: "Updated" }) };
  });
  await employer.updateCompanyProfile({ user: { id: employerId }, body: {
    companyName: "Updated", role: "admin", password: "plain", verified: true, totalJobs: 999,
    $set: { role: "admin" },
  } }, response());
});

test("CV updates enforce ownership and cannot move files or ownership", async (t) => {
  t.mock.method(CV, "findOneAndUpdate", async (filter, update, options) => {
    assert.deepEqual(filter, { _id: jobId, userId: candidateId });
    assert.deepEqual(update, { $set: { name: "My CV" } });
    assert.equal(options.runValidators, true);
    return null;
  });
  const res = response();
  await cv.updateCV({ params: { id: jobId }, user: { id: candidateId }, body: {
    name: "My CV", userId: employerId, fileName: "../../secret", type: "uploaded", downloads: 900,
  } }, res);
  assert.equal(res.statusCode, 404);
});

test("invalid default CV does not clear the current default", async (t) => {
  t.mock.method(CV, "findOne", async () => null);
  const update = t.mock.method(CV, "updateMany", async () => {});
  const res = response();
  await cv.setDefaultCV({ user: { id: candidateId }, params: { id: jobId } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(update.mock.callCount(), 0);
});

test("CV download refuses another candidate's CV", async (t) => {
  t.mock.method(CV, "findOneAndUpdate", async (filter) => {
    assert.equal(filter.userId, candidateId);
    return null;
  });
  const res = response();
  await cv.downloadCV({ user: { id: candidateId }, params: { id: jobId } }, res);
  assert.equal(res.statusCode, 404);
});

test("private CV file rejects an unrelated employer", async (t) => {
  t.mock.method(Application, "find", () => ({ populate: async () => [
    { job: { employerId: { toString: () => "another-employer" } } },
  ] }));
  const res = response();
  await files.getCvFile({ user: { id: employerId, role: "employer" }, params: { filename: "cv-123-456.pdf" } }, res, assert.fail);
  assert.equal(res.statusCode, 404);
});

test("employer can read only the submitted CV for their job", async (t) => {
  t.mock.method(Application, "find", (filter) => {
    assert.equal(filter.pdfCvUrl, "/uploads/cvs/cv-123-456.pdf");
    return { populate: async () => [{ job: { employerId: { toString: () => employerId } } }] };
  });
  const res = response();
  res.sendFile = (filename, options) => {
    assert.equal(filename, "cv-123-456.pdf");
    assert.equal(options.root, path.resolve(__dirname, "../uploads/cvs"));
    res.sent = true;
  };
  await files.getCvFile({ user: { id: employerId, role: "employer" }, params: { filename: "cv-123-456.pdf" } }, res, assert.fail);
  assert.equal(res.sent, true);
  assert.equal(res.headers["Cache-Control"], "private, no-store");
});

test("private CV filenames cannot traverse directories", async () => {
  const res = response();
  await files.getCvFile({ user: {}, params: { filename: "../secret.pdf" } }, res, assert.fail);
  assert.equal(res.statusCode, 404);
});

for (const [label, record] of [
  ["missing", null], ["closed", { status: "closed" }],
  ["expired", { status: "active", deadline: new Date(0) }],
]) {
  test(`application gate blocks ${label} job before uploading`, async (t) => {
    t.mock.method(Job, "findById", async () => record);
    const res = response();
    await job.checkAlreadyApplied({ params: { id: jobId }, user: { id: candidateId } }, res, assert.fail);
    assert.equal(res.statusCode, record ? 409 : 404);
  });
}

test("duplicate application removes multipart files", async (t) => {
  const filename = "cv-security-test.pdf";
  const filepath = path.join(__dirname, filename);
  await fs.writeFile(filepath, "test");
  t.after(() => fs.rm(filepath, { force: true }));
  t.mock.method(Job, "findById", async () => ({ status: "active" }));
  t.mock.method(Application, "findOne", async () => ({}));
  const res = response();
  await job.applyJob({ params: { id: jobId }, user: { id: candidateId }, body: {
    fullName: "Test", email: "test@example.com", phone: "0123456789", cvType: "pdf",
  }, files: { cv: [{ path: filepath, filename }] } }, res);
  assert.equal(res.statusCode, 409);
  await assert.rejects(fs.access(filepath));
});

test("expired or exhausted OTP is explicitly rejected without relying on TTL deletion", async (t) => {
  t.mock.method(OTP, "findOneAndUpdate", async (filter, update) => {
    assert.ok(filter.createdAt.$gt > new Date(Date.now() - 301000));
    assert.deepEqual(filter.attempts, { $lt: 5 });
    assert.deepEqual(update, { $inc: { attempts: 1 } });
    return null;
  });
  const res = response();
  await auth.resetPassword({ body: { email: "test@example.com", otp: "123456", newPassword: "password123" } }, res);
  assert.equal(res.statusCode, 400);
});

test("reset password validates password before consuming OTP", async (t) => {
  const lookup = t.mock.method(OTP, "findOneAndUpdate", async () => assert.fail());
  const res = response();
  await auth.resetPassword({ body: { email: "test@example.com", otp: "123456", newPassword: "x" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(lookup.mock.callCount(), 0);
});

test("a consumed OTP cannot reset a password twice", async (t) => {
  const otp = "123456";
  const hash = crypto.createHmac("sha256", process.env.JWT_SECRET).update(otp).digest("hex");
  t.mock.method(OTP, "findOneAndUpdate", async () => ({ _id: jobId, otp: hash }));
  let consumed = false;
  t.mock.method(OTP, "findOneAndDelete", async (filter) => {
    assert.equal(filter.otp, hash);
    if (consumed) return null;
    consumed = true;
    return {};
  });
  let saved = 0;
  t.mock.method(User, "findOne", async () => ({ _id: candidateId, role: "candidate", password: "old-hash" }));
  t.mock.method(User, "findOneAndUpdate", async (filter, update) => {
    assert.equal(filter.password, "old-hash");
    assert.equal(update.$inc.authVersion, 1);
    saved++;
    return { authVersion: 1 };
  });
  const req = { body: { email: "test@example.com", otp, newPassword: "password123" } };
  const first = response(); const second = response();
  await auth.resetPassword(req, first);
  await auth.resetPassword(req, second);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 400);
  assert.equal(saved, 1);
});

test("applications are saved without writing redundant job and user counters", async (t) => {
  const filename = "cv-counter-test.pdf";
  const filepath = path.join(__dirname, filename);
  await fs.writeFile(filepath, "test");
  t.after(() => fs.rm(filepath, { force: true }));
  t.mock.method(Job, "findById", async () => ({ status: "active" }));
  t.mock.method(Application, "findOne", async () => null);
  t.mock.method(Application.prototype, "save", async function () { return this; });
  const jobWrite = t.mock.method(Job, "findByIdAndUpdate", async () => assert.fail("Redundant counter write"));
  const userWrite = t.mock.method(User, "findByIdAndUpdate", async () => assert.fail("Redundant appliedJobs write"));
  const res = response();
  await job.applyJob({ params: { id: jobId }, user: { id: candidateId }, body: {
    fullName: "Test", email: "test@example.com", phone: "0123456789", cvType: "pdf",
  }, files: { cv: [{ path: filepath, filename }] } }, res);
  assert.equal(res.statusCode, 201);
  await fs.access(filepath);
  assert.equal(jobWrite.mock.callCount(), 0);
  assert.equal(userWrite.mock.callCount(), 0);
});

test("authentication rejects object injection before querying accounts", async (t) => {
  const lookup = t.mock.method(User, "findOne", async () => assert.fail());
  const res = response();
  await auth.login({ body: { email: { $ne: null }, password: "password123" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(lookup.mock.callCount(), 0);
});

test("rate limit returns 429 and Retry-After", () => {
  const limit = rateLimit({ windowMs: 60000, max: 1 });
  let passed = 0;
  const res = response();
  limit({ ip: "test" }, res, () => passed++);
  limit({ ip: "test" }, res, () => passed++);
  assert.equal(passed, 1);
  assert.equal(res.statusCode, 429);
  assert.ok(res.headers["Retry-After"] > 0);
});

test("download routes enforce token and candidate role over HTTP", async (t) => {
  t.mock.method(Employer, "findById", () => ({ select: () => ({ lean: async () => ({ role: "employer", authVersion: 0 }) }) }));
  t.mock.method(AuthSession, "exists", async () => ({}));
  const app = express();
  app.use("/cvs", require("../routes/cvRoutes"));
  app.use("/notifications", require("../routes/notificationRoutes"));
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/cvs/${jobId}/download`;
  for (const method of ["GET", "POST"]) {
    assert.equal((await fetch(url, { method })).status, 401);
    const token = jwt.sign({ id: employerId, role: "employer", sid: jobId, version: 0 }, process.env.JWT_SECRET);
    assert.equal((await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } })).status, 403);
  }
  const notificationUrl = `http://127.0.0.1:${server.address().port}/notifications`;
  assert.equal((await fetch(notificationUrl)).status, 401);
  assert.equal((await fetch(`${notificationUrl}/read-all`, { method: "PATCH" })).status, 401);
  const invalidRole = jwt.sign({ id: candidateId, role: "admin" }, process.env.JWT_SECRET);
  assert.equal((await fetch(notificationUrl, { headers: { Authorization: `Bearer ${invalidRole}` } })).status, 401);
});

test("invalid signatures and expired JWTs are rejected", async () => {
  for (const token of [jwt.sign({ id: candidateId }, "wrong-secret"), jwt.sign({ id: candidateId }, process.env.JWT_SECRET, { expiresIn: -1 })]) {
    const res = response();
    await verifyToken({ headers: { authorization: `Bearer ${token}` } }, res, assert.fail);
    assert.equal(res.statusCode, 401);
  }
});
