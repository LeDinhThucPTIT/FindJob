const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateScoreResult } = require("../utils/scoreValidation");
const { scoreCV } = require("../controllers/cvscoreController");

const validResult = () => ({
  overallScore: 75, grade: "B+", summary: "Nhận xét",
  sections: Object.fromEntries(["format", "experience", "skills", "education", "presentation", "ats_compatibility"].map((key) => [key, { score: 75, details: "Chi tiết" }])),
  strengths: ["Điểm mạnh"], weaknesses: [], tips: [], improvementPriority: [],
  keywords: { found: ["React"], missing: [] }, jobMatch: null,
  hiringChance: "Trung bình", estimatedSalary: "Tham khảo",
});

test("valid AI response passes validation", () => {
  assert.equal(validateScoreResult(validResult()).overallScore, 75);
});

for (const [label, mutate] of [
  ["out of range score", (result) => result.overallScore = 101],
  ["non numeric section", (result) => result.sections.skills.score = "75"],
  ["missing section", (result) => delete result.sections.format],
  ["invalid list", (result) => result.tips = "text"],
  ["objects in rendered text", (result) => result.strengths = [{}]],
  ["invalid match", (result) => result.jobMatch = -10],
]) {
  test(`rejects ${label} from AI`, () => {
    const result = validResult(); mutate(result);
    assert.throws(() => validateScoreResult(result), /INVALID_AI_RESPONSE/);
  });
}

test("scoring rejects invalid input before calling provider", async () => {
  for (const body of [{ cvText: {} }, { cvText: "x".repeat(40001) }, { cvText: "x".repeat(100), jobDesc: [] }]) {
    const res = { status(code) { this.code = code; return this; }, json() {} };
    await scoreCV({ body }, res);
    assert.equal(res.code, 400);
  }
});
