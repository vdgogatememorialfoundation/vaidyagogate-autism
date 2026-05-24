/**
 * Database factory: PostgreSQL (Neon/Vercel) when DATABASE_URL is set, else SQLite locally.
 */
const path = require('path');
const { resolveDatabaseUrl, isPostgresConfigured } = require('./env-db');

function createDb() {
    const databaseUrl = resolveDatabaseUrl();
    if (databaseUrl) {
        process.env.DATABASE_URL = databaseUrl;
        console.log('[db] Using PostgreSQL (DATABASE_URL)');
        return require('./db-pg').createPgDb();
    }
    if (process.env.VERCEL) {
        console.error('[db] DATABASE_URL is required on Vercel. Set it in Project → Settings → Environment Variables.');
        const failDb = {
            connect(callback) {
                const err = new Error('DATABASE_URL is not set');
                if (callback) callback(err);
            },
            run(_sql, _params, callback) {
                if (typeof _params === 'function') callback = _params;
                if (callback) callback(new Error('DATABASE_URL is not set'));
            },
            get(_sql, _params, callback) {
                if (typeof _params === 'function') callback = _params;
                if (callback) callback(new Error('DATABASE_URL is not set'));
            },
            all(_sql, _params, callback) {
                if (typeof _params === 'function') callback = _params;
                if (callback) callback(new Error('DATABASE_URL is not set'));
            },
            serialize(fn) {
                if (typeof fn === 'function') fn();
            }
        };
        return failDb;
    }
    const sqlite3 = require('sqlite3').verbose();
    const dbFile = process.env.SQLITE_PATH || path.join(__dirname, '..', 'database.sqlite');
    console.log('[db] Using SQLite:', dbFile);
    const db = new sqlite3.Database(dbFile, (err) => {
        if (err) console.error('[db]', err.message);
    });
    const origSerialize = db.serialize.bind(db);
    db.connect = (callback) => {
        if (callback) callback(null);
    };
    db.serialize = origSerialize;
    return db;
}

const db = createDb();

module.exports = db;
module.exports.isPostgresConfigured = isPostgresConfigured;
module.exports.resolveDatabaseUrl = resolveDatabaseUrl;
