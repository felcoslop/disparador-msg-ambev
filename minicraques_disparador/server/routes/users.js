import express from 'express';
import prisma from '../db.js';
import { authenticateToken } from '../middleware/index.js';

const router = express.Router();

// Get Current User
router.get('/user/me', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            include: { config: true }
        });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            config: user.config ? {
                ...user.config,
                mapping: JSON.parse(user.config.mapping || '{}')
            } : null
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar dados' });
    }
});

// Update User Config
router.post('/user-config/:userId', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const { token, phoneId, wabaId, templateName, mapping, webhookVerifyToken } = req.body;

        await prisma.userConfig.upsert({
            where: { userId },
            update: { token, phoneId, wabaId, templateName, mapping: JSON.stringify(mapping), webhookVerifyToken },
            create: { userId, token, phoneId, wabaId, templateName, mapping: JSON.stringify(mapping), webhookVerifyToken }
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao salvar configuração' });
    }
});

// Get User (backward compatibility or full data)
router.get('/user/:id', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(req.params.id) },
            include: { config: true }
        });
        if (user.config) {
            user.config.mapping = JSON.parse(user.config.mapping || '{}');
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
});

export default router;
