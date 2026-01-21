import prisma from '../db.js';
import { sendWhatsApp, uploadMediaToMeta } from './whatsapp.js';
import { sleep } from '../utils/helpers.js';

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

    findStartNode(nodes, edges) {
        const explicitStart = nodes.find(n => n.data?.isStart || n.type === 'start');
        if (explicitStart) return explicitStart.id;

        const targetIds = new Set(edges.map(e => String(e.target)));
        const roots = nodes.filter(n => !targetIds.has(String(n.id)));

        if (roots.length > 0) {
            const preferredRoot = roots.find(n => n.type === 'messageNode' || n.type === 'templateNode');
            return (preferredRoot || roots[0]).id;
        }
        return nodes[0]?.id;
    },

    async executeStep(session, flow, configInput) {
        try {
            const userConfig = await prisma.userConfig.findUnique({ where: { userId: flow.userId } });

            if (!userConfig || !userConfig.token || !userConfig.phoneId) {
                await this.logAction(session.id, session.currentStep, null, 'error', 'Configurações de WhatsApp não encontradas');
                return;
            }

            const config = userConfig;
            const nodes = JSON.parse(flow.nodes);
            const edges = JSON.parse(flow.edges);
            const currentNode = nodes.find(n => String(n.id) === String(session.currentStep));

            if (!currentNode) {
                await this.logAction(session.id, session.currentStep, null, 'error', `Nó ${session.currentStep} não encontrado`);
                await this.endSession(session.id, 'Fluxo concluído - nó não encontrado');
                return;
            }

            const nodeName = currentNode.data?.label || currentNode.data?.templateName || `Nó ${currentNode.id}`;

            if (currentNode.type === 'templateNode') {
                const templateName = currentNode.data.templateName;
                if (templateName) {
                    const sessionVars = JSON.parse(session.variables || '{}');
                    const headerParams = [];
                    const bodyParams = [];

                    const nodeVars = Object.keys(sessionVars)
                        .filter(k => k.startsWith(`fnode_${currentNode.id}_`))
                        .map(k => ({ key: k, ...sessionVars[k] }))
                        .sort((a, b) => (a.order || 0) - (b.order || 0));

                    nodeVars.forEach(v => {
                        const val = String(v.value || '').substring(0, 100);
                        const paramObj = { name: v.index, value: val };
                        v.component === 'HEADER' ? headerParams.push(paramObj) : bodyParams.push(paramObj);
                    });

                    const finalComponents = (headerParams.length > 0 || bodyParams.length > 0)
                        ? { header: headerParams, body: bodyParams }
                        : (currentNode.data.params || { header: [], body: [] });

                    await sendWhatsApp(session.contactPhone, config, templateName, finalComponents);
                    await this.logAction(session.id, currentNode.id, nodeName, 'sent_message', `Template: ${templateName}`);

                    await prisma.receivedMessage.create({
                        data: {
                            whatsappPhoneId: String(config.phoneId),
                            contactPhone: String(session.contactPhone).replace(/\D/g, ''),
                            contactName: 'Eu',
                            messageBody: `[Fluxo] Template: ${templateName}`,
                            isFromMe: true,
                            isRead: true
                        }
                    });
                }
            } else if (currentNode.type === 'imageNode') {
                const images = currentNode.data.imageUrls || (currentNode.data.imageUrl ? [currentNode.data.imageUrl] : []);
                for (const url of images) {
                    await this.sendWhatsAppImage(session.contactPhone, url.trim(), config);
                    await sleep(500);
                }
                await this.logAction(session.id, currentNode.id, nodeName, 'sent_message', `Enviada(s) ${images.length} imagem(ns)`);
            } else if (currentNode.type === 'optionsNode') {
                const messageText = currentNode.data.label || currentNode.data.message || 'Escolha uma opção:';
                const options = currentNode.data.options || [];
                if (options.length > 0) {
                    await this.sendWhatsAppInteractive(session.contactPhone, messageText, options, config);
                    await this.logAction(session.id, currentNode.id, nodeName, 'sent_message', `Interativo: ${messageText}`);
                } else {
                    await this.sendWhatsAppText(session.contactPhone, messageText, config);
                    await this.logAction(session.id, currentNode.id, nodeName, 'sent_message', messageText);
                }
            } else if (currentNode.type === 'messageNode' || !currentNode.type) {
                const messageText = currentNode.data.label || currentNode.data.message || '';
                if (messageText) {
                    await this.sendWhatsAppText(session.contactPhone, messageText, config);
                    await this.logAction(session.id, currentNode.id, nodeName, 'sent_message', messageText.substring(0, 100));
                    await prisma.receivedMessage.create({
                        data: {
                            whatsappPhoneId: String(config.phoneId),
                            contactPhone: String(session.contactPhone).replace(/\D/g, ''),
                            contactName: 'Eu',
                            messageBody: `[Fluxo] ${messageText}`,
                            isFromMe: true,
                            isRead: true
                        }
                    });
                }
            }

            const outboundEdges = edges.filter(e => String(e.source) === String(currentNode.id));
            const hasOptions = outboundEdges.some(e => e.sourceHandle?.startsWith('source-') && e.sourceHandle !== 'source-gray');

            if (hasOptions || currentNode.data?.waitForReply) {
                await prisma.flowSession.update({
                    where: { id: session.id },
                    data: { status: 'waiting_reply' }
                });
                await this.logAction(session.id, currentNode.id, nodeName, 'waiting_reply', 'Aguardando resposta');
            } else {
                const nextEdge = outboundEdges.find(e => e.sourceHandle === 'source-gray' || !e.sourceHandle);
                if (nextEdge) {
                    await prisma.flowSession.update({
                        where: { id: session.id },
                        data: { currentStep: nextEdge.target }
                    });
                    setTimeout(() => this.executeStep({ ...session, currentStep: nextEdge.target }, flow, config), 1000);
                } else {
                    await this.endSession(session.id, 'Fluxo concluído');
                }
            }
        } catch (err) {
            console.error('[FLOW EXECUTION ERROR]', err);
            await this.logAction(session.id, session.currentStep, null, 'error', err.message);
        }
    },

    async sendWhatsAppImage(phone, imageUrl, config) {
        try {
            let normalizedPhone = String(phone).replace(/\D/g, '');
            if (!normalizedPhone.startsWith('55')) normalizedPhone = '55' + normalizedPhone;

            let mediaId = (imageUrl.startsWith('/') || !imageUrl.startsWith('http'))
                ? await uploadMediaToMeta(imageUrl, 'image', config)
                : null;

            const payload = {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: normalizedPhone,
                type: "image",
                image: mediaId ? { id: mediaId } : { link: imageUrl }
            };

            await fetch(`https://graph.facebook.com/v21.0/${config.phoneId}/messages`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (e) { console.error('[FLOW IMAGE ERROR]', e); }
    },

    async sendWhatsAppInteractive(phone, messageText, options, config) {
        let interactive = options.length <= 3 ? {
            type: "button",
            body: { text: messageText },
            action: {
                buttons: options.map((opt, i) => ({ type: "reply", reply: { id: `source-${i + 1}`, title: opt.substring(0, 20) } }))
            }
        } : {
            type: "list",
            body: { text: messageText },
            action: {
                button: "Ver opções",
                sections: [{ title: "Opções", rows: options.map((opt, i) => ({ id: `source-${i + 1}`, title: opt.substring(0, 24) })) }]
            }
        };

        await fetch(`https://graph.facebook.com/v21.0/${config.phoneId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "interactive", interactive })
        });
    },

    async processMessage(contactPhone, messageBody, contextStart, targetUserId) {
        let normalizedPhone = String(contactPhone).replace(/\D/g, '');
        if (!normalizedPhone.startsWith('55')) normalizedPhone = '55' + normalizedPhone;

        const possibleNumbers = [normalizedPhone, normalizedPhone.replace('55', '')];
        if (normalizedPhone.length === 13 && normalizedPhone.startsWith('55')) {
            const withoutNine = normalizedPhone.slice(0, 4) + normalizedPhone.slice(5);
            possibleNumbers.push(withoutNine, withoutNine.replace('55', ''));
        }
        if (normalizedPhone.length === 12 && normalizedPhone.startsWith('55')) {
            const withNine = normalizedPhone.slice(0, 4) + '9' + normalizedPhone.slice(4);
            possibleNumbers.push(withNine, withNine.replace('55', ''));
        }

        const sessionWhere = { contactPhone: { in: possibleNumbers }, status: 'waiting_reply' };
        if (targetUserId) sessionWhere.flow = { userId: targetUserId };

        const session = await prisma.flowSession.findFirst({
            where: sessionWhere,
            include: { flow: { include: { user: { include: { config: true } } } } }
        });

        if (!session) return;

        const flow = session.flow;
        const userConfig = await prisma.userConfig.findUnique({ where: { userId: flow.userId } });
        if (!userConfig || !userConfig.token || !userConfig.phoneId) return;

        const config = userConfig;
        const nodes = JSON.parse(flow.nodes);
        const edges = JSON.parse(flow.edges);
        const currentNode = nodes.find(n => String(n.id) === String(session.currentStep));
        if (!currentNode) return;

        const nodeName = currentNode.data?.label || currentNode.data?.templateName || `Nó ${currentNode.id}`;
        let nextNodeId = null;
        let isValid = true;
        const outboundEdges = edges.filter(e => String(e.source) === String(currentNode.id));

        if (currentNode.type === 'optionsNode') {
            const body = messageBody.trim().toLowerCase();
            if (body.startsWith('source-')) {
                const choice = body.split('-')[1];
                const edge = outboundEdges.find(e => e.sourceHandle === `source-${choice}`);
                if (edge) nextNodeId = edge.target;
            }

            if (!nextNodeId) {
                const simpleMatch = body.match(/^\d+/) || body.match(/\d+/);
                let choice = simpleMatch ? simpleMatch[0] : null;
                if (!choice) {
                    const optIdx = (currentNode.data?.options || []).findIndex(opt => opt.toLowerCase() === body);
                    if (optIdx !== -1) choice = String(optIdx + 1);
                }
                const edge = outboundEdges.find(e => e.sourceHandle === `source-${choice}`);
                if (edge) nextNodeId = edge.target; else isValid = false;
            }
        } else {
            const edge = outboundEdges.find(e => ['source-green', 'source-gray'].includes(e.sourceHandle)) || outboundEdges.find(e => !['source-red', 'source-invalid'].includes(e.sourceHandle));
            if (edge) nextNodeId = edge.target;
        }

        if (!isValid) {
            const redEdge = outboundEdges.find(e => ['source-red', 'source-invalid'].includes(e.sourceHandle));
            if (redEdge) {
                await prisma.flowSession.update({ where: { id: session.id }, data: { currentStep: redEdge.target, status: 'active' } });
                await this.logAction(session.id, currentNode.id, nodeName, 'invalid_reply', `Resposta inválida: ${messageBody}`);
                await this.executeStep({ ...session, currentStep: redEdge.target }, flow, config);
            } else {
                await this.sendWhatsAppText(normalizedPhone, "Opção inválida. Por favor tente novamente.", config);
            }
            return;
        }

        if (nextNodeId) {
            await this.logAction(session.id, currentNode.id, nodeName, 'received_reply', `Resposta recebida: "${messageBody}"`);
            await prisma.flowSession.update({ where: { id: session.id }, data: { currentStep: String(nextNodeId), status: 'active' } });
            await this.executeStep({ ...session, currentStep: String(nextNodeId) }, flow, config);
        } else {
            await this.endSession(session.id, 'Fluxo concluído');
        }
    },

    async endSession(sessionId, reason = 'Fluxo concluído') {
        await prisma.flowSession.update({ where: { id: sessionId }, data: { status: 'completed' } });
        await this.logAction(sessionId, null, null, 'completed', reason);
    },

    async sendWhatsAppText(phone, text, config) {
        await fetch(`https://graph.facebook.com/v21.0/${config.phoneId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${config.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "text", text: { body: text } })
        });
    }
};

export default FlowEngine;
