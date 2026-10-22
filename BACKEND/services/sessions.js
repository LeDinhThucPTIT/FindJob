const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Employer = require("../models/Employer");
const AuthSession = require("../models/AuthSession");
const { getJwtSecret } = require("../config/security");

const accountModel = (role) => role === "candidate" ? User : role === "employer" ? Employer : null;
const issueSession = async (account) => {
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  const session = await AuthSession.create({ account: account._id, role: account.role, authVersion: account.authVersion || 0, expiresAt });
  return jwt.sign({ id: String(account._id), role: account.role, version: session.authVersion, sid: String(session._id) }, getJwtSecret(), { expiresIn: "7d", algorithm: "HS256" });
};

const validateSession = async (token) => {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
  const Model = accountModel(decoded.role);
  if (!Model || !mongoose.isObjectIdOrHexString(decoded.id) || !mongoose.isObjectIdOrHexString(decoded.sid) || !Number.isInteger(decoded.version)) return null;
  const [account, session] = await Promise.all([
    Model.findById(decoded.id).select("authVersion role").lean(),
    AuthSession.exists({ _id: decoded.sid, account: decoded.id, role: decoded.role, authVersion: decoded.version, expiresAt: { $gt: new Date() } }),
  ]);
  if (!account || !session || account.role !== decoded.role || (account.authVersion || 0) !== decoded.version) return null;
  return decoded;
};

// Password and revocation version change in one write. Concurrent password
// changes cannot silently overwrite a password saved by another request.
const replacePassword = async (account, password) => accountModel(account.role).findOneAndUpdate(
  { _id: account._id, password: account.password },
  { $set: { password }, $inc: { authVersion: 1 } },
  { returnDocument: "after", runValidators: true },
);

module.exports = { accountModel, issueSession, validateSession, replacePassword };
