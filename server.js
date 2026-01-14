import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        const { phone } = req.body;
        await prisma.receivedMessage.updateMany({
            where: {
                contactPhone: phone,
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

// --- SERVE STATIC FILES ---
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
