import React, { useState, useEffect } from 'react';
import { LogIn, UserPlus, LogOut, Settings, Upload, Send, History, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// --- Global Constants ---
const DEFAULT_USER = {
    email: '99847120@ab-inbev.com',
    password: 'admin'
};

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

export default function App() {
    // Session Persistence: Load 'ambev_session' to stay logged in
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('ambev_session');
        return saved ? JSON.parse(saved) : null;
    });

    // Persist session whenever user changes
    useEffect(() => {
        if (user) {
            localStorage.setItem('ambev_session', JSON.stringify(user));
        } else {
            localStorage.removeItem('ambev_session');
        }
    }, [user]);

    const [view, setView] = useState(user ? 'dashboard' : 'login'); // Auto-redirect if logged in

    // State - Initialized as empty, populated ONLY by API (Server synchronization)
    const [users, setUsers] = useState([DEFAULT_USER]);
    const [config, setConfig] = useState(() => {
        try { return JSON.parse(localStorage.getItem('ambev_config_backup')) || { token: '', phoneId: '', wabaId: '' }; } catch { return { token: '', phoneId: '', wabaId: '' }; }
    });
    const [history, setHistory] = useState(() => {
        try { return JSON.parse(localStorage.getItem('ambev_history_backup')) || []; } catch { return []; }
    });
    const [receivedMessages, setReceivedMessages] = useState([]);

    // UI State (not persisted)
    const [campaignData, setCampaignData] = useState(null);
    const [headers, setHeaders] = useState([]);
    const [mapping, setMapping] = useState({});
    const [templateName, setTemplateName] = useState('');
    const [templatePreview, setTemplatePreview] = useState(null);
    const [dates, setDates] = useState({ old: '', new: '' });
    const [sendingStatus, setSendingStatus] = useState('idle');
    const [activeTab, setActiveTab] = useState('disparos');
    const [activeContact, setActiveContact] = useState(null);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [logs, setLogs] = useState([]);
    const [errors, setErrors] = useState([]);
    const [showToken, setShowToken] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // --- API SYNC + HYBRID BACKUP ---
    const fetchDb = async () => {
        try {
            // If logged in, fetch specific user config
            const emailParam = user && user.email ? `?email=${encodeURIComponent(user.email)}` : '';
            const res = await fetch(`/api/db${emailParam}`);

            if (res.ok) {
                const data = await res.json();

                // Server is master. Update state AND backup.
                if (data.users && data.users.length) {
                    setUsers(data.users);
                    localStorage.setItem('ambev_users_backup', JSON.stringify(data.users));
                }

                // Only update config if we got one (meaning we are logged in or server sent default)
                if (data.config) {
                    setConfig(data.config);
                    localStorage.setItem('ambev_config_backup', JSON.stringify(data.config));
                }

                if (data.history) {
                    setHistory(data.history);
                    localStorage.setItem('ambev_history_backup', JSON.stringify(data.history));
                }
                setReceivedMessages(data.receivedMessages || []);
                return data;
            }
        } catch (err) {
            console.warn("Server unavailable, using local backup.");
        } finally {
            setIsLoading(false);
        }
        return null;
    };

    const saveDb = async (newData) => {
        // 1. SAVE LOCAL BACKUP IMMEDIATELY (Safe)
        if (newData.users) localStorage.setItem('ambev_users_backup', JSON.stringify(newData.users));
        if (newData.config) localStorage.setItem('ambev_config_backup', JSON.stringify(newData.config));
        if (newData.history) localStorage.setItem('ambev_history_backup', JSON.stringify(newData.history));

        // 2. TRY SERVER SYNC
        try {
            const currentData = {
                users: newData.users || users,
                config: newData.config || config,
                history: newData.history || history,
                receivedMessages: newData.receivedMessages || receivedMessages
            };

            await fetch('/api/db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentData)
            });
        } catch (err) {
            console.error("Failed to sync to server (saved locally).", err);
            // Non-blocking error. User is safe locally.
        }
    };

    // Load data on mount
    useEffect(() => {
        fetchDb();
        // Periodically refresh received messages every 10s
        const interval = setInterval(fetchDb, 10000);
        return () => clearInterval(interval);
    }, []);

    const resetApp = async () => {
        if (window.confirm("Isso apagará todas as configurações e histórico do servidor. Continuar?")) {
            // Reset to defaults
            const defaultData = {
                users: [DEFAULT_USER],
                history: [],
                config: { token: '', phoneId: '', wabaId: '' },
                receivedMessages: []
            };
            await saveDb(defaultData);
            window.location.reload();
        }
    };

    const handleLogin = (email, password) => {
        // Simple standardization
        const cleanEmail = email.trim().toLowerCase();
        const cleanPass = password.trim();

        // 1. Try Direct Bypass first (Safe Mode)
        if (cleanEmail === DEFAULT_USER.email.toLowerCase() && cleanPass === DEFAULT_USER.password) {
            setUser(DEFAULT_USER);
            setView('dashboard');
            return;
        }

        // 2. Database Inspection
        const userInDb = users.find(u => u.email.trim().toLowerCase() === cleanEmail);

        if (userInDb) {
            // User exists, check password
            if (userInDb.password.trim() === cleanPass) {
                setUser(userInDb);
                setView('dashboard');
            } else {
                alert(`Senha incorreta para ${userInDb.email}.`);
            }
        } else {
            alert(`Usuário ${cleanEmail} não encontrado. Se você acabou de criar no PC, aguarde 2 segundos e tente novamente.`);
        }
    };

    const handleRegister = async (email, password) => {
        const sterilize = (str) => str
            .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
            .replace(/[\u2013\u2014]/g, '-');

        const cleanEmail = sterilize(email).toLowerCase();
        const cleanPass = sterilize(password);

        if (users.find(u => sterilize(u.email).toLowerCase() === cleanEmail)) {
            alert('E-mail já cadastrado');
            return;
        }
        const updatedUsers = [...users, { email: cleanEmail, password: cleanPass }];
        setUsers(updatedUsers);

        // SQLite Register
        try {
            await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: cleanEmail, password: cleanPass })
            });
            alert('Usuário cadastrado com sucesso!');
            setView('login');
        } catch (e) {
            alert('Erro ao salvar no banco.' + e.message);
        }
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

    if (!user) {
        return view === 'login' ? (
            <LoginView onLogin={handleLogin} onSwitch={() => setView('register')} onResetApp={resetApp} />
        ) : (
            <RegisterView onRegister={handleRegister} onSwitch={() => setView('login')} />
        );
    }

    return (
        <Dashboard
            user={user}
            onLogout={() => setUser(null)}
            config={config}
            setConfig={setConfig}
            history={history}
            setHistory={setHistory}
            receivedMessages={receivedMessages}
            setReceivedMessages={setReceivedMessages}
            saveDb={saveDb}
            campaignData={campaignData}
            setCampaignData={setCampaignData}
            headers={headers}
            setHeaders={setHeaders}
            mapping={mapping}
            setMapping={setMapping}
            templateName={templateName}
            setTemplateName={setTemplateName}
            templatePreview={templatePreview}
            setTemplatePreview={setTemplatePreview}
            dates={dates}
            setDates={setDates}
            sendingStatus={sendingStatus}
            setSendingStatus={setSendingStatus}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            activeContact={activeContact}
            setActiveContact={setActiveContact}
            progress={progress}
            setProgress={setProgress}
            logs={logs}
            setLogs={setLogs}
            errors={errors}
            setErrors={setErrors}
            showToken={showToken}
            setShowToken={setShowToken}
        />
    );
}

// --- Views ---

function LoginView({ onLogin, onSwitch, onResetApp }) {
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
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            placeholder="exemplo@ab-inbev.com"
                            spellCheck="false"
                            autoCorrect="off"
                            autoCapitalize="none"
                        />
                    </div>
                    <div className="input-group">
                        <label>Senha</label>
                        <div className="input-with-btn">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                spellCheck="false"
                                autoCorrect="off"
                                autoCapitalize="none"
                            />
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <button type="submit" className="btn-primary w-full">Entrar</button>
                </form>
                <button className="btn-link" onClick={onSwitch}>Criar nova conta</button>
                <div style={{ marginTop: '2rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                    <button
                        style={{ fontSize: '0.7rem', color: '#999', background: 'none', border: 'none', cursor: 'pointer' }}
                        onClick={onResetApp}
                    >
                        Resetar Aplicativo (Emergência)
                    </button>
                </div>
            </div>
            <style>{`
        .auth-container {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--ambev-gradient);
        }
        .auth-card {
          width: 90%;
          max-width: 400px;
          text-align: center;
        }
        .logo-text {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 3rem;
          color: var(--ambev-blue);
          margin-bottom: 0.5rem;
          letter-spacing: -2px;
        }
        .subtitle {
          color: #666;
          margin-bottom: 2rem;
          font-size: 0.9rem;
        }
        .input-group {
          text-align: left;
          margin-bottom: 1.5rem;
        }
        .input-group label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #333;
        }
        .input-group input {
          width: 100%;
          padding: 0.8rem;
          border: 1px solid #ddd;
          border-radius: var(--radius-md);
          font-size: 1rem;
        }
        .w-full { width: 100%; }
        .btn-link {
          background: none;
          border: none;
          color: var(--ambev-blue);
          margin-top: 1rem;
          font-size: 0.9rem;
          cursor: pointer;
          text-decoration: underline;
        }
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
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            spellCheck="false"
                            autoCorrect="off"
                            autoCapitalize="none"
                        />
                    </div>
                    <div className="input-group">
                        <label>Senha</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="btn-primary w-full">Cadastrar</button>
                </form>
                <button className="btn-link" onClick={onSwitch}>Já tenho conta</button>
            </div>
        </div>
    );
}

function Dashboard({
    user,
    onLogout,
    config,
    setConfig,
    history,
    setHistory,
    receivedMessages,
    setReceivedMessages,
    saveDb,
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
    sendingStatus,
    setSendingStatus,
    activeTab,
    setActiveTab,
    activeContact,
    setActiveContact,
    progress,
    setProgress,
    logs,
    setLogs,
    errors,
    setErrors,
    showToken,
    setShowToken
}) {
    // No longer initialized from localStorage, received as props
    // const [config, setConfig] = useState(() => { ... });
    // const [campaignData, setCampaignData] = useState(null);
    // const [headers, setHeaders] = useState([]);
    // const [mapping, setMapping] = useState({});
    // const [templateName, setTemplateName] = useState('');
    // const [templatePreview, setTemplatePreview] = useState(null);
    // const [dates, setDates] = useState({ old: '', new: '' });
    // const [sendingStatus, setSendingStatus] = useState('idle'); // idle, sending, paused, completed
    // const [activeTab, setActiveTab] = useState('disparos'); // disparos, historico, recebidas, ajustes
    // const [receivedMessages, setReceivedMessages] = useState(() => { ... });
    // const [activeContact, setActiveContact] = useState(null);
    // const [history, setHistory] = useState(() => { ... });
    // const [progress, setProgress] = useState({ current: 0, total: 0 });
    // const [logs, setLogs] = useState([]);
    // const [errors, setErrors] = useState([]);

    // const [showToken, setShowToken] = useState(false); // Now passed as prop
    const [isEditing, setIsEditing] = useState(false);
    const [tempConfig, setTempConfig] = useState(config);

    // These useEffects are now handled in App.js and passed down
    // useEffect(() => {
    //     localStorage.setItem('ambev_received_messages', JSON.stringify(receivedMessages));
    // }, [receivedMessages]);

    // useEffect(() => {
    //     localStorage.setItem('ambev_history', JSON.stringify(history));
    // }, [history]);

    // Auto-save removed to allow explicit 'Save' in Settings

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        const extension = file.name.split('.').pop().toLowerCase();

        if (extension === 'xlsx' || extension === 'xls') {
            reader.onload = (evt) => {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
                if (data.length > 0) {
                    setHeaders(data[0]);
                    setCampaignData(data.slice(1).map(row => {
                        const obj = {};
                        data[0].forEach((header, i) => obj[header] = row[i]);
                        return obj;
                    }));
                }
            };
            reader.readAsBinaryString(file);
        } else {
            Papa.parse(file, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => {
                    setHeaders(results.meta.fields);
                    setCampaignData(results.data);
                }
            });
        }
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Bom dia";
        if (hour < 18) return "Boa tarde";
        return "Boa noite";
    };

    const getDateLogic = () => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const format = (d) => {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            return `${day}/${month}`;
        };

        const todayStr = format(today);
        const tomorrowStr = format(tomorrow);

        let oldDisplay = dates.old ? `no dia ${dates.old}` : 'hoje';
        let newDisplay = dates.new ? `no dia ${dates.new}` : 'amanhã';

        if (dates.old === todayStr) oldDisplay = 'hoje';
        if (dates.new === tomorrowStr) newDisplay = 'amanhã';

        // Se as datas forem vazias (ex: usuário esqueceu), assume hoje/amanhã como padrão amigável
        if (!dates.old) oldDisplay = 'hoje';
        if (!dates.new) newDisplay = 'amanhã';

        return { oldDisplay, newDisplay };
    };

    const renderTemplatePreview = () => {
        if (!campaignData || campaignData.length === 0) return null;
        const item = campaignData[0];
        const clientName = item[mapping['fantasy_name']] || '[NOME FANTASIA]';
        const clientCode = item[mapping['client_code']] || '[CÓDIGO]';
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

    // --- POLL SERVER STATUS ---
    useEffect(() => {
        let interval;
        const checkStatus = async () => {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();

                setSendingStatus(data.status);
                setProgress(data.progress);
                if (data.logs.length > 0) setLogs(data.logs); // Sync logs
                if (data.errors.length > 0) setErrors(data.errors);
            } catch (e) {
                console.error("Polling error", e);
            }
        };

        if (sendingStatus === 'sending' || sendingStatus === 'paused') {
            interval = setInterval(checkStatus, 2000);
        } else {
            // Check once to see if job persisted after refresh
            checkStatus();
        }

        return () => clearInterval(interval);
    }, [sendingStatus]);

    const startSending = async () => {
        if (!config.token || !config.phoneId || !templateName) {
            alert('Configure as credenciais do Meta e o nome do template primeiro.');
            return;
        }

        if (sendingStatus === 'sending') {
            // Already sending, do pause
            await fetch('/api/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'pause' })
            });
            setSendingStatus('paused');
            return;
        }

        if (sendingStatus === 'paused') {
            // Resume
            await fetch('/api/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'resume' })
            });
            setSendingStatus('sending');
            return;
        }

        // START NEW CAMPAIGN
        const { oldDisplay, newDisplay } = getDateLogic();
        setSendingStatus('sending');

        try {
            const res = await fetch('/api/start-campaign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: campaignData,
                    config,
                    templateName,
                    dates: { old: oldDisplay, new: newDisplay }
                })
            });

            if (!res.ok) {
                const err = await res.json();
                alert('Erro ao iniciar campanha: ' + err.error);
                setSendingStatus('idle');
            }
        } catch (e) {
            alert('Erro de conexão com o servidor.');
            setSendingStatus('idle');
        }
    };


    const retryErrors = async () => {
        if (errors.length === 0) return;

        const failedPhones = errors.map(err => err.split(': ')[0].replace('[ERRO] ', '').replace('[FALHA] ', ''));
        const retryData = campaignData.filter(item => {
            let phone = String(item[mapping['phone']] || '').replace(/\D/g, '');
            if (phone && !phone.startsWith('55')) phone = '55' + phone;
            return failedPhones.includes(phone);
        });

        if (retryData.length === 0) {
            alert('Não foi possível mapear os erros de volta para a base.');
            return;
        }

        setCampaignData(retryData);
        setErrors([]);
        setProgress({ current: 0, total: retryData.length });
        setSendingStatus('idle');
        alert(`Preparado para reenviar para ${retryData.length} registros com erro.`);
    };

    return (
        <div className="dashboard-container">
            <aside className="sidebar">
                <div className="logo-small">
                    <img src="/favicon.jpg" alt="Ambev" style={{ width: '40px', borderRadius: '4px' }} />
                    <span>ambev</span>
                </div>
                <nav>
                    <button
                        className={`nav-item ${activeTab === 'disparos' ? 'active' : ''}`}
                        onClick={() => setActiveTab('disparos')}
                    >
                        <Send size={20} /> Disparos
                    </button>
                    <button
                        className={`nav-item ${activeTab === 'historico' ? 'active' : ''}`}
                        onClick={() => setActiveTab('historico')}
                    >
                        <History size={20} /> Histórico
                    </button>
                    <button
                        className={`nav-item ${activeTab === 'recebidas' ? 'active' : ''}`}
                        onClick={() => setActiveTab('recebidas')}
                    >
                        <AlertCircle size={20} /> Recebidas
                    </button>
                    <button
                        className={`nav-item ${activeTab === 'ajustes' ? 'active' : ''}`}
                        onClick={() => setActiveTab('ajustes')}
                    >
                        <Settings size={20} /> Ajustes
                    </button>
                </nav>
                <div className="user-profile">
                    <div className="user-info">
                        <span className="user-email">{user.email}</span>
                    </div>
                    <button className="logout-btn" onClick={onLogout}><LogOut size={18} /></button>
                </div>
            </aside>

            <main className="content">
                <header className="content-header">
                    <h1>{activeTab === 'disparos' ? 'Automação de Notificações' : activeTab === 'historico' ? 'Histórico de Disparos' : 'Configurações'}</h1>
                    {activeTab === 'disparos' && <div className="badge-live">Live</div>}
                </header>

                {activeTab === 'disparos' && (
                    <section className="dashboard-grid">
                        {/* Upload de Base */}
                        {!campaignData ? (
                            <div className="card ambev-flag upload-card" style={{ gridColumn: 'span 2' }}>
                                <h3><Upload size={18} /> Selecione sua Base de Dados</h3>
                                <p className="card-desc">Suporta arquivos .xlsx, .xls ou .csv</p>
                                <div className="dropzone" onClick={() => document.getElementById('fileInput').click()}>
                                    <input type="file" id="fileInput" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                                    <div className="dropzone-label">
                                        <Upload size={48} strokeWidth={1} />
                                        <span>Clique aqui ou arraste o arquivo</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="card ambev-flag upload-success" style={{ gridColumn: 'span 2' }}>
                                <CheckCircle2 size={48} color="var(--ambev-green)" />
                                <h3>Base carregada com sucesso!</h3>
                                <p>{campaignData.length} registros encontrados.</p>
                                <button className="btn-link" onClick={() => setCampaignData(null)}>Trocar arquivo</button>
                            </div>
                        )}

                        {campaignData && (
                            <div className="campaign-container" style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                <div className="card ambev-flag mapping-card">
                                    <h3>Mapeamento de Colunas</h3>
                                    <div className="mapping-grid">
                                        {REQUIRED_COLUMNS.map(col => (
                                            <div key={col.id} className="input-group">
                                                <label>{col.label}</label>
                                                <select
                                                    value={mapping[col.id] || ''}
                                                    onChange={e => setMapping({ ...mapping, [col.id]: e.target.value })}
                                                >
                                                    <option value="">Selecione a coluna...</option>
                                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="card ambev-flag template-card">
                                    <h3>Configuração do Template</h3>
                                    <div className="input-group">
                                        <label>Nome do Modelo no Meta</label>
                                        <div className="input-with-btn">
                                            <input
                                                type="text"
                                                placeholder="ex: alteracao_entrega_ambev"
                                                value={templateName}
                                                onChange={e => setTemplateName(e.target.value)}
                                            />
                                            <button className="btn-secondary" onClick={() => setTemplatePreview(true)}>Validar</button>
                                        </div>
                                    </div>

                                    <div className="input-row mt-4">
                                        <div className="input-group">
                                            <label>Data Antiga</label>
                                            <input
                                                type="text"
                                                placeholder="12/01"
                                                value={dates.old}
                                                onChange={e => setDates({ ...dates, old: e.target.value })}
                                                spellCheck="false"
                                                autoCorrect="off"
                                                autoCapitalize="none"
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label>Data Nova</label>
                                            <input
                                                type="text"
                                                placeholder="13/01"
                                                value={dates.new}
                                                onChange={e => setDates({ ...dates, new: e.target.value })}
                                                spellCheck="false"
                                                autoCorrect="off"
                                                autoCapitalize="none"
                                            />
                                        </div>
                                    </div>

                                    {templatePreview && (
                                        <div className="preview-container">
                                            <label>Preview da Mensagem:</label>
                                            {renderTemplatePreview()}
                                        </div>
                                    )}
                                </div>

                                <div className="card ambev-flag table-card" style={{ gridColumn: 'span 2' }}>
                                    <h3>Preview da Base</h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="preview-table">
                                            <thead>
                                                <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
                                            </thead>
                                            <tbody>
                                                {campaignData.slice(0, 5).map((row, i) => (
                                                    <tr key={i}>{headers.map(h => <td key={h}>{row[h]}</td>)}</tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="dispatch-actions">
                                    {sendingStatus === 'idle' && (
                                        <button className="btn-primary btn-lg" onClick={startSending}>
                                            <Send size={24} /> Iniciar Disparo em Massa
                                        </button>
                                    )}

                                    {sendingStatus !== 'idle' && (
                                        <div className="progress-container card ambev-flag">
                                            <div className="progress-header">
                                                <span>Progresso: {progress.current} / {progress.total}</span>
                                                <div className="status-group">
                                                    {errors.length > 0 && <span className="error-badge">{errors.length} erros</span>}
                                                    <span className="status-badge">{sendingStatus}</span>
                                                </div>
                                            </div>
                                            <div className="progress-bar-bg">
                                                <div className="progress-bar-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                                            </div>
                                            <div className="progress-controls">
                                                {sendingStatus === 'sending' && <button className="btn-pause" onClick={() => setSendingStatus('paused')}>Pausar Disparo</button>}
                                                {sendingStatus === 'paused' && <button className="btn-resume" onClick={startSending}>Continuar Disparo</button>}
                                                {sendingStatus === 'completed' && <button className="btn-secondary" onClick={() => { setSendingStatus('idle'); setCampaignData(null); }}>Novo Disparo</button>}
                                                {errors.length > 0 && sendingStatus === 'completed' && <button className="btn-retry" onClick={retryErrors}>Reenviar Falhas ({errors.length})</button>}
                                            </div>

                                            <div className="log-container">
                                                <label>Log de Execução:</label>
                                                <div className="log-box">
                                                    {logs.map((log, i) => (
                                                        <div key={i} className={`log-entry ${log.includes('[ERRO]') || log.includes('[FALHA]') ? 'error' : ''}`}>
                                                            {log}
                                                        </div>
                                                    ))}
                                                    {logs.length === 0 && <div className="log-empty">Nenhuma atividade registrada...</div>}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {activeTab === 'recebidas' && (
                    <div className="received-container">
                        <aside className="contacts-sidebar card ambev-flag">
                            <h3>Conversas</h3>
                            <div className="contacts-list">
                                {Array.from(new Set(receivedMessages.map(m => m.from))).map(phone => (
                                    <button
                                        key={phone}
                                        className={`contact-item ${activeContact === phone ? 'active' : ''}`}
                                        onClick={() => setActiveContact(phone)}
                                    >
                                        <div className="contact-info">
                                            <span className="contact-phone">{phone}</span>
                                            <span className="last-msg">
                                                {receivedMessages.filter(m => m.from === phone).slice(-1)[0]?.text}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                                {receivedMessages.length === 0 && <p className="empty-text">Nenhuma mensagem recebida ainda.</p>}
                            </div>
                        </aside>

                        <main className={`chat-area card ambev-flag ${activeContact ? 'active' : ''}`}>
                            {activeContact ? (
                                <>
                                    <header className="chat-header">
                                        <h3>{activeContact}</h3>
                                        <div className="header-actions">
                                            <button className="btn-secondary" onClick={() => window.open(`tel:${activeContact}`)}>Ligar</button>
                                            <button className="btn-mobile-back" onClick={() => setActiveContact(null)}>Voltar</button>
                                        </div>
                                    </header>
                                    <div className="messages-log">
                                        {receivedMessages.filter(m => m.from === activeContact).map((m, i) => (
                                            <div key={i} className="msg-bubble received">
                                                <p>{m.text}</p>
                                                <span className="msg-time">{m.timestamp}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="chat-placeholder">
                                    <AlertCircle size={48} opacity={0.2} />
                                    <p>Selecione uma conversa para ver o retorno do cliente.</p>
                                </div>
                            )}
                        </main>
                    </div>
                )}

                {activeTab === 'historico' && (
                    <div className="card ambev-flag" style={{ width: '100%', boxSizing: 'border-box' }}>
                        <h3><History size={18} /> Campanhas Recentes</h3>
                        {history.length === 0 ? (
                            <p style={{ color: '#666' }}>Nenhuma campanha realizada ainda.</p>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="preview-table">
                                    <thead>
                                        <tr>
                                            <th>Data/Hora</th>
                                            <th>Template</th>
                                            <th>Total</th>
                                            <th>Sucesso</th>
                                            <th>Erros</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map(item => (
                                            <tr key={item.id}>
                                                <td>{item.date}</td>
                                                <td><code>{item.template}</code></td>
                                                <td>{item.total}</td>
                                                <td style={{ color: 'var(--ambev-green)', fontWeight: 'bold' }}>{item.success}</td>
                                                <td style={{ color: item.errors > 0 ? '#ff5555' : 'inherit' }}>{item.errors}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'ajustes' && (
                    <div className="card ambev-flag">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3><Settings size={18} /> Credenciais Meta API</h3>
                            {!isEditing && (
                                <button className="btn-secondary" onClick={() => { setTempConfig(config); setIsEditing(true); }}>
                                    Editar
                                </button>
                            )}
                        </div>

                        <p className="card-desc">Configure as credenciais do seu aplicativo no Meta for Developers.</p>

                        <div className="input-grid">
                            <div className="input-group">
                                <label>WHATSAPP_ACCESS_TOKEN</label>
                                <div className="input-with-btn">
                                    <input
                                        type={showToken ? "text" : "password"}
                                        value={isEditing ? tempConfig.token : config.token}
                                        onChange={e => setTempConfig({ ...tempConfig, token: e.target.value })}
                                        disabled={!isEditing}
                                        placeholder="EAAB..."
                                        spellCheck="false"
                                        autoCorrect="off"
                                        autoCapitalize="none"
                                        style={{ opacity: isEditing ? 1 : 0.7 }}
                                    />
                                    <button
                                        className="btn-secondary"
                                        onClick={() => setShowToken(!showToken)}
                                        title={showToken ? "Esconder" : "Mostrar"}
                                    >
                                        {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div className="input-row">
                                <div className="input-group">
                                    <label>PHONE_NUMBER_ID</label>
                                    <input
                                        type="text"
                                        value={isEditing ? tempConfig.phoneId : config.phoneId}
                                        onChange={e => setTempConfig({ ...tempConfig, phoneId: e.target.value })}
                                        disabled={!isEditing}
                                        spellCheck="false"
                                        autoCorrect="off"
                                        autoCapitalize="none"
                                        style={{ opacity: isEditing ? 1 : 0.7 }}
                                    />
                                </div>
                                <div className="input-group">
                                    <label>BUSINESS_ACCOUNT_ID</label>
                                    <input
                                        type="text"
                                        value={isEditing ? tempConfig.wabaId : config.wabaId}
                                        onChange={e => setTempConfig({ ...tempConfig, wabaId: e.target.value })}
                                        disabled={!isEditing}
                                        spellCheck="false"
                                        autoCorrect="off"
                                        autoCapitalize="none"
                                        style={{ opacity: isEditing ? 1 : 0.7 }}
                                    />
                                </div>
                            </div>

                            {isEditing && (
                                <div className="mt-4" style={{ display: 'flex', gap: '1rem' }}>
                                    <button
                                        className="btn-secondary w-full"
                                        onClick={() => { setIsEditing(false); }}
                                        style={{ background: '#eee', color: '#333' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        className="btn-primary w-full"
                                        onClick={async () => {
                                            setConfig(tempConfig);
                                            // SQLite Save Config
                                            await fetch('/api/config', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ ...tempConfig, email: user?.email })
                                            });
                                            // await saveDb({ config: tempConfig }); // Legacy removed
                                            setIsEditing(false);
                                            alert('Configurações salvas e sincronizadas!');
                                        }}
                                    >
                                        Salvar Configurações
                                    </button>
                                </div>
                            )}
                            {!isEditing && (
                                <div className="mt-4">
                                    <p style={{ fontSize: '0.8rem', color: '#999', textAlign: 'center' }}>
                                        As configurações atuais estão sincronizadas com o servidor.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* Bottom Navigation for Mobile */}
            <nav className="mobile-nav">
                <button
                    className={`mobile-nav-item ${activeTab === 'disparos' ? 'active' : ''}`}
                    onClick={() => setActiveTab('disparos')}
                >
                    <Send size={20} />
                    <span>Disparos</span>
                </button>
                <button
                    className={`mobile-nav-item ${activeTab === 'historico' ? 'active' : ''}`}
                    onClick={() => setActiveTab('historico')}
                >
                    <History size={20} />
                    <span>Histórico</span>
                </button>
                <button
                    className={`mobile-nav-item ${activeTab === 'recebidas' ? 'active' : ''}`}
                    onClick={() => setActiveTab('recebidas')}
                >
                    <AlertCircle size={20} />
                    <span>Recebidas</span>
                </button>
                <button
                    className={`mobile-nav-item ${activeTab === 'ajustes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ajustes')}
                >
                    <Settings size={20} />
                    <span>Ajustes</span>
                </button>
            </nav>
        </div>
    );
}
