const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const puppeteer = require("puppeteer");
let browser, server, baseUrl;
const candidateId = "507f1f77bcf86cd799439011";
const jobId = "507f1f77bcf86cd799439012";
const recruiterId = "507f1f77bcf86cd799439013";
const job = {
  _id: jobId, title: "React Developer", status: "active", category: "IT", location: "Hà Nội",
  description: '<p>Safe description</p><img src="x" onerror="window.__xss=true"><script>window.__xss=true</script>',
  companySnapshot: { id: recruiterId, companyName: "Demo" }, skills: ["React"], salary: { negotiable: true },
  applied: 1, views: 3, deadline: "2099-01-01", isApplied: true, applicationStatus: "reviewing",
};
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };

before(async () => {
  const dist = path.resolve(__dirname, "../../../FRONTEND/dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error("Build FRONTEND before browser tests");
  const executablePath = [process.env.PUPPETEER_EXECUTABLE_PATH, puppeteer.executablePath(),
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean).find((file) => fs.existsSync(file));
  if (!executablePath) throw new Error("Install Chrome or set PUPPETEER_EXECUTABLE_PATH");
  const app = express(); app.use(express.static(dist));
  app.use((req, res) => res.sendFile(path.join(dist, "index.html")));
  server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

const openPage = async (role = "candidate", state = {}) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1365, height: 900 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const profile = { _id: role === "candidate" ? candidateId : recruiterId, role, name: "Test", companyName: "Demo", email: "test@example.com", savedJobs: [], appliedJobs: [] };
  await page.evaluateOnNewDocument((user, id, anonymous) => {
    if (window.top !== window || !/^https?:$/.test(location.protocol)) return;
    if (sessionStorage.getItem("fixture-initialized")) return;
    sessionStorage.setItem("fixture-initialized", "1");
    if (!anonymous) {
      localStorage.setItem("token", "browser-test-token");
      localStorage.setItem("user", JSON.stringify(user));
    } else {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
    localStorage.setItem(`applicationStatus:${user._id}:${id}`, "rejected");
    localStorage.setItem(`applicationNote:${id}`, "PRIVATE_LEGACY_NOTE");
  }, profile, jobId, state.anonymous);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (state.holdNotifications && url.pathname === "/notifications") {
      state.releaseUnauthorized = () => request.respond({ status: 401, headers: cors, contentType: "application/json", body: JSON.stringify({ message: "Old session expired" }) });
      return;
    }
    if (url.hostname === "accounts.google.com" && url.pathname === "/gsi/client") {
      return request.respond({ status: 200, contentType: "application/javascript", body:
        'window.google={accounts:{oauth2:{initCodeClient(config){window.__googleReady=true;return{requestCode(){config.callback({code:"test-auth-code"})}}}}}};' });
    }
    if (request.method() === "OPTIONS") return request.respond({ status: 204, headers: cors });
    if (url.pathname === '/jobs' && ['fetch', 'xhr'].includes(request.resourceType())) {
      const respond = () => request.respond({ status: state.failJobs ? 503 : 200, headers: cors, contentType: 'application/json', body: JSON.stringify(state.failJobs ? { message: 'Unavailable' } : { data: state.jobs || [{ ...job, title: url.searchParams.get('keyword') || 'Latest results' }], total: state.jobs?.length || 1 }) });
      if (url.searchParams.get('keyword') === 'old') { state.releaseOldJobs = () => respond().catch(() => {}); return; }
      state.lastJobQuery = Object.fromEntries(url.searchParams);
      return respond();
    }
    if (url.pathname === '/cvs/extract') {
      state.extractionCalls = (state.extractionCalls || 0) + 1;
      return request.respond({ status: state.failExtraction ? 422 : 200, headers: cors, contentType: 'application/json', body: JSON.stringify(state.failExtraction ? { message: 'File cannot be read' } : { text: 'Experienced engineer building reliable applications. '.repeat(5) }) });
    }
    if (url.pathname === '/cvs/score') state.scoreCalls = (state.scoreCalls || 0) + 1;
    if (state.holdSaves && /^\/jobs\/[^/]+\/save$/.test(url.pathname) && request.method() === 'POST') {
      state.pendingSaves ||= [];
      state.pendingSaves.push(() => request.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ isSaved: true }) }));
      return;
    }
    if (!["fetch", "xhr"].includes(request.resourceType())) {
      return url.origin === baseUrl ? request.continue() : request.abort();
    }
    const routes = {
      "/notifications": { items: state.notifications || [], unreadCount: (state.notifications || []).filter((item) => !item.isRead).length, total: (state.notifications || []).length, page: 1, limit: 10 },
      "/auth/profile": { user: profile }, "/jobs/hot": [],
      "/auth/login": { token: "authenticated-token", user: profile },
      "/auth/google": { token: "authenticated-token", user: profile },
      "/cvs": state.cvs || [],
      "/jobs/overview": { stats: { totalJobs: 7, totalCompanies: 3, totalCandidates: 11, verifiedCompanies: 1, newJobsToday: 2 }, categories: [], companies: [] },
      [`/jobs/${jobId}`]: job,
      [`/jobs/${jobId}/application`]: { isApplied: true, application: { status: state.status || "reviewing" } },
      "/employer/dashboard": { totalJobs: 0, activeJobs: 0, totalApplications: 0, newApplications: 0, totalViews: 0, offeredApplications: 0 },
      "/employer/chart-data": { applicationsByStatus: [], applicationsByDay: Array.from({ length: 12 }, (_, index) => ({ date: `${index + 1}/10`, count: 0 })) },
      "/employer/profile": profile, "/employer/jobs": [], "/employer/applications": [],
    };
    if (url.pathname === "/auth/logout" && request.method() === "POST") {
      state.logoutCalls = (state.logoutCalls || 0) + 1;
      return request.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ success: true }) });
    }
    if (url.pathname === "/auth/change-password" && request.method() === "PUT") {
      state.passwordChanged = true;
      return request.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ success: true }) });
    }
    const defaultMatch = url.pathname.match(/^\/cvs\/([a-f0-9]{24})\/default$/);
    if (defaultMatch && request.method() === "PATCH") {
      (state.cvs || []).forEach((cv) => cv.isDefault = cv._id === defaultMatch[1]);
      return request.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(state.cvs.find((cv) => cv.isDefault)) });
    }
    if (url.pathname.startsWith("/notifications/") && request.method() === "PATCH") {
      if (url.pathname === "/notifications/read-all") (state.notifications || []).forEach((item) => item.isRead = true);
      else {
        const eventId = decodeURIComponent(url.pathname.split("/")[2]);
        const item = (state.notifications || []).find((item) => item.eventId === eventId);
        if (item) item.isRead = true;
      }
      return request.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ success: true }) });
    }
    if (state.failNotifications && url.pathname === "/notifications") return request.respond({ status: 503, headers: cors, contentType: "application/json", body: JSON.stringify({ message: "Unavailable" }) });
    if (state.failStats && url.pathname === "/employer/dashboard") return request.respond({ status: 503, headers: cors, contentType: "application/json", body: JSON.stringify({ message: "Unavailable" }) });
    return request.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(routes[url.pathname] ?? []) });
  });
  return { page, errors };
};

test('CV upload shows editable extracted text and waits for explicit scoring', async () => {
  const state = {};
  const { page, errors } = await openPage('candidate', state);
  try {
    await page.goto(`${baseUrl}/cvscoring`);
    await page.waitForSelector('.mode-tab');
    await page.$$eval('.mode-tab', (tabs) => tabs[2].click());
    await page.waitForSelector('input[type=file]');
    const selectFile = () => page.$eval('input[type=file]', (input) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['Example CV content'], 'cv.txt', { type: 'text/plain' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await selectFile();
    await page.waitForFunction(() => document.querySelector('.cv-text-input')?.value.includes('Experienced engineer'));
    assert.equal(await page.$eval('.cv-text-input', (input) => input.disabled), false);
    assert.equal(state.extractionCalls, 1);
    assert.equal(state.scoreCalls || 0, 0);
    state.failExtraction = true;
    await selectFile();
    await page.waitForFunction(() => document.body.innerText.includes('File cannot be read'));
    assert.equal(await page.$eval('.cv-text-input', (input) => input.value), '');
    assert.equal(state.scoreCalls || 0, 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('job search discards slow old responses and exposes retry after API failure', async () => {
  const state = {};
  const { page, errors } = await openPage('candidate', state);
  try {
    await page.goto(`${baseUrl}/jobs?keyword=old`);
    await page.waitForSelector('.job-list-header__search input');
    for (let attempt = 0; !state.releaseOldJobs && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(state.releaseOldJobs, 'old search request was intercepted');
    await page.$eval('.job-list-header__search input', (input) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'new'); input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('.job-list-header__search button');
    await page.waitForFunction(() => document.querySelector('.job-card')?.innerText.includes('new'));
    await state.releaseOldJobs();
    assert.equal(await page.$eval('.job-card', (card) => card.innerText.includes('new')), true);
    assert.equal(new URL(page.url()).searchParams.get('page'), '1');
    state.failJobs = true;
    await page.goto(`${baseUrl}/jobs?keyword=error`);
    await page.waitForSelector('.ant-alert-error');
    assert.equal(await page.$('.job-list-empty'), null);
    state.failJobs = false;
    await page.click('.ant-alert-error button');
    await page.waitForSelector('.job-card');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('main candidate pages fit mobile width and job filters remain accessible', async () => {
  const { page, errors } = await openPage();
  try {
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    for (const route of ['/', '/jobs', '/cvscoring', '/cv', '/profile']) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle0' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `horizontal overflow on ${route}`);
      if (route === '/jobs') {
        assert.equal(await page.$eval('.job-list-filters', (node) => node.getBoundingClientRect().width > 0), true);
        await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'topcv-mobile-jobs.png'), fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('saving two jobs concurrently preserves both in the shared profile', async () => {
  const state = { holdSaves: true, jobs: [{ ...job, isSaved: false }, { ...job, _id: '507f1f77bcf86cd799439099', isSaved: false }] };
  const { page, errors } = await openPage('candidate', state);
  try {
    await page.goto(`${baseUrl}/jobs`);
    await page.waitForSelector('.job-card__save');
    await page.$$eval('.job-card__save', (buttons) => buttons.forEach((button) => button.click()));
    for (let attempt = 0; state.pendingSaves?.length !== 2 && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(state.pendingSaves.length, 2);
    await Promise.all(state.pendingSaves.map((respond) => respond()));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('user')).savedJobs.length === 2);
    assert.equal(await page.$$('.job-card__save.saved').then((nodes) => nodes.length), 2);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('employer dashboard fits mobile width', async () => {
  const { page, errors } = await openPage('employer');
  try {
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/employer/dashboard`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.stats-card');
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((node) => node.getBoundingClientRect().right > innerWidth + 1).slice(0, 20).map((node) => ({ tag: node.tagName, class: node.className, left: node.getBoundingClientRect().left, width: node.getBoundingClientRect().width, parent: node.parentElement?.className, text: node.textContent?.slice(0, 45) })));
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'topcv-mobile-employer.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, JSON.stringify(overflow));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("home displays live metrics and empty states", async () => {
  const { page, errors } = await openPage();
  try {
    await page.goto(baseUrl);
    await page.waitForFunction(() => document.querySelectorAll(".home-stat-number")[0]?.textContent === "7");
    assert.deepEqual(await page.$$eval(".home-stat-number", (nodes) => nodes.map((node) => node.textContent)), ["7", "3", "11", "1"]);
    assert.equal(await page.evaluate(() => document.body.innerText.includes("4.8/5")), false);
    assert.equal(await page.evaluate(() => document.body.innerText.includes("Chưa có việc làm nổi bật")), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("job details ignore stale local status, hide notes, sanitize HTML and refresh from server", async () => {
  const state = { status: "reviewing" };
  const { page, errors } = await openPage("candidate", state);
  try {
    await page.goto(`${baseUrl}/jobs/${jobId}`);
    await page.waitForSelector(".job-detail-description");
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.$eval(".job-detail-description", (node) => node.querySelectorAll("img, script").length), 0);
    assert.equal(await page.evaluate(() => document.body.innerText.includes("PRIVATE_LEGACY_NOTE")), false);
    assert.equal(await page.evaluate((id) => localStorage.getItem(`applicationNote:${id}`), jobId), null);
    assert.equal(await page.evaluate(() => document.body.innerText.includes("Đang xem xét")), true);
    state.status = "offered";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(() => document.body.innerText.includes("Đã offer"));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("empty employer dashboard has no fictitious growth or invalid zero-height bars", async () => {
  const { page, errors } = await openPage("employer");
  try {
    await page.goto(`${baseUrl}/employer/dashboard`);
    await page.waitForSelector(".stats-card");
    assert.equal((await page.$$(".stats-card__trend")).length, 0);
    assert.equal(await page.evaluate(() => document.body.innerText.includes("Đã gửi offer")), true);
    assert.equal(await page.$$eval(".mini-bar-chart__bar", (nodes) => nodes.every((node) => node.style.height === "0%")), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("failed dashboard request leaves loading state and exposes retry", async () => {
  const { page, errors } = await openPage("employer", { failStats: true });
  try {
    await page.goto(`${baseUrl}/employer/dashboard`);
    await page.waitForFunction(() => document.body.innerText.includes("Không tải được thống kê"));
    assert.equal(await page.evaluate(() => document.body.innerText.includes("Thử lại")), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

for (const role of ["candidate", "employer"]) {
  test(`password login persists the ${role} session and survives reload`, async () => {
    const { page, errors } = await openPage(role, { anonymous: true });
    try {
      await page.goto(`${baseUrl}/login`);
      await page.waitForSelector("#email");
      await page.type("#email", "test@example.com");
      await page.type("#password", "password123");
      await page.click(".auth-submit-btn");
      const expected = role === "employer" ? "/employer/dashboard" : "/";
      await page.waitForFunction((pathname) => location.pathname === pathname, {}, expected);
      assert.equal(await page.evaluate(() => localStorage.getItem("token")), "authenticated-token");
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("user")).role), role);
      await page.reload();
      await page.waitForFunction((pathname) => location.pathname === pathname && !document.querySelector(".auth-form"), {}, expected);
      assert.equal(await page.evaluate(() => localStorage.getItem("token")), "authenticated-token");
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test("Google code callback stores the unwrapped API session and survives reload", async () => {
  const { page, errors } = await openPage("candidate", { anonymous: true });
  try {
    await page.goto(`${baseUrl}/login`);
    await page.waitForFunction(() => window.__googleReady);
    await page.click(".auth-social-btn--google");
    await page.waitForFunction(() => location.pathname === "/");
    assert.equal(await page.evaluate(() => localStorage.getItem("token")), "authenticated-token");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("user")).role), "candidate");
    await page.reload();
    await page.waitForSelector(".home-page");
    assert.equal(await page.evaluate(() => localStorage.getItem("token")), "authenticated-token");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("notification badge reflects unread data, opens a job and persists read state", async () => {
  const state = { notifications: [{ eventId: `${jobId}:submitted`, title: "Đã gửi hồ sơ ứng tuyển", message: "Bạn đã ứng tuyển React Developer.", type: "application_submitted", path: `/jobs/${jobId}`, createdAt: new Date().toISOString(), isRead: false }] };
  const { page, errors } = await openPage("candidate", state);
  try {
    await page.goto(baseUrl);
    await page.waitForSelector('.notification-bell[aria-label="Thông báo, 1 chưa đọc"]');
    await page.click(".notification-bell");
    await page.waitForSelector(".notification-item--unread", { visible: true });
    await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {}))));
    await page.click(".notification-item");
    await page.waitForFunction((id) => location.pathname === `/jobs/${id}`, {}, jobId);
    assert.equal(state.notifications[0].isRead, true);
    await page.reload();
    await page.waitForSelector('.notification-bell[aria-label="Thông báo"]');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("notifications support mark all read and empty/error states", async () => {
  const state = { notifications: [{ eventId: `${jobId}:submitted`, title: "Đã gửi hồ sơ", message: "React Developer", path: `/jobs/${jobId}`, createdAt: new Date().toISOString(), isRead: false }] };
  const { page, errors } = await openPage("candidate", state);
  try {
    await page.goto(baseUrl);
    await page.waitForSelector('.notification-bell[aria-label="Thông báo, 1 chưa đọc"]');
    await page.click(".notification-bell");
    await page.waitForSelector(".notification-item--unread");
    await page.click(".notification-panel__header button");
    await page.waitForSelector('.notification-bell[aria-label="Thông báo"]');
    assert.equal(state.notifications[0].isRead, true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
  const failedState = { failNotifications: true };
  const failed = await openPage("candidate", failedState);
  try {
    await failed.page.goto(baseUrl);
    await failed.page.waitForSelector(".notification-bell");
    await failed.page.click(".notification-bell");
    await failed.page.waitForFunction(() => document.body.innerText.includes("Chưa tải được thông báo"));
    failedState.failNotifications = false;
    await failed.page.click(".notification-panel .ant-alert-action button");
    await failed.page.waitForFunction(() => document.body.innerText.includes("Bạn chưa có thông báo"));
    await failed.page.setViewport({ width: 375, height: 812 });
    await failed.page.waitForFunction(() => {
      const rect = document.querySelector(".notification-panel").getBoundingClientRect();
      return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth;
    });
    assert.deepEqual(failed.errors, []);
  } finally { await failed.page.close(); }
});

test("employer notification opens the applications tab with the job filter", async () => {
  const state = { notifications: [{ eventId: `${jobId}:received`, title: "Hồ sơ ứng tuyển mới", message: "Candidate đã ứng tuyển React Developer.", path: `/employer/dashboard?tab=applications&jobId=${jobId}&applicationId=${jobId}`, createdAt: new Date().toISOString(), isRead: false }] };
  const { page, errors } = await openPage("employer", state);
  try {
    await page.goto(`${baseUrl}/employer/dashboard`);
    await page.waitForSelector('.notification-bell[aria-label="Thông báo, 1 chưa đọc"]');
    await page.click(".notification-bell");
    await page.waitForSelector(".notification-item", { visible: true });
    await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {}))));
    await page.click(".notification-item");
    await page.waitForFunction(() => location.search.includes("tab=applications"));
    await page.waitForFunction(() => document.querySelector('.ant-tabs-tab-active')?.innerText.includes("Hồ sơ ứng viên"));
    assert.equal(state.notifications[0].isRead, true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("logout calls the server and signs out another open tab", async () => {
  const state = {};
  const first = await openPage("candidate", state);
  const second = await openPage("candidate");
  try {
    await first.page.bringToFront();
    await first.page.goto(baseUrl);
    await first.page.waitForSelector(".app-header__user");
    await second.page.bringToFront();
    await second.page.goto(`${baseUrl}/profile`);
    await second.page.waitForSelector(".profile-name");
    await first.page.bringToFront();
    await first.page.click(".app-header__user");
    await first.page.waitForSelector(".ant-dropdown-menu-item-danger");
    await first.page.click(".ant-dropdown-menu-item-danger");
    await first.page.waitForSelector(".app-header__btn-login");
    await second.page.bringToFront();
    await second.page.waitForFunction(() => location.pathname === "/login");
    assert.equal(state.logoutCalls, 1);
    assert.equal(await second.page.evaluate(() => localStorage.getItem("token")), null);
    assert.deepEqual([...first.errors, ...second.errors], []);
  } finally { await first.page.close(); await second.page.close(); }
});

test("successful password change clears the session and opens login", async () => {
  const state = {};
  const { page, errors } = await openPage("candidate", state);
  try {
    await page.goto(`${baseUrl}/profile`);
    await page.waitForSelector(".profile-card-actions button:nth-child(2)");
    await page.click(".profile-card-actions button:nth-child(2)");
    await page.waitForSelector("#oldPassword");
    await page.waitForFunction(() => document.querySelector(".ant-modal")?.getAnimations({ subtree: true }).every((animation) => animation.playState !== "running"));
    await page.type("#oldPassword", "oldpassword123");
    await page.type("#newPassword", "newpassword456");
    await page.type("#confirmNewPassword", "newpassword456");
    await page.click('.ant-modal button[type="submit"]');
    try { await page.waitForFunction(() => location.pathname === "/login", { timeout: 5000 }); }
    catch {
      const detail = await page.evaluate(() => ({ path: location.pathname,
        validation: [...document.querySelectorAll(".ant-form-item-explain-error")].map((node) => node.textContent),
        inputLengths: [...document.querySelectorAll(".ant-modal input")].map((node) => ({ id: node.id, length: node.value.length })),
        messages: [...document.querySelectorAll(".ant-message-notice-content")].map((node) => node.textContent),
      }));
      throw new Error(JSON.stringify({ passwordChanged: state.passwordChanged, ...detail }));
    }
    assert.equal(state.passwordChanged, true);
    assert.equal(await page.evaluate(() => localStorage.getItem("token")), null);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("changing the default CV reloads the server selection and shows one badge", async () => {
  const state = { cvs: [
    { _id: jobId, name: "First CV", type: "created", template: "modern", isDefault: true, updatedAt: new Date().toISOString(), downloads: 0, views: 0, data: {} },
    { _id: recruiterId, name: "Second CV", type: "created", template: "modern", isDefault: false, updatedAt: new Date().toISOString(), downloads: 0, views: 0, data: {} },
  ] };
  const { page, errors } = await openPage("candidate", state);
  try {
    await page.goto(`${baseUrl}/cv`);
    await page.waitForSelector('[aria-label="Đặt Second CV làm CV mặc định"]');
    await page.click('[aria-label="Đặt Second CV làm CV mặc định"]');
    await page.waitForFunction(() => document.querySelector(".cv-card--default .cv-card__name")?.textContent === "Second CV");
    assert.equal((await page.$$(".cv-card__default-badge")).length, 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("an old in-flight 401 cannot clear a newer login session", async () => {
  const state = { holdNotifications: true };
  const { page, errors } = await openPage("candidate", state);
  try {
    await page.goto(baseUrl);
    await page.waitForSelector(".notification-bell");
    assert.equal(typeof state.releaseUnauthorized, "function");
    await page.evaluate(() => localStorage.setItem("token", "new-session-token"));
    const completed = page.waitForResponse((response) => new URL(response.url()).pathname === "/notifications" && response.status() === 401);
    await state.releaseUnauthorized();
    await completed;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => localStorage.getItem("token")), "new-session-token");
    assert.equal(new URL(page.url()).pathname, "/");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
