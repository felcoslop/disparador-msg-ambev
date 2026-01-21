import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

// Hooks
import { useWebSocket } from './hooks/useWebSocket';

// Views
import LoginView from './views/LoginView';
import RegisterView from './views/RegisterView';
import ForgotPasswordView from './views/ForgotPasswordView';
import ResetPasswordView from './views/ResetPasswordView';
import Dashboard from './views/Dashboard/Dashboard';

// Components
import Toast from './components/Toast';

// --- Main App Component ---
export default function App() {
    return (
        <BrowserRouter>
            <AppContent />
        </BrowserRouter>
    );
}

function AppContent() {
    const navigate = useNavigate();
    const location = useLocation();

    const [toasts, setToasts] = useState([]);
    const addToast = useCallback((message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    }, []);

    // Session: now stores full user object with id
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('ambev_session');
        return saved ? JSON.parse(saved) : null;
    });

    useEffect(() => {
        if (user) {
            localStorage.setItem('tizap_token', user.token || '');
            localStorage.setItem('ambev_session', JSON.stringify(user));
        } else {
            localStorage.removeItem('tizap_token');
            localStorage.removeItem('ambev_session');
        }
    }, [user]);

    // Prevent double verification calls
    const hasVerified = React.useRef(false);

    // Handle Google Auth success or Email Verification
    useEffect(() => {
        const query = new URLSearchParams(location.search);
        const token = query.get('token');

        if (location.pathname === '/auth/success' && token) {
            // Fetch user data with this token to verify and get config
            const verifyToken = async () => {
                try {
                    const res = await fetch(`/api/user/me`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setUser({ ...data, token });
                        addToast(`Logado com sucesso!`, 'success');
                        navigate('/home');
                    } else {
                        addToast('Erro ao validar login do Google.', 'error');
                        navigate('/login');
                    }
                } catch (err) {
                    addToast('Erro de conexão.', 'error');
                    navigate('/login');
                }
            };
            verifyToken();
        }

        if (location.pathname === '/verify' && token && !hasVerified.current) {
            hasVerified.current = true;
            const verifyEmail = async () => {
                try {
                    console.log('[VERIFY] Calling API for token:', token);
                    const res = await fetch(`/api/verify/${token}`);
                    const data = await res.json();
                    if (res.ok) {
                        navigate('/login?verified=true', { replace: true });
                    } else {
                        console.error('[VERIFY] API Error:', data.error);
                        navigate('/login?error=token', { replace: true });
                    }
                } catch (err) {
                    console.error('[VERIFY] Connection error:', err);
                    addToast('Erro ao verificar e-mail.', 'error');
                    navigate('/login', { replace: true });
                }
            };
            verifyEmail();
        }
    }, [location.pathname, location.search, navigate, addToast]);

    const [config, setConfig] = useState({ token: '', phoneId: '', wabaId: '', templateName: '', mapping: {}, webhookVerifyToken: '' });
    const [dispatches, setDispatches] = useState([]);
    const [activeDispatch, setActiveDispatch] = useState(null);
    const [receivedMessages, setReceivedMessages] = useState([]);

    // UI State
    const [campaignData, setCampaignData] = useState(null);
    const [headers, setHeaders] = useState([]);
    const [mapping, setMapping] = useState(() => {
        try { return JSON.parse(localStorage.getItem('ambev_mapping_backup')) || {}; } catch { return {}; }
    });
    const [templateName, setTemplateName] = useState(() => {
        return localStorage.getItem('ambev_template_name_backup') || '';
    });
    const [templatePreview, setTemplatePreview] = useState(null);
    const [dates, setDates] = useState({ old: '', new: '' });
    const [templateDetails, setTemplateDetails] = useState(null);
    const [templateVariables, setTemplateVariables] = useState({});
    const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
    const [activeContact, setActiveContact] = useState(null);
    const [showToken, setShowToken] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const activeTab = useMemo(() => {
        if (location.pathname === '/home') return 'disparos';
        if (location.pathname === '/history') return 'historico';
        if (location.pathname === '/received') return 'recebidas';
        if (location.pathname === '/settings') return 'ajustes';
        if (location.pathname === '/flows') return 'fluxos';
        return 'disparos';
    }, [location.pathname]);

    // Fetch functions
    const fetchUserData = useCallback(async () => {
        if (!user?.id) return;
        try {
            const res = await fetch(`/api/user/${user.id}`, {
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.config) {
                    setConfig(data.config);
                    setTemplateName(data.config.templateName || '');
                    setMapping(data.config.mapping || {});
                }
            }
        } catch (err) {
            console.error('Failed to fetch user data:', err);
        }
    }, [user?.id]);

    const fetchDispatches = useCallback(async () => {
        if (!user?.id) return;
        try {
            const authHeader = { 'Authorization': `Bearer ${user.token}` };
            const res = await fetch(`/api/dispatch/${user.id}`, { headers: authHeader });
            if (res.ok) {
                const data = await res.json();
                setDispatches(data);

                // Check for running dispatch
                const running = data.find(d => d.status === 'running' || d.status === 'paused');
                if (running) {
                    const detailRes = await fetch(`/api/dispatch/${user.id}/${running.id}`, { headers: authHeader });
                    if (detailRes.ok) {
                        const detail = await detailRes.json();
                        setActiveDispatch(detail);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to fetch dispatches:', err);
        }
    }, [user?.id]);

    const fetchMessages = useCallback(async () => {
        if (!config.phoneId || !config.token) return;
        setIsRefreshing(true);
        try {
            const res = await fetch(`/api/messages/${user.id}`, {
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setReceivedMessages(data);
            }
        } catch (err) {
            console.error('Failed to fetch messages:', err);
        } finally {
            setIsRefreshing(false);
        }
    }, [config.phoneId, config.token]);

    // WebSocket message handler
    const handleWsMessage = useCallback((data) => {
        const { event, data: payload } = data;

        if (event === 'dispatch:progress') {
            setActiveDispatch(prev => {
                if (prev && prev.id === payload.dispatchId) {
                    return {
                        ...prev,
                        currentIndex: payload.currentIndex,
                        successCount: payload.successCount,
                        errorCount: payload.errorCount,
                        status: payload.status || prev.status,
                        lastLog: payload.lastLog
                    };
                }
                return prev;
            });

            setDispatches(prev => prev.map(d => d.id === payload.dispatchId ? {
                ...d,
                currentIndex: payload.currentIndex,
                successCount: payload.successCount,
                errorCount: payload.errorCount,
                status: payload.status || d.status
            } : d));

        } else if (event === 'dispatch:status') {
            const isFinished = ['completed', 'error', 'stopped'].includes(payload.status);

            setActiveDispatch(prev => {
                if (prev && prev.id === payload.dispatchId) {
                    const updated = {
                        ...prev,
                        status: payload.status,
                        successCount: payload.successCount !== undefined ? payload.successCount : prev.successCount,
                        errorCount: payload.errorCount !== undefined ? payload.errorCount : prev.errorCount
                    };
                    if (isFinished) updated.currentIndex = prev.totalLeads;
                    return updated;
                }
                return prev;
            });

            setDispatches(prev => prev.map(d => d.id === payload.dispatchId ? {
                ...d,
                status: payload.status,
                successCount: payload.successCount !== undefined ? payload.successCount : d.successCount,
                errorCount: payload.errorCount !== undefined ? payload.errorCount : d.errorCount,
                currentIndex: isFinished ? d.totalLeads : d.currentIndex
            } : d));

            if (payload.status === 'completed') {
                addToast('Campanha concluída com sucesso!', 'success');
            } else if (payload.status === 'error') {
                addToast('Campanha finalizada com alguns erros.', 'error');
            }

        } else if (event === 'dispatch:complete') {
            fetchDispatches();
        } else if (event === 'message:received') {
            fetchMessages();
        }
    }, [addToast, fetchMessages, fetchDispatches]);

    // Connect WebSocket
    useWebSocket(user?.id, handleWsMessage);

    // Load data on mount/login
    useEffect(() => {
        if (user?.id) {
            Promise.all([fetchUserData(), fetchDispatches(), fetchMessages()])
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, [user?.id, fetchUserData, fetchDispatches, fetchMessages]);

    // Auto-polling for new messages
    useEffect(() => {
        if (user?.id && location.pathname === '/received') {
            const interval = setInterval(() => {
                if (!isRefreshing) {
                    fetchMessages();
                }
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [user?.id, location.pathname, fetchMessages, isRefreshing]);

    // Persist UI state
    useEffect(() => {
        localStorage.setItem('ambev_template_name_backup', templateName);
    }, [templateName]);

    useEffect(() => {
        localStorage.setItem('ambev_mapping_backup', JSON.stringify(mapping));
    }, [mapping]);

    const handleLogin = async (email, password, directToken = null) => {
        try {
            if (directToken) {
                // Handle Google/Direct Token Login
                const res = await fetch('/api/user/me', {
                    headers: { 'Authorization': `Bearer ${directToken}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setUser({ ...data, token: directToken });
                    if (data.config) {
                        setConfig(data.config);
                        setTemplateName(data.config.templateName || '');
                        setMapping(data.config.mapping || {});
                    }
                    addToast(`Bem-vindo, ${data.name || data.email}!`, 'success');
                    navigate('/home');
                } else {
                    addToast('Erro ao validar login.', 'error');
                }
                return;
            }

            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setUser({ ...data.user, token: data.token });
                if (data.user.config) {
                    setConfig(data.user.config);
                    setTemplateName(data.user.config.templateName || '');
                    setMapping(data.user.config.mapping || {});
                }
                addToast(`Bem-vindo, ${data.user.name || data.user.email}!`, 'success');
                navigate('/home');
            } else {
                addToast(data.error || 'Erro ao entrar.', 'error');
            }
        } catch (err) {
            addToast('Erro de conexão com o servidor.', 'error');
        }
    };

    const handleRegister = async (email, password) => {
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.trim().toLowerCase(),
                    password: password.trim()
                })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                addToast(data.message || 'Verifique seu e-mail para ativar a conta!', 'success');
                navigate('/login');
            } else {
                addToast(data.error || 'Erro ao cadastrar.', 'error');
            }
        } catch (err) {
            addToast('Erro de conexão com o servidor.', 'error');
        }
    };

    const handleLogout = () => {
        setUser(null);
        setConfig({ token: '', phoneId: '', wabaId: '', templateName: '', mapping: {}, webhookVerifyToken: '' });
        setActiveDispatch(null);
        setDispatches([]);
        navigate('/login');
    };

    if (isLoading) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>Carregando dados...</p>
                <style>{`
                    .loading-screen {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        background-color: #f0f2f5;
                        color: #333;
                        font-family: sans-serif;
                    }
                    .spinner {
                        border: 4px solid rgba(0, 0, 0, 0.1);
                        border-left-color: #280091;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        animation: spin 1s linear infinite;
                        margin-bottom: 1rem;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    const commonProps = {
        user,
        onLogout: handleLogout,
        config,
        setConfig,
        dispatches,
        setDispatches,
        activeDispatch,
        setActiveDispatch,
        receivedMessages,
        fetchDispatches,
        campaignData,
        setCampaignData,
        headers,
        setHeaders,
        mapping,
        setMapping,
        templateName,
        setTemplateName,
        templatePreview,
        setTemplatePreview,
        dates,
        setDates,
        setActiveTab: (tab) => navigate(`/${tab === 'disparos' ? 'home' : tab === 'historico' ? 'history' : tab === 'recebidas' ? 'received' : tab === 'fluxos' ? 'flows' : 'settings'}`),
        isRefreshing,
        fetchMessages,
        activeContact,
        setActiveContact,
        showToken,
        setShowToken,
        addToast,
        setReceivedMessages,
        templateDetails,
        setTemplateDetails,
        templateVariables,
        setTemplateVariables,
        isLoadingTemplate,
        setIsLoadingTemplate,
        fetchUserData
    };

    return (
        <>
            <Toast toasts={toasts} />
            <Routes>
                <Route path="/login" element={!user ? (
                    <LoginView
                        onLogin={handleLogin}
                        onSwitch={(mode) => {
                            if (mode === 'forgot') navigate('/forgot-password');
                            else navigate('/register');
                        }}
                    />
                ) : <Navigate to="/home" />} />
                <Route path="/register" element={!user ? <RegisterView onRegister={handleRegister} onSwitch={() => navigate('/login')} /> : <Navigate to="/home" />} />
                <Route path="/forgot-password" element={!user ? <ForgotPasswordView onSwitch={() => navigate('/login')} /> : <Navigate to="/home" />} />
                <Route path="/reset-password" element={!user ? <ResetPasswordView /> : <Navigate to="/home" />} />
                <Route path="/auth/success" element={<div className="loading-screen"><div className="spinner"></div><p>Finalizando login...</p></div>} />
                <Route path="/verify" element={<div className="loading-screen"><div className="spinner"></div><p>Verificando e-mail...</p></div>} />
                <Route path="/home" element={user ? <Dashboard {...commonProps} activeTab="disparos" /> : <Navigate to="/login" />} />
                <Route path="/history" element={user ? <Dashboard {...commonProps} activeTab="historico" /> : <Navigate to="/login" />} />
                <Route path="/received" element={user ? <Dashboard {...commonProps} activeTab="recebidas" /> : <Navigate to="/login" />} />
                <Route path="/flows" element={user ? <Dashboard {...commonProps} activeTab="fluxos" /> : <Navigate to="/login" />} />
                <Route path="/settings" element={user ? <Dashboard {...commonProps} activeTab="ajustes" /> : <Navigate to="/login" />} />
                <Route path="*" element={<Navigate to={user ? "/home" : "/login"} />} />
            </Routes>
        </>
    );
}
