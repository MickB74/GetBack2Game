const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
    console.log(`Request: ${req.url}`);

    // Proxy API requests
    if (req.url.startsWith('/api/')) {
        let targetUrl;

        if (req.url.startsWith('/api/nba/')) {
            const proxyPath = req.url.replace('/api/nba/', '');
            targetUrl = `https://cdn.nba.com/static/json/liveData/${proxyPath}`;
        } else {
            const proxyPath = req.url.replace('/api/', '');
            targetUrl = `https://api-web.nhle.com/v1/${proxyPath}`;
        }

        console.log(`Proxying to: ${targetUrl}`);

        const makeRequest = (url) => {
            https.get(url, (proxyRes) => {
                // Handle redirects
                if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                    console.log(`Redirecting to: ${proxyRes.headers.location}`);
                    makeRequest(proxyRes.headers.location);
                    return;
                }

                res.writeHead(proxyRes.statusCode, {
                    ...proxyRes.headers,
                    'Access-Control-Allow-Origin': '*' // Add CORS header for safety
                });
                proxyRes.pipe(res);
            }).on('error', (e) => {
                console.error(e);
                res.writeHead(500);
                res.end('Proxy error');
            });
        };

        makeRequest(targetUrl);
        return;
    }

    // Serve static files
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = path.extname(filePath);
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('500 Internal Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('Open this URL in your browser to view the app.');
});
