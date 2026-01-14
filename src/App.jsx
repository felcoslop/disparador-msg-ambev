import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LogIn, UserPlus, LogOut, Settings, Upload, Send, History, AlertCircle, CheckCircle2, Eye, EyeOff, Play, Pause, RotateCcw, X, List, RefreshCw, Trash2 } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// --- Global Constants ---
const AMBEV_COLORS = {
    blue: '#280091',
    green: '#00a276',
    yellow: '#fecb00',
    white: '#ffffff'
};

const REQUIRED_COLUMNS = [
    { id: 'client_code', label: 'Cód. Cliente' },
    { id: 'fantasy_name', label: 'Nome fantasia' },
    { id: 'phone', label: 'Tel. Promax' },
    { id: 'order_number', label: 'Nº do Pedido' }
];

// --- WebSocket Hook ---
function useWebSocket(userId, onMessage) {
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);

    const connect = useCallback(() => {
        if (!userId) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
            console.log('[WS] Connected');
            wsRef.current.send(JSON.stringify({ type: 'auth', userId }));
        };

        wsRef.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                onMessage(data);
            } catch (e) {
                console.error('[WS] Parse error:', e);
            }
        };

        wsRef.current.onclose = () => {
            console.log('[WS] Disconnected, reconnecting...');
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };

        wsRef.current.onerror = (err) => {
            console.error('[WS] Error:', err);
        };
    }, [userId, onMessage]);

    useEffect(() => {
        connect();
        return () => {
            if (wsRef.current) wsRef.current.close();
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        };
    }, [connect]);

    return wsRef;
}

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

    // Session: now stores full user object with id
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('ambev_session');
        return saved ? JSON.parse(saved) : null;
    });

    useEffect(() => {
        if (user) {
            localStorage.setItem('ambev_session', JSON.stringify(user));
        } else {
            localStorage.removeItem('ambev_session');
        }
    }, [user]);

    const [config, setConfig] = useState({ token: '', phoneId: '', wabaId: '', templateName: '', mapping: {} });
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
    const [activeContact, setActiveContact] = useState(null);
    const [showToken, setShowToken] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [toasts, setToasts] = useState([]);

    const activeTab = useMemo(() => {
        if (location.pathname === '/home') return 'disparos';
        if (location.pathname === '/history') return 'historico';
        if (location.pathname === '/received') return 'recebidas';
        if (location.pathname === '/settings') return 'ajustes';
        return 'disparos';
    }, [location.pathname]);

    const addToast = useCallback((message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    }, []);

    // Fetch functions
    const fetchUserData = useCallback(async () => {
        if (!user?.id) return;
        try {
            const res = await fetch(`/api/user/${user.id}`);
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
            const res = await fetch(`/api/dispatch/${user.id}`);
            if (res.ok) {
                const data = await res.json();
                setDispatches(data);

                // Check for running dispatch
                const running = data.find(d => d.status === 'running' || d.status === 'paused');
                if (running) {
                    const detailRes = await fetch(`/api/dispatch/${user.id}/${running.id}`);
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
        setIsRefreshing(true);
        try {
            const res = await fetch('/api/messages');
            if (res.ok) {
                const data = await res.json();
                console.log('[MESSAGES] Fetched:', data.length);
                setReceivedMessages(data);
            }
        } catch (err) {
            console.error('Failed to fetch messages:', err);
        } finally {
            setIsRefreshing(false);
        }
    }, []);

    // WebSocket message handler
    const handleWsMessage = useCallback((data) => {
        const { event, data: payload } = data;

        if (event === 'dispatch:progress') {
            setActiveDispatch(prev => (prev && prev.id === payload.dispatchId) ? {
                ...prev,
                currentIndex: payload.currentIndex,
                successCount: payload.successCount,
                errorCount: payload.errorCount,
                lastLog: payload.lastLog
            } : prev);
        } else if (event === 'dispatch:status') {
            setActiveDispatch(prev => (prev && prev.id === payload.dispatchId) ? { ...prev, status: payload.status } : prev);
            if (payload.status === 'completed') {
                addToast('Disparo concluído!', 'success');
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
        if (user?.id && activeTab === 'recebidas') {
            const interval = setInterval(() => {
                // Only poll if not currently refreshing to avoid overlaps
                if (!isRefreshing) {
                    fetchMessages();
                }
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [user?.id, activeTab, fetchMessages, isRefreshing]);

    // Persist UI state
    useEffect(() => {
        localStorage.setItem('ambev_template_name_backup', templateName);
    }, [templateName]);

    useEffect(() => {
        localStorage.setItem('ambev_mapping_backup', JSON.stringify(mapping));
    }, [mapping]);

    const handleLogin = async (email, password) => {
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setUser(data.user);
                if (data.user.config) {
                    setConfig(data.user.config);
                    setTemplateName(data.user.config.templateName || '');
                    setMapping(data.user.config.mapping || {});
                }
                addToast(`Bem-vindo, ${data.user.email}!`, 'success');
                navigate('/home');
            } else {
                addToast(data.error || 'E-mail ou senha incorretos.', 'error');
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
                addToast('Usuário cadastrado com sucesso!', 'success');
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
        setConfig({ token: '', phoneId: '', wabaId: '', templateName: '', mapping: {} });
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
        setActiveTab: (tab) => navigate(`/${tab === 'disparos' ? 'home' : tab === 'historico' ? 'history' : tab === 'recebidas' ? 'received' : 'settings'}`),
        isRefreshing,
        fetchMessages,
        activeContact,
        setActiveContact,
        showToken,
        setShowToken,
        addToast,
        setReceivedMessages
    };

    return (
        <>
            <Toast toasts={toasts} />
            <Routes>
                <Route path="/login" element={!user ? <LoginView onLogin={handleLogin} onSwitch={() => navigate('/register')} /> : <Navigate to="/home" />} />
                <Route path="/register" element={!user ? <RegisterView onRegister={handleRegister} onSwitch={() => navigate('/login')} /> : <Navigate to="/home" />} />
                <Route path="/home" element={user ? <Dashboard {...commonProps} activeTab="disparos" /> : <Navigate to="/login" />} />
                <Route path="/history" element={user ? <Dashboard {...commonProps} activeTab="historico" /> : <Navigate to="/login" />} />
                <Route path="/received" element={user ? <Dashboard {...commonProps} activeTab="recebidas" /> : <Navigate to="/login" />} />
                <Route path="/settings" element={user ? <Dashboard {...commonProps} activeTab="ajustes" /> : <Navigate to="/login" />} />
                <Route path="*" element={<Navigate to={user ? "/home" : "/login"} />} />
            </Routes>
        </>
    );
}

// --- Toast Component ---
function Toast({ toasts }) {
    if (!toasts.length) return null;

    return (
        <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            pointerEvents: 'none'
        }}>
            {toasts.map(toast => (
                <div key={toast.id} style={{
                    minWidth: '280px',
                    padding: '16px',
                    borderRadius: '8px',
                    backgroundColor: toast.type === 'error' ? '#dc3545' :
                        toast.type === 'success' ? '#00a276' :
                            '#280091',
                    color: '#fff',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    animation: 'slideInToast 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
                    pointerEvents: 'auto'
                }}>
                    {toast.type === 'error' ? <AlertCircle size={20} /> :
                        toast.type === 'success' ? <CheckCircle2 size={20} /> :
                            <AlertCircle size={20} />}
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{toast.message}</span>
                </div>
            ))}
            <style>{`
                @keyframes slideInToast {
                    0% { transform: translateX(120%); opacity: 0; }
                    100% { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}

// --- Login/Register Views (Omitted for brevity, assume they are the same as before or updated via replace) ---
function LoginView({ onLogin, onSwitch }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="auth-container">
            <div className="auth-card ambev-flag">
                <img src="/favicon.jpg" alt="Ambev" style={{ width: '120px', marginBottom: '1rem' }} />
                <h1 className="logo-text">ambev</h1>
                <p className="subtitle">Gente realizando grandes sonhos</p>
                <form onSubmit={(e) => { e.preventDefault(); onLogin(email, password); }}>
                    <div className="input-group">
                        <label>E-mail</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="exemplo@ab-inbev.com" />
                    </div>
                    <div className="input-group">
                        <label>Senha</label>
                        <div className="input-with-btn">
                            <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required />
                            <button type="button" className="btn-secondary" onClick={() => setShowPassword(!showPassword)}>
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <button type="submit" className="btn-primary w-full">Entrar</button>
                </form>
                <button className="btn-link" onClick={onSwitch}>Criar nova conta</button>
                <div className="legal-footer-login">
                    <a href="/politics/privacidade.html" target="_blank">Privacidade</a>
                    <a href="/politics/termos.html" target="_blank">Termos de Uso</a>
                </div>
            </div>
            <style>{`
                .auth-container { height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--ambev-gradient); }
                .auth-card { width: 90%; max-width: 400px; text-align: center; }
                .logo-text { font-family: var(--font-display); font-weight: 700; font-size: 3rem; color: var(--ambev-blue); margin-bottom: 0.5rem; letter-spacing: -2px; }
                .subtitle { color: #666; margin-bottom: 2rem; font-size: 0.9rem; }
                .input-group { text-align: left; margin-bottom: 1.5rem; }
                .input-group label { display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.5rem; color: #333; }
                .input-group input { width: 100%; padding: 0.8rem; border: 1px solid #ddd; border-radius: var(--radius-md); font-size: 1rem; }
                .w-full { width: 100%; }
                .btn-link { background: none; border: none; color: var(--ambev-blue); margin-top: 1rem; font-size: 0.9rem; cursor: pointer; text-decoration: underline; }
            `}</style>
        </div>
    );
}

function RegisterView({ onRegister, onSwitch }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    return (
        <div className="auth-container">
            <div className="auth-card ambev-flag">
                <img src="/favicon.jpg" alt="Ambev" style={{ width: '120px', marginBottom: '1rem' }} />
                <h1 className="logo-text">ambev</h1>
                <h2>Cadastro</h2>
                <form onSubmit={(e) => { e.preventDefault(); onRegister(email, password); }}>
                    <div className="input-group">
                        <label>E-mail</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div className="input-group">
                        <label>Senha</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                    </div>
                    <button type="submit" className="btn-primary w-full">Cadastrar</button>
                </form>
                <button className="btn-link" onClick={onSwitch}>Já tenho conta</button>
                <div className="legal-footer-login">
                    <a href="/politics/privacidade.html" target="_blank">Privacidade</a>
                    <a href="/politics/termos.html" target="_blank">Termos de Uso</a>
                </div>
            </div>
        </div>
    );
}

// --- Log Modal Component ---
function LogModal({ dispatch, onClose }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await fetch(`/api/dispatch/${dispatch.userId}/${dispatch.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setLogs(data.logs || []);
                }
            } catch (err) {
                console.error('Error fetching logs:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
    }, [dispatch]);

    return (
        <div className="modal-overlay">
            <div className="modal-content card ambev-flag" style={{ maxWidth: '800px', width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3>Logs do Disparo #{dispatch.id}</h3>
                    <button className="btn-icon" onClick={onClose}><X size={20} /></button>
                </header>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    {loading ? <p>Carregando...</p> : (
                        <table className="preview-table">
                            <thead>
                                <tr>
                                    <th>Telefone</th>
                                    <th>Status</th>
                                    <th>Mensagem</th>
                                    <th>Data</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id}>
                                        <td>{log.phone}</td>
                                        <td><span className={`status-badge ${log.status}`}>{log.status}</span></td>
                                        <td style={{ fontSize: '0.8rem' }}>{log.message || '-'}</td>
                                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(log.createdAt).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {logs.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center' }}>Nenhum log encontrado.</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
            <style>{`
                .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100000; }
                .modal-content { overflow: hidden; padding: 2rem; position: relative; }
                .btn-icon { background: none; border: none; cursor: pointer; color: #666; }
            `}</style>
        </div>
    );
}

// --- Dashboard ---
function Dashboard({
    user,
    onLogout,
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
    activeTab,
    setActiveTab,
    activeContact,
    setActiveContact,
    showToken,
    setShowToken,
    addToast,
    setReceivedMessages,
    isRefreshing,
    fetchMessages
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedContacts, setSelectedContacts] = useState([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [tempConfig, setTempConfig] = useState(config); const [selectedLogDispatch, setSelectedLogDispatch] = useState(null);
    const [showProfileModal, setShowProfileModal] = useState(null); // Will store { name, phone }


    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const extension = file.name.split('.').pop().toLowerCase();
        if (extension === 'xlsx' || extension === 'xls') {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
                if (data.length > 0) {
                    setHeaders(data[0]);
                    setCampaignData(data.slice(1).map(row => {
                        const obj = {};
                        data[0].forEach((header, i) => obj[header] = row[i]);
                        obj._raw = row;
                        return obj;
                    }));
                }
            };
            reader.readAsBinaryString(file);
        } else {
            Papa.parse(file, {
                header: true, skipEmptyLines: true, complete: (results) => {
                    setHeaders(results.meta.fields);
                    setCampaignData(results.data);
                }
            });
        }
    };

    const getDateLogic = () => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const format = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        const todayStr = format(today);
        const tomorrowStr = format(tomorrow);
        let oldDisplay = dates.old ? `no dia ${dates.old}` : 'hoje';
        let newDisplay = dates.new ? `no dia ${dates.new}` : 'amanhã';
        if (dates.old === todayStr) oldDisplay = 'hoje';
        if (dates.new === tomorrowStr) newDisplay = 'amanhã';
        return { oldDisplay, newDisplay };
    };

    const renderTemplatePreview = () => {
        if (!campaignData || campaignData.length === 0) return null;
        const item = campaignData[0];
        const clientName = item[mapping['fantasy_name']] || '[NOME FANTASIA]';
        const orderNum = item[mapping['order_number']] || '[PEDIDO]';
        const { oldDisplay, newDisplay } = getDateLogic();
        return (
            <div className="template-box">
                <p>Olá, <strong>{clientName}</strong>.</p>
                <p>Informamos que, devido a um imprevisto logístico, o pedido <strong>{orderNum}</strong> não será entregue <strong>{oldDisplay}</strong>.</p>
                <p>A entrega foi reagendada e será realizada <strong>{newDisplay}</strong>.</p>
                <p>Agradecemos a compreensão e seguimos à disposição.</p>
            </div>
        );
    };

    const startDispatch = async () => {
        if (!config.token || !config.phoneId) return addToast('Configure as credenciais primeiro.', 'error');
        if (!templateName) return addToast('Informe o nome do template.', 'error');
        if (!campaignData) return addToast('Carregue uma base primeiro.', 'error');

        const { oldDisplay, newDisplay } = getDateLogic();
        const leads = campaignData.map(row => ({
            'Nome fantasia': row[mapping['fantasy_name']] || row['Nome fantasia'],
            'Nº do Pedido': row[mapping['order_number']] || row['Nº do Pedido'],
            'Tel. Promax': row[mapping['phone']] || row['Tel. Promax'],
            ...row
        }));

        try {
            const res = await fetch(`/api/dispatch/${user.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateName, dateOld: oldDisplay, dateNew: newDisplay, leads })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                addToast('Disparo iniciado!', 'success');
                setActiveDispatch({ id: data.dispatchId, status: 'running', currentIndex: 0, totalLeads: leads.length, successCount: 0, errorCount: 0 });
                fetchDispatches();
            } else {
                addToast(data.error || 'Erro ao iniciar.', 'error');
            }
        } catch (err) { addToast('Erro de conexão.', 'error'); }
    };

    const controlDispatch = async (action, dispatchId = null) => {
        const id = dispatchId || activeDispatch?.id;
        if (!id) return;
        try {
            const res = await fetch(`/api/dispatch/${id}/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            if (res.ok) {
                addToast(`Ação ${action} realizada.`, 'info');
                fetchDispatches();
            } else {
                const data = await res.json();
                addToast(data.error || 'Erro ao controlar.', 'error');
            }
        } catch (err) { addToast('Erro de conexão.', 'error'); }
    };

    const retryFailed = async (dispatchId) => {
        try {
            const res = await fetch(`/api/dispatch/${dispatchId}/retry`, { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.success) {
                addToast(data.message, 'success');
                fetchDispatches();
                setActiveTab('disparos');
            } else {
                addToast(data.error || 'Erro ao reintentar.', 'error');
            }
        } catch (err) { addToast('Erro de conexão.', 'error'); }
    };

    const saveConfig = async () => {
        try {
            const res = await fetch(`/api/config/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...tempConfig, templateName, mapping })
            });
            if (res.ok) {
                setConfig(tempConfig);
                setIsEditing(false);
                addToast('Configurações salvas!', 'success');
            } else { addToast('Erro ao salvar.', 'error'); }
        } catch (err) { addToast('Erro ao salvar.', 'error'); }
    };

    return (
        <div className="dashboard-container">
            <aside className="sidebar">
                <div className="logo-small">
                    <img src="/favicon.jpg" alt="Ambev" style={{ width: '40px', borderRadius: '4px' }} />
                    <span>ambev</span>
                </div>
                <nav>
                    <button className={`nav-item ${activeTab === 'disparos' ? 'active' : ''}`} onClick={() => setActiveTab('disparos')}><Send size={20} /> Disparos</button>
                    <button className={`nav-item ${activeTab === 'historico' ? 'active' : ''}`} onClick={() => setActiveTab('historico')}><History size={20} /> Histórico</button>
                    <button className={`nav-item ${activeTab === 'recebidas' ? 'active' : ''}`} onClick={() => setActiveTab('recebidas')}><AlertCircle size={20} /> Recebidas</button>
                    <button className={`nav-item ${activeTab === 'ajustes' ? 'active' : ''}`} onClick={() => setActiveTab('ajustes')}><Settings size={20} /> Ajustes</button>
                </nav>
                <div className="user-profile">
                    <div className="user-info"><span className="user-email">{user.email}</span></div>
                    <button className="logout-btn" onClick={onLogout}><LogOut size={18} /></button>
                </div>
            </aside>

            <main className="content">
                <header className="content-header">
                    <h1>{activeTab === 'disparos' ? 'Automação de Notificações' : activeTab === 'historico' ? 'Histórico' : activeTab === 'recebidas' ? 'Mensagens Recebidas' : 'Configurações'}</h1>
                    {activeTab === 'disparos' && activeDispatch?.status === 'running' && <div className="badge-live">Live</div>}
                </header>

                {activeTab === 'disparos' && (
                    <section className="dashboard-grid">
                        {activeDispatch && (activeDispatch.status === 'running' || activeDispatch.status === 'paused' || activeDispatch.status === 'stopped') ? (
                            <div className="card ambev-flag progress-container" style={{ gridColumn: 'span 2' }}>
                                <div className="progress-header">
                                    <span>#{activeDispatch.id} - Progresso: {activeDispatch.currentIndex} / {activeDispatch.totalLeads}</span>
                                    <div className="status-group">
                                        {activeDispatch.errorCount > 0 && <span className="error-badge">{activeDispatch.errorCount} erros</span>}
                                        <span className={`status-badge ${activeDispatch.status}`}>{activeDispatch.status}</span>
                                    </div>
                                </div>
                                <div className="progress-bar-bg">
                                    <div className="progress-bar-fill" style={{ width: `${(activeDispatch.currentIndex / activeDispatch.totalLeads) * 100 || 0}%` }}></div>
                                </div>
                                <div className="progress-controls">
                                    {activeDispatch.status === 'running' ? (
                                        <button className="btn-pause" onClick={() => controlDispatch('pause')}><Pause size={18} /> Pausar</button>
                                    ) : (
                                        <button className="btn-resume" onClick={() => controlDispatch('resume')}><Play size={18} /> Continuar</button>
                                    )}
                                    <button className="btn-secondary" onClick={() => controlDispatch('stop')}><RotateCcw size={18} /> Parar tudo</button>
                                    <button className="btn-secondary" onClick={() => setSelectedLogDispatch(activeDispatch)}><List size={18} /> Ver Logs</button>
                                </div>
                                {activeDispatch.lastLog && (
                                    <div className="log-container">
                                        <label>Último:</label>
                                        <div className={`log-entry ${activeDispatch.lastLog.status === 'error' ? 'error' : ''}`}>
                                            {activeDispatch.lastLog.phone}: {activeDispatch.lastLog.status === 'success' ? '✓ OK' : `✗ ${activeDispatch.lastLog.message}`}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {!campaignData ? (
                                    <div className="card ambev-flag upload-card" style={{ gridColumn: 'span 2' }}>
                                        <h3><Upload size={18} /> Base de Dados</h3>
                                        <div className="dropzone" onClick={() => document.getElementById('fileInput').click()}>
                                            <input type="file" id="fileInput" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                                            <div className="dropzone-label"><Upload size={48} strokeWidth={1} /><span>Clique ou arraste o arquivo</span></div>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="card ambev-flag upload-success" style={{ gridColumn: 'span 2' }}>
                                            <CheckCircle2 size={48} color="var(--ambev-green)" />
                                            <h3>Base carregada: {campaignData.length} leads</h3>
                                            <button className="btn-link" onClick={() => setCampaignData(null)}>Trocar base</button>
                                        </div>
                                        <div className="card ambev-flag" style={{ gridColumn: 'span 2', maxHeight: '400px', overflow: 'auto', padding: '1rem' }}>
                                            <h3>Preview dos Dados</h3>
                                            <table className="preview-table">
                                                <thead>
                                                    <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
                                                </thead>
                                                <tbody>
                                                    {campaignData.slice(0, 10).map((row, i) => (
                                                        <tr key={i}>
                                                            {headers.map(h => <td key={h}>{row[h]}</td>)}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {campaignData.length > 10 && <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '10px' }}>Exibindo os primeiros 10 leads de {campaignData.length}.</p>}
                                        </div>
                                    </>
                                )}
                                {campaignData && (
                                    <>
                                        <div className="card ambev-flag mapping-card">
                                            <h3>Mapeamento</h3>
                                            <div className="mapping-grid">
                                                {REQUIRED_COLUMNS.map(col => (
                                                    <div key={col.id} className="input-group">
                                                        <label>{col.label}</label>
                                                        <select value={mapping[col.id] || ''} onChange={e => setMapping({ ...mapping, [col.id]: e.target.value })}>
                                                            <option value="">Coluna...</option>
                                                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                        </select>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="card ambev-flag template-card">
                                            <h3>Datas e Template</h3>
                                            <div className="input-group"><label>Template Meta</label><input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)} /></div>
                                            <div className="input-grid mt-4">
                                                <div className="input-group"><label>Antiga</label><input type="text" placeholder="12/01" value={dates.old} onChange={e => setDates({ ...dates, old: e.target.value })} /></div>
                                                <div className="input-group"><label>Nova</label><input type="text" placeholder="13/01" value={dates.new} onChange={e => setDates({ ...dates, new: e.target.value })} /></div>
                                            </div>
                                            <button className="btn-secondary mt-2" onClick={() => setTemplatePreview(true)}>Validar Template</button>
                                            {templatePreview && renderTemplatePreview()}
                                        </div>
                                        <div className="dispatch-actions" style={{ gridColumn: 'span 2' }}>
                                            <button className="btn-primary btn-lg" onClick={startDispatch}><Send size={24} /> Iniciar Disparo</button>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </section>
                )}

                {activeTab === 'recebidas' && (
                    <div className="card ambev-flag fade-in">
                        <div className="card-header" style={{ marginBottom: '1rem' }}>
                            {/* Refresh button moved to Chat Header */}
                        </div>
                        <div className="received-container" style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 280px)' }}>
                            <div className="card ambev-flag" style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3>Contatos</h3>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (isDeleting && selectedContacts.length > 0) {
                                                    setShowDeleteConfirm(true);
                                                } else {
                                                    setIsDeleting(!isDeleting);
                                                    setSelectedContacts([]);
                                                }
                                            }}
                                            title={isDeleting ? "Confirmar Exclusão" : "Excluir Conversas"}
                                            style={{ padding: '4px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDeleting ? 'red' : '#999' }}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                        <button
                                            className={`refresh-btn ${isRefreshing ? 'spinning' : ''}`}
                                            onClick={fetchMessages}
                                            title="Atualizar mensagens"
                                            disabled={isRefreshing}
                                            style={{ padding: '4px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ambev-blue)' }}
                                        >
                                            <RefreshCw size={18} />
                                        </button>
                                    </div>
                                </div>
                                <div className="contact-list" style={{ flex: 1, overflowY: 'auto', marginTop: '1rem' }}>
                                    {/* Deduction of unique contacts with normalization (Brazil 9-digit fix) */}
                                    {(() => {
                                        // Helper to normalize phone for grouping (Handling Brazil 9-digit issue)
                                        const normalize = p => {
                                            let s = String(p).replace(/\D/g, '');
                                            if (s.startsWith('55') && s.length === 12) {
                                                return s.slice(0, 4) + '9' + s.slice(4);
                                            }
                                            return s;
                                        };

                                        // Group messages by normalized phone
                                        const groups = {};
                                        receivedMessages.forEach(m => {
                                            const key = normalize(m.contactPhone);
                                            if (!groups[key]) groups[key] = [];
                                            groups[key].push(m);
                                        });

                                        return Object.keys(groups).map(phoneKey => {
                                            const contactMsgs = groups[phoneKey];
                                            const bestPhone = contactMsgs.find(m => String(m.contactPhone).replace(/\D/g, '').length === 13)?.contactPhone || contactMsgs[0].contactPhone;

                                            const incomingMsg = contactMsgs.find(m => !m.isFromMe);
                                            const outgoingMsg = contactMsgs.find(m => m.isFromMe);
                                            // Priority: Outgoing (Nome Fantasia) -> Incoming -> Phone
                                            const contactName = outgoingMsg ? outgoingMsg.contactName : (incomingMsg ? incomingMsg.contactName : bestPhone);

                                            const hasUnread = contactMsgs.some(m => !m.isFromMe && !m.isRead);
                                            const isSelected = normalize(activeContact) === phoneKey;

                                            return (
                                                <div
                                                    key={phoneKey}
                                                    className={`contact-item ${isSelected ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setActiveContact(bestPhone);
                                                        // Instant UI update
                                                        setReceivedMessages(prev => prev.map(m =>
                                                            (normalize(m.contactPhone) === phoneKey && !m.isFromMe) ? { ...m, isRead: true } : m
                                                        ));

                                                        // Get all unique raw phones in this group to mark as read
                                                        const groupPhones = [...new Set(contactMsgs.map(m => m.contactPhone))];

                                                        fetch('/api/messages/mark-read', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ phones: groupPhones })
                                                        }).catch(err => console.error('Failed to mark as read:', err));
                                                    }}
                                                    style={{
                                                        padding: '12px',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        marginBottom: '8px',
                                                        border: isSelected ? '2px solid var(--ambev-blue)' : '1px solid #eee',
                                                        backgroundColor: isSelected ? '#f0f4ff' : 'white',
                                                        width: '100%',
                                                        boxSizing: 'border-box'
                                                    }}
                                                >
                                                    <div className="contact-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {isDeleting && (
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedContacts.includes(phoneKey)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onChange={(e) => {
                                                                    if (selectedContacts.includes(phoneKey)) {
                                                                        setSelectedContacts(prev => prev.filter(p => p !== phoneKey));
                                                                    } else {
                                                                        setSelectedContacts(prev => [...prev, phoneKey]);
                                                                    }
                                                                }}
                                                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                            />
                                                        )}
                                                        <div className="contact-name" style={{ flex: 1 }}>{contactName}</div>
                                                        {hasUnread && <span className="unread-dot"></span>}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                    {receivedMessages.length === 0 && <p style={{ textAlign: 'center', color: '#999', marginTop: '2rem' }}>Nenhuma mensagem.</p>}
                                </div>
                            </div>

                            <div className="card ambev-flag chat-view" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0' }}>
                                {activeContact ? (
                                    <>
                                        <header style={{ padding: '1rem', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center' }}>
                                            <div
                                                className="profile-avatar"
                                                onClick={() => {
                                                    const normalize = p => String(p).replace(/\D/g, '');
                                                    const activeKey = normalize(activeContact);
                                                    const contactMsgs = receivedMessages.filter(m => normalize(m.contactPhone) === activeKey);

                                                    const incomingMsg = contactMsgs.find(m => !m.isFromMe);
                                                    const outgoingMsg = contactMsgs.find(m => m.isFromMe);
                                                    const clientName = incomingMsg ? incomingMsg.contactName : (outgoingMsg ? outgoingMsg.contactName : activeContact);

                                                    setShowProfileModal({
                                                        name: clientName,
                                                        phone: activeContact
                                                    });
                                                }}
                                            >
                                                <img
                                                    src={`/api/contacts/${activeContact}/photo?name=${encodeURIComponent(
                                                        (() => {
                                                            const normalize = p => {
                                                                let s = String(p).replace(/\D/g, '');
                                                                if (s.startsWith('55') && s.length === 12) return s.slice(0, 4) + '9' + s.slice(4);
                                                                return s;
                                                            };
                                                            const activeKey = normalize(activeContact);
                                                            const contactMsgs = receivedMessages.filter(m => normalize(m.contactPhone) === activeKey);
                                                            const incomingMsg = contactMsgs.find(m => !m.isFromMe);
                                                            const outgoingMsg = contactMsgs.find(m => m.isFromMe);
                                                            return outgoingMsg ? outgoingMsg.contactName : (incomingMsg ? incomingMsg.contactName : activeContact);
                                                        })()
                                                    )}`}
                                                    alt="Avatar"
                                                />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700 }}>
                                                    {(() => {
                                                        const normalize = p => {
                                                            let s = String(p).replace(/\D/g, '');
                                                            if (s.startsWith('55') && s.length === 12) return s.slice(0, 4) + '9' + s.slice(4);
                                                            return s;
                                                        };
                                                        const activeKey = normalize(activeContact);
                                                        const contactMsgs = receivedMessages.filter(m => normalize(m.contactPhone) === activeKey);
                                                        const incomingMsg = contactMsgs.find(m => !m.isFromMe);
                                                        const outgoingMsg = contactMsgs.find(m => m.isFromMe);
                                                        return outgoingMsg ? outgoingMsg.contactName : (incomingMsg ? incomingMsg.contactName : activeContact);
                                                    })()}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#666' }}>{activeContact}</div>
                                            </div>
                                        </header>
                                        <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column-reverse' }}>
                                            {(() => {
                                                const normalize = p => {
                                                    let s = String(p).replace(/\D/g, '');
                                                    if (s.startsWith('55') && s.length === 12) return s.slice(0, 4) + '9' + s.slice(4);
                                                    return s;
                                                };
                                                const activeKey = normalize(activeContact);
                                                return receivedMessages
                                                    .filter(m => normalize(m.contactPhone) === activeKey)
                                                    .map(msg => (
                                                        <div key={msg.id} style={{
                                                            alignSelf: msg.isFromMe ? 'flex-end' : 'flex-start',
                                                            backgroundColor: msg.isFromMe ? 'var(--ambev-blue)' : '#f0f2f5',
                                                            color: msg.isFromMe ? 'white' : 'black',
                                                            padding: '10px 14px',
                                                            borderRadius: '12px',
                                                            maxWidth: '80%',
                                                            marginBottom: '10px',
                                                            position: 'relative',
                                                            fontSize: '0.9rem'
                                                        }}>
                                                            {msg.messageBody}
                                                            <div style={{ fontSize: '0.65rem', opacity: 0.7, marginTop: '4px', textAlign: 'right' }}>
                                                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </div>
                                                    ));
                                            })()}
                                        </div>
                                        <form
                                            style={{ padding: '1rem', borderTop: '1px solid #eee', display: 'flex', gap: '10px' }}
                                            onSubmit={async (e) => {
                                                e.preventDefault();
                                                const text = e.target.reply.value;
                                                if (!text) return;
                                                try {
                                                    const res = await fetch('/api/send-message', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ userId: user.id, phone: activeContact, text })
                                                    });
                                                    if (res.ok) {
                                                        e.target.reply.value = '';
                                                        addToast('Mensagem enviada!', 'success');
                                                        fetchMessages();
                                                    } else {
                                                        addToast('Erro ao enviar resposta.', 'error');
                                                    }
                                                } catch (err) { addToast('Erro de conexão.', 'error'); }
                                            }}
                                        >
                                            <input name="reply" type="text" placeholder="Digite uma resposta..." style={{ flex: 1, padding: '10px', borderRadius: '20px', border: '1px solid #ddd' }} />
                                            <button type="submit" className="btn-icon" style={{ backgroundColor: 'var(--ambev-blue)', color: 'white', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Send size={20} />
                                            </button>
                                        </form>
                                    </>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', flexDirection: 'column' }}>
                                        <AlertCircle size={48} strokeWidth={1} style={{ marginBottom: '1rem' }} />
                                        Selecione um contato para ver as mensagens
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'historico' && (
                    <div className="card ambev-flag" style={{ width: '100%', boxSizing: 'border-box', maxWidth: '100%' }}>
                        <h3>Camppanhas Recentes</h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="preview-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Data</th>
                                        <th>Total</th>
                                        <th>Sucesso</th>
                                        <th>Erros</th>
                                        <th>Status</th>
                                        <th>Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dispatches.map(d => (
                                        <tr key={d.id}>
                                            <td>#{d.id}</td>
                                            <td style={{ fontSize: '0.8rem' }}>{new Date(d.createdAt).toLocaleString()}</td>
                                            <td>{d.totalLeads}</td>
                                            <td style={{ color: 'var(--ambev-green)' }}>{d.successCount}</td>
                                            <td style={{ color: d.errorCount > 0 ? '#ff5555' : 'inherit' }}>{d.errorCount}</td>
                                            <td><span className={`status-badge ${d.status}`}>{d.status}</span></td>
                                            <td style={{ display: 'flex', gap: '8px' }}>
                                                <button className="btn-icon" onClick={() => setSelectedLogDispatch(d)} title="Ver Logs"><List size={18} /></button>
                                                {d.errorCount > 0 && d.status !== 'running' && (
                                                    <button className="btn-icon" onClick={() => retryFailed(d.id)} title="Reintentar Erros" style={{ color: 'var(--ambev-blue)' }}><RotateCcw size={18} /></button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'ajustes' && (
                    <div className="card ambev-flag">
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <h3>Credenciais</h3>
                            <button className="btn-secondary" onClick={() => setIsEditing(!isEditing)}>{isEditing ? 'Cancelar' : 'Editar'}</button>
                        </div>
                        <div className="input-grid mt-4">
                            <div className="input-group">
                                <label>Token</label>
                                <div className="input-with-btn">
                                    <input type={showToken ? "text" : "password"} value={isEditing ? tempConfig.token : config.token} onChange={e => setTempConfig({ ...tempConfig, token: e.target.value })} disabled={!isEditing} />
                                    <button onClick={() => setShowToken(!showToken)}>{showToken ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                                </div>
                            </div>
                            <div className="input-row">
                                <div className="input-group"><label>Phone ID</label><input type="text" value={isEditing ? tempConfig.phoneId : config.phoneId} onChange={e => setTempConfig({ ...tempConfig, phoneId: e.target.value })} disabled={!isEditing} /></div>
                                <div className="input-group"><label>WABA ID</label><input type="text" value={isEditing ? tempConfig.wabaId : config.wabaId} onChange={e => setTempConfig({ ...tempConfig, wabaId: e.target.value })} disabled={!isEditing} /></div>
                            </div>
                            {isEditing && <button className="btn-primary w-full mt-4" onClick={saveConfig}>Salvar</button>}
                        </div>
                    </div>
                )}
            </main>

            <div className="mobile-nav">
                <button className={`mobile-nav-item ${activeTab === 'disparos' ? 'active' : ''}`} onClick={() => setActiveTab('disparos')}>
                    <Send size={24} />
                    <span>Início</span>
                </button>
                <button className={`mobile-nav-item ${activeTab === 'recebidas' ? 'active' : ''}`} onClick={() => setActiveTab('recebidas')}>
                    <AlertCircle size={24} />
                    <span>Recebidas</span>
                </button>
                <button className={`mobile-nav-item ${activeTab === 'historico' ? 'active' : ''}`} onClick={() => setActiveTab('historico')}>
                    <History size={24} />
                    <span>Histórico</span>
                </button>
                <button className={`mobile-nav-item ${activeTab === 'ajustes' ? 'active' : ''}`} onClick={() => setActiveTab('ajustes')}>
                    <Settings size={24} />
                    <span>Ajustes</span>
                </button>
            </div>

            {
                selectedLogDispatch && (
                    <LogModal dispatch={selectedLogDispatch} onClose={() => setSelectedLogDispatch(null)} />
                )
            }
            {
                showProfileModal && (
                    <div className="profile-modal-overlay" onClick={() => setShowProfileModal(null)}>
                        <div className="profile-modal-content" onClick={e => e.stopPropagation()}>
                            <button className="profile-modal-close" onClick={() => setShowProfileModal(null)}>
                                <X size={20} />
                            </button>
                            <img
                                src={`/api/contacts/${showProfileModal.phone}/photo?name=${encodeURIComponent(showProfileModal.name)}`}
                                alt="Profile"
                            />
                        </div>
                    </div>
                )
            }
            {showDeleteConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="card fade-in" style={{ width: '400px', padding: '24px', backgroundColor: 'white', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#e02424' }}>
                            <Trash2 size={28} />
                            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Excluir Conversas</h3>
                        </div>
                        <p style={{ color: '#666', marginBottom: '24px' }}>
                            Tem certeza que deseja excluir <strong>{selectedContacts.length}</strong> conversa(s)? Essa ação não pode ser desfeita.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                className="btn-secondary"
                                onClick={() => setShowDeleteConfirm(false)}
                                style={{ padding: '8px 16px' }}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn-primary"
                                style={{
                                    backgroundColor: '#e02424',
                                    color: 'white',
                                    padding: '8px 16px',
                                    border: 'none',
                                    borderRadius: '6px'
                                }}
                                onClick={async () => {
                                    const normalize = p => {
                                        let s = String(p).replace(/\D/g, '');
                                        if (s.startsWith('55') && s.length === 12) return s.slice(0, 4) + '9' + s.slice(4);
                                        return s;
                                    };
                                    const uniquePhones = [...new Set(
                                        receivedMessages
                                            .filter(m => selectedContacts.includes(normalize(m.contactPhone)))
                                            .map(m => m.contactPhone)
                                    )];

                                    try {
                                        await fetch('/api/messages/delete', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ phones: uniquePhones })
                                        });

                                        addToast({ type: 'success', title: 'Sucesso', message: 'Excluído(s).' });

                                        // Reset UI state to prevent white screen
                                        setIsDeleting(false);
                                        setSelectedContacts([]);
                                        setShowDeleteConfirm(false);
                                        if (uniquePhones.some(p => normalize(p) === normalize(activeContact))) {
                                            setActiveContact(null);
                                        }

                                        // Refresh data
                                        fetchMessages();

                                    } catch (e) {
                                        console.error(e);
                                        addToast({ type: 'error', title: 'Erro', message: 'Falha ao excluir.' });
                                    }
                                }}
                            >
                                Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}
