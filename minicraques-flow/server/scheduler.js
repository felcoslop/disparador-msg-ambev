import cron from 'node-cron';
import { getDB } from './database.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { STATES, FLOW_CONFIG, TIMEOUT_FINAL_MSG } from './flows.js';

export function startScheduler() {
    // Run every hour
    cron.schedule('0 * * * *', async () => {
        console.log('[Cron] Checking for 24h timeouts...');
        const db = await getDB();
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString();

        try {
            // Find conversations in State 0 or 2 that haven't replied for 24h
            const timeouts = await db.all(`
                SELECT phone, state FROM conversations 
                WHERE (state = ? OR state = ?) 
                AND last_message_at < ? 
                AND opted_out = 0
            `, STATES.START, STATES.POSITIVE_RESPONSE, oneDayAgo);

            for (const conv of timeouts) {
                const lead = await db.get('SELECT nome_pessoa FROM leads WHERE phone = ?', conv.phone);
                let nextMsg = '';
                let nextState = conv.state;

                if (conv.state === STATES.START) {
                    nextMsg = FLOW_CONFIG[STATES.FOLLOW_UP_1].getMessage(lead || {});
                    nextState = STATES.FOLLOW_UP_1;
                } else if (conv.state === STATES.POSITIVE_RESPONSE) {
                    nextMsg = TIMEOUT_FINAL_MSG(lead ? lead.nome_pessoa : '');
                    nextState = STATES.FINAL_TIMEOUT;
                }

                if (nextMsg) {
                    await sendWhatsAppMessage(conv.phone, nextMsg);
                    await db.run('UPDATE conversations SET state = ?, last_message_at = ? WHERE phone = ?',
                        nextState, now.toISOString(), conv.phone);
                    console.log(`[Cron] Sent timeout follow-up to ${conv.phone}`);
                }
            }
        } catch (err) {
            console.error('[Cron] Error:', err);
        }
    });
}
