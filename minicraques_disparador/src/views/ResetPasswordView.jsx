import React, { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

export function ResetPasswordView() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
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

    const location = useLocation();
    const navigate = useNavigate();
    const query = new URLSearchParams(location.search);
    const token = query.get('token');

    const handleNavigation = (path) => {
        setIsExiting(true);
        setTimeout(() => {
            navigate(path);
        }, 800);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }
        if (password.length < 6) {
            setError('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password: password.trim() })
            });
            const data = await res.json();
            if (res.ok) {
                setSuccess(true);
                // Trigger splash exit after a short delay to read success message, or immediately? 
                // Let's give 1.5s to read, then 1.5s splash
                setTimeout(() => handleNavigation('/login'), 1500);
            } else {
                setError(data.error || 'Erro ao redefinir senha.');
                setIsLoading(false);
            }
        } catch (err) {
            setError('Erro de conexão.');
            setIsLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <p>Token inválido ou ausente.</p>
                    <button className="btn-primary" onClick={() => handleNavigation('/login')}>Voltar</button>
                </div>
            </div>
        );
    }

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
                <h2 style={{ color: '#888', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>Nova Senha</h2>

                {success ? (
                    <div style={{ backgroundColor: 'rgba(0, 162, 118, 0.1)', color: 'var(--ambev-green)', padding: '15px', borderRadius: '8px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
                        <p style={{ fontWeight: 'bold', margin: 0 }}>Senha alterada com sucesso!</p>
                        <p style={{ fontSize: '0.85rem', marginTop: '10px' }}>Redirecionando para o login...</p>
                        <button className="btn-link" onClick={() => handleNavigation('/login')} style={{ marginTop: '10px' }}>Ir para Login agora</button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ position: 'relative', zIndex: 1 }}>
                        {error && (
                            <div style={{ backgroundColor: 'rgba(255, 85, 85, 0.1)', color: 'var(--color-error)', padding: '10px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                {error}
                            </div>
                        )}
                        <div className="input-group">
                            <label>Nova Senha</label>
                            <div className="input-with-btn">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    disabled={isLoading}
                                />
                                <button type="button" className="btn-secondary" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <div className="input-group">
                            <label>Confirmar Nova Senha</label>
                            <div className="input-with-btn">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    required
                                    disabled={isLoading}
                                />
                                <button type="button" className="btn-secondary" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <button type="submit" className="btn-3d-blue btn-block" disabled={isLoading}>
                            {isLoading ? 'Alterando...' : 'Alterar Senha'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

export default ResetPasswordView;
