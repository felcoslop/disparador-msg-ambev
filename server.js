console.log('[STARTUP] Starting server process...');
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const prisma = new PrismaClient();

const PORT = process.env.PORT || 3000;
const WEBHOOK_VERIFY_TOKEN = 'ambev_webhook_token_2026';

// --- WebSocket Client Management ---
const clients = new Map(); // userId -> Set of WebSocket connections

wss.on('connection', (ws, req) => {
    console.log('[WS] New connection');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            if (data.type === 'auth' && data.userId) {
                // Associate this connection with a user
                if (!clients.has(data.userId)) {
                    clients.set(data.userId, new Set());
                }
                clients.get(data.userId).add(ws);
                ws.userId = data.userId;
                console.log(`[WS] Client authenticated for user ${data.userId}`);
            }
        } catch (e) {
            console.error('[WS] Parse error:', e);
        }
    });

    ws.on('close', () => {
        if (ws.userId && clients.has(ws.userId)) {
            clients.get(ws.userId).delete(ws);
            if (clients.get(ws.userId).size === 0) {
                clients.delete(ws.userId);
            }
        }
        console.log('[WS] Client disconnected');
    });
});

// Broadcast to all connections of a specific user
function broadcast(userId, event, data) {
    if (clients.has(userId)) {
        const message = JSON.stringify({ event, data });
        clients.get(userId).forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }
}

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Debug Middleware ---
app.use((req, res, next) => {
    if (req.path === '/webhook') {
        console.log(`[DEBUG] ${req.method} ${req.path} - ${new Date().toISOString()}`);
    }
    next();
});

// --- Health Check ---
app.get('/health', (req, res) => res.send('OK'));

// --- AUTH ROUTES ---

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { email, name, password } = req.body;

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(400).json({ error: 'E-mail já cadastrado' });
        }

        const user = await prisma.user.create({
            data: { email, name, password }
        });

        // Create empty config
        await prisma.userConfig.create({
            data: { userId: user.id }
        });

        res.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    } catch (err) {
        console.error('[REGISTER ERROR]', err);
        res.status(500).json({ error: 'Erro ao cadastrar usuário' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email },
            include: { config: true }
        });

        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'E-mail ou senha incorretos' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                config: user.config ? {
                    token: user.config.token,
                    phoneId: user.config.phoneId,
                    wabaId: user.config.wabaId,
                    templateName: user.config.templateName,
                    mapping: JSON.parse(user.config.mapping || '{}')
                } : null
            }
        });
    } catch (err) {
        console.error('[LOGIN ERROR]', err);
        res.status(500).json({ error: 'Erro ao fazer login' });
    }
});

// --- USER ROUTES ---

// Get user with config
app.get('/api/user/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { config: true }
        });

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            config: user.config ? {
                token: user.config.token,
                phoneId: user.config.phoneId,
                wabaId: user.config.wabaId,
                templateName: user.config.templateName,
                mapping: JSON.parse(user.config.mapping || '{}')
            } : null
        });
    } catch (err) {
        console.error('[GET USER ERROR]', err);
        res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
});

// Update config
app.put('/api/config/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const { token, phoneId, wabaId, templateName, mapping } = req.body;

        const config = await prisma.userConfig.upsert({
            where: { userId },
            update: {
                token: token ?? undefined,
                phoneId: phoneId ?? undefined,
                wabaId: wabaId ?? undefined,
                templateName: templateName ?? undefined,
                mapping: mapping ? JSON.stringify(mapping) : undefined
            },
            create: {
                userId,
                token: token || '',
                phoneId: phoneId || '',
                wabaId: wabaId || '',
                templateName: templateName || '',
                mapping: JSON.stringify(mapping || {})
            }
        });

        res.json({ success: true, config });
    } catch (err) {
        console.error('[CONFIG ERROR]', err);
        res.status(500).json({ error: 'Erro ao salvar configurações' });
    }
});

// --- DISPATCH ROUTES ---

// Get all dispatches for user
app.get('/api/dispatch/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);

        const dispatches = await prisma.dispatch.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { logs: true } }
            }
        });

        res.json(dispatches.map(d => ({
            ...d,
            leadsData: undefined, // Don't send full leads data in list
            logCount: d._count.logs
        })));
    } catch (err) {
        console.error('[GET DISPATCHES ERROR]', err);
        res.status(500).json({ error: 'Erro ao buscar disparos' });
    }
});

// Get specific dispatch with logs
app.get('/api/dispatch/:userId/:dispatchId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const dispatchId = parseInt(req.params.dispatchId);

        const dispatch = await prisma.dispatch.findFirst({
            where: { id: dispatchId, userId },
            include: {
                logs: {
                    orderBy: { createdAt: 'desc' },
                    take: 100
                }
            }
        });

        if (!dispatch) {
            return res.status(404).json({ error: 'Disparo não encontrado' });
        }

        res.json(dispatch);
    } catch (err) {
        console.error('[GET DISPATCH ERROR]', err);
        res.status(500).json({ error: 'Erro ao buscar disparo' });
    }
});

// --- ACTIVE JOBS MAP ---
const activeJobs = new Map(); // dispatchId -> { intervalId, shouldStop }

// --- HELPER: SLEEP ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: SEND WHATSAPP ---
const sendWhatsApp = async (phone, config, templateName, variables) => {
    try {
        // Normalize phone
        let normalizedPhone = String(phone).replace(/\D/g, '');
        if (normalizedPhone && !normalizedPhone.startsWith('55')) {
            normalizedPhone = '55' + normalizedPhone;
        }

        const url = `https://graph.facebook.com/v21.0/${config.phoneId}/messages`;

        // Ensure template name is trimmed
        const finalTemplateName = String(templateName).trim();

        const payload = {
            messaging_product: "whatsapp",
            to: normalizedPhone,
            type: "template",
            template: {
                name: finalTemplateName,
                language: { code: "pt_BR" },
                components: [
                    {
                        type: "body",
                        parameters: variables.map(v => ({ type: "text", text: String(v || '').trim() }))
                    }
                ]
            }
        };

        console.log(`[META PAYLOAD] To: ${normalizedPhone} | Template: ${finalTemplateName} | Params: ${variables.length}`);


        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();
        if (!response.ok) {
            console.error('[META ERROR]', JSON.stringify(data, null, 2));
            console.error('[PAYLOAD SENT]', JSON.stringify(payload, null, 2));
            throw new Error(data.error?.message || 'Erro desconhecido na API do Meta');
        }

        return { success: true, data, phone: normalizedPhone };
    } catch (error) {
        if (error.name === 'AbortError') {
            return { success: false, error: 'Timeout: Meta API demorou muito para responder', phone };
        }
        return { success: false, error: error.message, phone };
    }
};



// --- PROCESS DISPATCH (Background Worker) ---
async function processDispatch(dispatchId) {
    console.log(`[JOB ${dispatchId}] Starting...`);

    try {
        const dispatch = await prisma.dispatch.findUnique({
            where: { id: dispatchId },
            include: { user: { include: { config: true } } }
        });

        if (!dispatch || !dispatch.user.config) {
            console.error(`[JOB ${dispatchId}] No dispatch or config found`);
            return;
        }

        const config = dispatch.user.config;
        const leads = JSON.parse(dispatch.leadsData);
        const userId = dispatch.userId;

        // Ensure status is running if it was idle or paused
        if (dispatch.status !== 'running') {
            await prisma.dispatch.update({
                where: { id: dispatchId },
                data: { status: 'running' }
            });
            broadcast(userId, 'dispatch:status', { dispatchId, status: 'running' });
        }

        for (let i = dispatch.currentIndex; i < leads.length; i++) {
            // Check if job should stop
            const job = activeJobs.get(dispatchId);
            if (!job || job.shouldStop) {
                console.log(`[JOB ${dispatchId}] Paused at index ${i}`);
                await prisma.dispatch.update({
                    where: { id: dispatchId },
                    data: { status: 'paused', currentIndex: i }
                });
                broadcast(userId, 'dispatch:status', { dispatchId, status: 'paused' });
                activeJobs.delete(dispatchId);
                return;
            }

            const lead = leads[i];
            const phone = lead['Tel. Promax'] || lead['phone'] || lead['telefone'] || lead['Tel.'];

            if (!phone) {
                console.warn(`[JOB ${dispatchId}] Skipping lead at index ${i} - No phone found`);
                await prisma.dispatch.update({
                    where: { id: dispatchId },
                    data: { currentIndex: i + 1 }
                });
                continue;
            }

            const params = [
                String(lead['Nome fantasia'] || lead['fantasy_name'] || lead['nome'] || 'Cliente').substring(0, 100),
                String(lead['Nº do Pedido'] || lead['order_number'] || lead['pedido'] || 'N/A').substring(0, 100),
                String(dispatch.dateOld || 'hoje').substring(0, 50),
                String(dispatch.dateNew || 'amanhã').substring(0, 50)
            ];

            const result = await sendWhatsApp(phone, config, dispatch.templateName, params);

            // Create log
            await prisma.dispatchLog.create({
                data: {
                    dispatchId,
                    phone: String(result.phone || phone || ''),
                    status: result.success ? 'success' : 'error',
                    message: result.success ? null : result.error
                }
            });

            if (result.success) {
                try {
                    // Unified History: Check if we have enough params, otherwise fallback
                    const p0 = params[0] || '';
                    const p1 = params[1] || '';
                    const p2 = params[2] || '';
                    const p3 = params[3] || '';

                    const unifiedBody = `Olá, ${p0}. Informamos que, devido a um imprevisto logístico, o pedido ${p1} não será entregue ${p2}. A entrega foi reagendada e será realizada ${p3}. Agradecemos a compreensão e seguimos à disposição.`;

                    await prisma.receivedMessage.create({
                        data: {
                            contactPhone: String(result.phone || phone).replace(/\D/g, ''),
                            contactName: p0,
                            messageBody: unifiedBody,
                            isFromMe: true,
                            isRead: true
                        }
                    });

                    // Trigger UI to fetch messages immediately
                    broadcast(userId, 'message:received', {});
                } catch (histErr) {
                    console.error('[UNIFIED HISTORY ERROR]', histErr);
                }
            }

            // Update database state
            const updateData = {
                currentIndex: i + 1,
            };
            if (result.success) {
                updateData.successCount = { increment: 1 };
            } else {
                updateData.errorCount = { increment: 1 };
            }

            const updated = await prisma.dispatch.update({
                where: { id: dispatchId },
                data: updateData
            });

            // Broadcast progress to UI
            broadcast(userId, 'dispatch:progress', {
                dispatchId,
                currentIndex: i + 1,
                totalLeads: leads.length,
                successCount: updated.successCount,
                errorCount: updated.errorCount,
                status: 'running',
                lastLog: {
                    phone: result.phone || phone,
                    status: result.success ? 'success' : 'error',
                    message: result.error || null
                }
            });

            // Rate limit (approx 5 msgs per second)
            await sleep(200);
        }

        // Loop finished naturally
        console.log(`[JOB ${dispatchId}] Completed successfully`);
        await prisma.dispatch.update({
            where: { id: dispatchId },
            data: { status: 'completed' }
        });

        broadcast(userId, 'dispatch:status', { dispatchId, status: 'completed' });
        broadcast(userId, 'dispatch:complete', { dispatchId });
        activeJobs.delete(dispatchId);

    } catch (err) {
        console.error(`[JOB ${dispatchId}] Fatal error:`, err);
        // Attempt to set status to error so it's not stuck 'running'
        try {
            await prisma.dispatch.update({
                where: { id: dispatchId },
                data: { status: 'error' }
            });
            // We don't have direct access to userId in some catch paths, 
            // but we can try to find it or just let the polling handle it.
        } catch (subErr) {
            console.error('[CRITICAL] Failed to update job status to error:', subErr);
        }
    }
}


// Create and start dispatch
app.post('/api/dispatch/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const { templateName, dateOld, dateNew, leads } = req.body;

        if (!leads || !leads.length) {
            return res.status(400).json({ error: 'Nenhum lead fornecido' });
        }

        // Check for existing running dispatch for this user
        const running = await prisma.dispatch.findFirst({
            where: { userId, status: { in: ['running', 'idle'] } }
        });

        if (running) {
            return res.status(400).json({ error: 'Já existe um disparo em andamento' });
        }

        // Create dispatch
        const dispatch = await prisma.dispatch.create({
            data: {
                userId,
                templateName,
                dateOld,
                dateNew,
                totalLeads: leads.length,
                leadsData: JSON.stringify(leads),
                status: 'running'
            }
        });

        // Register job
        activeJobs.set(dispatch.id, { shouldStop: false });

        // Start processing (async)
        processDispatch(dispatch.id);

        res.json({ success: true, dispatchId: dispatch.id });
    } catch (err) {
        console.error('[CREATE DISPATCH ERROR]', err);
        res.status(500).json({ error: 'Erro ao criar disparo' });
    }
});

// Control dispatch (pause/resume/stop)
app.post('/api/dispatch/:dispatchId/control', async (req, res) => {
    try {
        const dispatchId = parseInt(req.params.dispatchId);
        const { action } = req.body; // pause, resume, stop

        const dispatch = await prisma.dispatch.findUnique({
            where: { id: dispatchId }
        });

        if (!dispatch) {
            return res.status(404).json({ error: 'Disparo não encontrado' });
        }

        if (action === 'pause') {
            const job = activeJobs.get(dispatchId);
            if (job) job.shouldStop = true;
            await prisma.dispatch.update({
                where: { id: dispatchId },
                data: { status: 'paused' }
            });
            broadcast(dispatch.userId, 'dispatch:status', { dispatchId, status: 'paused' });
        } else if (action === 'resume') {
            // Check if another job is running
            const running = await prisma.dispatch.findFirst({
                where: { userId: dispatch.userId, status: 'running' }
            });

            if (running && running.id !== dispatchId) {
                return res.status(400).json({ error: 'Já existe um outro disparo em andamento.' });
            }

            activeJobs.set(dispatchId, { shouldStop: false });
            processDispatch(dispatchId);
            // status update is handled inside processDispatch
        } else if (action === 'stop') {
            const job = activeJobs.get(dispatchId);
            if (job) job.shouldStop = true;
            await prisma.dispatch.update({
                where: { id: dispatchId },
                data: { status: 'stopped' }
            });
            broadcast(dispatch.userId, 'dispatch:status', { dispatchId, status: 'stopped' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[CONTROL DISPATCH ERROR]', err);
        res.status(500).json({ error: 'Erro ao controlar disparo' });
    }
});

// Retry failed leads only
app.post('/api/dispatch/:dispatchId/retry', async (req, res) => {
    try {
        const dispatchId = parseInt(req.params.dispatchId);

        const dispatch = await prisma.dispatch.findUnique({
            where: { id: dispatchId },
            include: { logs: { orderBy: { createdAt: 'desc' } } }
        });

        if (!dispatch) return res.status(404).json({ error: 'Disparo não encontrado' });

        // Get leads that failed (status 'error')
        // We match by phone number in logs
        const failedLogs = dispatch.logs.filter(l => l.status === 'error');
        if (failedLogs.length === 0) {
            return res.status(400).json({ error: 'Não há envios com erro para reintentar.' });
        }

        const allLeads = JSON.parse(dispatch.leadsData);

        // Helper to normalize phone numbers consistently
        const normalize = (p) => {
            let n = String(p || '').replace(/\D/g, '');
            if (n && !n.startsWith('55')) n = '55' + n;
            return n;
        };

        const failedPhones = new Set(failedLogs.map(l => normalize(l.phone)));

        const leadsToRetry = allLeads.filter(lead => {
            const p = normalize(lead['Tel. Promax'] || lead['phone'] || lead['telefone'] || lead['Tel.']);
            return p && failedPhones.has(p);
        });

        if (leadsToRetry.length === 0) {
            console.error('[RETRY] Could not map failed phones back to leads. Failed phones:', Array.from(failedPhones));
            return res.status(400).json({ error: 'Não foi possível mapear os erros para os leads originais.' });
        }


        // Create a NEW dispatch for these retries (easier to track)
        const newDispatch = await prisma.dispatch.create({
            data: {
                userId: dispatch.userId,
                templateName: dispatch.templateName,
                dateOld: dispatch.dateOld,
                dateNew: dispatch.dateNew,
                totalLeads: leadsToRetry.length,
                leadsData: JSON.stringify(leadsToRetry),
                status: 'running'
            }
        });

        activeJobs.set(newDispatch.id, { shouldStop: false });
        processDispatch(newDispatch.id);

        res.json({ success: true, dispatchId: newDispatch.id, message: `Iniciado reenvio para ${leadsToRetry.length} leads.` });

    } catch (err) {
        console.error('[RETRY ERROR]', err);
        res.status(500).json({ error: 'Erro ao reintentar disparos' });
    }
});


// --- MESSAGES ROUTES ---

// Get received messages
app.get('/api/messages', async (req, res) => {
    try {
        const messages = await prisma.receivedMessage.findMany({
            orderBy: { createdAt: 'desc' },
            take: 200
        });
        res.json(messages);
    } catch (err) {
        console.error('[GET MESSAGES ERROR]', err);
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
});

// Mark messages as read
app.post('/api/messages/mark-read', async (req, res) => {
    try {
        const { phone, phones } = req.body;
        const targetPhones = phones || [phone];

        await prisma.receivedMessage.updateMany({
            where: {
                contactPhone: { in: targetPhones },
                isRead: false
            },
            data: { isRead: true }
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[MARK READ ERROR]', err);
        res.status(500).json({ error: 'Erro ao marcar como lida' });
    }
});

// Delete messages
app.post('/api/messages/delete', async (req, res) => {
    try {
        const { phones } = req.body;
        if (!phones || !Array.isArray(phones) || phones.length === 0) {
            return res.status(400).json({ error: 'Nenhum telefone fornecido' });
        }
        await prisma.receivedMessage.deleteMany({
            where: {
                contactPhone: { in: phones }
            }
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[DELETE MESSAGES ERROR]', err);
        res.status(500).json({ error: 'Erro ao excluir mensagens' });
    }
});

// Proxy route for contact profile photos
app.get('/api/contacts/:phone/photo', async (req, res) => {
    try {
        const { phone } = req.params;
        const name = req.query.name || 'Contact';

        // NOTE: Official WhatsApp Cloud API does NOT provide an endpoint to fetch contact profile pictures.
        // To get real photos, you would normally use a third-party API like Whapi.Cloud or similar.
        // For now, we provide a consistent route that returns a styled avatar.

        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=280091&color=fff&size=500`;

        // Redirect to the avatar service (or fetch and pipe if you want to mask it)
        res.redirect(avatarUrl);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao processar foto' });
    }
});

// Send individual message
app.post('/api/send-message', async (req, res) => {
    try {
        const { userId, phone, text } = req.body;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { config: true }
        });

        if (!user || !user.config) {
            return res.status(400).json({ error: 'Configuração não encontrada' });
        }

        const config = user.config;

        let normalizedPhone = String(phone).replace(/\D/g, '');
        if (!normalizedPhone.startsWith('55')) {
            normalizedPhone = '55' + normalizedPhone;
        }

        const url = `https://graph.facebook.com/v21.0/${config.phoneId}/messages`;
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: normalizedPhone,
            type: "text",
            text: { body: text }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || 'Erro ao enviar mensagem');
        }

        // Log sent message
        await prisma.receivedMessage.create({
            data: {
                contactPhone: normalizedPhone,
                contactName: 'Eu',
                messageBody: text,
                isFromMe: true,
                isRead: true
            }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[SEND MESSAGE ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// --- FLOWS ROUTES ---

// Get all flows for user
app.get('/api/flows/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const flows = await prisma.flow.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' }
        });
        res.json(flows);
    } catch (err) {
        console.error('[GET FLOWS ERROR]', err);
        res.status(500).json({ error: 'Erro ao buscar fluxos' });
    }
});

// Get specific flow
app.get('/api/flows/:userId/:flowId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const flowId = parseInt(req.params.flowId);
        const flow = await prisma.flow.findFirst({
            where: { id: flowId, userId }
        });
        if (!flow) return res.status(404).json({ error: 'Fluxo não encontrado' });
        res.json(flow);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar fluxo' });
    }
});

// Create flow
app.post('/api/flows/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const { name, nodes, edges } = req.body;
        const flow = await prisma.flow.create({
            data: {
                userId,
                name,
                nodes: JSON.stringify(nodes || []),
                edges: JSON.stringify(edges || [])
            }
        });
        res.json({ success: true, flow });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao criar fluxo' });
    }
});

// Update flow
app.put('/api/flows/:userId/:flowId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const flowId = parseInt(req.params.flowId);
        const { name, nodes, edges } = req.body;

        const flow = await prisma.flow.updateMany({
            where: { id: flowId, userId },
            data: {
                name,
                nodes: JSON.stringify(nodes),
                edges: JSON.stringify(edges)
            }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar fluxo' });
    }
});

// Delete flow
app.delete('/api/flows/:userId/:flowId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const flowId = parseInt(req.params.flowId);
        await prisma.flow.deleteMany({
            where: { id: flowId, userId }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao excluir fluxo' });
    }
});

// Start flow for contacts
app.post('/api/flows/:flowId/start', async (req, res) => {
    try {
        const flowId = parseInt(req.params.flowId);
        const { phones } = req.body; // Array of phone numbers

        const flow = await prisma.flow.findUnique({
            where: { id: flowId },
            include: { user: { include: { config: true } } }
        });

        if (!flow) return res.status(404).json({ error: 'Fluxo não encontrado' });

        const nodes = JSON.parse(flow.nodes);
        const startNode = nodes.find(n => n.type === 'start' || n.data?.isStart);
        // Assuming first node or specific start node. 
        // If not explicit, take the first one or the one with no incoming edges (simplified: first in array for now or specifically 'start' type if we make one)
        // Let's assume user connects from a "Start" node or we pick the first message node.

        // Better strategy: Find node with no target handles connected? 
        // For simplicity, we'll assume the user design starts with a specific node or we take the first MessageNode.
        // Let's rely on a helper to find start node.
        const initialNodeId = nodes[0]?.id; // Simplest start

        if (!initialNodeId) return res.status(400).json({ error: 'Fluxo vazio' });

        let count = 0;
        for (let phone of phones) {
            let normalized = String(phone).replace(/\D/g, '');
            if (!normalized.startsWith('55')) normalized = '55' + normalized;

            // Create or update session
            // We terminate old session if exists
            await prisma.flowSession.deleteMany({
                where: { contactPhone: normalized } // Ensure only one active session per phone globally? Or per flow? Per phone usually.
            });

            const session = await prisma.flowSession.create({
                data: {
                    flowId,
                    contactPhone: normalized,
                    currentStep: initialNodeId,
                    status: 'active',
                    variables: '{}'
                }
            });

            // Trigger first step execution immediately
            await FlowEngine.executeStep(session, flow, flow.user.config);
            count++;
        }

        res.json({ success: true, count });
    } catch (err) {
        console.error('[START FLOW ERROR]', err);
        res.status(500).json({ error: 'Erro ao iniciar fluxo' });
    }
});

// Get flow sessions for history
app.get('/api/flow-sessions/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);

        // Get all flows for this user
        const flows = await prisma.flow.findMany({
            where: { userId },
            select: { id: true, name: true, nodes: true }
        });

        const flowIds = flows.map(f => f.id);

        // Get all sessions for these flows
        const sessions = await prisma.flowSession.findMany({
            where: { flowId: { in: flowIds } },
            orderBy: { updatedAt: 'desc' },
            take: 100
        });

        // Enrich sessions with flow name and current step name
        const enrichedSessions = sessions.map(session => {
            const flow = flows.find(f => f.id === session.flowId);
            let currentStepName = 'Desconhecido';

            if (flow && session.currentStep) {
                try {
                    const nodes = JSON.parse(flow.nodes);
                    const node = nodes.find(n => n.id === session.currentStep);
                    if (node) {
                        currentStepName = node.data?.label || node.data?.templateName || `Nó ${node.id}`;
                    }
                } catch (e) { }
            }

            return {
                ...session,
                flowName: flow?.name || 'Fluxo removido',
                currentStepName
            };
        });

        res.json(enrichedSessions);
    } catch (err) {
        console.error('[GET FLOW SESSIONS ERROR]', err);
        res.status(500).json({ error: 'Erro ao buscar sessões' });
    }
});

// Get logs for a specific flow session
app.get('/api/flow-session-logs/:sessionId', async (req, res) => {
    try {
        const sessionId = parseInt(req.params.sessionId);

        const logs = await prisma.flowSessionLog.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'asc' }
        });

        res.json(logs);
    } catch (err) {
        console.error('[GET SESSION LOGS ERROR]', err);
        res.status(500).json({ error: 'Erro ao buscar logs' });
    }
});

// --- FLOW ENGINE LOGIC ---
const FlowEngine = {
    async logAction(sessionId, nodeId, nodeName, action, details) {
        try {
            await prisma.flowSessionLog.create({
                data: { sessionId, nodeId, nodeName, action, details }
            });
        } catch (e) {
            console.error('[FLOW LOG ERROR]', e);
        }
    },

    async executeStep(session, flow, config) {
        try {
            const nodes = JSON.parse(flow.nodes);
            const edges = JSON.parse(flow.edges);
            const currentNode = nodes.find(n => n.id === session.currentStep);

            if (!currentNode) {
                console.log(`[FLOW] Node ${session.currentStep} not found. Ending session.`);
                await this.logAction(session.id, session.currentStep, null, 'error', 'Nó não encontrado no fluxo');
                await this.endSession(session.id, 'Fluxo concluído - nó não encontrado');
                return;
            }

            const nodeName = currentNode.data?.label || currentNode.data?.templateName || `Nó ${currentNode.id}`;
            console.log(`[FLOW] Executing node ${currentNode.id} (${currentNode.type}) for ${session.contactPhone}`);

            // Handle Node Logic based on Type
            if (currentNode.type === 'templateNode') {
                const templateName = currentNode.data.templateName;
                const variables = currentNode.data.params || [];
                if (templateName) {
                    const result = await sendWhatsApp(session.contactPhone, config, templateName, variables);
                    await this.logAction(session.id, currentNode.id, nodeName, 'sent_message', `Template: ${templateName}`);
                }
            } else if (currentNode.type === 'imageNode') {
                const imageUrl = currentNode.data.imageUrl;
                if (imageUrl) {
                    await this.sendWhatsAppImage(session.contactPhone, imageUrl, config);
                    await this.logAction(session.id, currentNode.id, nodeName, 'sent_message', `Imagem: ${imageUrl}`);
                }
            } else if (currentNode.type === 'messageNode' || currentNode.type === 'optionsNode' || !currentNode.type) {
                const messageText = currentNode.data.label || currentNode.data.message || '';
                if (messageText) {
                    await this.sendWhatsAppText(session.contactPhone, messageText, config);
                    await this.logAction(session.id, currentNode.id, nodeName, 'sent_message', messageText.substring(0, 100));
                }
            }

            // Determine next state
            const outboundEdges = edges.filter(e => e.source === currentNode.id);

            // Check for specific handles that imply waiting for reply
            const hasOptions = outboundEdges.some(e => e.sourceHandle?.startsWith('source-') && e.sourceHandle !== 'source-gray');

            if (hasOptions || currentNode.data?.waitForReply) {
                await prisma.flowSession.update({
                    where: { id: session.id },
                    data: { status: 'waiting_reply' }
                });
                await this.logAction(session.id, currentNode.id, nodeName, 'waiting_reply', 'Aguardando resposta do cliente');
            } else {
                // "Gray" or default path -> Move immediately
                const nextEdge = outboundEdges.find(e => e.sourceHandle === 'source-gray' || !e.sourceHandle);
                if (nextEdge) {
                    await prisma.flowSession.update({
                        where: { id: session.id },
                        data: { currentStep: nextEdge.target }
                    });
                    // Recursive call for next step
                    setTimeout(() => this.executeStep({ ...session, currentStep: nextEdge.target }, flow, config), 1000);
                } else {
                    await this.endSession(session.id, 'Fluxo concluído com sucesso');
                }
            }
        } catch (err) {
            console.error('[FLOW EXECUTION ERROR]', err);
            await this.logAction(session.id, session.currentStep, null, 'error', err.message);
        }
    },

    async sendWhatsAppImage(phone, imageUrl, config) {
        const url = `https://graph.facebook.com/v20.0/${config.phoneId}/messages`;

        // Ensure URL is absolute for Meta
        let fullImageUrl = imageUrl;
        if (imageUrl.startsWith('/uploads/')) {
            // Using a placeholder or trying to guess the host. 
            // Better: just use what's provided (user should provide public URL or we need to know server URL)
            // But let's assume it's external or correctly formatted.
        }

        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phone,
            type: "image",
            image: { link: fullImageUrl }
        };

        try {
            await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            console.error('[FLOW IMAGE SEND ERROR]', e);
        }
    },

    async processMessage(contactPhone, messageBody) {
        // Normalize phone number (remove DDI if needed or ensure format)
        let normalizedPhone = String(contactPhone).replace(/\D/g, '');
        if (!normalizedPhone.startsWith('55')) {
            normalizedPhone = '55' + normalizedPhone;
        }

        console.log(`[FLOW] Processing response from ${normalizedPhone}: "${messageBody}"`);

        // Find active session
        const session = await prisma.flowSession.findFirst({
            where: {
                contactPhone: {
                    in: [normalizedPhone, normalizedPhone.replace('55', '')]
                },
                status: 'waiting_reply'
            },
            include: { flow: { include: { user: { include: { config: true } } } } }
        });

        if (!session) {
            console.log(`[FLOW] No active session found for ${normalizedPhone}`);
            return;
        }

        const flow = session.flow;
        const config = flow.user.config;
        const nodes = JSON.parse(flow.nodes);
        const edges = JSON.parse(flow.edges);
        const currentNode = nodes.find(n => n.id === session.currentStep);

        if (!currentNode) {
            console.error(`[FLOW] Current step ${session.currentStep} not found in nodes.`);
            return;
        }

        const nodeName = currentNode.data?.label || currentNode.data?.templateName || `Nó ${currentNode.id}`;

        // Validation Logic
        let nextNodeId = null;
        let isValid = true;

        const outboundEdges = edges.filter(e => e.source === currentNode.id);

        // Robust Numeric Matching (1, 2, 3, 4, 5, ...)
        // Check if any edge has 'source-N' format
        const hasNumericOptions = outboundEdges.some(e => e.sourceHandle?.startsWith('source-') && /^\d+$/.test(e.sourceHandle.split('-')[1]));

        if (hasNumericOptions) {
            const body = messageBody.trim().toLowerCase();
            // 1. Try exact numeric match
            const match = body.match(/^\d+$/);
            let choice = match ? match[0] : null;

            // 2. Try matching by option text
            const options = currentNode.data?.options || [];
            if (!choice) {
                const optIndex = options.findIndex(opt => opt.toLowerCase() === body);
                if (optIndex !== -1) {
                    choice = String(optIndex + 1);
                }
            }

            // 3. Try matching "1." or "Option 1" (extract first number if simple)
            if (!choice && body.length < 10) {
                const simpleMatch = body.match(/\d+/);
                if (simpleMatch) choice = simpleMatch[0];
            }

            if (choice) {
                const chosenEdge = outboundEdges.find(e => e.sourceHandle === `source-${choice}`);
                if (chosenEdge) {
                    nextNodeId = chosenEdge.target;
                } else {
                    isValid = false;
                }
            } else {
                isValid = false;
            }
        } else {
            // Check for Green/Red generic validation
            const greenEdge = outboundEdges.find(e => e.sourceHandle === 'source-green');
            if (greenEdge) {
                nextNodeId = greenEdge.target;
            }
        }

        if (!isValid) {
            const redEdge = outboundEdges.find(e => e.sourceHandle === 'source-red' || e.sourceHandle === 'source-invalid');
            if (redEdge) {
                await prisma.flowSession.update({
                    where: { id: session.id },
                    data: { currentStep: redEdge.target, status: 'active' }
                });
                await this.logAction(session.id, currentNode.id, nodeName, 'invalid_reply', `Resposta inválida: ${messageBody}`);
                await this.executeStep({ ...session, currentStep: redEdge.target }, flow, config);
                return;
            } else {
                await this.sendWhatsAppText(normalizedPhone, "Opção inválida. Por favor tente novamente.", config);
                await this.logAction(session.id, currentNode.id, nodeName, 'invalid_reply', `"${messageBody}" - pedido para repetir`);
                return;
            }
        }

        if (nextNodeId) {
            await this.logAction(session.id, currentNode.id, nodeName, 'received_reply', `Resposta recebida: "${messageBody}"`);
            await prisma.flowSession.update({
                where: { id: session.id },
                data: { currentStep: nextNodeId, status: 'active' }
            });
            await this.executeStep({ ...session, currentStep: nextNodeId }, flow, config);
        } else {
            await this.endSession(session.id, 'Fluxo concluído - fim das opções');
        }
    },

    async endSession(sessionId, reason = 'Fluxo concluído') {
        await prisma.flowSession.update({
            where: { id: sessionId },
            data: { status: 'completed' }
        });
        await this.logAction(sessionId, null, null, 'completed', reason);
    },

    async sendWhatsAppText(phone, text, config) {
        // Using the existing 'sendWhatsApp' logic adaptation or calling the API directly
        // We duplicate simplified logic here to avoid dependency on global generic sendWhatsApp if it's strictly for Templates. 
        // The existing 'sendWhatsApp' function is for TEMPLATES.
        // We need TEXT message support.

        const url = `https://graph.facebook.com/v20.0/${config.phoneId}/messages`;
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phone,
            type: "text",
            text: { body: text }
        };

        try {
            await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            console.error('[FLOW SEND ERROR]', e);
        }
    }
};

// --- WEBHOOK ---

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
            console.log('[WEBHOOK] Verified by Meta');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        console.log('[WEBHOOK] Received payload:', JSON.stringify(body, null, 2));

        if (body.object === 'whatsapp_business_account') {
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;

            if (value?.messages?.[0]) {
                const message = value.messages[0];
                const contact = value.contacts?.[0];

                const from = message.from;
                const name = contact?.profile?.name || 'Cliente';
                const text = message.text ? message.text.body : '[Mídia/Outro tipo]';

                console.log(`[WEBHOOK] Processing message from ${name} (${from}): ${text}`);

                await prisma.receivedMessage.create({
                    data: {
                        contactPhone: from,
                        contactName: name,
                        messageBody: text,
                        isFromMe: false,
                        isRead: false
                    }
                });

                // Process Flow
                if (text) {
                    await FlowEngine.processMessage(from, text);
                }

                // Broadcast to all connected clients
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            event: 'message:received',
                            data: { from, name, text }
                        }));
                    }
                });
            } else if (value?.statuses) {
                console.log('[WEBHOOK] Status update received');
            }
            res.sendStatus(200);
        } else {
            console.warn('[WEBHOOK] Unknown object type:', body.object);
            res.sendStatus(404);
        }
    } catch (err) {
        console.error('[WEBHOOK ERROR]', err);
        res.sendStatus(500);
    }
});

// --- LEGACY COMPAT: /api/status for polling fallback ---
app.get('/api/status/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);

        const dispatch = await prisma.dispatch.findFirst({
            where: {
                userId,
                status: { in: ['running', 'paused'] }
            },
            include: {
                logs: {
                    orderBy: { createdAt: 'desc' },
                    take: 50
                }
            }
        });

        if (!dispatch) {
            return res.json({ status: 'idle', progress: { current: 0, total: 0 }, logs: [], errors: [] });
        }

        res.json({
            dispatchId: dispatch.id,
            status: dispatch.status,
            progress: {
                current: dispatch.currentIndex,
                total: dispatch.totalLeads
            },
            successCount: dispatch.successCount,
            errorCount: dispatch.errorCount,
            logs: dispatch.logs.map(l => ({
                phone: l.phone,
                status: l.status,
                message: l.message,
                time: l.createdAt.toLocaleTimeString()
            })),
            errors: dispatch.logs.filter(l => l.status === 'error')
        });
    } catch (err) {
        console.error('[STATUS ERROR]', err);
        res.status(500).json({ error: 'Erro ao buscar status' });
    }
});

// --- IMAGE UPLOAD ---
app.post('/api/upload-image', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhuma imagem enviada' });
        }
        // Generate public URL for the uploaded file
        const url = `/uploads/${req.file.filename}`;
        res.json({ success: true, url, filename: req.file.filename });
    } catch (err) {
        console.error('[UPLOAD ERROR]', err);
        res.status(500).json({ error: 'Erro ao fazer upload' });
    }
});

// --- SERVE STATIC FILES ---
app.use('/uploads', express.static(uploadsDir));
app.use('/politics', express.static(path.join(__dirname, 'politics')));
app.use(express.static(path.join(__dirname, 'dist')));

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- START SERVER ---
const FINAL_PORT = process.env.PORT || 3000;
server.listen(FINAL_PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${FINAL_PORT}`);
    console.log(`📡 WebSocket ready on port ${FINAL_PORT}`);
});


// --- GRACEFUL SHUTDOWN ---
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await prisma.$disconnect();
    process.exit(0);
});
