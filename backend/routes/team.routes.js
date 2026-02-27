const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

// All team routes require authentication
router.use(verifyToken);

// Scan team assignment card (for team leads)
router.post("/scan-assignment", async (req, res) => {
    try {
        const { card_data } = req.body;
        const userId = req.user.id;

        // Parse card data
        const cardInfo = JSON.parse(card_data);

        if (cardInfo.type !== 'team_assignment') {
            return res.status(400).json({ message: "Invalid card type" });
        }

        // Check if user is a team lead
        if (req.user.role !== 'team_lead') {
            return res.status(403).json({ message: "Only team leads can scan assignment cards" });
        }

        // Check if team lead already has a team
        const existingTeam = await db.query(
            "SELECT * FROM teams WHERE team_lead_id = $1",
            [userId]
        );

        if (existingTeam.rows.length > 0) {
            return res.status(400).json({ message: "You already have a team" });
        }

        res.json({
            team_type: cardInfo.team_type,
            card_id: cardInfo.card_id
        });
    } catch (error) {
        console.error("Scan assignment error:", error);
        res.status(500).json({ message: "Error scanning assignment card" });
    }
});

// Create team (after scanning assignment card)
router.post("/create", async (req, res) => {
    try {
        const { team_name, team_type } = req.body;
        const userId = req.user.id;

        // Validate team type
        if (!['innocent', 'traitor'].includes(team_type)) {
            return res.status(400).json({ message: "Invalid team type" });
        }

        // Check if user is a team lead
        if (req.user.role !== 'team_lead') {
            return res.status(403).json({ message: "Only team leads can create teams" });
        }

        // Check if team lead already has a team
        const existingTeam = await db.query(
            "SELECT * FROM teams WHERE team_lead_id = $1",
            [userId]
        );

        if (existingTeam.rows.length > 0) {
            return res.status(400).json({ message: "You already have a team" });
        }

        // Generate unique team code
        const team_code = uuidv4().substring(0, 8).toUpperCase();

        // Create team
        const teamResult = await db.query(
            `INSERT INTO teams (team_name, team_code, team_type, team_lead_id) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [team_name, team_code, team_type, userId]
        );

        const team = teamResult.rows[0];

        // Add team lead as a member
        await db.query(
            "INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)",
            [team.id, userId]
        );

        // Generate QR code for team joining
        const joinData = JSON.stringify({
            type: 'team_join',
            team_id: team.id,
            team_code: team.team_code
        });
        const qrCodeDataUrl = await QRCode.toDataURL(joinData);

        res.json({
            ...team,
            qr_code_image: qrCodeDataUrl
        });
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(400).json({ message: "Team name or code already exists" });
        }
        console.error("Create team error:", error);
        res.status(500).json({ message: "Error creating team" });
    }
});

// Join team (by scanning QR or entering code)
router.post("/join", async (req, res) => {
    try {
        const { team_code, qr_data } = req.body;
        const userId = req.user.id;

        let teamId;
        let teamType;

        // Parse QR data if provided
        if (qr_data) {
            const joinInfo = JSON.parse(qr_data);
            if (joinInfo.type !== 'team_join') {
                return res.status(400).json({ message: "Invalid QR code" });
            }
            teamId = joinInfo.team_id;
        } else if (team_code) {
            // Find team by code
            const teamResult = await db.query(
                "SELECT id, team_type FROM teams WHERE team_code = $1",
                [team_code]
            );

            if (!teamResult.rows.length) {
                return res.status(404).json({ message: "Team not found" });
            }

            teamId = teamResult.rows[0].id;
            teamType = teamResult.rows[0].team_type;
        } else {
            return res.status(400).json({ message: "Team code or QR data required" });
        }

        // Check if user is already in a team
        const existingMembership = await db.query(
            "SELECT * FROM team_members WHERE user_id = $1",
            [userId]
        );

        if (existingMembership.rows.length > 0) {
            return res.status(400).json({ message: "You are already in a team" });
        }

        // Get team info
        const teamResult = await db.query(
            "SELECT * FROM teams WHERE id = $1",
            [teamId]
        );

        const team = teamResult.rows[0];

        // Check team size (max 4 members)
        const memberCount = await db.query(
            "SELECT COUNT(*) as count FROM team_members WHERE team_id = $1",
            [teamId]
        );

        if (parseInt(memberCount.rows[0].count) >= 4) {
            return res.status(400).json({ message: "Team is full (max 4 members)" });
        }

        // Add member to team
        await db.query(
            "INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)",
            [teamId, userId]
        );

        res.json({
            team_id: team.id,
            team_name: team.team_name,
            team_type: team.team_type,
            team_code: team.team_code
        });
    } catch (error) {
        console.error("Join team error:", error);
        res.status(500).json({ message: "Error joining team: " + error.message });
    }
});

// Get my team info
router.get("/my-team", async (req, res) => {
    try {
        const userId = req.user.id;

        // Find user's team
        const result = await db.query(`
            SELECT t.*, 
                   json_agg(json_build_object(
                       'id', u.id,
                       'email', u.email,
                       'role', u.role,
                       'is_lead', u.id = t.team_lead_id
                   )) as members
            FROM teams t
            INNER JOIN team_members tm ON t.id = tm.team_id
            INNER JOIN users u ON tm.user_id = u.id
            WHERE t.id IN (
                SELECT team_id FROM team_members WHERE user_id = $1
            )
            GROUP BY t.id
        `, [userId]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "You are not in a team" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Get my team error:", error);
        res.status(500).json({ message: "Error fetching team info: " + error.message });
    }
});

// Get current clue for my team
router.get("/current-clue", async (req, res) => {
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

        // Get current clue
        const clueResult = await db.query(`
            SELECT tc.current_clue_text as clue_text, l.location_name as clue_location_name
            FROM team_clues tc
            LEFT JOIN locations l ON tc.current_clue_location_id = l.id
            WHERE tc.team_id = $1
        `, [teamId]);

        if (!clueResult.rows.length) {
            return res.json({ message: "No clue available yet. Wait for the round to start." });
        }

        res.json(clueResult.rows[0]);
    } catch (error) {
        console.error("Get current clue error:", error);
        res.status(500).json({ message: "Error fetching clue" });
    }
});

// Scan gold bar QR code
router.post("/scan-gold-bar", async (req, res) => {
    try {
        const { qr_code } = req.body;
        const userId = req.user.id;
        const io = req.app.get("io");

        // Check game state
        // Check game state
        const gameStateResult = await db.query("SELECT * FROM game_state WHERE id = 1");

        if (gameStateResult.rows.length === 0) {
            return res.status(400).json({ message: "Game has not been initialized by admin." });
        }

        const gameState = gameStateResult.rows[0];
        if (gameState.game_status !== 'in_progress') {
            return res.status(400).json({ message: "Game round is not in progress. Wait for admin to start." });
        }

        // Check if round time has expired using DB time
        const timeCheck = await db.query(`
            SELECT id FROM game_state 
            WHERE id = 1 AND round_end_time < NOW()
        `);

        if (timeCheck.rows.length > 0) {
            await db.query("UPDATE game_state SET game_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = 1");
            return res.status(400).json({ message: "Round has ended! No more points can be collected." });
        }
        const teamResult = await db.query(
            "SELECT team_id FROM team_members WHERE user_id = $1",
            [userId]
        );

        if (!teamResult.rows.length) {
            return res.status(404).json({ message: "You are not in a team" });
        }

        const teamId = teamResult.rows[0].team_id;

        // Check scan limit (4 per round)
        const scanCountResult = await db.query(`
            SELECT COUNT(*) FROM scans_history 
            WHERE team_id = $1 
            AND scanned_at >= (SELECT round_start_time FROM game_state WHERE id = 1)
        `, [teamId]);
        const scanCount = parseInt(scanCountResult.rows[0].count);

        if (scanCount >= 4) {
            return res.status(403).json({
                message: "Scanning limit completed! You can only scan 4 gold bars per round.",
                limit_reached: true
            });
        }

        // Check if team has already scanned this specific bar
        const alreadyScannedByThisTeam = await db.query(
            "SELECT id FROM scans_history WHERE team_id = $1 AND gold_bar_id = (SELECT id FROM gold_bars WHERE qr_code = $2 OR entry_code = $2)",
            [teamId, qr_code]
        );

        if (alreadyScannedByThisTeam.rows.length > 0) {
            return res.status(400).json({ message: "Your team has already collected this gold bar!" });
        }

        // Use a transaction for atomic scan processing
        const client = await db.pool.connect();
        try {
            await client.query("BEGIN");

            // Find gold bar and lock it for update
            const goldBarResult = await client.query(
                "SELECT * FROM gold_bars WHERE (qr_code = $1 OR entry_code = $1) FOR UPDATE",
                [qr_code]
            );

            if (!goldBarResult.rows.length) {
                await client.query("ROLLBACK");
                return res.status(404).json({ message: "Invalid QR code or entry code" });
            }

            const goldBar = goldBarResult.rows[0];

            // 1. Check if already scanned by ANYONE
            if (goldBar.is_scanned) {
                // If it was their target, give them a new clue so they aren't stuck
                const clueCheck = await client.query("SELECT next_gold_bar_id FROM team_clues WHERE team_id = $1", [teamId]);
                const isTarget = clueCheck.rows.length > 0 && clueCheck.rows[0].next_gold_bar_id === goldBar.id;

                let nextClue = null;
                if (isTarget) {
                    const nextGoldBarRes = await client.query(`
                        SELECT id, clue_text, clue_location_id FROM gold_bars 
                        WHERE is_scanned = FALSE ORDER BY RANDOM() LIMIT 1
                    `);

                    if (nextGoldBarRes.rows.length > 0) {
                        const nextGB = nextGoldBarRes.rows[0];
                        await client.query(`
                            INSERT INTO team_clues (team_id, current_clue_text, current_clue_location_id, next_gold_bar_id, updated_at)
                            VALUES ($4, $1, $2, $3, CURRENT_TIMESTAMP)
                            ON CONFLICT (team_id) DO UPDATE SET 
                                current_clue_text = $1, current_clue_location_id = $2,
                                next_gold_bar_id = $3, updated_at = CURRENT_TIMESTAMP
                        `, [nextGB.clue_text, nextGB.clue_location_id, nextGB.id, teamId]);
                        nextClue = nextGB.clue_text;
                    }
                }

                await client.query("COMMIT");

                if (isTarget) {
                    // Update the team via socket
                    io.to(`team_${teamId}`).emit("score_update", { points: 0, total_score: null, next_clue: nextClue });
                }

                return res.json({
                    success: false,
                    message: isTarget
                        ? "Someone else collected this bar first! We've assigned you a new clue."
                        : "This gold bar has already been collected by another team.",
                    next_clue: nextClue,
                    points: 0
                });
            }

            // 2. Check if it's their target (we allow scanning any bar now)
            const clueCheck = await client.query("SELECT next_gold_bar_id FROM team_clues WHERE team_id = $1", [teamId]);
            const currentTargetId = clueCheck.rows.length > 0 ? clueCheck.rows[0].next_gold_bar_id : null;
            const isTarget = currentTargetId === goldBar.id;

            // 3. Check sabotage
            const sabotageResult = await client.query(`
                SELECT * FROM sabotages WHERE target_team_id = $1 AND is_active = TRUE AND sabotage_end_time > NOW()
            `, [teamId]);
            const isSabotaged = sabotageResult.rows.length > 0;
            const sabotageEndTime = isSabotaged ? sabotageResult.rows[0].sabotage_end_time : null;

            // 4. Update Gold Bar status
            await client.query(`
                UPDATE gold_bars SET is_scanned = TRUE, scanned_by_team_id = $1, scanned_at = CURRENT_TIMESTAMP WHERE id = $2
            `, [teamId, goldBar.id]);

            // 5. Record scan history
            const pointsToAdd = isSabotaged ? 0 : goldBar.points;
            await client.query(`
                INSERT INTO scans_history (team_id, gold_bar_id, user_id, points_earned, was_sabotaged)
                VALUES ($1, $2, $3, $4, $5)
            `, [teamId, goldBar.id, userId, pointsToAdd, isSabotaged]);

            // 6. Update Team Score
            const scoreUpdateResult = await client.query(`
                UPDATE teams SET total_score = total_score + $1 WHERE id = $2 RETURNING total_score
            `, [pointsToAdd, teamId]);
            const newTotalScore = scoreUpdateResult.rows[0].total_score;

            // 7. Assign next clue (always assign a new one after any successful scan)
            let nextClue = null;
            const nextGoldBarRes = await client.query(`
                SELECT id, clue_text, clue_location_id FROM gold_bars WHERE is_scanned = FALSE ORDER BY RANDOM() LIMIT 1
            `);

            if (nextGoldBarRes.rows.length > 0) {
                const nextGB = nextGoldBarRes.rows[0];
                await client.query(`
                    INSERT INTO team_clues (team_id, current_clue_text, current_clue_location_id, next_gold_bar_id, updated_at)
                    VALUES ($4, $1, $2, $3, CURRENT_TIMESTAMP)
                    ON CONFLICT (team_id) DO UPDATE SET 
                        current_clue_text = $1, current_clue_location_id = $2,
                        next_gold_bar_id = $3, updated_at = CURRENT_TIMESTAMP
                `, [nextGB.clue_text, nextGB.clue_location_id, nextGB.id, teamId]);
                nextClue = nextGB.clue_text;
            }

            await client.query("COMMIT");

            // Real-time updates
            const leaderboardResult = await db.query(`
                SELECT t.id, t.team_name, t.team_type, t.total_score FROM teams t ORDER BY t.total_score DESC, t.team_name ASC
            `);
            io.emit("leaderboard_update", leaderboardResult.rows);
            io.to(`team_${teamId}`).emit("score_update", { points: pointsToAdd, total_score: newTotalScore, next_clue: nextClue });

            res.json({
                success: true,
                message: isSabotaged ? "Your team is sabotaged! 0 Points!" : "Gold bar collected!",
                points: pointsToAdd,
                total_score: newTotalScore,
                was_sabotaged: isSabotaged,
                sabotage_end_time: sabotageEndTime,
                next_clue: nextClue
            });

        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Scan gold bar error:", error);
        res.status(500).json({ message: "Error scanning gold bar: " + error.message });
    }
});

// Get team members (for team lead)
router.get("/members", async (req, res) => {
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

        // Get all team members
        const membersResult = await db.query(`
            SELECT u.id, u.email, u.role, 
                   t.team_lead_id = u.id as is_lead,
                   tm.joined_at
            FROM team_members tm
            INNER JOIN users u ON tm.user_id = u.id
            INNER JOIN teams t ON tm.team_id = t.id
            WHERE tm.team_id = $1
            ORDER BY is_lead DESC, tm.joined_at ASC
        `, [teamId]);

        res.json(membersResult.rows);
    } catch (error) {
        console.error("Get team members error:", error);
        res.status(500).json({ message: "Error fetching team members" });
    }
});

module.exports = router;
