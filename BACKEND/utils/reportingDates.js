const DAY_MS = 86400000;
const OFFSET_MS = 7 * 3600000;
const vietnamDayStart = (now = new Date()) => new Date(Math.floor((now.getTime() + OFFSET_MS) / DAY_MS) * DAY_MS - OFFSET_MS);
const dayKey = (date) => new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 10);
const applicationDays = (rows, now = new Date(), days = 12) => {
  const counts = new Map(rows.map((row) => [row._id, row.count]));
  const today = vietnamDayStart(now);
  return Array.from({ length: days }, (_, index) => {
    const key = dayKey(new Date(today.getTime() - (days - 1 - index) * DAY_MS));
    return { date: `${key.slice(8, 10)}/${key.slice(5, 7)}`, key, count: counts.get(key) || 0 };
  });
};

module.exports = { DAY_MS, vietnamDayStart, applicationDays };
