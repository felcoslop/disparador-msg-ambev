import express from 'express';
import prisma from '../db.js';
import { authenticateToken } from '../middleware/index.js';

const router = express.Router();

// Get Received Messages (History)
router.get('/messages/:userId', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);

        // Find user config to get phoneId
        const config = await prisma.userConfig.findUnique({
            where: { userId }
        });

        if (!config || !config.phoneId) {
            return res.json([]); // No config, no messages
        }

        const messages = await prisma.receivedMessage.findMany({
            where: { whatsappPhoneId: String(config.phoneId) },
            orderBy: { createdAt: 'desc' }
        });
        res.json(messages);
    } catch (err) {
        console.error('[MESSAGES ERROR]', err);
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
});

// Delete Received Message
router.delete('/messages/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.receivedMessage.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao excluir mensagem' });
    }
});

// Send Single Message (Manual)
// Send Single Message (Manual/Flow)
router.post('/send-message', authenticateToken, async (req, res) => {
    try {
        const { phone, body, mediaUrl, mediaType } = req.body;
        const userId = req.userId; // From middleware

        // Fetch config from DB to ensure security and validity
        const config = await prisma.userConfig.findUnique({ where: { userId } });

        if (!config || !config.phoneId || !config.token) {
            return res.status(400).json({ error: 'Configuração do WhatsApp incompleta.' });
        }

        let normalizedPhone = String(phone).replace(/\D/g, '');
        if (!normalizedPhone.startsWith('55')) normalizedPhone = '55' + normalizedPhone;

        const url = `https://graph.facebook.com/v21.0/${config.phoneId}/messages`;
        let payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: normalizedPhone,
        };

        if (mediaUrl) {
            payload.type = mediaType === 'image' ? 'image' : 'document';
            payload[payload.type] = { link: mediaUrl };
        } else {
            payload.type = 'text';
            payload.text = { body };
        }

        console.log('[SEND MSG] Sending to:', normalizedPhone);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            await prisma.receivedMessage.create({
                data: {
                    whatsappPhoneId: String(config.phoneId),
                    contactPhone: normalizedPhone,
                    contactName: 'Eu',
                    messageBody: body || `[Arquivo: ${mediaType}]`,
                    isFromMe: true,
                    isRead: true,
                    mediaUrl,
                    mediaType
                }
            });
            res.json({ success: true });
        } else {
            const errData = await response.json();
            console.error('[SEND MSG META ERROR]', errData);
            res.status(response.status).json(errData);
        }
    } catch (err) {
        console.error('[SEND MSG ERROR]', err);
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
});

// Mark messages as read
router.post('/messages/mark-read', async (req, res) => {
    try {
        const { phones, phoneId } = req.body;
        if (!phones || !phones.length) return res.json({ success: true });

        await prisma.receivedMessage.updateMany({
            where: {
                contactPhone: { in: phones },
                whatsappPhoneId: String(phoneId),
                isRead: false
            },
            data: { isRead: true }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[MARK READ ERROR]', err);
        res.status(500).json({ error: 'Erro ao marcar como lido' });
    }
});

// Get Contact Photo (with Initials fallback)
router.get('/contacts/:phone/photo', async (req, res) => {
    try {
        const { phone } = req.params;
        const name = req.query.name || 'Cliente';

        // 1. Try to find if we have a local photo (placeholder logic if needed)
        // For now, always generate initials as per requested "era gerado"

        const initials = name
            .split(' ')
            .map(n => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

        const colors = ['#280091', '#00a276', '#ffc200', '#ff5555', '#4285F4'];
        const colorIndex = phone.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
        const bgColor = colors[colorIndex];
        const textColor = bgColor === '#ffc200' ? '#280091' : '#ffffff';

        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
                <rect width="100" height="100" fill="${bgColor}" />
                <text x="50" y="50" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="${textColor}" text-anchor="middle" dominant-baseline="central">${initials}</text>
            </svg>
        `.trim();

        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svg);
    } catch (err) {
        res.status(500).send('Error');
    }
});

export default router;
