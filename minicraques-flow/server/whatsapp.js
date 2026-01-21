import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { getDB } from './database.js';
dotenv.config();

async function getCredentials() {
    const db = await getDB();
    const rows = await db.all('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);

    return {
        WA_TOKEN: settings.WA_TOKEN || process.env.WA_TOKEN,
        WA_PHONE_ID: settings.WA_PHONE_ID || process.env.WA_PHONE_ID,
        API_URL: (id) => `https://graph.facebook.com/v18.0/${id || settings.WA_PHONE_ID || process.env.WA_PHONE_ID}/messages`
    };
}

// Send plain text message
export async function sendWhatsAppMessage(to, message) {
    const creds = await getCredentials();
    if (!creds.WA_TOKEN || !creds.WA_PHONE_ID) {
        console.error('[WA] Missing credentials');
        return null;
    }

    const body = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: { body: message }
    };

    return await makeRequest(body, creds);
}

// Send interactive BUTTON message (up to 3 buttons)
export async function sendInteractiveButtons(to, bodyText, buttons, headerText = null) {
    const creds = await getCredentials();
    const interactive = {
        type: "button",
        body: { text: bodyText },
        action: {
            buttons: buttons.map((btn, idx) => ({
                type: "reply",
                reply: {
                    id: btn.id || `btn_${idx}`,
                    title: btn.title.substring(0, 20) // Max 20 chars
                }
            }))
        }
    };

    if (headerText) {
        interactive.header = { type: "text", text: headerText };
    }

    const body = {
        messaging_product: "whatsapp",
        to: to,
        type: "interactive",
        interactive: interactive
    };

    return await makeRequest(body, creds);
}

// Send interactive LIST message (for more than 3 options)
export async function sendInteractiveList(to, bodyText, buttonText, sections) {
    const creds = await getCredentials();
    const interactive = {
        type: "list",
        body: { text: bodyText },
        action: {
            button: buttonText,
            sections: sections.map(section => ({
                title: section.title,
                rows: section.rows.map(row => ({
                    id: row.id,
                    title: row.title.substring(0, 24), // Max 24 chars
                    description: row.description ? row.description.substring(0, 72) : undefined
                }))
            }))
        }
    };

    const body = {
        messaging_product: "whatsapp",
        to: to,
        type: "interactive",
        interactive: interactive
    };

    return await makeRequest(body, creds);
}

// Send image with caption
export async function sendWhatsAppImage(to, imageUrl, caption) {
    const creds = await getCredentials();
    const body = {
        messaging_product: "whatsapp",
        to: to,
        type: "image",
        image: { link: imageUrl, caption: caption }
    };

    return await makeRequest(body, creds);
}

// Send template message (for initial contact - requires Meta approval)
export async function sendTemplate(to, templateName, languageCode, components) {
    const creds = await getCredentials();
    const body = {
        messaging_product: "whatsapp",
        to: to,
        type: "template",
        template: {
            name: templateName,
            language: { code: languageCode },
            components: components
        }
    };

    return await makeRequest(body, creds);
}

// Helper function to make API requests
async function makeRequest(body, creds) {
    try {
        const res = await fetch(creds.API_URL(creds.WA_PHONE_ID), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${creds.WA_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!res.ok) {
            console.error('[WA] API Error:', data);
        }

        return data;
    } catch (err) {
        console.error('[WA] Request failed:', err);
        return null;
    }
}
