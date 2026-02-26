require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function migrate() {
    try {
        console.log("Checking columns in game_state...");

        await pool.query(`
            ALTER TABLE game_state 
            ADD COLUMN IF NOT EXISTS active_admin_id INTEGER REFERENCES users(id),
            ADD COLUMN IF NOT EXISTS active_admin_last_seen TIMESTAMP;
        `);

        console.log("✓ Columns added successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Migration error:", error);
        process.exit(1);
    }
}

migrate();
