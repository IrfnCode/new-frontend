import express from 'express';
import compression from 'compression';
import 'dotenv/config';
import path from 'node:path';

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handler as ssrHandler } from './dist/server/entry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 3000;

const clientDir = path.join(__dirname, 'dist', 'client');
const assetsDir = path.join(clientDir, 'assets');

// Check if directories exist
console.log(`[CHECK] clientDir exists: ${fs.existsSync(clientDir)}`);
console.log(`[CHECK] assetsDir exists: ${fs.existsSync(assetsDir)}`);
if (fs.existsSync(assetsDir)) {
    console.log(`[CHECK] Files in assets:`, fs.readdirSync(assetsDir));
}

// Debug Middleware: Log all requests and timing
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[REQUEST] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// Enable Gzip Compression
app.use(compression());

// 1. Serve static assets with cache control
app.use(express.static(clientDir, {
    maxAge: '1d',
    immutable: true,
    index: false
}));

// 2. Handle SSR
app.use(ssrHandler);

app.listen(PORT, HOST, () => {
    console.log(`[BATIX] Server running on http://${HOST}:${PORT}`);
    console.log(`[BATIX] Static assets path: ${clientDir}`);
});


