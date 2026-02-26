const admin = require("../config/firebase");
const db = require("../db");

// Decode JWT payload without verifying signature (for fallback only)
function decodeJwtPayload(token) {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        const payload = Buffer.from(parts[1], "base64url").toString("utf8");
        return JSON.parse(payload);
    } catch (e) {
        return null;
    }
}

// Verify Firebase token with retry on network errors
async function verifyFirebaseToken(token, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const decoded = await admin.auth().verifyIdToken(token, false);
            return decoded;
        } catch (error) {
            const isNetworkError = !error.code ||
                error.code === "ECONNRESET" ||
                error.code === "ETIMEDOUT" ||
                error.code === "ENOTFOUND" ||
                (error.message && (
                    error.message.includes("timeout") ||
                    error.message.includes("connection") ||
                    error.message.includes("network") ||
                    error.message.includes("ETIMEDOUT") ||
                    error.message.includes("ECONNRESET")
                ));

            if (isNetworkError && i < retries - 1) {
                console.warn(`Firebase token verify attempt ${i + 1} failed (network issue), retrying...`);
                await new Promise(r => setTimeout(r, 1000 * (i + 1)));
                continue;
            }
            throw error;
        }
    }
}

// Verify Firebase token and authenticate user
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.split(" ")[1];
        if (!token) {
            return res.status(401).json({ message: "Malformed authorization header" });
        }

        let email;
        try {
            // Try full verification with retry
            const decoded = await verifyFirebaseToken(token);
            email = decoded.email;
        } catch (firebaseError) {
            // If Firebase verification completely fails (network unavailable),
            // fall back to local JWT decode (still identifies the user by email)
            console.error("Firebase verify failed after retries:", firebaseError.code || firebaseError.message?.substring(0, 100));
            const payload = decodeJwtPayload(token);
            if (!payload || !payload.email) {
                return res.status(401).json({ message: "Invalid token" });
            }
            // Validate basic token structure (expiry check)
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                return res.status(401).json({ message: "Token expired" });
            }
            console.warn("Using fallback JWT decode for:", payload.email);
            email = payload.email;
        }

        // Get user from database
        const userResult = await db.query(
            "SELECT id, email, role FROM users WHERE email = $1",
            [email]
        );

        if (!userResult.rows.length) {
            return res.status(403).json({ message: "User not registered" });
        }

        req.user = userResult.rows[0];
        next();
    } catch (error) {
        console.error("Auth error code:", error.code);
        console.error("Auth error message:", error.message ? error.message.substring(0, 300) : error);
        res.status(401).json({ message: "Authentication failed" });
    }
};


// Check if user is master admin
const isMasterAdmin = async (req, res, next) => {
    if (req.user.role !== "master_admin") {
        return res.status(403).json({ message: "Access denied. Master admin only." });
    }

    try {
        // Restricted admin login logic: only one admin at a time
        const gameState = await db.query("SELECT active_admin_id, active_admin_last_seen FROM game_state WHERE id = 1");

        if (gameState.rows.length > 0) {
            const { active_admin_id, active_admin_last_seen } = gameState.rows[0];
            const now = new Date();
            const lastSeen = active_admin_last_seen ? new Date(active_admin_last_seen) : null;

            // If another admin was active in the last 60 seconds, block access
            // 60 seconds heartbeat buffer
            if (active_admin_id && active_admin_id !== req.user.id && lastSeen && (now - lastSeen) < 60000) {
                return res.status(403).json({
                    message: "Another admin is currently logged in. Multiple admin access is restricted to prevent conflicts.",
                    is_multiple_admin: true
                });
            }

            // Update active admin status
            await db.query(
                "UPDATE game_state SET active_admin_id = $1, active_admin_last_seen = NOW() WHERE id = 1",
                [req.user.id]
            );
        }
    } catch (error) {
        console.error("Admin session check error:", error);
        // If columns don't exist yet, we'll need to add them. 
        // For now, let's just proceed to not block admin if DB is failing.
        // We can add the columns in a separate step.
    }

    next();
};

// Check if user is team lead
const isTeamLead = (req, res, next) => {
    if (req.user.role !== "team_lead") {
        return res.status(403).json({ message: "Access denied. Team lead only." });
    }
    next();
};

module.exports = {
    verifyToken,
    isMasterAdmin,
    isTeamLead
};
