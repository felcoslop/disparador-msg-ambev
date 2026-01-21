import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import XLSX from 'xlsx';
import { getDB, initializeDB } from './database.js';
import { sendWhatsAppMessage, sendWhatsAppImage, sendInteractiveButtons, sendInteractiveList } from './whatsapp.js';
import { sendPromoEmail } from './email.js';
import { EXIT_MSG, SUPPORT_MSG } from './flows.js';
import { startScheduler } from './scheduler.js';
import { startFlowForLead, processUserMessage } from './flow_interpreter.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// --- DATABASE INIT ---
await initializeDB();
startScheduler();

// --- WEBHOOK (META) ---
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
            console.log('[WEBHOOK] Verified ✓');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;

        let userResponse = null;
        if (msg.type === 'text') {
            userResponse = msg.text?.body?.trim();
        } else if (msg.type === 'interactive') {
            if (msg.interactive.type === 'button_reply') {
                userResponse = msg.interactive.button_reply.id;
            } else if (msg.interactive.type === 'list_reply') {
                userResponse = msg.interactive.list_reply.id;
            }
        }

        console.log(`[WEBHOOK] Received: "${userResponse}" from ${from}`);

        const db = await getDB();
        const conv = await db.get('SELECT * FROM conversations WHERE phone = ?', from);

        if (conv && conv.opted_out) {
            res.sendStatus(200);
            return;
        }

        if (userResponse === 'SAIR' || userResponse === 'EXIT') {
            await sendWhatsAppMessage(from, EXIT_MSG);
            await db.run('INSERT INTO conversations (phone, opted_out) VALUES (?, 1) ON CONFLICT(phone) DO UPDATE SET opted_out = 1', from);
        } else if (userResponse === 'SUPORTE' || userResponse === 'SUPPORT') {
            await sendWhatsAppMessage(from, SUPPORT_MSG);
        } else {
            // Process via Flow Interpreter
            await processUserMessage(from, userResponse || 'START');
        }
    }
    res.sendStatus(200);
});

// --- API ROUTES ---

app.get('/api/leads', async (req, res) => {
    try {
        const db = await getDB();
        const leads = await db.all('SELECT * FROM leads ORDER BY created_at DESC');
        res.json(leads);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
});

app.get('/api/conversations', async (req, res) => {
    try {
        const db = await getDB();
        const conversations = await db.all(`
            SELECT c.*, l.nome_pessoa, l.nome_bairro 
            FROM conversations c 
            LEFT JOIN leads l ON c.phone = l.phone 
            ORDER BY c.last_message_at DESC
        `);
        res.json(conversations);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

app.post('/api/upload-leads', upload.single('file'), async (req, res) => {
    try {
        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);
        const db = await getDB();
        let imported = 0;
        for (const row of data) {
            const { phone, nome_pessoa, nome_bairro, email } = row;
            if (phone) {
                await db.run(`
                    INSERT INTO leads (phone, nome_pessoa, nome_bairro, email) 
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(phone) DO UPDATE SET 
                        nome_pessoa = excluded.nome_pessoa,
                        nome_bairro = excluded.nome_bairro,
                        email = excluded.email
                `, phone, nome_pessoa, nome_bairro, email);
                imported++;
            }
        }
        res.json({ success: true, count: imported });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/api/send-campaign', async (req, res) => {
    const { leadIds } = req.body;
    const db = await getDB();
    try {
        const leads = await db.all(`SELECT * FROM leads WHERE id IN (${leadIds.join(',')})`);
        for (const lead of leads) {
            await startFlowForLead(lead.phone);
            if (lead.email) {
                await sendPromoEmail(lead.email, lead.nome_pessoa);
                await db.run('INSERT INTO email_logs (lead_phone, template_name) VALUES (?, ?)', lead.phone, 'promo_26_27');
            }
        }
        res.json({ success: true, sent: leads.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/flow-config', async (req, res) => {
    try {
        const db = await getDB();
        const config = await db.get('SELECT data FROM flow_config WHERE id = "main"');
        res.json(config ? JSON.parse(config.data) : { nodes: [], edges: [] });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/api/flow-config', async (req, res) => {
    try {
        const db = await getDB();
        const data = JSON.stringify(req.body);
        await db.run(`INSERT INTO flow_config (id, data, updated_at) VALUES ("main", ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, data, new Date().toISOString());
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const db = await getDB();
        const rows = await db.all('SELECT * FROM settings');
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const db = await getDB();
        for (const [key, value] of Object.entries(req.body)) {
            await db.run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, String(value));
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/api/upload-media', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const ext = path.extname(req.file.originalname);
    const newName = `${req.file.filename}${ext}`;
    fs.renameSync(req.file.path, path.join(uploadsDir, newName));
    const url = `${req.protocol}://${req.get('host')}/uploads/${newName}`;
    res.json({ url });
});

app.listen(PORT, () => {
    console.log(`[SERVER] MiniCraques Flow listening on port ${PORT} 🚀`);
});
