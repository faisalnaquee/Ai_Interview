const express = require("express");
const app = express();
const cors = require("cors");
const InterviewRoute = require("./routes/interview.routes");
const atsRoute = require("./routes/atsRoute");
const agentRoute = require("./routes/agent.route");
const cookieParser = require("cookie-parser");

app.use(cors({
    origin: function (origin, callback) {
        // Allow same-origin / non-browser requests
        if (!origin) return callback(null, true);
        
        // Allow localhost and preview cloud domains
        if (
            origin.includes("localhost") ||
            origin.includes("127.0.0.1") ||
            origin.endsWith(".run.app") ||
            origin.endsWith(".vercel.app") ||
            origin.includes("mockhire")
        ) {
            return callback(null, true);
        }
        
        // Permissive fallback in development
        callback(null, true);
    },
    credentials: true
}));

app.use(cookieParser());
app.use(express.json());

const anonymousMiddleware = require("./middleware/anonymous.middleware");
const { generalLimiter } = require("./middleware/rateLimiter");

// Add Clerk middleware safely if secret/publishable key is set
if (process.env.CLERK_SECRET_KEY || process.env.CLERK_PUBLISHABLE_KEY) {
    try {
        const { clerkMiddleware } = require('@clerk/express');
        app.use(clerkMiddleware());
    } catch (err) {
        console.warn("[Clerk] Warning initializing middleware:", err.message);
    }
}

// General API Rate Limiter
app.use(generalLimiter);

// Health check
app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", message: "MockHire API is running" });
});

// Routes
// ATS route remains accessible for guests via anonymous session
app.use("/api/v1/ats", anonymousMiddleware, atsRoute);
app.use("/api/v1/agent", agentRoute);
const { requireAuth } = require('./middleware/auth.middleware');
app.use("/api/v1", requireAuth(), InterviewRoute);

// Database offline fallback error handler
app.use((err, req, res, next) => {
    if (err && (err.name === 'MongooseError' || err.name === 'MongoNetworkError' || (err.message && err.message.includes('buffering timed out')))) {
        console.warn('[DB] Offline fallback triggered:', err.message);
        if (req.method === 'GET') {
            return res.json(req.path.endsWith('s') || req.path.endsWith('s/') ? [] : {});
        }
        return res.status(503).json({ success: false, error: 'Database service temporarily offline' });
    }
    next(err);
});

module.exports = app;
