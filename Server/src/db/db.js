const mongoose = require("mongoose");
const dns = require("dns");

// Ensure reliable DNS SRV resolution for MongoDB Atlas across all ISP routers
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignore if running in restricted environments
}

async function connectDb() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("db is connected");

    mongoose.connection.on("error", (err) => {
      console.error("Mongoose connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("Mongoose connection disconnected");
    });

  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}

module.exports = connectDb;