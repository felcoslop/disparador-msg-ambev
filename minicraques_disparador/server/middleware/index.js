import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/constants.js';

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Token inválido ou expirado' });
        req.userId = decoded.userId;
        next();
    });
};

export const logger = (req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.path}`);
    next();
};
