const express = require("express");
const router = express.Router();
const { completeInterview, startAssessment, getAssessment, listAssessments } = require("../controller/agent.controller");
const { requireAuth } = require('../middleware/auth.middleware');
const multer = require("multer");

const upload = multer({ dest: "uploads/" });

router.post("/assess", requireAuth(), upload.fields([{ name: "resume", maxCount: 1 }, { name: "jdFile", maxCount: 1 }]), startAssessment);
router.get("/assess/me", requireAuth(), listAssessments);
router.get("/assess/:assessmentId", requireAuth(), getAssessment);
router.post("/assess/:assessmentId/interview-complete", requireAuth({ allowInternal: true }), completeInterview);

module.exports = router;
