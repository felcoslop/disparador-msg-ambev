import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

export function RegisterView({ onRegister, onSwitch }) {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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
            if (path === 'login') onSwitch();
            else navigate(path);
        }, 800);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isLoading) return;
        setIsLoading(true);
        try {
            await onRegister(email, password);
            handleNavigation('/login');
        } catch (error) {
            console.error("Registration failed", error);
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div
                className="auth-card ambev-flag"
                style={{ position: 'relative', overflow: 'hidden', borderTopColor: 'var(--ambev-blue)' }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                <div
                    ref={splashRef}
                    className={`auth-splash-shape ${isExiting ? 'expanding' : ''}`}
                ></div>

                <div onClick={() => handleNavigation('/login')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    <img src="/logo.png" alt="tizap!" className="rounded-logo" style={{ width: '80px', height: '80px', objectFit: 'cover', marginBottom: '1.5rem' }} />
                    <h1 className="logo-text" style={{ color: 'var(--ambev-yellow)', fontSize: '2.5rem', marginBottom: '0.2rem' }}>tizap!</h1>
                </div>
                <h2 style={{ color: '#888', position: 'relative', zIndex: 1 }}>Cadastro</h2>
                <form onSubmit={handleSubmit} style={{ position: 'relative', zIndex: 1 }}>
                    <div className="input-group">
                        <label>E-mail</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={isLoading} />
                    </div>
                    <div className="input-group">
                        <label>Senha</label>
                        <div className="input-with-btn">
                            <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required disabled={isLoading} />
                            <button type="button" className="btn-secondary" onClick={() => setShowPassword(!showPassword)} disabled={isLoading}>
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <button type="submit" className="btn-3d-yellow btn-block" disabled={isLoading}>
                        {isLoading ? 'Cadastrando...' : 'Cadastrar'}
                    </button>
                </form>
                <div style={{ textAlign: 'center', marginTop: '1rem', position: 'relative', zIndex: 1 }}>
                    <button className="btn-link" onClick={() => handleNavigation('login')} style={{ fontSize: '0.85rem', color: '#888' }}>Já tenho conta</button>
                </div>
                <div className="legal-footer-login" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center', fontSize: '12px', position: 'relative', zIndex: 1 }}>
                    <a href="/politics/privacidade.html" target="_blank" style={{ color: '#666' }}>Privacidade</a>
                    <a href="/politics/termos.html" target="_blank" style={{ color: '#666' }}>Termos de Uso</a>
                </div>
            </div>
        </div>
    );
}

export default RegisterView;
