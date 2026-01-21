import express from 'express';
import passport from 'passport';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import prisma from './db.js';
import { PORT } from './config/constants.js';
import { authenticateToken, logger as requestLogger } from './middleware/index.js';

// Route Imports
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import flowRoutes from './routes/flows.js';
import messageRoutes from './routes/messages.js';
import dispatchRoutes from './routes/dispatch.js';
import webhookRoutes from './routes/webhooks.js';
import metaRoutes from './routes/meta.js';
import { startDispatch, stopDispatch } from './services/dispatchEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(passport.initialize());
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// WebSocket clients management
const clients = new Map();

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    if (userId) {
        clients.set(parseInt(userId), ws);
        console.log(`[WS] User ${userId} connected`);
    }
    ws.on('close', () => {
        if (userId) clients.delete(parseInt(userId));
    });
});

const broadcastMessage = (event, data, targetUserId = null) => {
    const payload = JSON.stringify({ event, data });
    if (targetUserId) {
        const client = clients.get(parseInt(targetUserId));
        if (client && client.readyState === WebSocket.OPEN) client.send(payload);
    } else {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        });
    }
};

// Expose broadcast to routes
app.set('broadcastMessage', broadcastMessage);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(requestLogger);

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../dist')));

// Specific route for logo if not in dist
app.get('/logo.png', (req, res) => res.sendFile(path.join(__dirname, '../logo.png')));

// Mount routes
app.use('/', authRoutes); // To allow /auth/google top-level
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', flowRoutes);
app.use('/api', messageRoutes);
app.use('/api', dispatchRoutes);
app.use('/api', metaRoutes);
app.use('/', webhookRoutes);

// Special Action Routes (that need broadcast)
app.post('/api/start-dispatch', authenticateToken, (req, res) => {
    startDispatch(req, res, (data) => broadcastMessage('dispatch:progress', data, req.userId));
});

app.post('/api/stop-dispatch/:id', authenticateToken, (req, res) => {
    stopDispatch(req.params.id);
    res.json({ success: true });
});

// SPA fallback - serve index.html for all non-API and non-static routes
app.use((req, res, next) => {
    // Check if it's an API, uploads or has any file extension (contains a dot)
    const hasExtension = req.path.includes('.');
    const isApi = req.path.startsWith('/api');
    const isUploads = req.path.startsWith('/uploads');

    const isAuthBackend = req.path === '/auth/google' || req.path === '/auth/google/callback';

    if (!isApi && !isUploads && !isAuthBackend && !hasExtension) {
        res.sendFile(path.join(__dirname, '../dist/index.html'));
    } else {
        next();
    }
});

// Initialize server
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`
  🚀 tiZAP! Server Running
  ------------------------
  Port: ${PORT}
  Env:  ${process.env.NODE_ENV || 'development'}
  DB:   SQLite via Prisma
  ------------------------
  `);
});
