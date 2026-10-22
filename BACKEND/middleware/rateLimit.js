// Single-process limiter. Use a shared store before running multiple API instances.
const rateLimit = ({ windowMs, max, key = (req) => req.ip }) => {
  const buckets = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [id, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(id);
  }, Math.min(windowMs, 60000));
  timer.unref();

  return (req, res, next) => {
    const now = Date.now();
    const id = key(req);
    let bucket = buckets.get(id);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(id, bucket);
    }
    if (++bucket.count > max) {
      res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ message: "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau." });
    }
    next();
  };
};

module.exports = rateLimit;
