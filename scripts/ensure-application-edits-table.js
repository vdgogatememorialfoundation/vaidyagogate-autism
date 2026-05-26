#!/usr/bin/env node
/**
 * Ensure application_edits exists on Neon (audit log for admin registration edits).
 * Usage: DATABASE_URL=... node scripts/ensure-application-edits-table.js
 */
const { getPool } = require('../lib/db-pg');

const SQL = `CREATE TABLE IF NOT EXISTS application_edits (
    id SERIAL PRIMARY KEY,
    application_id INTEGER,
    edited_by_user_id INTEGER,
    changes TEXT,
    edited_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)`;

async function main() {
    const pool = getPool();
    if (!pool) {
        console.error('DATABASE_URL is not set.');
        process.exit(1);
    }
    await pool.query(SQL);
    console.log('application_edits table is ready.');
    await pool.end();
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
