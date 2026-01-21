import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../db.js';
import { sendMail } from '../config/email.js';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { JWT_SECRET, FRONTEND_URL, EMAIL_USER, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '../config/constants.js';

// Google Passport Strategy
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: `${FRONTEND_URL}/auth/google/callback`,
    proxy: true
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        let user = await prisma.user.findUnique({
            where: { email },
            include: { config: true }
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    email,
                    name: profile.displayName,
                    avatar: profile.photos[0]?.value,
                    isVerified: true,
                    googleId: profile.id
                }
            });
            await prisma.userConfig.create({ data: { userId: user.id } });
        } else {
            // Update/Link account
            const updateData = { avatar: profile.photos[0]?.value };
            if (!user.googleId) updateData.googleId = profile.id;

            user = await prisma.user.update({
                where: { id: user.id },
                data: updateData,
                include: { config: true }
            });

            // Ensure config exists (using upsert to be safe)
            if (!user.config) {
                await prisma.userConfig.upsert({
                    where: { userId: user.id },
                    update: {},
                    create: { userId: user.id }
                });
            }
        }

        return done(null, user);
    } catch (err) {
        console.error('[OAUTH STRATEGY ERROR]', err);
        return done(err, null);
    }
}));

const router = express.Router();

// Helper: Send Verification Email
const sendVerificationEmail = async (email, token) => {
    const verificationUrl = `${FRONTEND_URL}/verify?token=${token}`;
    try {
        await sendMail({
            to: email,
            subject: 'Confirme seu cadastro no tiZAP!',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #280091;">Olá! Confirme seu e-mail</h2>
                    <p>Faltam poucos passos para você começar a usar o tiZAP!. Clique no botão abaixo para ativar sua conta:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${verificationUrl}" style="background-color: #ffc200; color: #280091; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                            Confirmar E-mail
                        </a>
                    </div>
                    <p style="color: #666; font-size: 14px;">Este link é válido por 24 horas.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #888;">Se você não solicitou este cadastro, pode ignorar este e-mail.</p>
                </div>
            `
        });
        console.log('[EMAIL SUCCESS] Delivery successful to:', email);
        return { success: true };
    } catch (err) {
        console.error('[EMAIL ERROR] Delivery failed for:', email, err);
        return { success: false, error: err.message };
    }
};

// Helper: Send Reset Password Email
const sendResetEmail = async (email, token) => {
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;
    try {
        await sendMail({
            to: email,
            subject: 'Redefinição de Senha - tiZAP!',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #280091;">Redefinição de Senha</h2>
                    <p>Você solicitou a redefinição de sua senha no tiZAP!. Clique no botão abaixo para escolher uma nova senha:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background-color: #ffc200; color: #280091; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                            Redefinir Senha
                        </a>
                    </div>
                    <p style="color: #666; font-size: 14px;">Este link é válido por 1 hora.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #888;">Se você não solicitou isso, ignore este e-mail.</p>
                </div>
            `
        });
        return { success: true };
    } catch (err) {
        console.error('[EMAIL ERROR]', err);
        return { success: false, error: err.message };
    }
};

// Register
router.post('/register', async (req, res) => {
    try {
        const { email, name, password } = req.body;
        const normalizedEmail = email.trim().toLowerCase();

        const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
            return res.status(400).json({ error: 'E-mail já cadastrado' });
        }

        console.log('[REGISTER DEBUG] Received password for:', normalizedEmail, 'Length:', password?.length);
        const hashedPassword = await bcrypt.hash(password, 10);
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                name,
                password: hashedPassword,
                isVerified: false,
                verificationToken: token,
                verificationExpires: expiresAt
            }
        });

        await prisma.userConfig.create({ data: { userId: user.id } });

        // Non-blocking email sending
        sendVerificationEmail(normalizedEmail, token).catch(err => {
            console.error('[REGISTER MAIL ERROR]', err);
        });

        res.json({ success: true, message: 'Cadastro realizado! Verifique seu e-mail para ativar a conta.' });
    } catch (err) {
        console.error('[REGISTER ERROR]', err);
        res.status(500).json({ error: 'Erro ao cadastrar usuário' });
    }
});

// Verify Email
router.get('/verify/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const user = await prisma.user.findFirst({
            where: {
                verificationToken: token,
                verificationExpires: { gt: new Date() }
            }
        });

        if (!user) {
            return res.status(400).json({ error: 'Token inválido ou expirado' });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                isVerified: true,
                verificationToken: null,
                verificationExpires: null
            }
        });

        res.json({ success: true, message: 'Conta ativada com sucesso! Você já pode fazer login.' });
    } catch (err) {
        console.error('[VERIFY ERROR]', err);
        res.status(500).json({ error: 'Erro ao verificar e-mail' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            include: { config: true }
        });

        if (!user) {
            console.warn('[LOGIN FAILED] User not found:', normalizedEmail);
            return res.status(401).json({ error: 'E-mail ou senha incorretos' });
        }

        console.log('[LOGIN DEBUG] Comparing password for:', normalizedEmail, 'Length:', password?.length);

        if (!user.password) {
            console.warn('[LOGIN FAILED] User has no password set (OAuth user?):', normalizedEmail);
            return res.status(401).json({ error: 'Este e-mail foi cadastrado via Google. Use o botão "Entrar com Google".' });
        }

        console.log('[LOGIN DEBUG] Hash starts with:', user.password.substring(0, 10));

        const isMatch = user.password.startsWith('$2')
            ? await bcrypt.compare(password, user.password)
            : user.password === password;

        console.log('[LOGIN DEBUG] Match result:', isMatch);

        if (!isMatch) {
            console.warn('[LOGIN FAILED] Password mismatch for:', normalizedEmail);
            return res.status(401).json({ error: 'E-mail ou senha incorretos' });
        }

        if (!user.isVerified) {
            return res.status(401).json({ error: 'Sua conta ainda não foi verificada. Verifique seu e-mail.' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                config: user.config ? {
                    token: user.config.token,
                    phoneId: user.config.phoneId,
                    wabaId: user.config.wabaId,
                    templateName: user.config.templateName,
                    mapping: JSON.parse(user.config.mapping || '{}'),
                    webhookVerifyToken: user.config.webhookVerifyToken
                } : null
            }
        });
    } catch (err) {
        console.error('[LOGIN ERROR]', err);
        res.status(500).json({ error: 'Erro ao fazer login' });
    }
});

// Forgot Password
router.post('/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

        if (!user) {
            return res.json({ success: true, message: 'Se o e-mail existir no sistema, enviamos um link para redefinir a senha.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken: token,
                resetPasswordExpires: expires
            }
        });

        // Non-blocking email sending
        sendResetEmail(normalizedEmail, token).catch(err => {
            console.error('[FORGOT MAIL ERROR]', err);
        });

        res.json({ success: true, message: 'Se o e-mail existir no sistema, enviaremos um link de redefinição.' });
    } catch (err) {
        console.error('[FORGOT ERROR]', err);
        res.status(500).json({ error: 'Erro ao processar solicitação' });
    }
});

// Reset Password
router.post('/auth/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        const user = await prisma.user.findFirst({
            where: {
                resetPasswordToken: token,
                resetPasswordExpires: { gt: new Date() }
            }
        });

        if (!user) {
            return res.status(400).json({ error: 'Link de redefinição inválido ou expirado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpires: null
            }
        });

        res.json({ success: true, message: 'Senha atualizada com sucesso!' });
    } catch (err) {
        console.error('[RESET ERROR]', err);
        res.status(500).json({ error: 'Erro ao redefinir senha' });
    }
});

// Google Auth Routes
router.get('/auth/google', (req, res, next) => {
    console.log('[OAUTH] Starting Google Auth, redirecting to Google...');
    next();
}, passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback', (req, res, next) => {
    console.log('[OAUTH] Google Callback status. Params:', JSON.stringify(req.query));
    passport.authenticate('google', { session: false }, (err, user, info) => {
        if (err) {
            console.error('[OAUTH] Passport authentication error:', err);
            return res.redirect(`/login?error=auth_error`);
        }
        if (!user) {
            console.error('[OAUTH] No user found/created. Info:', info);
            return res.redirect(`/login?error=google_failed`);
        }

        console.log('[OAUTH] Authentication success for:', user.email);
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        const target = `/auth/success?token=${token}`;
        console.log('[OAUTH] Redirecting to:', target);
        res.redirect(target);
    })(req, res, next);
});

// Test Email Route
router.get('/auth/test-email', (req, res) => {
    console.log('[MAIL TEST] Attempting to send test email to:', EMAIL_USER);
    sendMail({
        to: EMAIL_USER,
        subject: 'Teste de Conexão tiZAP!',
        text: 'Se você recebeu este e-mail, as configurações (SMTP ou API) estão corretas.'
    }).then(info => {
        console.log('[MAIL TEST] Success:', info);
        res.json({ success: true, info });
    }).catch(err => {
        console.error('[MAIL TEST] Failed:', err);
        res.status(500).json({ success: false, error: err.message });
    });
});

export default router;
