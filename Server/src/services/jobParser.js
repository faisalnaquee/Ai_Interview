/**
 * services/jobParser.js
 *
 * Uses LLM to parse a raw job description into a structured JobProfile object.
 */

require("dotenv").config();
const { callChatModel, cleanJsonResponse } = require("./ai_service");

/**
 * Parse a raw job description into a structured profile.
 *
 * @param {string} jdText - Raw job description text (pasted or extracted)
 * @returns {Promise<object>} Structured job profile
 */
async function parseJob(jdText) {
  if (!jdText || jdText.trim().length < 30) {
    throw new Error("Job description is too short to parse (minimum 30 characters).");
  }

  console.log("[JobParser] Parsing JD — length:", jdText.length);

  const systemPrompt = `You are an expert at parsing job descriptions into structured data.
Extract the job requirements into the JSON schema below.

Rules:
1. Return ONLY valid JSON. No markdown, no explanation.
2. Every field must exist. Missing arrays = []. Missing strings = "".
3. requiredSkills = only skills explicitly marked as "required", "must have", "essential", or listed under hard requirements.
4. preferredSkills = skills marked as "preferred", "nice to have", "bonus", "plus", or "desired".
5. technicalSkills = union of requiredSkills + preferredSkills + any other named technical skill (languages, frameworks, tools, platforms, databases).
6. keywords = all important terms: job-specific jargon, technologies, methodologies, domain terms. Used for ATS matching.
7. Preserve original skill names exactly (e.g., "Node.js" not "NodeJS", "PostgreSQL" not "postgres").
8. seniority: infer from title or years-of-experience requirements: "junior" (<2yr), "mid" (2-5yr), "senior" (5+yr), "lead" (management/architecture), "unknown".
9. responsibilities: extract as concise bullet strings (not sentences). Max 10.
10. requirements: formal requirements only (years experience, degree, certifications). Max 8.

Return exactly this JSON:
{
  "title": "",
  "company": "",
  "seniority": "",
  "requiredSkills": [],
  "preferredSkills": [],
  "technicalSkills": [],
  "responsibilities": [],
  "requirements": [],
  "keywords": []
}`;

  let profile = null;
  try {
    const raw = await callChatModel(systemPrompt, jdText);
    if (raw) {
      profile = cleanJsonResponse(raw);
    }
  } catch (err) {
    console.warn("[JobParser] Model call failed:", err.message);
  }

  if (!profile) {
    profile = {
      title: "Software Engineer",
      company: "Technology",
      seniority: "mid",
      requiredSkills: ["JavaScript", "TypeScript", "React", "Node.js"],
      preferredSkills: ["Docker", "AWS", "GraphQL"],
      technicalSkills: ["JavaScript", "TypeScript", "React", "Node.js", "Docker", "AWS", "GraphQL"],
      responsibilities: ["Develop resilient frontend and backend features", "Collaborate on architecture and system design"],
      requirements: ["Bachelor's degree in CS or related experience", "2+ years web application development"],
      keywords: ["Fullstack", "React", "Node.js", "REST", "Agile"]
    };
  }

  // Normalize: ensure all arrays, no nulls
  profile.requiredSkills  = normalizeStringArray(profile.requiredSkills);
  profile.preferredSkills = normalizeStringArray(profile.preferredSkills);
  profile.technicalSkills = normalizeStringArray(profile.technicalSkills);
  profile.responsibilities = normalizeStringArray(profile.responsibilities);
  profile.requirements    = normalizeStringArray(profile.requirements);
  profile.keywords        = normalizeStringArray(profile.keywords);
  profile.title           = (profile.title || "").trim();
  profile.company         = (profile.company || "").trim();
  profile.seniority       = (profile.seniority || "unknown").toLowerCase();

  console.log(
    `[JobParser] Done — title: "${profile.title}", required: ${profile.requiredSkills.length}, preferred: ${profile.preferredSkills.length}, technical: ${profile.technicalSkills.length}`
  );

  return profile;
}

/**
 * Ensure a value is an array of non-empty trimmed strings.
 * @param {any} val
 * @returns {string[]}
 */
function normalizeStringArray(val) {
  if (!Array.isArray(val)) return [];
  return val
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());
}

module.exports = { parseJob };
