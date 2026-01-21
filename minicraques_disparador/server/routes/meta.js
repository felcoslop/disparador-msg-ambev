import express from 'express';
import prisma from '../db.js';
import { authenticateToken } from '../middleware/index.js';

const router = express.Router();

// Fetch templates from Meta API
router.get('/meta/templates/:userId', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);

        // Ensure user is requesting their own data
        if (req.userId !== userId) {
            return res.status(403).json({ error: 'Acesso negado' });
        }

        const config = await prisma.userConfig.findUnique({
            where: { userId }
        });

        if (!config || !config.token || !config.wabaId) {
            return res.status(400).json({ error: 'Configuração do WhatsApp incompleta no perfil.' });
        }

        const templateName = req.query.templateName;
        // Meta API for templates usually needs the WABA ID
        const url = `https://graph.facebook.com/v21.0/${config.wabaId}/message_templates`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${config.token}` }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[META API ERROR]', data);
            return res.status(response.status).json({
                error: data.error?.message || 'Erro ao buscar templates na Meta API'
            });
        }

        // If templateName is provided, filter or return specific one
        if (templateName) {
            const template = data.data.find(t => t.name === templateName);
            if (template) {
                return res.json(template);
            } else {
                return res.status(404).json({ error: 'Template não encontrado na sua conta Meta' });
            }
        }

        res.json(data);
    } catch (err) {
        console.error('[META TEMPLATES ROUTE ERROR]', err);
        res.status(500).json({ error: 'Erro interno ao buscar templates' });
    }
});

export default router;
