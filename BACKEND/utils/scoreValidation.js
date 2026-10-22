const SECTION_KEYS = ["format", "experience", "skills", "education", "presentation", "ats_compatibility"];
const isScore = (value) => Number.isInteger(value) && value >= 0 && value <= 100;
const isText = (value) => typeof value === "string" && value.length > 0 && value.length <= 5000;
const isTextList = (value) => Array.isArray(value) && value.length <= 30 && value.every(isText);

const validateScoreResult = (value) => {
  if (!value || !isScore(value.overallScore) || !["A+", "A", "B+", "B", "C+", "C", "D"].includes(value.grade) ||
      !isText(value.summary) || !SECTION_KEYS.every((key) => isScore(value.sections?.[key]?.score) && isText(value.sections[key].details)) ||
      !["strengths", "weaknesses", "tips", "improvementPriority"].every((key) => isTextList(value[key])) ||
      !isTextList(value.keywords?.found) || !isTextList(value.keywords?.missing) ||
      !(value.jobMatch === null || isScore(value.jobMatch)) ||
      !["Cao", "Khá cao", "Trung bình", "Thấp"].includes(value.hiringChance) || !isText(value.estimatedSalary)) {
    throw new Error("INVALID_AI_RESPONSE");
  }
  return value;
};

module.exports = { validateScoreResult };
