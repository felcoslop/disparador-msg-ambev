import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { getDB } from './database.js';
dotenv.config();

async function getTransporter() {
    const db = await getDB();
    const rows = await db.all('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);

    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: settings.GMAIL_USER || process.env.GMAIL_USER,
            pass: settings.GMAIL_PASS || process.env.GMAIL_PASS
        }
    });
}

export async function sendPromoEmail(to, nome) {
    const db = await getDB();
    const customTemplate = await db.get('SELECT value FROM settings WHERE key = "email_template"');

    let htmlContent = customTemplate ? customTemplate.value : null;

    if (htmlContent) {
        // Replace placeholders
        htmlContent = htmlContent.replace(/nome_pessoa/g, nome || 'Craque');
    } else {
        // Use default fallback
        htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>MiniCraques.com - Promoção</title>
            <style>
                body { font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 0; background-color: #f8f8f8; }
                .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
                .header { background-color: #FF6B00; padding: 30px; text-align: center; }
                .logo { color: #fff; font-size: 28px; font-weight: 800; }
                .content { padding: 40px; line-height: 1.6; }
                .btn { display: block; padding: 18px; background-color: #000; color: #fff; text-decoration: none; text-align: center; font-weight: bold; margin-top: 30px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header"><div class="logo">⚽ MINICRAQUES.COM</div></div>
                <div class="content">
                    <h1>Olá ${nome || 'Craque'}, aqui é o Felipe!</h1>
                    <p>Confira os lançamentos da temporada 26/27!</p>
                    <a href="https://minicraques.com" class="btn">VER LANÇAMENTOS ⚽</a>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    const transporter = await getTransporter();
    const settingsRows = await db.all('SELECT * FROM settings');
    const settings = {};
    settingsRows.forEach(r => settings[r.key] = r.value);

    const mailOptions = {
        from: `"Felipe MiniCraques" <${settings.GMAIL_USER || process.env.GMAIL_USER}>`,
        to: to,
        subject: '⚽ Conjuntos Infantis Temporada 26/27 - MiniCraques.com',
        html: htmlContent
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('[Email] Sent:', info.messageId);
        return info;
    } catch (err) {
        console.error('[Email] Error:', err);
        return null;
    }
}
