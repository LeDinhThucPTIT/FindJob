const { test } = require("node:test");
const assert = require("node:assert/strict");
const { vietnamDayStart, applicationDays } = require("../utils/reportingDates");

test("Vietnam reporting day begins at 17:00 UTC the previous day", () => {
  assert.equal(vietnamDayStart(new Date("2026-10-21T18:00:00Z")).toISOString(), "2026-10-21T17:00:00.000Z");
});

test("chart has 12 zero-filled calendar days across month boundary", () => {
  const result = applicationDays([{ _id: "2026-10-01", count: 3 }], new Date("2026-10-01T18:00:00Z"));
  assert.equal(result.length, 12);
  assert.equal(result[0].key, "2026-09-21");
  assert.deepEqual(result.at(-1), { key: "2026-10-02", date: "02/10", count: 0 });
  assert.equal(result.at(-2).count, 3);
  assert.equal(result.reduce((sum, row) => sum + row.count, 0), 3);
});
