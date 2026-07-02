#!/usr/bin/env node
/**
 * Fix: Create missing support_messages table on VPS PostgreSQL
 * 
 * Usage:
 *   DATABASE_URL=postgresql://user:password@host:5432/dbname node scripts/fix-support-messages-vps.js
 * 
 * Or set environment variables:
 *   PGHOST=localhost PGPORT=5432 PGUSER=dbuser PGPASSWORD=secret PGDATABASE=dbname node scripts/fix-support-messages-vps.js
 */
const { Client } = require('pg');

async function main() {
    // Build connection string from environment or DATABASE_URL
    let connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
        const host = process.env.PGHOST || 'localhost';
        const port = process.env.PGPORT || 5432;
        const user = process.env.PGUSER || process.env.USER || 'postgres';
        const password = process.env.PGPASSWORD || process.env.PGPASSWORD;
        const database = process.env.PGDATABASE || 'vaidyagogate';
        
        if (!password) {
            console.error('Error: Set PGPASSWORD environment variable');
            process.exit(1);
        }
        
        connectionString = `postgresql://${user}:${password}@${host}:${port}/${database}`;
    }
    
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        console.log('Connected to PostgreSQL');
        
        // Check if support_messages table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'support_messages'
            ) as exists
        `);
        
        if (tableCheck.rows[0].exists) {
            console.log('✓ support_messages table already exists');
        } else {
            // Create support_messages table
            console.log('Creating support_messages table...');
            await client.query(`
                CREATE TABLE IF NOT EXISTS support_messages (
                    id SERIAL PRIMARY KEY,
                    ticket_id INTEGER NOT NULL,
                    sender TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✓ Created support_messages table');
        }
        
        // Create index if it doesn't exist
        try {
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_support_messages_ticket 
                ON support_messages (ticket_id)
            `);
            console.log('✓ Created index idx_support_messages_ticket');
        } catch (e) {
            if (e.code !== '42P07') { // index already exists
                throw e;
            }
            console.log('✓ Index idx_support_messages_ticket already exists');
        }
        
        // Also check if ticket_messages table exists (for compatibility)
        const ticketMsgCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'ticket_messages'
            ) as exists
        `);
        
        if (ticketMsgCheck.rows[0].exists) {
            console.log('✓ ticket_messages table exists');
        } else {
            console.log('Creating ticket_messages table...');
            await client.query(`
                CREATE TABLE IF NOT EXISTS ticket_messages (
                    id SERIAL PRIMARY KEY,
                    ticket_id TEXT NOT NULL,
                    sender_id INTEGER NOT NULL,
                    sender_type TEXT,
                    message TEXT NOT NULL,
                    attachment_path TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✓ Created ticket_messages table');
        }
        
        console.log('\n✅ Fix applied successfully!');
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
