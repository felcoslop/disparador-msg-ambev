import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export function ForgotPasswordView({ onSwitch }) {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const splashRef = useRef(null);

    const handleMouseMove = (e) => {
        if (isExiting) return;

        // CHECK IF MOUSE IS OVER SPLASH
        if (splashRef.current) {
            const splashRect = splashRef.current.getBoundingClientRect();
            if (
                e.clientX >= splashRect.left &&
                e.clientX <= splashRect.right &&
                e.clientY >= splashRect.top &&
                e.clientY <= splashRect.bottom
            ) {
                // Mouse is over splash, do not update position
                return;
            }
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Increased multiplier for "closer to mouse" feel
        const targetX = centerX + (mouseX - centerX) * 0.85;
        const targetY = centerY + (mouseY - centerY) * 0.85;

        e.currentTarget.style.setProperty('--mouse-x', `${targetX}px`);
        e.currentTarget.style.setProperty('--mouse-y', `${targetY}px`);
    };

    const handleMouseLeave = (e) => {
        e.currentTarget.style.removeProperty('--mouse-x');
        e.currentTarget.style.removeProperty('--mouse-y');
    };

    const handleNavigation = (path) => {
        setIsExiting(true);
        setTimeout(() => {
            if (path === 'login') onSwitch('login');
            else navigate(path);
        }, 800);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setMessage('');

        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim().toLowerCase() })
            });
            const data = await res.json();
            if (res.ok) {
                setMessage(data.message);
                setTimeout(() => handleNavigation('login'), 2000);
            } else {
                setError(data.error || 'Erro ao processar solicitação.');
            }
        } catch (err) {
            setError('Erro de conexão.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div
                className="auth-card ambev-flag"
                style={{ position: 'relative', overflow: 'hidden' }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                <div
                    ref={splashRef}
                    className={`auth-splash-shape ${isExiting ? 'expanding' : ''}`}
                ></div>

                <div onClick={() => handleNavigation('login')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    <img src="/logo.png" alt="tizap!" className="rounded-logo" style={{ width: '80px', height: '80px', objectFit: 'cover', marginBottom: '1.5rem' }} />
                    <h1 className="logo-text" style={{ fontSize: '2.5rem', marginBottom: '0.2rem', color: 'var(--ambev-yellow)' }}>tizap!</h1>
                </div>
                <h2 style={{ color: '#888', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>Recuperar Senha</h2>

                {message && (
                    <div style={{ backgroundColor: 'rgba(0, 162, 118, 0.1)', color: 'var(--ambev-green)', padding: '12px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 'bold', position: 'relative', zIndex: 1 }}>
                        {message}
                    </div>
                )}
                {error && (
                    <div style={{ backgroundColor: 'rgba(255, 85, 85, 0.1)', color: 'var(--color-error)', padding: '12px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 'bold', position: 'relative', zIndex: 1 }}>
                        {error}
                    </div>
                )}

                <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                    Insira seu e-mail para receber um link de redefinição de senha.
                </p>

                <form onSubmit={handleSubmit} style={{ position: 'relative', zIndex: 1 }}>
                    <div className="input-group">
                        <label>E-mail</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            placeholder="exemplo@dominio.com"
                            disabled={isLoading}
                        />
                    </div>
                    <button type="submit" className="btn-3d-blue btn-block" disabled={isLoading}>
                        {isLoading ? 'Enviando...' : 'Enviar Link'}
                    </button>
                </form>

                <button className="btn-link" onClick={() => handleNavigation('login')} style={{ marginTop: '1rem', position: 'relative', zIndex: 1, fontSize: '0.85rem', color: '#888' }}>Voltar para o Login</button>
            </div>
        </div>
    );
}

export default ForgotPasswordView;
