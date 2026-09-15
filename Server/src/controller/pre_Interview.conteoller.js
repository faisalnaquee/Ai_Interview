const extractResumeText = require("../services/resume")
const { extractGitHubRepo } = require("../services/github")
const { parseResume } = require("../services/ai_service");
const { normalizeCandidateProfile } = require("../services/profile.service")
const resumeModel = require("../model/resume.model")
const interviewModel = require("../model/interview.model")


async function preInterview(req, res) {
    try {
        const userId = req.auth?.userId || req.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized: Missing user ID. Please check Clerk keys." });
        }

        let resume;

        if (req.file) {
            const resumeText = await extractResumeText(req.file);
            const profile = await parseResume(resumeText);
            const candidateProfile = normalizeCandidateProfile(profile);

            console.log("[PreInterview] parsed profile for:", candidateProfile.name);

            // ✅ Upsert — one resume per user, replaces on new upload
            resume = await resumeModel.findOneAndUpdate(
                { userId },          // find by authenticated clerk user
                {
                    $set: {
                        userId,
                        candidateProfile,
                        originalFile: { name: req.file.originalname },
                    }
                },
                {
                    upsert: true,     // create if doesn't exist
                    returnDocument: 'after',  // return the updated doc
                    setDefaultsOnInsert: true,
                }
            );
        } else {
            // Check if user already has a saved resume (e.g. from ATS)
            resume = await resumeModel.findOne({ userId }).sort({ createdAt: -1 });
            
            if (!resume) {
                return res.status(400).json({ message: "Resume file is required. No saved resume found." });
            }
            console.log("[PreInterview] using existing profile for:", resume.candidateProfile?.name);
        }

        // ── Form Data ────────────────────────────────────────────────────────
        const jobTitle = req.body.jobTitle || "";
        const company = req.body.company || "";
        const jobDescription = req.body.jobDescription || "";
        const interviewType = req.body.interviewType || "Technical";
        const difficulty = req.body.difficulty || "Medium";
        const experience = req.body.experience || "1-3 years";

        // Idempotency / Duplicate protection: Check if a pending interview for this user & job was created in the last 2 minutes
        const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000);
        const existingPending = await interviewModel.findOne({
            userId,
            jobTitle,
            "interview.status": "pending",
            createdAt: { $gte: twoMinsAgo }
        });

        if (existingPending) {
            console.log("[PreInterview] Returning recently created duplicate interview:", existingPending._id);
            return res.status(200).json({ success: true, interview: existingPending, id: existingPending._id });
        }

        const interview = await interviewModel.create({
            resumeId: resume._id,
            userId,
            jobTitle,
            company,
            jobDescription,
            interviewType,
            difficulty,
            experience
        });

        return res.json({ interview, id: interview._id });

    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: err.message });
    }
}

module.exports = preInterview;