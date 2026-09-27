const mongoose = require("mongoose");
const dns = require("dns");

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignore in restricted environments
}

// CRITICAL: fail fast, don't hang when DB is offline
mongoose.set("bufferCommands", false);

async function connectDb() {
  const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!mongoUrl) {
    console.warn("[DB] No MONGO_URL configured. App will run with resilient fallback mode.");
    return;
  }

  try {
    await mongoose.connect(mongoUrl, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log("[DB] Connected to MongoDB");

    mongoose.connection.on("error", (err) => {
      console.error("[DB] Mongoose connection error:", err.message);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("[DB] Mongoose connection disconnected");
    });
  } catch (error) {
    console.warn("[DB] Could not connect to MongoDB:", error.message);
    // Do NOT exit process so server and frontend remain available
  }
}

module.exports = connectDb;
