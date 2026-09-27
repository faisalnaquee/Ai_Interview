/**
 * agent/orchestrator.js
 *
 * Assessment Agent Orchestrator — Phase 2.
 *
 * LIFECYCLE:
 *   PREREQUISITES  → deterministic: resume + JD + GitHub discovery
 *   INVESTIGATE    → LLM-directed: inspect repos, then classify + gap analysis
 *   PREPARE_INTERVIEW → build verificationContext from evidence
 *   AWAITING_INTERVIEW → pause. Existing Gemini Live system takes over.
 *   EVALUATE_AND_REPORT → post-interview batch evaluation + scoring + reports (Phase 4)
 *   COMPLETED
 *
 * RULES:
 *   - The LLM never mutates state. applyToolResult() is the only mutation boundary.
 *   - LLM decisions are constrained to the current stage's allowed tool set.
 *   - Prerequisites run deterministically — no LLM call decides whether to parse a resume.
 *   - maxSteps is a safety net. Normal termination is through stage logic.
 *   - Checkpoints are saved at meaningful boundaries only.
 *   - GitHub failures degrade gracefully; resume/JD failures are fatal.
 *   - Each failed tool is retried once before escalation.
 *
 * INTEGRATION BOUNDARY WITH EXISTING INTERVIEW SYSTEM:
 *   The orchestrator writes verificationContext to the Assessment doc and creates
 *   an Interview document (via existing interviewModel). The existing Gemini Live
 *   WebSocket then picks up the Interview doc and runs the conversation.
 *   The orchestrator does NOT open WebSockets or touch GeminiLive.
 */

"use strict";

require("dotenv").config();

const Groq = require("groq-sdk");

// ── Phase 1 services (reused, not duplicated) ──────────────────────────────────
const { parseJob }                           = require("../services/jobParser");
const { parseResume: parseResumeAI }         = require("../services/ai_service");
const { normalizeCandidateProfile }            = require("../services/profile.service");
const { discoverRepositories, inspectRepository } = require("../services/github");
const { classifyEvidence, extractClaimsFromProfile } = require("../services/evidenceEngine");
const { analyzeGaps }                        = require("../services/gapAnalysis");
const { calculate: calculateScore }          = require("../services/readinessScore");

// ── Models ─────────────────────────────────────────────────────────────────────
const Assessment  = require("../model/assessment.model");
const Resume      = require("../model/resume.model");
const InterviewModel = require("../model/interview.model");

// ── Agent state ────────────────────────────────────────────────────────────────
const {
  createInitialState,
  applyToolResult,
  getStateSummary,
  shouldSaveCheckpoint,
  buildMongoUpdate,
} = require("./state");

// ── LLM client ─────────────────────────────────────────────────────────────────
let groq = null;
if (process.env.GROK_API_KEY) {
  try {
    groq = new Groq({ apiKey: process.env.GROK_API_KEY });
  } catch (e) {
    console.warn("[Orchestrator] Groq init warning:", e.message);
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────
const DEFAULT_MAX_STEPS   = 15;   // absolute ceiling for the entire run
const MAX_REPO_INSPECTIONS = 4;   // LLM may inspect at most this many repos
const LLM_MODEL           = "openai/gpt-oss-120b";

// ── Stage definitions ──────────────────────────────────────────────────────────
const STAGE = {
  PREREQUISITES:      "PREREQUISITES",
  INVESTIGATE:        "INVESTIGATE",
  PREPARE_INTERVIEW:  "PREPARE_INTERVIEW",
  AWAITING_INTERVIEW: "AWAITING_INTERVIEW",
  EVALUATE_AND_REPORT: "EVALUATE_AND_REPORT",
  COMPLETED:          "COMPLETED",
  ERROR:              "ERROR",
};

// ── Tool definitions the LLM can pick from (INVESTIGATE stage only) ────────────
const INVESTIGATE_TOOLS = [
  {
    name: "inspect_github_repo",
    description: "Deeply inspect a single GitHub repository to find evidence for candidate skills. Returns language breakdown, package.json dependencies, README summary, and notable files.",
    parameters: {
      type: "object",
      properties: {
        repoName: {
          type: "string",
          description: "The repository name (not full_name) to inspect.",
        },
        reason: {
          type: "string",
          description: "Why this repo is relevant to the candidate's claims.",
        },
      },
      required: ["repoName", "reason"],
    },
  },
  {
    name: "finish_investigation",
    description: "Signal that enough evidence has been gathered to proceed to classification. Call this when you have inspected the most relevant repositories or when no GitHub is available.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief explanation of why investigation is complete.",
        },
      },
      required: ["reason"],
    },
  },
];

// ── Main exported function ─────────────────────────────────────────────────────

/**
 * Run the assessment agent for a given Assessment document.
 *
 * Can be called fresh (new run) or resumed from a persisted agentState.
 *
 * @param {object} options
 * @param {string}  options.assessmentId    - MongoDB Assessment._id
 * @param {string}  options.userId          - Clerk userId
 * @param {string}  options.jobRawText      - Raw job description text
 * @param {string}  [options.githubUrl]     - Optional GitHub profile URL
 * @param {string}  [options.resumeId]      - Existing Resume._id (if already parsed)
 * @param {object}  [options.resumeFile]    - Multer file object (if new upload)
 * @param {object}  [options.persistedState] - Restore from saved agentState (resume after restart)
 * @param {number}  [options.maxSteps]      - Override default step limit
 */
function _transitionStage(state, newStage) {
  if (state._stage && state._stage !== newStage) {
    console.log(`\n[STAGE] ${state._stage} -> ${newStage}`);
  }
  state._stage = newStage;
}

async function runAssessment({
  assessmentId,
  userId,
  jobRawText,
  githubUrl   = null,
  resumeId    = null,
  resumeFile  = null,
  persistedState = null,
  maxSteps    = DEFAULT_MAX_STEPS,
}) {
  console.log(`\n[ASSESSMENT] Starting | id=${assessmentId}`);

  // ── Restore or create state ──────────────────────────────────────────────────
  let state;
  if (persistedState && persistedState.assessmentId === assessmentId) {
    state = persistedState;
    console.log(`[ASSESSMENT] Resumed | stage=${state._stage} | step=${state.agent.stepCount}`);
  } else {
    state = createInitialState({ assessmentId, userId, jobRawText, githubUrl, resumeId, maxSteps });
    _transitionStage(state, STAGE.PREREQUISITES); // internal stage tracker
  }

  // Mark active status in MongoDB immediately
  const activeStatus = state._stage === STAGE.EVALUATE_AND_REPORT ? "evaluating" : "running";
  await Assessment.findByIdAndUpdate(assessmentId, {
    $set: {
      status: activeStatus,
      ...(state._stage === STAGE.PREREQUISITES ? { startedAt: new Date() } : {})
    },
  });
  state.status = activeStatus;

  try {
    // ── Stage machine ──────────────────────────────────────────────────────────
    while (state._stage !== STAGE.AWAITING_INTERVIEW &&
           state._stage !== STAGE.COMPLETED &&
           state._stage !== STAGE.ERROR) {

      // Safety: absolute maxSteps guard (allow +5 steps for deterministic post-LLM stages)
      if (state.agent.stepCount >= state.agent.maxSteps + 5) {
        await _failAssessment(state, "max_steps_reached", `Step limit (${state.agent.maxSteps + 5}) reached at stage ${state._stage}`);
        return;
      }

      switch (state._stage) {
        case STAGE.PREREQUISITES:
          await _runPrerequisites(state, { resumeFile, userId });
          break;

        case STAGE.INVESTIGATE:
          await _runInvestigation(state);
          break;

        case STAGE.PREPARE_INTERVIEW:
          await _runPrepareInterview(state, userId);
          break;

        case STAGE.EVALUATE_AND_REPORT:
          await _runEvaluateAndReport(state, userId);
          break;

        default:
          throw new Error(`[Orchestrator] Unknown stage: ${state._stage}`);
      }
    }

    if (state._stage === STAGE.COMPLETED) {
      console.log(`\n[ASSESSMENT] Completed | id=${assessmentId}`);
    }

  } catch (err) {
    console.error(`\n[ERROR] Fatal error in assessment ${assessmentId}: ${err.message}`);
    await _failAssessment(state, "error", err.message);
  }
}

// ── STAGE: PREREQUISITES ───────────────────────────────────────────────────────

/**
 * Deterministic prerequisite collection.
 * No LLM decisions. Run all three sequentially. Fail fast on critical errors.
 * GitHub failure is non-critical — degrades gracefully.
 */
async function _runPrerequisites(state, { resumeFile, userId }) {
  console.log(`[Orchestrator][PREREQUISITES] Starting step ${state.agent.stepCount}`);

  // ── 1. Parse resume ──────────────────────────────────────────────────────────
  if (!state.resume.parsed) {
    state.agent.stepCount++;
    await _runTool(state, "parse_resume", {}, async () => {
      let profile;

      if (state.resume.resumeId) {
        // Load existing resume from MongoDB (user reusing saved resume)
        const resumeDoc = await Resume.findById(state.resume.resumeId);
        if (!resumeDoc) throw new Error(`Resume ${state.resume.resumeId} not found in DB`);
        profile = resumeDoc.candidateProfile;
        console.log(`[ACTION] Parse Resume | status=success | loaded_existing=true`);
      } else if (resumeFile) {
        // Parse new upload
        const extractResumeText = require("../services/resume");
        const rawText = await extractResumeText(resumeFile);
        const parsed = await parseResumeAI(rawText);
        profile = normalizeCandidateProfile(parsed);

        // Save to MongoDB (upsert — one resume per user)
        const savedResume = await Resume.findOneAndUpdate(
          { userId },
          { $set: { userId, candidateProfile: profile, originalFile: { name: resumeFile.originalname } } },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );
        return { profile, resumeId: savedResume._id.toString() };
      } else {
        // Last resort: look up most recent resume for this user
        const resumeDoc = await Resume.findOne({ userId }).sort({ createdAt: -1 });
        if (!resumeDoc) throw new Error("No resume provided and no saved resume found for this user.");
        profile = resumeDoc.candidateProfile;
        console.log(`[ACTION] Parse Resume | status=success | using_latest=true`);
        return { profile, resumeId: resumeDoc._id.toString() };
      }

      return { profile };
    }, { critical: true });

    if (state._stage === STAGE.ERROR) return;
  }

  // ── 2. Parse job description ─────────────────────────────────────────────────
  if (!state.job.parsed) {
    state.agent.stepCount++;
    await _runTool(state, "parse_job", {}, async () => {
      const profile = await parseJob(state.job.rawText);
      console.log(`[ACTION] Parse Job Description | status=success`);
      return { profile };
    }, { critical: true });

    if (state._stage === STAGE.ERROR) return;
  }

  // ── 3. Discover GitHub repositories ─────────────────────────────────────────
  if (state.github.available && !state.github.repositories?.length) {
    state.agent.stepCount++;
    await _runTool(state, "discover_github", { url: state.github.url }, async () => {
      try {
        const result = await discoverRepositories(state.github.url);
        console.log(`[ACTION] GitHub Discovery | status=success | repos=${result.repositories?.length ?? 0}`);
        return result; // { username, repositories[] }
      } catch (err) {
        // GitHub failure is non-critical — log and degrade
        console.log(`[ACTION] GitHub Discovery | status=failed | degraded=true | reason=${err.message}`);
        return { username: null, repositories: [], unavailable: true, degraded: true };
      }
    }, { critical: false }); // non-critical — assessment continues without GitHub
  }

  // All prerequisites complete — advance
  // All prerequisites complete — advance
  _transitionStage(state, STAGE.INVESTIGATE);
}

// ── STAGE: INVESTIGATE ─────────────────────────────────────────────────────────

/**
 * LLM-directed investigation.
 * The LLM chooses which repos to inspect, then signals finish_investigation.
 * After LLM finishes, we run deterministic evidence + gap analysis.
 *
 * Stopping conditions (any one terminates the loop):
 *   1. LLM calls finish_investigation
 *   2. inspectionCount reaches MAX_REPO_INSPECTIONS
 *   3. No GitHub available (skip directly to classify)
 *   4. stepCount approaches maxSteps
 */
async function _runInvestigation(state) {
  console.log(`[Orchestrator][INVESTIGATE] Starting — repos available: ${state.github.repositories?.length ?? 0}`);

  const inspections = state.github.inspections || [];
  let investigationDone = false;

  // If no GitHub or no repos — skip directly to classification
  if (!state.github.available || !state.github.repositories?.length) {
    investigationDone = true;
  }

  // LLM investigation loop
  while (!investigationDone) {
    if (state.agent.stepCount >= state.agent.maxSteps) break;
    if (inspections.length >= MAX_REPO_INSPECTIONS) {
      console.log(`[Orchestrator][INVESTIGATE] Max repo inspections (${MAX_REPO_INSPECTIONS}) reached`);
      break;
    }

    state.agent.stepCount++;
    const decision = await _callLLMForInvestigation(state);

    if (!decision) {
      console.warn(`[Orchestrator][INVESTIGATE] LLM returned no decision — ending investigation`);
      break;
    }

    if (decision.tool === "finish_investigation") {
      investigationDone = true;
      break;
    }

    if (decision.tool === "inspect_github_repo") {
      const { repoName, reason } = decision.args;

      // Validate the repo exists in our discovered list
      const repoExists = state.github.repositories.some((r) => r.name === repoName);
      if (!repoExists) {
        continue;
      }

      // Avoid re-inspecting already inspected repos
      const alreadyInspected = inspections.some((i) => i.name === repoName);
      if (alreadyInspected) {
        continue;
      }

      await _runTool(state, "inspect_github_repo", { repoName }, async () => {
        const inspection = await inspectRepository(state.github.username, repoName);
        inspections.push(inspection); // track locally too
        return { inspection };
      }, { critical: false });
    }
  }

  // ── Now run deterministic classification (no LLM) ────────────────────────────
  state.agent.stepCount++;

  // Extract claims from resume profile
  const claims = extractClaimsFromProfile(state.resume.profile);

  await _runTool(state, "analyze_evidence", {}, async () => {
    const result = classifyEvidence(
      claims,
      state.github.inspections || [],
      state.github.available && !state.github.repositories?.every?.((r) => r.unavailable)
    );
    console.log(`[ACTION] Evidence Classification | coverage=${result.coveragePercent}%`);
    return result; // { claims, coveragePercent, summary }
  }, { critical: true });

  if (state._stage === STAGE.ERROR) return;

  // ── Gap analysis (also deterministic) ───────────────────────────────────────
  state.agent.stepCount++;
  await _runTool(state, "identify_gaps", {}, async () => {
    const result = analyzeGaps(state.job.profile, state.evidence.claims);
    console.log(`[ACTION] Gap Analysis | criticalGaps=${result.criticalGaps?.length ?? 0}`);
    return result; // { matchedSkills, skillGaps, criticalGaps, unverifiedClaims, ... }
  }, { critical: true });

  if (state._stage === STAGE.ERROR) return;
  // Transition to PREPARE_INTERVIEW before checkpointing so resumability resumes at the correct stage
  _transitionStage(state, STAGE.PREPARE_INTERVIEW);

  // Save checkpoint after full evidence + gap analysis
  await _saveCheckpoint(state);
}

/**
 * Single LLM call during INVESTIGATE stage.
 * Returns { tool, args } from the LLM's tool choice.
 */
async function _callLLMForInvestigation(state) {
  const summary = getStateSummary(state);

  // Build a compact repo list for the LLM to reason about
  const repoList = (state.github.repositories || []).slice(0, 20).map((r) => ({
    name: r.name,
    language: r.language,
    topics: r.topics?.slice(0, 4) || [],
    description: r.description ? r.description.slice(0, 80) : "",
    isForked: r.isForked,
  }));

  const alreadyInspected = (state.github.inspections || []).map((i) => i.name);
  const candidateSkills  = state.resume.profile?.skills?.slice(0, 20) || [];
  const requiredSkills   = state.job.profile?.requiredSkills?.slice(0, 15) || [];
  const preferredSkills  = state.job.profile?.preferredSkills?.slice(0, 10) || [];

  const systemPrompt = `You are the evidence investigation agent for an AI hiring verification system.

Your job: Decide which GitHub repositories to inspect to find evidence for the candidate's skill claims.

CANDIDATE SKILLS: ${candidateSkills.join(", ")}
JOB REQUIRED SKILLS: ${requiredSkills.join(", ")}
JOB PREFERRED SKILLS: ${preferredSkills.join(", ")}

REPOSITORIES (${repoList.length} available, already inspected: ${alreadyInspected.join(", ") || "none"}):
${JSON.stringify(repoList, null, 2)}

INVESTIGATION BUDGET: You may inspect at most ${MAX_REPO_INSPECTIONS} repositories total.
Already inspected: ${alreadyInspected.length}/${MAX_REPO_INSPECTIONS}

DECISION RULES:
- Skip forked repositories (not original work).
- Prioritize repos whose language/topics match required skills.
- Skip repos that are clearly irrelevant (portfolios when we need backend, etc.).
- Once you have enough evidence for the most important skills, call finish_investigation.
- If no repos look relevant, call finish_investigation immediately.
- Never inspect the same repo twice.

You must call exactly one tool: either inspect_github_repo or finish_investigation.`;

  try {
    if (!groq) {
      return null;
    }
    const response = await groq.chat.completions.create({
      model: LLM_MODEL,
      messages: [{ role: "system", content: systemPrompt }],
      tools: INVESTIGATE_TOOLS.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      tool_choice: "required",
      temperature: 0,
    });

    const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return null;
    }

    let args;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      return null;
    }

    return { tool: toolCall.function.name, args };
  } catch (err) {
    console.error(`[ERROR] LLM call failed: ${err.message}`);
    return null; // Non-fatal — investigation loop will break
  }
}

// ── STAGE: PREPARE_INTERVIEW ───────────────────────────────────────────────────

/**
 * Build verificationContext and create the Interview document.
 * The existing Gemini Live interview will use this context.
 *
 * This stage does NOT run Gemini Live. It prepares data for the existing system.
 */
async function _runPrepareInterview(state, userId) {
  // ── Build verificationContext (deterministic from evidence + gap data) ───────
  const verificationContext = _buildVerificationContext(state);
  console.log(`[ACTION] Prepare Verification Context | status=success`);

  // Apply to state via the mutation boundary
  applyToolResult(state, "synthesize_verification_context", {}, {
    verificationContext,
  });

  // ── Create the Interview document ─────────────────────────────────────────────
  // Reuses the existing Interview model. The WebSocket will load this doc.
  state.agent.stepCount++;

  const jobProfile = state.job.profile;
  const interviewDoc = await InterviewModel.create({
    userId,
    resumeId:        state.resume.resumeId,
    jobTitle:        jobProfile?.title || "",
    company:         "",
    jobDescription:  state.job.rawText?.slice(0, 2000) || "",
    interviewType:   "Technical",
    difficulty:      _difficultyFromGaps(state.gaps.criticalGaps?.length || 0),
    experience:      _seniorityToExperience(jobProfile?.seniority || "mid"),
    // New field — picked up by the existing buildSystemPrompt() extension
    verificationContext,
  });

  console.log(`[INTERVIEW] Created | id=${interviewDoc._id}`);

  // Link the interview to this assessment via the mutation boundary
  applyToolResult(state, "interview_linked", {}, {
    interviewId: interviewDoc._id.toString(),
  });

  _transitionStage(state, STAGE.AWAITING_INTERVIEW);

  // Persist the interview link to MongoDB
  await Assessment.findByIdAndUpdate(state.assessmentId, {
    $set: {
      interviewId:         interviewDoc._id,
      verificationContext,
      status:              "awaiting_interview",
      agentState:          state,
      stepsUsed:           state.agent.stepCount,
    },
  });
}

/**
 * Build a structured verificationContext from the current state.
 * Deterministic — no LLM.
 *
 * Shape:
 * {
 *   targetClaims:      [{ claim, skill, status, priority, suggestedProbe }]
 *   criticalGaps:      [{ skill }]
 *   verifiedStrengths: [{ skill, evidenceStrength }]
 *   evidenceSummary:   string   (injected into Gemini system prompt)
 * }
 */
function _buildVerificationContext(state) {
  const { evidence, gaps } = state;

  // Target claims = UNVERIFIED or CLAIMED claims that the job cares about
  const requiredSkills  = new Set((state.job.profile?.requiredSkills || []).map((s) => s.toLowerCase()));
  const preferredSkills = new Set((state.job.profile?.preferredSkills || []).map((s) => s.toLowerCase()));

  const targetClaims = (gaps.unverifiedClaims || [])
    .slice(0, 5) // Top 5 — interview can't cover everything
    .map((uc, idx) => ({
      claim:     uc.claim,
      skill:     uc.skill,
      status:    uc.status,
      priority:  idx + 1,
      requiredByJob:  uc.requiredByJob,
      preferredByJob: uc.preferredByJob,
      suggestedProbe: _buildProbe(uc.skill, uc.status),
    }));

  // Critical gaps = required skills completely absent from candidate profile
  const criticalGaps = (gaps.criticalGaps || []).slice(0, 5).map((g) => ({
    skill:     g.skill,
    required:  true,
    isMissing: g.isMissing,
  }));

  // Verified strengths = SUPPORTED claims — let the interviewer acknowledge these
  const verifiedStrengths = (evidence.claims || [])
    .filter((c) => c.status === "SUPPORTED" || c.status === "PARTIALLY")
    .sort((a, b) => b.evidenceStrength - a.evidenceStrength)
    .slice(0, 5)
    .map((c) => ({
      skill:           c.skill,
      evidenceStrength: c.evidenceStrength,
      status:          c.status,
    }));

  // Evidence summary — plain text injected into the Gemini system prompt
  const supported    = (evidence.summary?.SUPPORTED    || 0);
  const partially    = (evidence.summary?.PARTIALLY    || 0);
  const unverified   = (evidence.summary?.UNVERIFIED   || 0);
  const claimed      = (evidence.summary?.CLAIMED      || 0);
  const criticalCount = criticalGaps.length;

  const lines = [];
  if (verifiedStrengths.length > 0) {
    lines.push(`Strong GitHub evidence for: ${verifiedStrengths.map((s) => s.skill).join(", ")}.`);
  }
  if (targetClaims.length > 0) {
    lines.push(`Claimed but unverified: ${targetClaims.map((c) => c.skill).join(", ")} — probe these specifically.`);
  }
  if (criticalCount > 0) {
    lines.push(`Critical gaps (completely absent): ${criticalGaps.map((g) => g.skill).join(", ")} — assess whether candidate has exposure.`);
  }
  if (lines.length === 0) {
    lines.push("No specific verification priorities. Conduct a general technical interview.");
  }

  return {
    targetClaims,
    criticalGaps,
    verifiedStrengths,
    evidenceSummary:   lines.join(" "),
    evidenceCoverage:  evidence.coveragePercent || 0,
    generatedAt:       new Date().toISOString(),
  };
}

// ── STAGE: EVALUATE_AND_REPORT ─────────────────────────────────────────────────

async function _runEvaluateAndReport(state, userId) {

  state.agent.stepCount++;

  await _runTool(state, "interview_completed", {}, async () => {
    const interviewDoc = await InterviewModel.findById(state.interview.interviewId);
    if (!interviewDoc) {
      throw new Error(`Interview ${state.interview.interviewId} not found`);
    }
    console.log(`[INTERVIEW] Completed | id=${interviewDoc._id}`);
    return { questions: interviewDoc.interview?.questions || [] };
  }, { critical: true });

  if (state._stage === STAGE.ERROR) return;

  const qna = state.interview.qaTranscript || [];
  
  const { evaluateInterview, generateReports } = require("../services/ai_service");
  
  state.agent.stepCount++;
  
  // Prepare payload for ONE batch LLM evaluation call
  const payload = {
    claims: state.evidence?.claims || [],
    criticalGaps: state.gaps?.criticalGaps || [],
    jobRequirements: state.job?.profile?.requiredSkills || [],
    verificationContext: state.verificationContext || {},
    qna,
  };

  await _runTool(state, "batch_evaluation", {}, async () => {
    const { evaluateInterview } = require("../services/ai_service");
    const qnaCount = qna.length;
    console.log(`[EVALUATION] questions=${qnaCount} | llmCall=1`);
    const evaluation = await evaluateInterview(payload);
    console.log(`[EVALUATION] Completed`);
    return evaluation; 
  }, { critical: true });


  if (state._stage === STAGE.ERROR) return;

  const evaluation = {
    interviewPerformance: state.interview.interviewPerformance,
    claimVerifications: state.interview.evaluations,
    // Provide other fields that readinessScore might not strictly need, but are good to pass through
  };

  // Deterministic Readiness Score
  const scoreResult = calculateScore({
    gapResult: state.gaps, 
    evidenceClaims: state.evidence.claims || [],
    interviewEvaluations: evaluation
  });

  const readinessScoreTotal = scoreResult.total;

  state.agent.stepCount++;
  
  // Build final reports payload
  const reportPayload = {
    evaluation: state.interview.batchEvaluation,
    readinessScore: readinessScoreTotal,
    candidateProfile: state.resume.profile,
  };
  
  await _runTool(state, "generate_reports", {}, async () => {
      const { generateReports } = require("../services/ai_service");
      const reports = await generateReports(reportPayload);
      console.log(`[REPORT] Generated | score=${readinessScoreTotal}`);
      return reports;
  }, { critical: true });
  
  if (state._stage === STAGE.ERROR) return;

  // Persist the final state
  await Assessment.findByIdAndUpdate(state.assessmentId, {
    $set: {
      status: "completed",
      completedAt: new Date(),
      readinessScore: readinessScoreTotal,
      candidateReport: state.reports.candidateReport,
      hiringReport: state.reports.hiringReport,
      agentState: state,
      stepsUsed: state.agent.stepCount
    }
  });

  _transitionStage(state, STAGE.COMPLETED);
}

/**
 * Generate a concise probe hint for a skill.
 * @param {string} skill
 * @param {string} status
 * @returns {string}
 */
function _buildProbe(skill, status) {
  const probes = {
    "Redis":          "Ask what they cached, TTL strategy, and eviction policy",
    "System Design":  "Ask for a real system they designed — scale, load, trade-offs",
    "Docker":         "Ask how they containerized an app — Dockerfile, compose, multi-stage",
    "Kubernetes":     "Ask about a deployment — pods, services, ingress, resource limits",
    "AWS":            "Ask which services they used and why — not just 'I deployed on AWS'",
    "PostgreSQL":     "Ask about indexing strategy, query optimization, or transactions",
    "MongoDB":        "Ask about schema design decisions and aggregation pipeline usage",
    "TypeScript":     "Ask about a complex type they had to define — generics, utility types",
    "GraphQL":        "Ask about schema design and resolver implementation",
    "Machine Learning": "Ask about a model they built — features, training, evaluation",
  };
  return probes[skill] || `Probe depth of ${skill} knowledge — ask for a real implementation they built`;
}

// ── Tool executor ──────────────────────────────────────────────────────────────

/**
 * Execute a tool with one retry on failure.
 * Applies the result to state via applyToolResult().
 * Saves checkpoint if appropriate.
 *
 * @param {object}   state
 * @param {string}   toolName
 * @param {object}   args
 * @param {Function} executor      - async function that returns the result object
 * @param {object}   opts
 * @param {boolean}  opts.critical - if true, failure transitions to STAGE.ERROR
 */
async function _runTool(state, toolName, args, executor, { critical = false } = {}) {
  let result;
  let attempt = 0;
  const maxAttempts = 2; // one retry

  while (attempt < maxAttempts) {
    attempt++;
    try {
      result = await executor();
      if (!result) result = {};
      break; // success
    } catch (err) {
      console.warn(`[Orchestrator] Tool "${toolName}" attempt ${attempt} failed: ${err.message}`);
      if (attempt >= maxAttempts) {
        result = { error: err.message };
      } else {
        // Brief wait before retry
        await _sleep(500);
      }
    }
  }

  // Apply result (even errors go through applyToolResult for history logging)
  applyToolResult(state, toolName, args, result);
  
  if (result.error) {
    console.log(`[TOOL] ${toolName} | status=error | err=${result.error}`);
  } else {
    // Determine a short summary string if it's inspect_github_repo
    let meta = "";
    if (toolName === "inspect_github_repo" && args.repoName) {
        meta = ` | repo=${args.repoName}`;
    }
    console.log(`[TOOL] ${toolName} | status=success${meta}`);
  }

  // Handle failure after all retries
  if (result.error) {
    if (critical) {
      await _failAssessment(state, "error", `Critical tool "${toolName}" failed: ${result.error}`);
    }
    return;
  }

  // Save checkpoint if this tool warrants one
  if (shouldSaveCheckpoint(state, toolName)) {
    await _saveCheckpoint(state);
  }
}

// ── Checkpoint + Error helpers ─────────────────────────────────────────────────

/**
 * Save the current state to MongoDB.
 * Uses buildMongoUpdate() to produce only the relevant $set payload.
 */
async function _saveCheckpoint(state) {
  try {
    const update = buildMongoUpdate(state);
    // agentState is Mixed — must markModified to trigger Mongoose change detection
    await Assessment.findByIdAndUpdate(state.assessmentId, update);
    console.log(`[CHECKPOINT] saved | stage=${state._stage} | step=${state.agent.stepCount}`);
  } catch (err) {
    // Checkpoint failure is non-fatal — log and continue
    console.error(`[ERROR] Checkpoint save failed: ${err.message}`);
  }
}

/**
 * Transition to error state, persist to MongoDB.
 */
async function _failAssessment(state, statusValue, message) {
  console.error(`\n[ERROR] Assessment ${state.assessmentId} failed: ${message}`);
  state.status = statusValue;
  _transitionStage(state, STAGE.ERROR);
  state.error  = message;

  try {
    await Assessment.findByIdAndUpdate(state.assessmentId, {
      $set: {
        status:       statusValue,
        errorMessage: message,
        stepsUsed:    state.agent.stepCount,
        agentState:   state,
      },
    });
  } catch (err) {
    console.error(`[ERROR] Could not persist failure: ${err.message}`);
  }
}

// ── Utility helpers ────────────────────────────────────────────────────────────

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map number of critical gaps to interview difficulty.
 */
function _difficultyFromGaps(criticalGapCount) {
  if (criticalGapCount === 0) return "Hard";
  if (criticalGapCount <= 2) return "Medium";
  return "Easy";
}

/**
 * Map seniority string to experience range string (matching existing Interview model).
 */
function _seniorityToExperience(seniority) {
  const map = {
    junior: "0-1 years",
    mid:    "1-3 years",
    senior: "5-8 years",
    lead:   "8+ years",
  };
  return map[seniority] || "1-3 years";
}

// ── Resume a paused assessment ─────────────────────────────────────────────────

/**
 * Attempt to resume an assessment that was interrupted.
 * Loads the persisted agentState from MongoDB and re-runs from the current stage.
 *
 * @param {string} assessmentId
 * @returns {Promise<void>}
 */
async function resumeAssessment(assessmentId) {
  const doc = await Assessment.findById(assessmentId);
  if (!doc) throw new Error(`Assessment ${assessmentId} not found`);

  if (doc.status === "completed" || doc.status === "awaiting_interview") {
    return;
  }

  if (!doc.agentState) {
    throw new Error(`Assessment ${assessmentId} has no persisted agentState to resume from`);
  }

  const persistedState = doc.agentState;
  
  // Map "evaluating" DB status back to EVALUATE_AND_REPORT stage
  if (doc.status === "evaluating" && persistedState._stage === STAGE.AWAITING_INTERVIEW) {
      persistedState._stage = STAGE.EVALUATE_AND_REPORT;
  }

  return runAssessment({
    assessmentId,
    userId:         doc.userId,
    jobRawText:     doc.jobRawText,
    githubUrl:      doc.githubUrl,
    resumeId:       doc.resumeId?.toString(),
    persistedState,
  });
}

// ── Exports ────────────────────────────────────────────────────────────────────
module.exports = { runAssessment, resumeAssessment, STAGE };
