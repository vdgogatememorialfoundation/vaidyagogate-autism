# VPS PostgreSQL Deployment

## Prerequisites

- PostgreSQL server running (local or remote)
- Node.js installed
- Project dependencies installed (`npm install`)

## Environment Variables

Set these in your shell or `.env` file:

```bash
# PostgreSQL connection
PGHOST=your-postgres-host
PGPORT=5432
PGUSER=your-username
PGPASSWORD=your-password
PGDATABASE=your-database

# Or use a full connection string:
DATABASE_URL=postgresql://user:password@host:5432/database

# Application settings
PORT=3001
PORTAL_SCHEME=https
APPLICANT_HOST=yourdomain.com
```

## Running the Application

```bash
PORT=3001 npm start
```

## Fixing Missing Tables

If you see "permission denied for table support_messages" error, run the fix script:

```bash
# Set credentials
export PGPASSWORD=your-password
export PGHOST=your-postgres-host
export PGPORT=5432
export PGUSER=your-username
export PGDATABASE=your-database

# Run the fix
node scripts/fix-support-messages-vps.js
```

## Manual SQL (Alternative)

Connect to your PostgreSQL directly:

```bash
psql -h your-postgres-host -U your-username -d your-database
```

Then run:

```sql
-- Create support_messages table (used by doctor portal)
CREATE TABLE IF NOT EXISTS support_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL,
    sender TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket 
ON support_messages (ticket_id);

-- Create ticket_messages table (used by admin portal)
CREATE TABLE IF NOT EXISTS ticket_messages (
    id SERIAL PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    sender_id INTEGER NOT NULL,
    sender_type TEXT,
    message TEXT NOT NULL,
    attachment_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket 
ON ticket_messages (ticket_id);
```

## Nginx Configuration

See `nginx-vaidyagogate.conf` for example nginx reverse proxy configuration.

## PM2 Process Manager (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start the app
pm2 start server.js --name autism-portal

# Save process list
pm2 save

# Setup startup script
pm2 startup
```
