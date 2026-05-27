const { Pool } = require('pg');
const { buildPgPoolOptions, resolveDatabaseUrl } = require('../lib/env-db');
const url = resolveDatabaseUrl();
const pool = new Pool(buildPgPoolOptions(url));
pool
    .query(
        `SELECT key, length(value::text) AS len FROM global_settings WHERE key IN ('site_logo_b64','site_logo_path','public_site_cms')`
    )
    .then((r) => console.log(r.rows))
    .finally(() => pool.end());
