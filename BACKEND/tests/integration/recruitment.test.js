const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const express = require("express");
process.env.JWT_SECRET = "integration-test-secret-never-used-in-production";
const { MongoMemoryServer } = require("mongodb-memory-server");
const User = require("../../models/User");
const Employer = require("../../models/Employer");
const Job = require("../../models/Job");
const Application = require("../../models/Application");
const NotificationRead = require("../../models/NotificationRead");
const NotificationState = require("../../models/NotificationState");
const notifications = require("../../services/notifications");
const AuthSession = require("../../models/AuthSession");
const CV = require("../../models/CV");
const OTP = require("../../models/OTP");
const { issueSession } = require("../../services/sessions");
const defaultCv = require("../../services/defaultCv");
const jobController = require("../../controllers/jobController");
const authController = require("../../controllers/auth");
const companyController = require("../../controllers/companyController");
const employerController = require("../../controllers/employerController");
const { getOverview } = require("../../controllers/overviewController");
const { withApplicationCounts } = require("../../services/recruitmentData");
let mongo;
let httpServer, apiUrl;
const api = (route, token, method = "GET", body) => fetch(`${apiUrl}${route}`, {
  method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
let candidate, recruiter;
test('CV extraction requires a candidate session and does not persist a CV', async () => {
  const upload = (token) => {
    const form = new FormData();
    form.append('file', new Blob(['Experienced developer building reliable applications. '.repeat(5)], { type: 'text/plain' }), 'cv.txt');
    return fetch(`${apiUrl}/cvs/extract`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  };
  assert.equal((await upload()).status, 401);
  assert.equal((await upload(await issueSession(recruiter, 'employer'))).status, 403);
  const result = await upload(await issueSession(candidate, 'candidate'));
  assert.equal(result.status, 200);
  assert.match((await result.json()).text, /Experienced developer/);
  assert.equal(await CV.countDocuments(), 0);
});
const response = () => ({
  code: 200, status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; }, setHeader() {},
});
const next = (error) => { throw error; };
const createJob = (extra = {}) => Job.create({
  employerId: recruiter._id, title: "React Developer", category: "IT", location: "Hà Nội",
  description: "Build applications", applied: 999, ...extra,
});
const createApplication = (job, extra = {}) => Application.create({
  job: job._id, candidate: candidate._id, fullName: "Candidate", email: "candidate@example.com",
  phone: "0123456789", cvType: "online", onlineCvSnapshot: { fullName: "Candidate" },
  note: "Private interviewer discussion", ...extra,
});

before(async () => {
  // This process creates its own database. Never reads MONGO_URI or the project .env.
  mongo = await MongoMemoryServer.create({ instance: { dbName: "topcv_integration" } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Employer.init(), Job.init(), Application.init(), NotificationRead.init(), NotificationState.init(), AuthSession.init(), CV.init(), OTP.init()]);
  const app = express(); app.use(express.json()); require("../../routes")(app);
  app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
  httpServer = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  apiUrl = `http://127.0.0.1:${httpServer.address().port}`;
});
after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Employer.deleteMany({}), Job.deleteMany({}), Application.deleteMany({}), NotificationRead.deleteMany({}), NotificationState.deleteMany({}), AuthSession.deleteMany({}), CV.deleteMany({}), OTP.deleteMany({})]);
  candidate = await User.create({ name: "Candidate", email: "candidate@example.com", password: "test-only" });
  recruiter = await Employer.create({ companyName: "Demo", email: "employer@example.com", password: "test-only", totalJobs: 999 });
});

test('public job filters and sort match frontend options', async () => {
  const low = await createJob({ title: 'Low salary', jobType: 'remote', salary: { min: 10000000, max: 15000000 }, views: 100 });
  const high = await createJob({ title: 'High salary', jobType: 'full-time', salary: { min: 30000000, max: 50000000 }, views: 1 });
  let result = await (await api('/jobs?sort=salary_desc')).json();
  assert.deepEqual(result.data.map((job) => job._id), [String(high._id), String(low._id)]);
  result = await (await api('/jobs?sort=hot')).json();
  assert.deepEqual(result.data.map((job) => job._id), [String(low._id), String(high._id)]);
  result = await (await api('/jobs?jobType=remote')).json();
  assert.equal(result.total, 1);
  assert.equal(result.data[0]._id, String(low._id));
});

test("concurrent applications produce one record; counts and profile ignore legacy projections", async () => {
  const job = await createJob();
  const request = () => ({ params: { id: String(job._id) }, user: { id: String(candidate._id) }, body: {
    fullName: "Candidate", email: "candidate@example.com", phone: "0123456789",
    cvType: "online", onlineCvSnapshot: JSON.stringify({ fullName: "Candidate" }),
  } });
  const responses = [response(), response()];
  await Promise.all(responses.map((res) => jobController.applyJob(request(), res)));
  assert.deepEqual(responses.map((res) => res.code).sort(), [201, 409]);
  assert.equal(await Application.countDocuments(), 1);
  assert.equal((await User.findById(candidate._id)).appliedJobs.length, 0);
  assert.equal((await Job.findById(job._id)).applied, 999);
  assert.equal((await withApplicationCounts([job]))[0].applied, 1);

  const res = response();
  await authController.getProfile({ user: { id: String(candidate._id), role: "candidate" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.user.appliedJobs.length, 1);
  assert.equal(res.body.user.appliedJobs[0].applicationStatus, "new");
  assert.equal(res.body.user.appliedJobs[0].applied, 1);
  assert.equal(res.body.user.appliedJobs[0].note, undefined);
});

test("job lists return real application counts and candidate flags", async () => {
  const job = await createJob();
  await createApplication(job);
  await User.updateOne({ _id: candidate._id }, { savedJobs: [job._id] });
  const res = response();
  await jobController.getJobs({ query: {}, user: { id: String(candidate._id), role: "candidate" } }, res);
  assert.equal(res.body.data[0].applied, 1);
  assert.equal(res.body.data[0].isSaved, true);
  assert.equal(res.body.data[0].isApplied, true);
});

test("candidate endpoints do not expose internal notes or other candidates' status", async () => {
  const job = await createJob();
  await createApplication(job, { status: "offered" });
  const req = { params: { id: String(job._id) }, user: { id: String(candidate._id), role: "candidate" } };
  const detail = response();
  await jobController.getJobById(req, detail);
  assert.equal(detail.body.currentUserApplication.status, "offered");
  assert.equal(detail.body.currentUserApplication.note, undefined);
  const status = response();
  await jobController.getMyApplication(req, status, next);
  assert.equal(status.body.application.status, "offered");
  assert.equal(JSON.stringify(status.body).includes("Private interviewer"), false);
  const other = response();
  await jobController.getMyApplication({ ...req, user: { id: String(new mongoose.Types.ObjectId()) } }, other, next);
  assert.deepEqual(other.body, { isApplied: false, application: null });
});

test("company counts exclude closed and expired jobs and ignore stored totalJobs", async () => {
  await createJob(); await createJob({ status: "draft" }); await createJob({ deadline: new Date(0) });
  const res = response();
  await companyController.getCompanyById({ params: { id: String(recruiter._id) } }, res);
  assert.equal(res.body.jobs, 1);
  assert.equal(res.body.totalJobs, 1);
  assert.equal(res.body.password, undefined);
  assert.equal(res.body.email, undefined);
});

test("overview uses live counts and returns no fictitious rating", async () => {
  await createJob(); await createJob({ status: "paused" });
  const res = response(); await getOverview({}, res, next);
  assert.equal(res.body.stats.totalJobs, 1);
  assert.equal(res.body.stats.totalCompanies, 1);
  assert.equal(res.body.stats.totalCandidates, 1);
  assert.equal(res.body.stats.verifiedCompanies, 0);
  assert.equal(res.body.stats.newJobsToday, 1);
  assert.equal(res.body.categories[0].count, 1);
  assert.equal(res.body.companies[0].jobs, 1);
  assert.equal(res.body.companies[0].password, undefined);
});

test("dashboard has accurate status totals and a complete 12-day chart", async () => {
  const job = await createJob();
  await createJob({ status: "closed" });
  await createJob({ deadline: new Date(0) });
  await createApplication(job, { status: "offered" });
  const req = { user: { id: String(recruiter._id) } };
  const stats = response(); await employerController.getDashboardStats(req, stats);
  assert.equal(stats.body.totalJobs, 3);
  assert.equal(stats.body.activeJobs, 1);
  assert.equal(stats.body.totalApplications, 1);
  assert.equal(stats.body.newApplications, 0);
  assert.equal(stats.body.offeredApplications, 1);
  assert.equal(stats.body.hiredThisMonth, undefined);
  assert.equal(stats.body.profileViews, undefined);
  const chart = response(); await employerController.getChartData(req, chart);
  assert.equal(chart.body.applicationsByDay.length, 12);
  assert.equal(chart.body.applicationsByDay.reduce((sum, row) => sum + row.count, 0), 1);
  assert.equal(chart.body.applicationsByStatus[0].count, 1);
});

test("internal note edits remain private after a status update", async () => {
  const job = await createJob(); const application = await createApplication(job);
  const res = response();
  await employerController.updateApplicationStatus({ params: { appId: String(application._id) },
    user: { id: String(recruiter._id) }, body: { status: "reviewing", note: "Updated private note" } }, res);
  assert.equal(res.code, 200);
  const status = response();
  await jobController.getMyApplication({ params: { id: String(job._id) }, user: { id: String(candidate._id) } }, status, next);
  assert.equal(status.body.application.status, "reviewing");
  assert.equal(status.body.application.note, undefined);
});

test("editing an internal note does not reset a previously changed status", async () => {
  const job = await createJob(); const application = await createApplication(job, { status: "offered" });
  const res = response();
  await employerController.updateApplicationStatus({ params: { appId: String(application._id) },
    user: { id: String(recruiter._id) }, body: { note: "Follow up next week" } }, res);
  assert.equal(res.code, 200);
  assert.equal((await Application.findById(application._id)).status, "offered");
});

test("repeated save requests with an explicit desired state are idempotent", async () => {
  const job = await createJob();
  const req = { params: { id: String(job._id) }, user: { id: String(candidate._id) }, body: { saved: true } };
  await Promise.all([jobController.saveJob(req, response()), jobController.saveJob(req, response())]);
  assert.equal((await User.findById(candidate._id)).savedJobs.length, 1);
  req.body.saved = false;
  await Promise.all([jobController.saveJob(req, response()), jobController.saveJob(req, response())]);
  assert.equal((await User.findById(candidate._id)).savedJobs.length, 0);
});

test("concurrent edits cannot overwrite a newer application version", async () => {
  const job = await createJob(); const application = await createApplication(job);
  const [first, stale] = await Promise.all([
    Application.findById(application._id), Application.findById(application._id),
  ]);
  first.status = "offered";
  await first.save();
  stale.status = "rejected";
  await assert.rejects(stale.save(), { name: "VersionError" });
  assert.equal((await Application.findById(application._id)).status, "offered");
});

test("password login works for both roles and accepts existing six-character passwords", async () => {
  for (const [account, role] of [[candidate, "candidate"], [recruiter, "employer"]]) {
    account.password = await bcrypt.hash("old123", 10);
    await account.save();
    const login = response();
    await authController.login({ body: { email: account.email, password: "old123" } }, login);
    assert.equal(login.code, 200);
    assert.equal(login.body.user.role, role);
    const decoded = jwt.verify(login.body.token, process.env.JWT_SECRET);
    const profile = response();
    await authController.getProfile({ user: decoded }, profile);
    assert.equal(profile.code, 200);
    assert.equal(profile.body.user.email, account.email);
  }
});

test("notification feeds contain real applications and isolate recipient/role", async () => {
  const job = await createJob(); const application = await createApplication(job);
  const user = { id: String(candidate._id), role: "candidate" };
  const employer = { id: String(recruiter._id), role: "employer" };
  const received = await notifications.listNotifications(employer, 1, 10);
  assert.equal(received.unreadCount, 1);
  assert.equal(received.items[0].eventId, `${application._id}:received`);
  assert.equal(received.items[0].path.includes(`applicationId=${application._id}`), true);
  assert.equal(received.items[0].message.includes(job.title), true);
  const submitted = await notifications.listNotifications(user, 1, 10);
  assert.equal(submitted.unreadCount, 1);
  assert.equal(submitted.items[0].eventId, `${application._id}:submitted`);
  assert.equal(submitted.items[0].path, `/jobs/${job._id}`);
  assert.equal(JSON.stringify(submitted).includes("Private interviewer discussion"), false);
  const stranger = { id: String(new mongoose.Types.ObjectId()), role: "employer" };
  assert.equal((await notifications.listNotifications(stranger, 1, 10)).total, 0);
  assert.equal(await notifications.markRead(stranger, `${application._id}:received`), false);
  assert.equal(await notifications.markRead(user, `${application._id}:received`), false);
});

test("notification read state persists, is idempotent and stays private", async () => {
  const job = await createJob(); const application = await createApplication(job);
  const user = { id: String(candidate._id), role: "candidate" };
  const employer = { id: String(recruiter._id), role: "employer" };
  await Promise.all([notifications.markRead(user, `${application._id}:submitted`), notifications.markRead(user, `${application._id}:submitted`)]);
  assert.equal(await NotificationRead.countDocuments(), 1);
  assert.equal((await notifications.listNotifications(user, 1, 10)).unreadCount, 0);
  assert.equal((await notifications.listNotifications(employer, 1, 10)).unreadCount, 1);
});

test("status changes create a fresh notification; internal note edits do not", async () => {
  const job = await createJob(); const application = await createApplication(job);
  const user = { id: String(candidate._id), role: "candidate" };
  await notifications.markAllRead(user);
  const change = (body) => employerController.updateApplicationStatus({ params: { appId: String(application._id) }, user: { id: String(recruiter._id) }, body }, response());
  await new Promise((resolve) => setTimeout(resolve, 5));
  await change({ status: "offered" });
  const feed = await notifications.listNotifications(user, 1, 10);
  assert.equal(feed.total, 2);
  assert.equal(feed.unreadCount, 1);
  const event = feed.items.find((item) => item.type === "application_status");
  assert.equal(event.eventId, `${application._id}:status:1`);
  assert.equal(event.message.includes("Đã offer"), true);
  await notifications.markRead(user, event.eventId);
  await change({ note: "Private changed note" });
  assert.equal((await notifications.listNotifications(user, 1, 10)).unreadCount, 0);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await change({ status: "new" });
  const latest = await notifications.listNotifications(user, 1, 10);
  assert.equal(latest.unreadCount, 1);
  assert.equal(latest.items.some((item) => item.eventId.endsWith(":status:2")), true);
  assert.equal(latest.items.some((item) => item.eventId.endsWith(":status:1")), false);
  await notifications.markAllRead(user);
  assert.equal((await notifications.listNotifications(user, 1, 10)).unreadCount, 0);
});

test("notification pagination counts all unread events, not only the current page", async () => {
  for (let index = 0; index < 3; index++) await createApplication(await createJob({ title: `Job ${index}` }));
  const feed = await notifications.listNotifications({ id: String(candidate._id), role: "candidate" }, 1, 2);
  assert.equal(feed.items.length, 2); assert.equal(feed.total, 3); assert.equal(feed.unreadCount, 3);
});

test("applicants can open notifications for closed jobs without exposing them to other candidates", async () => {
  const job = await createJob({ status: "closed" }); await createApplication(job);
  const own = response();
  await jobController.getJobById({ params: { id: String(job._id) }, user: { id: String(candidate._id), role: "candidate" } }, own);
  assert.equal(own.code, 200);
  const other = response();
  await jobController.getJobById({ params: { id: String(job._id) }, user: { id: String(new mongoose.Types.ObjectId()), role: "candidate" } }, other);
  assert.equal(other.code, 404);
});

test("editing notes on legacy status records does not make read notifications unread", async () => {
  const job = await createJob(); const application = await createApplication(job, { status: "offered" });
  const user = { id: String(candidate._id), role: "candidate" };
  await notifications.markAllRead(user);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await employerController.updateApplicationStatus({ params: { appId: String(application._id) },
    user: { id: String(recruiter._id) }, body: { note: "Internal discussion only" } }, response());
  assert.equal((await notifications.listNotifications(user, 1, 10)).unreadCount, 0);
});

test("logout revokes only the current server session for both account roles", async () => {
  for (const account of [candidate, recruiter]) {
    const first = await issueSession(account); const other = await issueSession(account);
    assert.notEqual(first, other);
    assert.equal((await api("/auth/profile", first)).status, 200);
    assert.equal((await api("/auth/logout", first, "POST")).status, 200);
    assert.equal((await api("/auth/profile", first)).status, 401);
    assert.equal((await api("/auth/profile", other)).status, 200);
  }
});

test("changing password revokes all existing sessions and fresh login works", async () => {
  candidate.password = await bcrypt.hash("oldpassword123", 10); await candidate.save();
  const first = await issueSession(candidate); const second = await issueSession(candidate);
  assert.equal((await api("/auth/change-password", first, "PUT", { oldPassword: "oldpassword123", newPassword: "newpassword456" })).status, 200);
  for (const token of [first, second]) assert.equal((await api("/auth/profile", token)).status, 401);
  assert.equal((await api("/auth/login", null, "POST", { email: candidate.email, password: "oldpassword123" })).status, 400);
  const login = await api("/auth/login", null, "POST", { email: candidate.email, password: "newpassword456" });
  assert.equal(login.status, 200);
  const data = await login.json();
  assert.equal((await api("/auth/profile", data.token)).status, 200);
});

test("OTP password reset revokes old sessions and code cannot be reused", async () => {
  const token = await issueSession(candidate);
  await OTP.create({ email: candidate.email, otp: crypto.createHmac("sha256", process.env.JWT_SECRET).update("123456").digest("hex") });
  const payload = { email: candidate.email, otp: "123456", newPassword: "newpassword456" };
  assert.equal((await api("/auth/reset-password", null, "POST", payload)).status, 200);
  assert.equal((await api("/auth/profile", token)).status, 401);
  assert.equal((await api("/auth/reset-password", null, "POST", payload)).status, 400);
  const login = await api("/auth/login", null, "POST", { email: candidate.email, password: payload.newPassword });
  assert.equal(login.status, 200);
  assert.equal((await api("/auth/profile", (await login.json()).token)).status, 200);
});

test("expired server session and deleted account are rejected without waiting for TTL", async () => {
  const expired = await issueSession(candidate);
  await AuthSession.updateOne({ _id: jwt.decode(expired).sid }, { expiresAt: new Date(0) });
  assert.equal((await api("/auth/profile", expired)).status, 401);
  const deleted = await issueSession(candidate);
  await User.deleteOne({ _id: candidate._id });
  assert.equal((await api("/auth/profile", deleted)).status, 401);
});

test("revoked sessions cannot personalize public routes and legacy stateless tokens require login", async () => {
  const job = await createJob(); await createApplication(job);
  const token = await issueSession(candidate);
  assert.equal((await (await api("/jobs", token)).json()).data[0].isApplied, true);
  await api("/auth/logout", token, "POST");
  const publicResponse = await api("/jobs", token);
  assert.equal(publicResponse.status, 200);
  assert.equal((await publicResponse.json()).data[0].isApplied, false);
  const legacy = jwt.sign({ id: String(candidate._id), role: "candidate" }, process.env.JWT_SECRET);
  assert.equal((await api("/auth/profile", legacy)).status, 401);
});

test("Google callback creates an active server session", async (t) => {
  const { OAuth2Client } = require("google-auth-library");
  t.mock.method(OAuth2Client.prototype, "getToken", async () => ({ tokens: { id_token: "test-id-token" } }));
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => ({ getPayload: () => ({ email: candidate.email, name: candidate.name }) }));
  const login = await api("/auth/google", null, "POST", { code: "test-auth-code" });
  assert.equal(login.status, 200);
  const token = (await login.json()).token;
  assert.ok(jwt.decode(token).sid);
  assert.equal((await api("/auth/profile", token)).status, 200);
});

test("concurrent first CV creation returns a list with exactly one default", async () => {
  const token = await issueSession(candidate);
  const created = await Promise.all(Array.from({ length: 8 }, (_, index) => api("/cvs", token, "POST", { name: `CV ${index}`, data: { fullName: "Candidate" } })));
  assert.equal(created.every((res) => res.status === 201), true);
  const list = await (await api("/cvs", token)).json();
  assert.equal(list.length, 8);
  assert.equal(list.filter((cv) => cv.isDefault).length, 1);
  assert.equal(list.find((cv) => cv.isDefault)._id, String((await User.findById(candidate._id)).defaultCvId));
});

test("legacy multiple default flags are resolved without returning multiple defaults", async () => {
  const first = await CV.create({ userId: candidate._id, name: "Old CV", type: "created", isDefault: true, createdAt: new Date("2020-01-01") });
  const second = await CV.create({ userId: candidate._id, name: "Other CV", type: "created", isDefault: true });
  const token = await issueSession(candidate);
  const list = await (await api("/cvs", token)).json();
  assert.equal(list.filter((cv) => cv.isDefault).length, 1);
  assert.equal(list.find((cv) => cv.isDefault)._id, String(first._id));
  assert.equal((await (await api(`/cvs/${second._id}`, token)).json()).isDefault, false);
});

test("concurrent default selections have one winner and reject another owner's CV", async () => {
  const [first, second, otherCv] = await CV.create([
    { userId: candidate._id, name: "First", type: "created" },
    { userId: candidate._id, name: "Second", type: "created" },
    { userId: new mongoose.Types.ObjectId(), name: "Other owner's CV", type: "created" },
  ]);
  const token = await issueSession(candidate);
  const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => api(`/cvs/${index % 2 ? first._id : second._id}/default`, token, "PATCH")));
  assert.equal(responses.every((res) => res.status === 200), true);
  const pointer = String((await User.findById(candidate._id)).defaultCvId);
  const list = await (await api("/cvs", token)).json();
  assert.equal(list.filter((cv) => cv.isDefault).length, 1);
  assert.equal(list.find((cv) => cv.isDefault)._id, pointer);
  assert.equal((await api(`/cvs/${otherCv._id}/default`, token, "PATCH")).status, 404);
  assert.equal(String((await User.findById(candidate._id)).defaultCvId), pointer);
  // A read with an old snapshot must not overwrite a newer valid selection.
  await User.updateOne({ _id: candidate._id }, { defaultCvId: second._id });
  assert.equal(await defaultCv.resolveDefaultId(candidate._id, [first]), String(second._id));
});

test("deleting the default selects another CV; deleting the last clears the pointer", async () => {
  const [first, second] = await CV.create([
    { userId: candidate._id, name: "First", type: "created" },
    { userId: candidate._id, name: "Second", type: "created" },
  ]);
  const token = await issueSession(candidate);
  await api(`/cvs/${first._id}/default`, token, "PATCH");
  assert.equal((await api(`/cvs/${first._id}`, token, "DELETE")).status, 200);
  const list = await (await api("/cvs", token)).json();
  assert.equal(list.length, 1); assert.equal(list[0].isDefault, true);
  assert.equal((await api(`/cvs/${second._id}`, token, "DELETE")).status, 200);
  assert.deepEqual(await (await api("/cvs", token)).json(), []);
  assert.equal((await User.findById(candidate._id)).defaultCvId, null);
});

test("concurrent selection/deletion repairs a removed CV pointer", async () => {
  const [first, second] = await CV.create([
    { userId: candidate._id, name: "First", type: "created" },
    { userId: candidate._id, name: "Second", type: "created" },
  ]);
  const token = await issueSession(candidate);
  const results = await Promise.all([api(`/cvs/${first._id}/default`, token, "PATCH"), api(`/cvs/${first._id}`, token, "DELETE")]);
  assert.equal(results.every((result) => [200, 404].includes(result.status)), true);
  const list = await (await api("/cvs", token)).json();
  assert.equal(list.length, 1); assert.equal(list[0]._id, String(second._id)); assert.equal(list[0].isDefault, true);
  assert.equal(String((await User.findById(candidate._id)).defaultCvId), String(second._id));
});

test("registration creates a usable session for candidates and employers", async () => {
  for (const role of ["candidate", "employer"]) {
    const registration = await api("/auth/register", null, "POST", {
      name: "New Account", companyName: "New Company", email: `new-${role}@example.com`,
      phone: "0123456789", password: "password123", role,
    });
    assert.equal(registration.status, 201);
    const data = await registration.json();
    assert.equal(data.user.role, role);
    assert.equal((await api("/auth/profile", data.token)).status, 200);
  }
});

test("employer password rotation targets the correct account collection", async () => {
  const sharedId = candidate._id;
  const employer = await Employer.create({ _id: sharedId, companyName: "Shared ID Company", email: "shared-id@example.com", password: await bcrypt.hash("oldpassword123", 10) });
  const token = await issueSession(employer);
  assert.equal((await api("/auth/change-password", token, "PUT", { oldPassword: "oldpassword123", newPassword: "newpassword456" })).status, 200);
  assert.equal((await User.findById(sharedId)).authVersion, 0);
  assert.equal((await Employer.findById(sharedId)).authVersion, 1);
  assert.equal((await api("/auth/profile", token)).status, 401);
  const fresh = await issueSession(await Employer.findById(sharedId));
  await OTP.create({ email: employer.email, otp: crypto.createHmac("sha256", process.env.JWT_SECRET).update("234567").digest("hex") });
  assert.equal((await api("/auth/reset-password", null, "POST", { email: employer.email, otp: "234567", newPassword: "resetpassword789" })).status, 200);
  assert.equal((await api("/auth/profile", fresh)).status, 401);
  assert.equal((await User.findById(sharedId)).password, "test-only");
});
