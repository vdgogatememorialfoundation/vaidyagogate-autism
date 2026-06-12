/**
 * Render / Node entry — package.json "main" points here so default `node index.js` works.
 * The app listens in server.js when not on Vercel serverless.
 */
require('./server.js');
