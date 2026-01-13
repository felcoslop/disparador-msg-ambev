import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDB, initializeDB } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_VERIFY_TOKEN = 'ambev_webhook_token_2026'; // Should match meta dashboard

// Initialize DB on start
initializeDB().then(() => {
    console.log('[DB] Database ready');
}).catch(err => {
    console.error('[DB ERROR] Failed to initialize:', err);
});

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support large payloads (images/base64)

app.get('/health', (req, res) => res.send('OK'));

// Aggregate GET for initial load
app.get('/api/db', async (req, res) => {
    try {
        const email = req.query.email; // Frontend should pass ?email=...
        const db = await getDB();
        const users = await db.all('SELECT * FROM users');
        const history = await db.all('SELECT * FROM history ORDER BY id DESC');
        const receivedMessages = await db.all('SELECT * FROM received_messages ORDER BY id DESC');

        // Fetch config ONLY for the specific user if email provided
        let userConfig = { token: '', phoneId: '', wabaId: '', templateName: '', mapping: {} };
        if (email) {
            const user = await db.get('SELECT id FROM users WHERE email = ?', email);
            if (user) {
                const conf = await db.get('SELECT * FROM user_config WHERE user_id = ?', user.id);
                if (conf) {
                    userConfig = {
                        ...conf,
                        mapping: conf.mapping ? JSON.parse(conf.mapping) : {}
                    };
                }
            }
        }

        res.json({
            users,
            config: userConfig, // returns user-specific config
            history,
            receivedMessages
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to read database' });
    }
});

// Specific Sync Endpoints (Transactional)
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = await getDB();
        await db.run('INSERT INTO users (email, password) VALUES (?, ?)', email, password);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const { email, token, phoneId, wabaId, templateName, mapping } = req.body; // Expect email to link config
        const db = await getDB();
        const user = await db.get('SELECT id FROM users WHERE email = ?', email);

        if (!user) return res.status(404).json({ error: 'User not found' });

        await db.run(`INSERT OR REPLACE INTO user_config (user_id, token, phoneId, wabaId, templateName, mapping) 
                      VALUES (?, ?, ?, ?, ?, ?)`,
            user.id, token, phoneId, wabaId, templateName, JSON.stringify(mapping));

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save config' });
    }
});

// Universal Save (Legacy Support - Maps mostly to Config/History updates if strictly needed, 
// but we encourage specific endpoints. For now, if frontend calls POST /api/db, we try to parse relevant parts)
app.post('/api/db', async (req, res) => {
    try {
        const { users, config, history, email } = req.body;
        const db = await getDB();

        // Transactional update attempt
        await db.exec('BEGIN TRANSACTION');

        if (config && email) {
            const user = await db.get('SELECT id FROM users WHERE email = ?', email);
            if (user) {
                // Determine existing mapping to avoid overwriting with null if only partial config sent
                const current = await db.get('SELECT * FROM user_config WHERE user_id = ?', user.id);
                const finalToken = config.token !== undefined ? config.token : (current?.token || '');
                const finalPhone = config.phoneId !== undefined ? config.phoneId : (current?.phoneId || '');
                const finalWaba = config.wabaId !== undefined ? config.wabaId : (current?.wabaId || '');
                const finalTemplate = config.templateName !== undefined ? config.templateName : (current?.templateName || '');
                const finalMapping = config.mapping !== undefined ? JSON.stringify(config.mapping) : (current?.mapping || '{}');

                await db.run(`INSERT OR REPLACE INTO user_config (user_id, token, phoneId, wabaId, templateName, mapping) 
                              VALUES (?, ?, ?, ?, ?, ?)`,
                    user.id, finalToken, finalPhone, finalWaba, finalTemplate, finalMapping);
            }
        }

        // Users: We don't overwrite users blindly to avoid deleting. We assume frontend handles registration via specific route.
        // But if provided and different, we might skip.

        // History: If provided, we could append? For now, let's rely on server-side job history.

        await db.exec('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await db.exec('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to sync database' });
    }
});

// --- JOB STATE ---
let activeJob = {
    status: 'idle', // idle, sending, paused, completed, error
    campaignData: [],
    progress: { current: 0, total: 0 },
    logs: [],
    errors: [],
    config: {}, // Current API conf
    templateName: '',
    dates: { old: '', new: '' },
    shouldPause: false, // Flag to control pausing
    abortController: null // To cancel fetch if needed (optional)
};

// --- HELPER: SLEEP ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: SEND WHATSAPP (Server Side) ---
const sendWhatsApp = async (phone, config, templateName, variables) => {
    try {
        const url = `https://graph.facebook.com/v21.0/${config.phoneId}/messages`;
        const payload = {
            messaging_product: "whatsapp",
            to: phone,
            type: "template",
            template: {
                name: templateName,
                language: { code: "pt_BR" },
                components: [
                    {
                        type: "body",
                        parameters: variables.map(v => ({ type: "text", text: String(v) }))
                    }
                ]
            }
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
            throw new Error(data.error?.message || 'Erro desconhecido na API do Meta');
        }
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// --- BACKGROUND WORKER ---
const processCampaign = async () => {
    activeJob.status = 'sending';
    const { campaignData, config, templateName, dates } = activeJob;

    console.log(`[JOB] Starting campaign for ${campaignData.length} contacts...`);

    for (let i = activeJob.progress.current; i < campaignData.length; i++) {
        // CHECK PAUSE/CANCEL
        if (activeJob.status === 'paused') {
            console.log(`[JOB] Paused at index ${i}`);
            return;
        }
        if (activeJob.status === 'idle' || activeJob.status === 'completed') {
            console.log(`[JOB] Stopped.`);
            return;
        }

        const row = campaignData[i];

        // Prepare Variables
        // LOGIC: If template expects {{1}} as name, and date logic is separate
        // For 'alteracao_entrega_ambev', we assume variables in order? 
        // Or strictly mapping? For simplicity, we assume the specific template structure:
        // {{1}} = Nome Cliente, {{2}} = Pedido, {{3}} = Data Antiga, {{4}} = Data Nova
        // We will respect the previous logic: [Nome, Pedido, DataAntiga, DataNova]

        // DATE LOGIC REPLICATION (Server Side)
        const getRelativeDate = (dateStr) => {
            // Basic implementation: if dateStr matches today/tomorrow logic
            // For strict MVP, we pass the raw strings from the frontend 'dates' object
            // which already has the logic or user input.
            // Wait, the frontend passed 'dates'. We use them directly.
            return dateStr;
        };

        const params = [
            row['Nome fantasia'] || row['fantasy_name'] || 'Cliente',
            row['Nº do Pedido'] || row['order_number'] || 'N/A',
            dates.old,
            dates.new
        ];

        // Send
        const res = await sendWhatsApp(row['Tel. Promax'] || row['phone'], config, templateName, params);

        // Update State
        if (res.success) {
            activeJob.logs.unshift({ id: i, phone: row['phone'], status: 'success', time: new Date().toLocaleTimeString() });
        } else {
            activeJob.errors.push({
                id: i,
                phone: row['phone'],
                error: res.error,
                row_data: row // Save for retry
            });
            activeJob.logs.unshift({ id: i, phone: row['phone'], status: 'error', msg: res.error, time: new Date().toLocaleTimeString() });
        }

        activeJob.progress.current = i + 1;

        // Rate Limit (Safety)
        await sleep(200); // 5 msg/sec max
    }

    activeJob.status = 'completed';
    console.log(`[JOB] Completed!`);
};

// --- INDIVIDUAL MESSAGE SENDER ---
const sendSingleMessage = async (phone, text, config) => {
    try {
        const url = `https://graph.facebook.com/v21.0/${config.phoneId}/messages`;
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phone,
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
            throw new Error(data.error?.message || 'Erro ao enviar mensagem individual');
        }
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// --- WEBHOOK ENDPOINTS ---

// GET: Verification for Meta
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
    }
});

// POST: Receive messages from Meta
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;

        if (body.object === 'whatsapp_business_account') {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
                const message = body.entry[0].changes[0].value.messages[0];
                const contact = body.entry[0].changes[0].value.contacts[0];

                const from = message.from; // Phone number
                const name = contact.profile.name || 'Cliente';
                const text = message.text ? message.text.body : '[Mensagem de mídia/outro tipo]';

                console.log(`[WEBHOOK] Nova mensagem de ${name} (${from}): ${text}`);

                const db = await getDB();
                await db.run(
                    'INSERT INTO received_messages (contact_phone, contact_name, message_body, is_from_me) VALUES (?, ?, ?, ?)',
                    from, name, text, 0
                );
            }
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    } catch (err) {
        console.error('[WEBHOOK ERROR]', err);
        res.sendStatus(500);
    }
});

// --- API ROUTES FOR JOB ---

app.get('/api/status', (req, res) => {
    res.json({
        status: activeJob.status,
        progress: activeJob.progress,
        logs: activeJob.logs.slice(0, 50), // Send only recent logs
        errors: activeJob.errors
    });
});

app.post('/api/start-campaign', (req, res) => {
    const { data, config, templateName, dates } = req.body;

    if (activeJob.status === 'sending') {
        return res.status(400).json({ error: 'Já existe uma campanha em andamento.' });
    }

    // Reset Job
    activeJob = {
        status: 'idle',
        campaignData: data,
        progress: { current: 0, total: data.length },
        logs: [],
        errors: [],
        config,
        templateName,
        dates,
        shouldPause: false
    };

    // Trigger Worker (Async - do not await)
    processCampaign();

    res.json({ success: true, message: 'Campanha iniciada em background.' });
});

app.post('/api/control', (req, res) => {
    const { action } = req.body; // pause, resume, stop

    if (action === 'pause') {
        activeJob.status = 'paused';
    } else if (action === 'resume') {
        if (activeJob.status === 'paused') {
            // Resume logic: just call processCampaign again, it picks up from progress.current
            processCampaign();
        }
    } else if (action === 'stop') {
        activeJob.status = 'idle';
        activeJob.progress.current = 0; // Reset? Or just stop?
        // Usually stop means cancel
    }

    res.json({ success: true, status: activeJob.status });
});

app.post('/api/send-message', async (req, res) => {
    try {
        const { phone, text, email } = req.body;
        const db = await getDB();

        // Find user config
        const user = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        const config = await db.get('SELECT * FROM user_config WHERE user_id = ?', user.id);
        if (!config || !config.token || !config.phoneId) {
            return res.status(400).json({ error: 'Configuração da Meta incompleta' });
        }

        const result = await sendSingleMessage(phone, text, config);

        if (result.success) {
            // Log in received_messages as from_me = 1
            await db.run(
                'INSERT INTO received_messages (contact_phone, contact_name, message_body, is_from_me) VALUES (?, ?, ?, ?)',
                phone, 'Eu', text, 1
            );
            res.json({ success: true });
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Falha ao enviar mensagem' });
    }
});

// Serve React Static Files (Production)
app.use(express.static(path.join(__dirname, 'dist')));

// Handle React Routing
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
