require("dotenv").config();
const app = require("./app");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
const io = new Server(server, {
    cors: {
        origin: [frontendUrl, "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Socket.IO connection handling
io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join_team", (teamId) => {
        socket.join(`team_${teamId}`);
        console.log(`Socket ${socket.id} joined team_${teamId}`);
    });

    socket.on("join_admin", () => {
        socket.join("admin");
        console.log(`Socket ${socket.id} joined admin room`);
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

// Make io accessible to routes
app.set("io", io);

// Database Migration & Initialization
const db = require("./db");
const runMigrations = async () => {
    try {
        console.log("Running database migrations...");
        // Add is_leaderboard_published if it doesn't exist
        await db.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='game_state' AND column_name='is_leaderboard_published') THEN
                    ALTER TABLE game_state ADD COLUMN is_leaderboard_published BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
        `);

        // Ensure game_state row exists
        await db.query(`
            INSERT INTO game_state (id, total_rounds, round_duration, sabotage_duration, sabotage_cooldown, sabotage_same_person_cooldown, game_status)
            VALUES (1, 4, 600, 60, 120, 300, 'not_started')
            ON CONFLICT (id) DO NOTHING;
        `);
        console.log("Migrations completed.");

        // Add entry_code column to gold_bars if it doesn't exist
        await db.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='gold_bars' AND column_name='entry_code') THEN
                    ALTER TABLE gold_bars ADD COLUMN entry_code VARCHAR(6) UNIQUE;
                END IF;
            END $$;
        `);

        // Backfill entry_code for any existing gold bars that don't have one
        const missingCodes = await db.query("SELECT id FROM gold_bars WHERE entry_code IS NULL");
        for (const row of missingCodes.rows) {
            let code, exists = true;
            while (exists) {
                code = String(Math.floor(100000 + Math.random() * 900000));
                const check = await db.query("SELECT id FROM gold_bars WHERE entry_code = $1", [code]);
                exists = check.rows.length > 0;
            }
            await db.query("UPDATE gold_bars SET entry_code = $1 WHERE id = $2", [code, row.id]);
        }
        if (missingCodes.rows.length > 0) {
            console.log(`Backfilled entry_code for ${missingCodes.rows.length} gold bars.`);
        }

        // Pre-warm Firebase token verification key cache with a dummy call
        // This avoids a cold-start timeout on the first real user login
        const admin = require("./config/firebase");
        admin.auth().verifyIdToken("warmup").catch(() => {
            console.log("Firebase key cache pre-warmed (expected error on dummy token).");
        });
    } catch (err) {
        console.error("Migration error:", err);
    }
};

server.listen(PORT, async () => {
    await runMigrations();
    console.log(`Server running on port ${PORT}`);
});