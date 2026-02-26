const express = require("express");
const cors = require("cors");
const app = express();

// Middleware
const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
app.use(cors({
    origin: [frontendUrl, "http://localhost:3000"],
    credentials: true
}));
app.use(express.json());

// Global Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`,
        req.headers.authorization ? "Auth: YES" : "Auth: NO",
        "Origin:", req.headers.origin || "None");
    next();
});

// Routes
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const teamRoutes = require("./routes/team.routes");
const gameRoutes = require("./routes/game.routes");

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/game", gameRoutes);

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

module.exports = app;