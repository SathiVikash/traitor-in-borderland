const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

// All game routes require authentication
// Debug logging
router.use((req, res, next) => {
    console.log(`[GameRoutes] ${req.method} ${req.path}`, req.headers.authorization ? "Auth Header Present" : "No Auth Header");
    next();
});

// Get game state (Public)
router.get("/state", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM game_state WHERE id = 1");
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Get game state error:", error);
        res.status(500).json({ message: "Error fetching game state" });
    }
});

// Get leaderboard (Public, follows published toggle)
router.get("/leaderboard", async (req, res) => {
    try {
        const gs = await db.query("SELECT * FROM game_state WHERE id = 1");
        if (gs.rows.length > 0 && gs.rows[0].is_leaderboard_published === false) {
            return res.json([]);
        }

        const result = await db.query(`
            SELECT t.id, t.team_name, t.team_type, t.total_score,
                   COUNT(DISTINCT tm.user_id) as member_count
            FROM teams t
            LEFT JOIN team_members tm ON t.id = tm.team_id
            GROUP BY t.id, t.team_name, t.team_type, t.total_score
            ORDER BY t.total_score DESC, t.team_name ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Get leaderboard error:", error);
        res.status(500).json({ message: "Error fetching leaderboard" });
    }
});

// Get Live Leaderboard (Always public, for spectators)
router.get("/leaderboard/live", async (req, res) => {
    try {
        const result = await db.query(`
            SELECT t.id, t.team_name, t.team_type, t.total_score,
                   COUNT(DISTINCT tm.user_id) as member_count
            FROM teams t
            LEFT JOIN team_members tm ON t.id = tm.team_id
            GROUP BY t.id, t.team_name, t.team_type, t.total_score
            ORDER BY t.total_score DESC, t.team_name ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Get live leaderboard error:", error);
        res.status(500).json({ message: "Error fetching live leaderboard" });
    }
});

// Protected routes below
// Sabotage an innocent team (traitors only)
// Sabotage an innocent team (traitors only)
router.post("/sabotage", verifyToken, async (req, res) => {
    try {
        const { target_team_id } = req.body;
        const userId = req.user.id;
        const io = req.app.get("io");

        // Find user's team
        const teamResult = await db.query(`
            SELECT t.id, t.team_type 
            FROM teams t
            INNER JOIN team_members tm ON t.id = tm.team_id
            WHERE tm.user_id = $1
        `, [userId]);

        if (!teamResult.rows.length) {
            return res.status(404).json({ message: "You are not in a team" });
        }

        const traitorTeam = teamResult.rows[0];

        // Check if user's team is a traitor team
        if (traitorTeam.team_type !== 'traitor') {
            return res.status(403).json({ message: "Only traitors can sabotage" });
        }

        // Check if target team is innocent
        const targetTeamResult = await db.query(
            "SELECT team_type FROM teams WHERE id = $1",
            [target_team_id]
        );

        if (!targetTeamResult.rows.length) {
            return res.status(404).json({ message: "Target team not found" });
        }

        if (targetTeamResult.rows[0].team_type !== 'innocent') {
            return res.status(400).json({ message: "Can only sabotage innocent teams" });
        }

        // Get game settings
        const gameSettings = await db.query("SELECT * FROM game_state WHERE id = 1");

        if (gameSettings.rows.length === 0 || gameSettings.rows[0].game_status !== 'in_progress') {
            return res.status(400).json({ message: "Game round is not in progress" });
        }

        const gameState = gameSettings.rows[0];

        // Restrict sabotage to only after 15 minutes of round start
        const roundStartTime = new Date(gameState.round_start_time);
        const now = new Date();
        const minutesSinceStart = (now - roundStartTime) / 60000;

        if (minutesSinceStart < 15) {
            const remainingMins = Math.ceil(15 - minutesSinceStart);
            return res.status(403).json({
                message: `Traitors can only sabotage after 15 minutes of the game starting. Please wait ${remainingMins} more minute(s).`
            });
        }

        // Check if round time has expired using DB time
        const timeCheck = await db.query(`
            SELECT id FROM game_state 
            WHERE id = 1 AND round_end_time < NOW()
        `);

        if (timeCheck.rows.length > 0) {
            await db.query("UPDATE game_state SET game_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = 1");
            return res.status(400).json({ message: "Round has ended! No more sabotages allowed." });
        }

        const sabotageDuration = gameSettings.rows[0].sabotage_duration;
        const sabotageCooldown = gameSettings.rows[0].sabotage_cooldown;
        const sabotageSamePersonCooldown = gameSettings.rows[0].sabotage_same_person_cooldown;

        // Check cooldown using DB time
        const lastSabotage = await db.query(`
            SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) as seconds_ago 
            FROM sabotages 
            WHERE traitor_team_id = $1 
            ORDER BY created_at DESC 
            LIMIT 1
        `, [traitorTeam.id]);

        if (lastSabotage.rows.length > 0) {
            const secondsAgo = lastSabotage.rows[0].seconds_ago;
            if (secondsAgo < sabotageCooldown) {
                const remainingTime = Math.ceil(sabotageCooldown - secondsAgo);
                return res.status(400).json({
                    message: `You must wait ${remainingTime} seconds before sabotaging again`,
                    remaining_time: remainingTime
                });
            }
        }

        // Check if same person was sabotaged recently
        const lastSabotageOnTarget = await db.query(`
            SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) as seconds_ago
            FROM sabotages 
            WHERE traitor_team_id = $1 
            AND target_team_id = $2
            ORDER BY created_at DESC 
            LIMIT 1
        `, [traitorTeam.id, target_team_id]);

        if (lastSabotageOnTarget.rows.length > 0) {
            const secondsAgo = lastSabotageOnTarget.rows[0].seconds_ago;
            if (secondsAgo < sabotageSamePersonCooldown) {
                const remainingTime = Math.ceil(sabotageSamePersonCooldown - secondsAgo);
                return res.status(400).json({
                    message: `You must wait ${remainingTime} seconds before sabotaging this team again`,
                    remaining_time: remainingTime
                });
            }
        }

        // Check if target is already sabotaged
        const activeSabotage = await db.query(`
            SELECT * FROM sabotages 
            WHERE target_team_id = $1 
            AND is_active = TRUE 
            AND sabotage_end_time > NOW()
        `, [target_team_id]);

        if (activeSabotage.rows.length > 0) {
            return res.status(400).json({ message: "This team is already sabotaged" });
        }

        // Create sabotage using DB time
        const sabotageResult = await db.query(`
            INSERT INTO sabotages (traitor_team_id, target_team_id, sabotage_start_time, sabotage_end_time, is_active)
            VALUES ($1, $2, NOW(), NOW() + ($3 || ' seconds')::interval, TRUE)
            RETURNING *, EXTRACT(EPOCH FROM (sabotage_end_time - NOW())) as duration_seconds
        `, [traitorTeam.id, target_team_id, sabotageDuration]);

        const sabotage = sabotageResult.rows[0];

        // Emit sabotage event to target team
        io.to(`team_${target_team_id}`).emit("sabotaged", {
            sabotage_end_time: sabotage.sabotage_end_time,
            duration: sabotageDuration
        });
        // Emit globally for traitor visibility
        io.emit("sabotage_started_global", {
            target_team_id: target_team_id,
            duration: sabotageDuration,
            traitor_team_id: traitorTeam.id
        });

        // Auto-deactivate sabotage after duration (cleanup)
        setTimeout(async () => {
            await db.query(`
                UPDATE sabotages 
                SET is_active = FALSE 
                WHERE id = $1
            `, [sabotage.id]);

            io.to(`team_${target_team_id}`).emit("sabotage_ended");
            io.emit("sabotage_ended_global", { target_team_id: sabotage.target_team_id });
        }, sabotageDuration * 1000);

        res.json({
            message: "Sabotage successful",
            sabotage_end_time: sabotage.sabotage_end_time,
            duration: sabotageDuration
        });
    } catch (error) {
        console.error("Sabotage error:", error);
        res.status(500).json({ message: "Error performing sabotage" });
    }
});

// Get list of innocent teams (for traitors)
router.get("/innocent-teams", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Check if user is in a traitor team
        const teamResult = await db.query(`
            SELECT t.team_type 
            FROM teams t
            INNER JOIN team_members tm ON t.id = tm.team_id
            WHERE tm.user_id = $1
        `, [userId]);

        if (!teamResult.rows.length) {
            return res.status(404).json({ message: "You are not in a team" });
        }

        if (teamResult.rows[0].team_type !== 'traitor') {
            return res.status(403).json({ message: "Only traitors can view innocent teams" });
        }

        // Get all innocent teams
        const innocentTeams = await db.query(`
            SELECT t.id, t.team_name, t.total_score,
                   COUNT(DISTINCT tm.user_id) as member_count,
                   CASE 
                       WHEN EXISTS (
                           SELECT 1 FROM sabotages s 
                           WHERE s.target_team_id = t.id 
                           AND s.is_active = TRUE 
                           AND s.sabotage_end_time > CURRENT_TIMESTAMP
                       ) THEN TRUE 
                       ELSE FALSE 
                   END as is_sabotaged
            FROM teams t
            LEFT JOIN team_members tm ON t.id = tm.team_id
            WHERE LOWER(t.team_type) = 'innocent'
            GROUP BY t.id, t.team_name, t.total_score
            ORDER BY t.team_name ASC
        `);

        res.json(innocentTeams.rows);
    } catch (error) {
        console.error("Get innocent teams error:", error);
        res.status(500).json({ message: "Error fetching innocent teams" });
    }
});

// Check if my team is sabotaged
router.get("/sabotage-status", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Find user's team
        const teamResult = await db.query(
            "SELECT team_id FROM team_members WHERE user_id = $1",
            [userId]
        );

        if (!teamResult.rows.length) {
            return res.status(404).json({ message: "You are not in a team" });
        }

        const teamId = teamResult.rows[0].team_id;

        // Check for active sabotage
        const sabotageResult = await db.query(`
            SELECT sabotage_end_time 
            FROM sabotages 
            WHERE target_team_id = $1 
            AND is_active = TRUE 
            AND sabotage_end_time > CURRENT_TIMESTAMP
            ORDER BY sabotage_end_time DESC
            LIMIT 1
        `, [teamId]);

        if (sabotageResult.rows.length > 0) {
            res.json({
                is_sabotaged: true,
                sabotage_end_time: sabotageResult.rows[0].sabotage_end_time
            });
        } else {
            res.json({
                is_sabotaged: false
            });
        }
    } catch (error) {
        console.error("Get sabotage status error:", error);
        res.status(500).json({ message: "Error checking sabotage status" });
    }
});

// Get sabotage cooldown info (for traitors)
router.get("/sabotage-cooldown", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Find user's team
        const teamResult = await db.query(`
            SELECT t.id, t.team_type 
            FROM teams t
            INNER JOIN team_members tm ON t.id = tm.team_id
            WHERE tm.user_id = $1
        `, [userId]);

        if (!teamResult.rows.length) {
            return res.status(404).json({ message: "You are not in a team" });
        }

        if (teamResult.rows[0].team_type !== 'traitor') {
            return res.status(403).json({ message: "Only traitors can check sabotage cooldown" });
        }

        const traitorTeamId = teamResult.rows[0].id;

        // Get game settings
        const gameSettings = await db.query("SELECT * FROM game_state WHERE id = 1");

        // Default to 300 seconds if settings missing
        const sabotageCooldown = (gameSettings.rows.length > 0) ? gameSettings.rows[0].sabotage_cooldown : 300;

        // Get last sabotage
        const lastSabotage = await db.query(`
            SELECT created_at FROM sabotages 
            WHERE traitor_team_id = $1 
            ORDER BY created_at DESC 
            LIMIT 1
        `, [traitorTeamId]);

        if (lastSabotage.rows.length > 0) {
            const timeSinceLastSabotage = (new Date() - new Date(lastSabotage.rows[0].created_at)) / 1000;
            const remainingTime = Math.max(0, Math.ceil(sabotageCooldown - timeSinceLastSabotage));

            res.json({
                can_sabotage: remainingTime === 0,
                remaining_time: remainingTime
            });
        } else {
            res.json({
                can_sabotage: true,
                remaining_time: 0
            });
        }
    } catch (error) {
        console.error("Get sabotage cooldown error:", error);
        res.status(500).json({ message: "Error checking sabotage cooldown" });
    }
});

// ─── POLL (Traitor Voting) ──────────────────────────────────────────

// Get current active poll (player view - no vote counts revealed while active)
router.get("/poll/current", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get team and type
        const teamResult = await db.query(`
            SELECT tm.team_id, t.team_type 
            FROM team_members tm
            JOIN teams t ON t.id = tm.team_id
            WHERE tm.user_id = $1
        `, [userId]);
        const myTeamId = teamResult.rows[0]?.team_id || null;
        const myTeamType = teamResult.rows[0]?.team_type || null;

        // Get latest poll
        const pollResult = await db.query(
            "SELECT * FROM polls ORDER BY created_at DESC LIMIT 1"
        );
        if (!pollResult.rows.length) {
            return res.json({ poll: null });
        }
        const poll = pollResult.rows[0];
        const isActive = poll.status === 'active' && new Date(poll.ends_at) > new Date();

        // Check if this team already voted
        let hasVoted = false;
        let myVoteTeamId = null;
        if (myTeamId) {
            const voteCheck = await db.query(
                "SELECT voted_for_team_id FROM poll_votes WHERE poll_id = $1 AND voter_team_id = $2",
                [poll.id, myTeamId]
            );
            hasVoted = voteCheck.rows.length > 0;
            myVoteTeamId = voteCheck.rows[0]?.voted_for_team_id || null;
        }

        // Get all teams to vote for (everyone can vote for any team)
        const teams = await db.query(
            "SELECT id, team_name FROM teams ORDER BY team_name ASC"
        );

        // Only reveal vote counts if poll is completed
        let results = null;
        if (!isActive) {
            const voteCounts = await db.query(`
                SELECT pv.voted_for_team_id, t.team_name, t.team_type,
                       COUNT(*) as vote_count
                FROM poll_votes pv
                JOIN teams t ON t.id = pv.voted_for_team_id
                WHERE pv.poll_id = $1
                GROUP BY pv.voted_for_team_id, t.team_name, t.team_type
                ORDER BY vote_count DESC
            `, [poll.id]);
            results = voteCounts.rows.map(r => ({
                team_id: r.voted_for_team_id,
                team_name: r.team_name,
                team_type: r.team_type,
                vote_count: parseInt(r.vote_count)
            }));
        }

        res.json({
            poll: { ...poll, is_active: isActive },
            teams: teams.rows,
            has_voted: hasVoted,
            my_vote_team_id: myVoteTeamId,
            my_team_id: myTeamId,
            my_team_type: myTeamType,
            results // null while active
        });
    } catch (error) {
        console.error("Get poll error:", error);
        res.status(500).json({ message: "Error fetching poll" });
    }
});

// Cast a vote
router.post("/poll/vote", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { voted_for_team_id } = req.body;

        // Get voter's team
        const teamResult = await db.query(
            "SELECT team_id FROM team_members WHERE user_id = $1",
            [userId]
        );
        if (!teamResult.rows.length) {
            return res.status(404).json({ message: "You are not in a team" });
        }
        const myTeamId = teamResult.rows[0].team_id;

        // Get active poll
        const pollResult = await db.query(
            "SELECT * FROM polls WHERE status = 'active' AND ends_at > NOW() ORDER BY created_at DESC LIMIT 1"
        );
        if (!pollResult.rows.length) {
            return res.status(400).json({ message: "No active poll" });
        }
        const poll = pollResult.rows[0];

        // Can't vote for your own team
        if (parseInt(voted_for_team_id) === myTeamId) {
            return res.status(400).json({ message: "You cannot vote for your own team" });
        }

        // Verify target team exists
        const targetTeam = await db.query("SELECT id, team_name FROM teams WHERE id = $1", [voted_for_team_id]);
        if (!targetTeam.rows.length) {
            return res.status(404).json({ message: "Target team not found" });
        }

        // Upsert vote (each team can change their vote while poll is active)
        await db.query(`
            INSERT INTO poll_votes (poll_id, voter_team_id, voted_for_team_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (poll_id, voter_team_id)
            DO UPDATE SET voted_for_team_id = $3, created_at = NOW()
        `, [poll.id, myTeamId, voted_for_team_id]);

        res.json({ message: "Vote cast successfully", voted_for: targetTeam.rows[0].team_name });
    } catch (error) {
        console.error("Cast vote error:", error);
        res.status(500).json({ message: "Error casting vote" });
    }
});

module.exports = router;
