/**
 * Local HTTP test for GET /certificate/view (set DATABASE_URL, optional VERCEL=1).
 */
process.env.VERCEL = process.env.VERCEL || '1';
process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection', reason && reason.stack ? reason.stack : reason);
});
const http = require('http');
const app = require('../server');

const server = http.createServer(app);
server.listen(0, () => {
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/certificate/view?uc=1&uid=2`;
    http
        .get(url, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
                console.log('status', res.statusCode);
                console.log('body start', body.slice(0, 200));
                server.close();
                process.exit(res.statusCode === 200 ? 0 : 1);
            });
        })
        .on('error', (e) => {
            console.error(e);
            server.close();
            process.exit(1);
        });
});
