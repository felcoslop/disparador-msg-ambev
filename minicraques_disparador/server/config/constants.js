import 'dotenv/config';

export const PORT = process.env.PORT || 3000;
export const WEBHOOK_VERIFY_TOKEN = 'ambev_webhook_token_2026';
export const JWT_SECRET = process.env.JWT_SECRET || 'tizap_secret_key_2026';
export const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
export const EMAIL_USER = (process.env.EMAIL_USER || '').trim();
export const EMAIL_PASS = (process.env.EMAIL_PASS || '').trim();
export const EMAIL_HOST = (process.env.EMAIL_SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com').trim();
export const EMAIL_PORT = (process.env.EMAIL_SMTP_PORT || process.env.EMAIL_PORT || '587').trim();
export const RESEND_API_KEY = process.env.RESEND_API_KEY;
export const GMAIL_REFRESH_TOKEN = (process.env.GMAIL_REFRESH_TOKEN || '').trim();
export const GOOGLE_CLIENT_ID = (process.env.CLIENT_ID || '').trim();
export const GOOGLE_CLIENT_SECRET = (process.env.CLIENT_SECRET || '').trim();
