import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

export function LoginView({ onLogin, onSwitch }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const splashRef = useRef(null);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const token = params.get('token');
        if (token) {
            // Google login success
            onLogin(null, null, token);
            // Clear token from URL
            navigate('/login', { replace: true });
        }
    }, [location, onLogin, navigate]);

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
            if (path === 'register') onSwitch();
            else if (path === 'forgot') onSwitch('forgot');
            else navigate(path);
        }, 800);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isLoading) return;
        setIsLoading(true);
        try {
            await onLogin(email, password);
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

                <div onClick={() => handleNavigation('/login')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    <img src="/logo.png" alt="tizap!" className="rounded-logo" style={{ width: '80px', height: '80px', objectFit: 'cover', marginBottom: '1.5rem' }} />
                    <h1 className="logo-text" style={{ fontSize: '2.5rem', marginBottom: '0.2rem', color: 'var(--ambev-yellow)' }}>tizap!</h1>
                </div>
                <p className="subtitle" style={{ color: '#888', fontWeight: 600, opacity: 0.8, position: 'relative', zIndex: 1 }}>Comunicação inteligente para o seu negócio</p>
                {window.location.search.includes('verified=true') && (
                    <div style={{ backgroundColor: 'rgba(0, 162, 118, 0.1)', color: 'var(--ambev-green)', padding: '10px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
                        E-mail confirmado! Faça login agora.
                    </div>
                )}
                {window.location.search.includes('error=token') && (
                    <div style={{ backgroundColor: 'rgba(255, 85, 85, 0.1)', color: 'var(--color-error)', padding: '10px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
                        Token inválido ou expirado. Tente se cadastrar novamente.
                    </div>
                )}
                <form onSubmit={handleSubmit} style={{ position: 'relative', zIndex: 1 }}>
                    <div className="input-group">
                        <label>E-mail</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="exemplo@dominio.com" disabled={isLoading} />
                    </div>
                    <div className="input-group">
                        <label>Senha</label>
                        <div className="input-with-btn">
                            <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="************" disabled={isLoading} />
                            <button type="button" className="btn-secondary" onClick={() => setShowPassword(!showPassword)} disabled={isLoading}>
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <button type="submit" className="btn-3d-blue btn-block" disabled={isLoading}>
                        {isLoading ? 'Entrando...' : 'Entrar'}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '0.5rem', position: 'relative', zIndex: 1 }}>
                    <button className="btn-link" onClick={() => handleNavigation('forgot')} style={{ fontSize: '0.85rem', color: '#888' }}>Esqueci minha senha</button>
                </div>

                <div style={{ margin: '1.5rem 0', display: 'flex', alignItems: 'center', gap: '10px', position: 'relative', zIndex: 1 }}>
                    <div style={{ flex: 1, height: '1px', background: '#eee' }}></div>
                    <span style={{ fontSize: '0.8rem', color: '#999' }}>OU</span>
                    <div style={{ flex: 1, height: '1px', background: '#eee' }}></div>
                </div>

                <a href="/auth/google" className="btn-google btn-block" style={{ position: 'relative', zIndex: 1 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Entrar com Google
                </a>

                <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.9rem', color: '#666', position: 'relative', zIndex: 1 }}>
                    Não tem uma conta? <button className="btn-link" onClick={() => handleNavigation('register')} style={{ display: 'inline', padding: 0, fontWeight: 'bold', color: 'var(--ambev-blue)', textDecoration: 'none' }}>Cadastre-se</button>
                </div>
                <div className="legal-footer-login" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center', fontSize: '12px', position: 'relative', zIndex: 1 }}>
                    <a href="/politics/privacidade.html" target="_blank" style={{ color: '#666' }}>Privacidade</a>
                    <a href="/politics/termos.html" target="_blank" style={{ color: '#666' }}>Termos de Uso</a>
                </div>
            </div>
        </div>
    );
}

export default LoginView;
