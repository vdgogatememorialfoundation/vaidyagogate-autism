/**
 * Script to import pre-registration data from TSV file
 * Usage: node scripts/import-preregistrations.js
 * 
 * The TSV data file should be at: scripts/prereg-data.tsv
 */

const fs = require('fs');
const path = require('path');

// Detect database type from environment
const dbUrl = process.env.DATABASE_URL;
const isPostgres = dbUrl && (dbUrl.includes('postgres') || dbUrl.includes('neon'));

const crypto = require('crypto');

function randomPassword() {
    return crypto.randomBytes(12).toString('base64url').slice(0, 14);
}

function generateUserId() {
    return 'USR' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(-3).toUpperCase();
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === '\t' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

async function main() {
    const tsvFile = path.join(__dirname, 'prereg-data.tsv');
    
    if (!dbUrl) {
        console.log('DATABASE_URL not set. This script should be run as a post-deploy hook.');
        console.log('It will import data when DATABASE_URL is available.');
        
        // Check if data file exists
        if (fs.existsSync(tsvFile)) {
            console.log('Data file found at:', tsvFile);
            const lines = fs.readFileSync(tsvFile, 'utf8').trim().split('\n');
            console.log(`Total records in data file: ${lines.length - 1}`);
        }
        return;
    }
    
    console.log('Starting import with DATABASE_URL:', dbUrl.substring(0, 30) + '...');
    
    // Dynamic require based on database type
    let db;
    if (isPostgres) {
        const { Pool } = require('pg');
        db = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    } else {
        db = require('better-sqlite3')(dbUrl.replace('sqlite:', ''));
    }
    
    try {
        const data = fs.readFileSync(tsvFile, 'utf8');
        const lines = data.trim().split('\n');
        const headers = parseCSVLine(lines[0]);
        
        console.log(`Total rows to process: ${lines.length - 1}`);
        
        // Find column indices
        const col = {
            application_no: headers.indexOf('application_no'),
            user_id_string: headers.indexOf('user_id_string'),
            first_name: headers.indexOf('first_name'),
            middle_name: headers.indexOf('middle_name'),
            last_name: headers.indexOf('last_name'),
            email: headers.indexOf('email'),
            phone: headers.indexOf('phone'),
            status: headers.indexOf('status')
        };
        
        let usersCreated = 0;
        let usersSkipped = 0;
        let preregsCreated = 0;
        let errors = 0;
        
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length < 5) continue;
            
            try {
                const applicationNo = values[col.application_no];
                const userIdString = values[col.user_id_string] || generateUserId();
                const firstName = values[col.first_name] || '';
                const lastName = values[col.last_name] || '';
                const email = values[col.email] || '';
                const phone = values[col.phone] || '';
                const status = values[col.status] || 'approved';
                
                if (!email && !phone) continue;
                
                const normalizedEmail = email.toLowerCase().trim();
                
                if (isPostgres) {
                    // Check if user exists
                    let existingUser;
                    if (normalizedEmail) {
                        existingUser = await db.query(
                            'SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 LIMIT 1',
                            [normalizedEmail]
                        );
                    }
                    
                    if (existingUser?.rows?.length) {
                        usersSkipped++;
                    } else {
                        const password = randomPassword();
                        const result = await db.query(
                            `INSERT INTO users (user_id_string, first_name, middle_name, last_name, email, phone, password, role, is_disabled, email_verified, created_at)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, 'user', 0, 1, NOW())
                             RETURNING id`,
                            [userIdString, firstName, values[col.middle_name] || '', lastName, normalizedEmail, phone, password]
                        );
                        usersCreated++;
                    }
                    
                    // Upsert preregistration
                    await db.query(
                        `INSERT INTO preregistrations (user_id, seminar_id, application_no, status, created_at, updated_at)
                         VALUES (COALESCE((SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 LIMIT 1), NULL), 1, $2, $3, NOW(), NOW())
                         ON CONFLICT (application_no) DO UPDATE SET
                            status = EXCLUDED.status,
                            updated_at = NOW()`,
                        [normalizedEmail, applicationNo, status]
                    );
                } else {
                    // SQLite
                    let existingUser;
                    if (normalizedEmail) {
                        existingUser = db.prepare('SELECT id FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1').get(normalizedEmail);
                    }
                    
                    if (existingUser) {
                        usersSkipped++;
                    } else {
                        const password = randomPassword();
                        const stmt = db.prepare(
                            `INSERT INTO users (user_id_string, first_name, middle_name, last_name, email, phone, password, role, is_disabled, email_verified, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, 'user', 0, 1, datetime('now'))`
                        );
                        stmt.run(userIdString, firstName, values[col.middle_name] || '', lastName, normalizedEmail, phone, password);
                        usersCreated++;
                    }
                    
                    try {
                        const stmt = db.prepare(
                            `INSERT INTO preregistrations (user_id, seminar_id, application_no, status, created_at, updated_at)
                             VALUES ((SELECT id FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1), 1, ?, ?, datetime('now'), datetime('now'))`
                        );
                        stmt.run(normalizedEmail, applicationNo, status);
                    } catch (e) {
                        if (e.message.includes('UNIQUE')) {
                            const updateStmt = db.prepare(
                                `UPDATE preregistrations SET status = ?, updated_at = datetime('now') WHERE application_no = ?`
                            );
                            updateStmt.run(status, applicationNo);
                        }
                    }
                }
                preregsCreated++;
                
                if (i % 20 === 0) {
                    console.log(`Processed ${i}/${lines.length - 1}...`);
                }
            } catch (err) {
                errors++;
                if (errors <= 5) console.error(`Row ${i} error: ${err.message}`);
            }
        }
        
        console.log('\n=== Import Summary ===');
        console.log(`Users created: ${usersCreated}`);
        console.log(`Users skipped (already exist): ${usersSkipped}`);
        console.log(`Preregistrations created/updated: ${preregsCreated}`);
        console.log(`Errors: ${errors}`);
        console.log('\nImport completed!');
        
    } catch (err) {
        console.error('Import failed:', err);
        throw err;
    } finally {
        if (isPostgres) {
            await db.end();
        } else {
            db.close();
        }
    }
}

main().catch(console.error);
