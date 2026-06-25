const fs = require('fs');
if (fs.existsSync('.env')) {
    const envConfig = fs.readFileSync('.env', 'utf8');
    envConfig.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] = match[2].trim();
    });
}

const { Client } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const NEON_URL = 'postgresql://neondb_owner:npg_6hitr5UIxosF@ep-misty-meadow-aphijqi6-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';
const SUPABASE_URL = process.env.DATABASE_URL;

const r2Config = process.env.R2_ACCOUNT_ID ? {
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
} : null;

const s3Client = r2Config ? new S3Client(r2Config) : null;
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'autism';

async function migrate() {
    console.log('Connecting to Neon...');
    const neon = new Client({ connectionString: NEON_URL });
    await neon.connect();

    console.log('Connecting to Supabase...');
    const supabase = new Client({ connectionString: SUPABASE_URL });
    await supabase.connect();

    // 1. Get all tables from Neon
    const tablesRes = await neon.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    `);
    
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log(`Found ${tables.length} tables to migrate.`);

    for (const table of tables) {
        if (table === 'file_blobs') {
            console.log(`\nMigrating file_blobs directly to Cloudflare R2...`);
            const blobRes = await neon.query(`SELECT storage_key, mime_type, original_name, data FROM file_blobs`);
            console.log(`Found ${blobRes.rows.length} blobs.`);
            
            for (let i = 0; i < blobRes.rows.length; i++) {
                const row = blobRes.rows[i];
                if (!row.data) continue;
                
                try {
                    let buffer = row.data;
                    if (typeof buffer === 'string') buffer = Buffer.from(buffer, 'base64');
                    
                    const command = new PutObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: row.storage_key,
                        Body: buffer,
                        ContentType: row.mime_type || 'application/octet-stream'
                    });
                    await s3Client.send(command);
                    process.stdout.write(`\rUploaded blob ${i+1}/${blobRes.rows.length} (${row.storage_key})`);
                } catch (err) {
                    console.error(`\nFailed to upload blob ${row.storage_key}:`, err.message);
                }
            }
            console.log(`\nfile_blobs migration to R2 complete.`);
            continue;
        }

        console.log(`\nMigrating table: ${table}...`);
        
        // Fetch source columns and types
        const colsRes = await neon.query(`
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_name = $1 AND table_schema = 'public'
        `, [table]);
        const neonColumns = colsRes.rows;

        // Fetch target columns
        const tgtColsRes = await supabase.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = $1 AND table_schema = 'public'
        `, [table]);
        const tgtColumnsSet = new Set(tgtColsRes.rows.map(r => r.column_name));

        // Add missing columns to Supabase
        for (const col of neonColumns) {
            if (!tgtColumnsSet.has(col.column_name)) {
                let type = col.data_type;
                if (type === 'character varying' && col.character_maximum_length) {
                    type += `(${col.character_maximum_length})`;
                }
                console.log(`Adding missing column ${col.column_name} (${type}) to ${table}`);
                await supabase.query(`ALTER TABLE "${table}" ADD COLUMN "${col.column_name}" ${type}`).catch(e => console.error(e.message));
            }
        }

        // Fetch data
        const dataRes = await neon.query(`SELECT * FROM "${table}"`);
        if (dataRes.rows.length === 0) {
            console.log(`Skipping empty table: ${table}`);
            continue;
        }

        // We truncate the target table first to avoid conflicts if script ran before
        await supabase.query(`TRUNCATE TABLE "${table}" CASCADE`).catch(() => {});

        const columns = Object.keys(dataRes.rows[0]);
        const colsStr = columns.map(c => `"${c}"`).join(', ');

        for (let i = 0; i < dataRes.rows.length; i++) {
            const row = dataRes.rows[i];
            const values = columns.map(c => row[c]);
            
            const paramsStr = columns.map((_, idx) => `$${idx + 1}`).join(', ');
            
            try {
                await supabase.query(
                    `INSERT INTO "${table}" (${colsStr}) VALUES (${paramsStr})`,
                    values
                );
            } catch (err) {
                console.error(`Failed to insert row ${i} into ${table}:`, err.message);
            }
        }
        console.log(`Inserted ${dataRes.rows.length} rows into ${table}.`);
    }

    // Attempt to update sequence counters for SERIAL primary keys
    try {
        console.log('\nUpdating sequences...');
        for (const table of tables) {
            if (table === 'file_blobs') continue;
            
            // simple heuristic: assuming 'id' is a serial primary key
            const idCheck = await supabase.query(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='${table}' AND column_name='id'
            `);
            
            if (idCheck.rows.length > 0) {
                const maxRes = await supabase.query(`SELECT MAX(id) FROM "${table}"`);
                const max = maxRes.rows[0].max;
                if (max) {
                    await supabase.query(`SELECT setval('"${table}_id_seq"', ${max}, true)`).catch(() => {});
                }
            }
        }
        console.log('Sequences updated.');
    } catch (e) {
        console.error('Sequence update error:', e.message);
    }

    await neon.end();
    await supabase.end();
    console.log('\nMigration entirely complete!');
}

migrate().catch(console.error);
