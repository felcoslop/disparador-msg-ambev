import { getDB } from './database.js';
import { sendWhatsAppMessage, sendWhatsAppImage, sendInteractiveButtons, sendInteractiveList, sendTemplate } from './whatsapp.js';

export async function startFlowForLead(phone) {
    const db = await getDB();
    const flowRes = await db.get('SELECT data FROM flow_config WHERE id = "main"');
    if (!flowRes) {
        console.error('[FLOW] No flow configuration found');
        return;
    }

    const flow = JSON.parse(flowRes.data);
    const nodes = flow.nodes || [];
    const edges = flow.edges || [];

    // Start node: Any node that is not a target of any edge
    const startNode = nodes.find(n => !edges.find(e => e.target === n.id));
    if (startNode) {
        await executeNode(phone, startNode);
        await db.run('INSERT INTO conversations (phone, state) VALUES (?, ?) ON CONFLICT(phone) DO UPDATE SET state = excluded.state', phone, startNode.id);
    }
}

export async function processUserMessage(phone, userResponse) {
    const db = await getDB();
    const flowRes = await db.get('SELECT data FROM flow_config WHERE id = "main"');
    if (!flowRes) return;

    const flow = JSON.parse(flowRes.data);
    const nodes = flow.nodes || [];
    const edges = flow.edges || [];

    // Get user current state
    let conv = await db.get('SELECT state FROM conversations WHERE phone = ?', phone);

    let currentNodeId = conv ? conv.state : null;
    let nextNodeId = null;

    if (!currentNodeId) {
        // Find start node (node with no target edges)
        const startNode = nodes.find(n => !edges.find(e => e.target === n.id));
        nextNodeId = startNode ? startNode.id : null;
    } else {
        // Find edge from current node with label/matching response
        // In our selection node, we can match response to edge label or handle
        const edge = edges.find(e => e.source === currentNodeId && (e.label === userResponse || e.sourceHandle === userResponse));
        nextNodeId = edge ? edge.target : null;
    }

    if (nextNodeId) {
        const nextNode = nodes.find(n => n.id === nextNodeId);
        if (nextNode) {
            await executeNode(phone, nextNode);
            // Update state
            await db.run('INSERT INTO conversations (phone, state) VALUES (?, ?) ON CONFLICT(phone) DO UPDATE SET state = excluded.state', phone, nextNodeId);
        }
    }
}

async function executeNode(phone, node) {
    const { type, data } = node;

    if (type === 'template') {
        const buttons = (data.options || []).map(opt => ({ id: opt, title: opt }));
        if (buttons.length > 0) {
            await sendInteractiveButtons(phone, `[Template: ${data.templateName}]`, buttons);
        } else {
            // Need meta template api call here, but for now fallback to message
            await sendWhatsAppMessage(phone, `Template: ${data.templateName}`);
        }
    } else if (type === 'image') {
        await sendWhatsAppImage(phone, data.imageUrl, data.caption || '');
        if (data.options && data.options.length > 0) {
            const buttons = data.options.map(opt => ({ id: opt, title: opt }));
            await sendInteractiveButtons(phone, 'Selecione uma opção:', buttons);
        }
    } else if (type === 'selection') {
        const buttons = (data.options || []).map(opt => ({ id: opt, title: opt }));
        await sendInteractiveButtons(phone, 'Escolha uma opção:', buttons);
    }
}
