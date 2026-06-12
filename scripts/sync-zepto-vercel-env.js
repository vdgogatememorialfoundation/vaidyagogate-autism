/**
 * Sync ZeptoMail settings from DB integration_secrets to Vercel env (production + preview).
 * Usage: node scripts/sync-zepto-vercel-env.js
 * Requires: .env.vercel with DATABASE_URL (vercel env pull)
 */
const { execSync } = require('child_process');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) return;
    fs.readFileSync(p, 'utf8')
        .split(/\r?\n/)
        .forEach((line) => {
            const m = line.match(/^([^#=]+)=(.*)$/);
            if (m) process.env[m[1].trim()] = m[2].replace(/^["']|["']$/g, '');
        });
}

function setVercelEnv(name, value, env) {
    if (!value) return;
    try {
        execSync(`npx vercel env rm ${name} ${env} --yes`, { stdio: 'ignore' });
    } catch (_) {}
    execSync(`npx vercel env add ${name} ${env}`, {
        input: value,
        stdio: ['pipe', 'inherit', 'inherit']
    });
}

async function main() {
    loadEnvFile('.env.vercel.production');
    if (!process.env.DATABASE_URL) loadEnvFile('.env.vercel');
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('DATABASE_URL missing — run: npx vercel env pull .env.vercel --yes');
        process.exit(1);
    }
    const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const r = await c.query(`SELECT value FROM global_settings WHERE key = 'integration_secrets'`);
    await c.end();
    let d = {};
    try {
        d = JSON.parse((r.rows[0] && r.rows[0].value) || '{}');
    } catch (_) {}
    const apiKey = String(d.zepto_api_key || '').trim();
    const from = String(d.zepto_from || d.zoho_from || '').trim();
    const fromName = String(d.zepto_from_name || 'Vaidya Gogate Memorial Foundation').trim();
    const region = String(d.zepto_region || 'in').trim() || 'in';
    if (!apiKey || !from) {
        console.error('ZeptoMail not saved in admin integrations yet (need zepto_api_key + zepto_from).');
        process.exit(1);
    }
    console.log('Syncing ZeptoMail env to Vercel for', from, 'region', region);
    for (const env of ['production', 'preview']) {
        setVercelEnv('ZEPTOMAIL_API_KEY', apiKey, env);
        setVercelEnv('ZEPTO_FROM', from, env);
        setVercelEnv('ZEPTO_FROM_NAME', fromName, env);
        setVercelEnv('ZEPTOMAIL_REGION', region, env);
        setVercelEnv('PUBLIC_BASE_URL', 'https://autism.vaidyagogate.org', env);
        setVercelEnv('APPLICANT_HOST', 'autism.vaidyagogate.org', env);
    }
    console.log('Done. Redeploy for env changes to apply.');
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
