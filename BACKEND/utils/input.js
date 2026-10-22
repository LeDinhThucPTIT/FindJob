const pick = (source, fields) => Object.fromEntries(
  fields.filter((field) => Object.hasOwn(source || {}, field)).map((field) => [field, source[field]]),
);

const JOB_FIELDS = ["title", "category", "location", "jobType", "experience", "salary", "skills", "description", "benefits", "deadline", "urgent", "status"];
const COMPANY_FIELDS = ["companyName", "logo", "coverImage", "industry", "size", "founded", "location", "address", "website", "phone", "description", "tags", "whyJoin"];
const PUBLIC_COMPANY_FIELDS = "companyName logo coverImage industry size founded location address website phone description tags whyJoin verified rating reviewCount followerCount totalJobs createdAt";
const escapeRegex = (value) => String(value).slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const positiveInteger = (value, fallback, maximum = 100) => {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
};

module.exports = { pick, JOB_FIELDS, COMPANY_FIELDS, PUBLIC_COMPANY_FIELDS, escapeRegex, positiveInteger };
