import express from 'express';
import prisma from '../db.js';
import { downloadMedia } from '../services/whatsapp.js';
import FlowEngine from '../services/flowEngine.js';
import { WEBHOOK_VERIFY_TOKEN } from '../config/constants.js';

const router = express.Router();

export const handleIncomingWebhook = async (req, res, targetUserId = null, broadcastMessage) => {
    try {
        const body = req.body;

        if (body.object === 'whatsapp_business_account' && body.entry) {
            for (const entry of body.entry) {
                if (!entry.changes) continue;
                for (const change of entry.changes) {
                    const value = change.value;
                    if (!value.messages) continue;

                    const whatsappPhoneId = value.metadata.phone_number_id;

                    for (const message of value.messages) {
                        const from = message.from;
                        const contactName = value.contacts?.[0]?.profile?.name || 'Cliente';
                        let messageBody = '';
                        let mediaUrl = null;
                        let mediaType = null;
                        let mediaId = null;

                        // 1. Determine local userId based on phoneId
                        let userId = targetUserId;
                        if (!userId) {
                            const config = await prisma.userConfig.findFirst({ where: { phoneId: String(whatsappPhoneId) } });
                            userId = config?.userId;
                        }

                        const userConfig = await prisma.userConfig.findFirst({ where: { userId } });

                        if (message.type === 'text') {
                            messageBody = message.text.body;
                        } else if (message.type === 'image') {
                            mediaId = message.image.id;
                            messageBody = message.image.caption || '[Imagem]';
                            mediaType = 'image';
                            mediaUrl = await downloadMedia(mediaId, userConfig);
                        } else if (message.type === 'audio') {
                            mediaId = message.audio.id;
                            messageBody = '[Áudio]';
                            mediaType = 'audio';
                            mediaUrl = await downloadMedia(mediaId, userConfig);
                        } else if (message.type === 'interactive') {
                            messageBody = message.interactive.button_reply?.title || message.interactive.list_reply?.title || '[Interativo]';
                            const buttonId = message.interactive.button_reply?.id || message.interactive.list_reply?.id;
                            if (buttonId) messageBody = buttonId;
                        }

                        // Save message to history
                        const savedMsg = await prisma.receivedMessage.create({
                            data: {
                                whatsappPhoneId: String(whatsappPhoneId),
                                contactPhone: from,
                                contactName,
                                messageBody,
                                mediaUrl,
                                mediaType,
                                mediaId
                            }
                        });

                        // Broadcast via WebSocket
                        if (broadcastMessage) {
                            broadcastMessage('message:received', savedMsg, userId);
                        }

                        // Proccess in FlowEngine
                        await FlowEngine.processMessage(from, messageBody, false, userId);
                    }
                }
            }
        }
        res.sendStatus(200);
    } catch (err) {
        console.error('[WEBHOOK ERROR]', err);
        res.sendStatus(500);
    }
};

router.get('/webhook/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId);
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        const user = await prisma.user.findUnique({ where: { id: userId }, include: { config: true } });
        if (mode === 'subscribe' && user?.config?.webhookVerifyToken === token) {
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

router.post('/webhook/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    handleIncomingWebhook(req, res, userId, req.app.get('broadcastMessage'));
});

// Generic Webhook (finds user by phone_number_id)
router.post('/webhook', (req, res) => {
    handleIncomingWebhook(req, res, null, req.app.get('broadcastMessage'));
});

// Backward compatibility (old webhook)
router.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === WEBHOOK_VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

export default router;
