import express from 'express';
import prisma from '../db.js';
import { authenticateToken } from '../middleware/index.js';
import FlowEngine from '../services/flowEngine.js';

const router = express.Router();

// List Flow Sessions
router.get('/flow-sessions/:userId', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const sessions = await prisma.flowSession.findMany({
            where: { flow: { userId } },
            orderBy: { updatedAt: 'desc' },
            include: { flow: true }
        });

        const enriched = sessions.map(s => {
            let currentStepName = s.currentStep;
            if (s.flow && s.currentStep) {
                try {
                    const nodes = JSON.parse(s.flow.nodes);
                    const node = nodes.find(n => String(n.id) === String(s.currentStep));
                    if (node) currentStepName = node.data?.label || node.data?.templateName || `Nó ${node.id}`;
                } catch (e) { }
            }
            return { ...s, flowName: s.flow?.name || 'Fluxo removido', currentStepName };
        });

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar sessões' });
    }
});

// Create/Update flow
router.post('/flows', authenticateToken, async (req, res) => {
    try {
        const { id, name, userId, nodes, edges } = req.body;
        console.log('[FLOW SAVE] Request received:', { id, name, userId, nodesCount: nodes?.length, edgesCount: edges?.length });

        let flow;
        if (id) {
            console.log('[FLOW SAVE] Updating existing flow:', id);
            flow = await prisma.flow.update({
                where: { id: parseInt(id) },
                data: { name, nodes: JSON.stringify(nodes), edges: JSON.stringify(edges) }
            });
        } else {
            console.log('[FLOW SAVE] Creating new flow for user:', userId);
            flow = await prisma.flow.create({
                data: { name, userId, nodes: JSON.stringify(nodes), edges: JSON.stringify(edges) }
            });
        }
        console.log('[FLOW SAVE] Success:', flow.id);
        res.json(flow);
    } catch (err) {
        console.error('[FLOW SAVE ERROR]', err);
        res.status(500).json({ error: 'Erro ao salvar fluxo' });
    }
});

// Alias for update with ID in URL (Standard REST fix)
router.post('/flows/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, userId, nodes, edges } = req.body;
        console.log('[FLOW SAVE] Updating flow via params:', id);

        const flow = await prisma.flow.update({
            where: { id: parseInt(id) },
            data: { name, nodes: JSON.stringify(nodes), edges: JSON.stringify(edges) }
        });
        res.json(flow);
    } catch (err) {
        console.error('[FLOW UPDATE ERROR]', err);
        res.status(500).json({ error: 'Erro ao atualizar fluxo' });
    }
});

// Delete flow
router.delete('/flows/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.flow.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao excluir fluxo' });
    }
});

router.get('/flows/:userId', authenticateToken, async (req, res) => {
    try {
        const flows = await prisma.flow.findMany({ where: { userId: parseInt(req.params.userId) } });
        res.json(flows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar fluxos' });
    }
});

router.post('/flow-sessions/:id/stop', authenticateToken, async (req, res) => {
    try {
        const sessionId = parseInt(req.params.id);
        await prisma.flowSession.update({ where: { id: sessionId }, data: { status: 'stopped' } });
        await FlowEngine.logAction(sessionId, null, null, 'stopped', 'Interrompido pelo usuário');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao interromper fluxo' });
    }
});

router.get('/flow-session-logs/:sessionId', authenticateToken, async (req, res) => {
    try {
        const logs = await prisma.flowSessionLog.findMany({
            where: { sessionId: parseInt(req.params.sessionId) },
            orderBy: { createdAt: 'asc' }
        });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar logs' });
    }
});

router.get('/flow-sessions/active-check/:userId', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const activeDispatch = await prisma.dispatch.findFirst({ where: { userId, status: { in: ['running', 'idle'] } } });
        const activeSessions = await prisma.flowSession.count({ where: { flow: { userId }, status: { in: ['active', 'waiting_reply'] } } });
        res.json({ isBusy: !!activeDispatch || activeSessions > 0, hasActiveDispatch: !!activeDispatch, activeDispatchId: activeDispatch?.id, activeSessionCount: activeSessions });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao verificar atividades' });
    }
});

export default router;
