const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET phải được cấu hình.");
  return process.env.JWT_SECRET;
};

module.exports = { getJwtSecret };
