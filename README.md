# MockHire — Autonomous AI Interview & Candidate Assessment Platform

**MockHire** is an end-to-end AI hiring intelligence platform that evaluates candidate job readiness beyond just bullet points on a resume. It combines automated candidate evidence verification, real-time voice interviews, and deep skill gap analysis to provide objective hiring insights.

## 🚀 Key Features

- 🎙️ **Real-Time Multimodal Voice Interviews**: Conversational AI technical interviews conducted over WebSockets using Google Gemini Live audio streaming.
- 🔍 **GitHub Evidence Engine**: Automatically inspects candidate GitHub repositories (languages, dependencies, commit work, and architecture) to verify claimed technical skills.
- 📄 **ATS Resume & Job Parser**: Parses resumes and job descriptions to map required vs. claimed capabilities with keyword and red-flag analysis.
- 📊 **Deterministic Readiness Scoring**: Calculates weighted job-readiness scores without LLM hallucination based on evidence coverage, critical gaps, and interview performance.
- 📑 **Dual-Report Generation**: Produces targeted **Candidate Feedback Reports** and executive **Hiring Manager Reports**.

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Framer Motion, TanStack Query, Clerk Auth.
- **Backend**: Node.js, Express, WebSockets (`ws`), MongoDB Atlas (Mongoose), Groq SDK.
- **AI Models**: Google Gemini Live API (real-time voice), Groq LPU (structured extraction, evidence reasoning, and reporting).
