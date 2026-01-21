import React, { useState, useEffect, useRef } from 'react';
import {
    Send, GitBranch, History, MessageSquare, Settings,
    LogOut, Upload, CheckCircle2, RefreshCw, List,
    Pause, Play, RotateCcw, Download, Eye, EyeOff,
    Copy, Trash2, Clock, Paperclip, Mic, AlertCircle, X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// Components
import AutomationTab from './AutomationTab';
import HistoryTab from './HistoryTab';
import ReceivedTab from './ReceivedTab';
import SettingsTab from './SettingsTab';
import FlowBuilder from './FlowBuilder'; // Assuming it's in the same dir or will be moved
import LogModal from '../../components/Modals/LogModal';
import MediaPreviewModal from '../../components/Modals/MediaPreviewModal';
import FlowConcurrencyModal from '../../components/Modals/FlowConcurrencyModal';

const REQUIRED_COLUMNS = [
    { id: 'client_code', label: 'Cód. Cliente' },
    { id: 'fantasy_name', label: 'Nome Fantasia' },
    { id: 'phone', label: 'Telefone' },
    { id: 'order_number', label: 'Nº do Pedido' }
];

export function Dashboard({
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
    fetchMessages,
    templateDetails,
    setTemplateDetails,
    templateVariables,
    setTemplateVariables,
    isLoadingTemplate,
    setIsLoadingTemplate,
    fetchUserData
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedContacts, setSelectedContacts] = useState([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [tempConfig, setTempConfig] = useState(config);
    const [selectedLogDispatch, setSelectedLogDispatch] = useState(null);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [stagedMedia, setStagedMedia] = useState([]);
    const [showMediaModal, setShowMediaModal] = useState(false);
    const [busyData, setBusyData] = useState(null);
    const fileInputRef = useRef(null);

    const [showProfileModal, setShowProfileModal] = useState(null);
    const [dispatchMode, setDispatchMode] = useState('template');
    const [availableFlows, setAvailableFlows] = useState([]);
    const [selectedFlowId, setSelectedFlowId] = useState(null);
    const [dispatchSource, setDispatchSource] = useState('ambev'); // 'ambev' or 'outros'
    const [currentDispatchPage, setCurrentDispatchPage] = useState(1);
    const [lastSyncConfig, setLastSyncConfig] = useState(config);

    // Sidebar navigation items
    const navItems = [
        { id: 'disparos', label: 'Disparos', icon: Send },
        { id: 'fluxos', label: 'Fluxos', icon: GitBranch },
        { id: 'historico', label: 'Histórico', icon: History },
        { id: 'recebidas', label: 'Recebidas', icon: MessageSquare },
        { id: 'ajustes', label: 'Ajustes', icon: Settings }
    ];

    useEffect(() => {
        if (!isEditing && config !== lastSyncConfig) {
            setTempConfig(config);
            setLastSyncConfig(config);
        }
    }, [config, isEditing, lastSyncConfig]);

    useEffect(() => {
        if (dispatchMode === 'flow' && user?.id) {
            fetch(`/api/flows/${user.id}`, {
                headers: { 'Authorization': `Bearer ${user.token}` }
            })
                .then(res => res.json())
                .then(data => setAvailableFlows(data || []))
                .catch(err => console.error('Error fetching flows:', err));
        }
    }, [dispatchMode, user?.id, user?.token]);

    useEffect(() => {
        if (dispatchMode === 'flow' && selectedFlowId) {
            const flow = availableFlows.find(f => f.id === selectedFlowId);
            if (!flow) return;

            const nodes = JSON.parse(flow.nodes);
            const templateNodes = nodes.filter(n => n.type === 'templateNode');

            if (templateNodes.length > 0) {
                const loadFlowVars = async () => {
                    setIsLoadingTemplate(true);
                    const newFlowVars = {};
                    let globalOrder = 0;

                    try {
                        await Promise.all(templateNodes.map(async (node) => {
                            const tName = node.data.templateName;
                            if (!tName) return;

                            const res = await fetch(`/api/meta/templates/${user.id}?templateName=${tName}`, {
                                headers: { 'Authorization': `Bearer ${user.token}` }
                            });
                            const data = await res.json();
                            if (res.ok) {
                                const templates = data.data || data.templates;
                                const template = Array.isArray(templates) ? templates.find(t => t.name.trim() === tName.trim()) : templates;
                                if (template) {
                                    template.components.forEach(comp => {
                                        const matches = comp.text ? comp.text.match(/{{([^}]+)}}/g) : null;
                                        if (matches) {
                                            matches.forEach(m => {
                                                const name = m.replace(/{{|}}/g, '');
                                                const type = comp.type === 'HEADER' ? 'h' : 'b';
                                                const key = `fnode_${node.id}_${type}_${name}`;
                                                newFlowVars[key] = {
                                                    component: comp.type,
                                                    index: name,
                                                    type: 'manual',
                                                    value: '',
                                                    nodeId: node.id,
                                                    nodeName: node.data.label || tName,
                                                    templateName: tName,
                                                    order: globalOrder++
                                                };
                                            });
                                        }
                                    });
                                }
                            }
                        }));
                        setTemplateVariables(newFlowVars);
                    } catch (e) {
                        console.error('Error fetching flow template:', e);
                        addToast('Erro ao carregar variáveis do fluxo', 'error');
                    } finally {
                        setIsLoadingTemplate(false);
                    }
                };
                loadFlowVars();
            } else {
                setTemplateVariables({});
            }
        }
    }, [selectedFlowId, dispatchMode, availableFlows, user?.id]);

    const handleMediaUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const newStaged = files.map(file => ({
            file,
            previewUrl: URL.createObjectURL(file),
            caption: '',
            type: file.type.startsWith('image/') ? 'image' :
                file.type.startsWith('audio/') ? 'audio' :
                    file.type.startsWith('video/') ? 'video' : 'document'
        }));

        setStagedMedia(prev => [...prev, ...newStaged]);
        setShowMediaModal(true);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const sendStagedMedia = async () => {
        if (stagedMedia.length === 0) return;
        setIsUploadingMedia(true);
        setShowMediaModal(false);

        try {
            for (const item of stagedMedia) {
                const formData = new FormData();
                formData.append('file', item.file);
                const uploadRes = await fetch('/api/upload-media', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${user.token}` },
                    body: formData
                });
                if (uploadRes.ok) {
                    const data = await uploadRes.json();
                    await fetch('/api/send-message', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${user.token}`
                        },
                        body: JSON.stringify({
                            phone: activeContact,
                            body: item.caption || null,
                            mediaUrl: data.url,
                            mediaType: data.type
                        })
                    });
                }
            }
            addToast('Mídias enviadas!', 'success');
            fetchMessages();
        } catch (err) {
            addToast('Erro ao enviar mídias.', 'error');
        } finally {
            stagedMedia.forEach(item => URL.revokeObjectURL(item.previewUrl));
            setStagedMedia([]);
            setIsUploadingMedia(false);
        }
    };

    const fetchMetaTemplate = async () => {
        if (!templateName) return addToast('Insira o nome do template', 'error');
        setIsLoadingTemplate(true);
        setTemplateDetails(null);
        setTemplateVariables({});
        setTemplatePreview(false);

        try {
            const res = await fetch(`/api/meta/templates/${user.id}?templateName=${templateName}`, {
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
            const data = await res.json();
            if (res.ok) {
                const templates = data.data || data.templates;
                const template = Array.isArray(templates) ? templates.find(t => t.name.trim() === templateName.trim()) : templates;
                if (template) {
                    const newVars = {};
                    let globalOrder = 0;
                    template.components.forEach(comp => {
                        if ((comp.type === 'HEADER' && comp.format === 'TEXT') || comp.type === 'BODY') {
                            const matches = comp.text.match(/{{([^}]+)}}/g);
                            if (matches) {
                                matches.forEach((m) => {
                                    const name = m.replace(/{{|}}/g, '');
                                    const typeCode = comp.type === 'HEADER' ? 'h' : 'b';
                                    newVars[`${typeCode}_${name}`] = {
                                        component: comp.type,
                                        index: name,
                                        type: 'manual',
                                        value: '',
                                        order: globalOrder++
                                    };
                                });
                            }
                        }
                    });
                    setTemplateDetails(template);
                    setTemplateVariables(newVars);
                    addToast('Template carregado!', 'success');
                } else {
                    addToast('Template não encontrado.', 'error');
                }
            } else {
                addToast(data.error || 'Erro ao buscar template.', 'error');
            }
        } catch (err) {
            addToast('Erro de conexão.', 'error');
        } finally {
            setIsLoadingTemplate(false);
        }
    };

    const generateWebhook = () => {
        const randomToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        setTempConfig({ ...tempConfig, webhookVerifyToken: randomToken });
        addToast('Token gerado. Salve para aplicar.', 'info');
    };

    const applyAutoMapping = (cols) => {
        const newMapping = { ...mapping };
        cols.forEach(header => {
            const h = String(header).toLowerCase().trim();
            if (h === 'cód. cliente' || h === 'cod. cliente' || h === 'código' || h === 'codigo') newMapping.client_code = header;
            else if (h === 'nome fantasia' || h === 'fantasia' || h === 'nome') newMapping.fantasy_name = header;
            else if (h === 'tel. promax' || h === 'telefone' || h === 'tel' || h === 'tel.' || h === 'phone' || h === 'celular') newMapping.phone = header;
            else if (h === 'nº do pedido' || h === 'pedido' || h === 'order' || h === 'nº pedido') newMapping.order_number = header;
        });
        setMapping(newMapping);
    };

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
                    const cols = data[0];
                    setHeaders(cols);
                    applyAutoMapping(cols);
                    setCampaignData(data.slice(1).map(row => {
                        const obj = {};
                        cols.forEach((header, i) => obj[header] = row[i]);
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
                    applyAutoMapping(results.meta.fields);
                    setCampaignData(results.data);
                }
            });
        }
    };

    const getDateLogic = () => {
        const format = (val) => {
            if (!val) return "";
            const today = new Date();
            const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
            const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
            const tomorrowStr = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}`;
            const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
            const yesterdayStr = `${String(yesterday.getDate()).padStart(2, '0')}/${String(yesterday.getMonth() + 1).padStart(2, '0')}`;

            if (val === todayStr) return "hoje";
            if (val === tomorrowStr) return "amanhã";
            if (val === yesterdayStr) return "ontem";
            return val;
        };
        return { old: format(dates.old), new: format(dates.new) };
    };

    const renderTemplatePreview = () => {
        if (!campaignData || campaignData.length === 0) return null;
        const firstLead = campaignData[0];
        let headerText = "", bodyText = "Carregando...", footerText = "";

        if (templateDetails) {
            const headerComp = templateDetails.components.find(c => c.type === 'HEADER');
            const bodyComp = templateDetails.components.find(c => c.type === 'BODY');
            const footerComp = templateDetails.components.find(c => c.type === 'FOOTER');

            if (headerComp?.text) {
                headerText = headerComp.text;
                Object.keys(templateVariables).filter(k => k.startsWith('h_')).forEach(key => {
                    const info = templateVariables[key];
                    const val = info.type === 'column' ? (firstLead[info.value] || `[${info.value}]`) : info.value;
                    headerText = headerText.replace(`{{${info.index}}}`, val || `{{${info.index}}}`);
                });
            }
            if (bodyComp?.text) {
                bodyText = bodyComp.text;
                Object.keys(templateVariables).filter(k => k.startsWith('b_')).forEach(key => {
                    const info = templateVariables[key];
                    const val = info.type === 'column' ? (firstLead[info.value] || `[${info.value}]`) : info.value;
                    bodyText = bodyText.replace(`{{${info.index}}}`, val || `{{${info.index}}}`);
                });
            }
            if (footerComp?.text) footerText = footerComp.text;
        }

        return (
            <div className="card ambev-flag preview-card mt-4" style={{ backgroundColor: '#fffbe6', border: '1px solid #ffe58f' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', color: '#856404' }}>
                    <Eye size={16} />
                    <h4 style={{ margin: 0 }}>Preview (1º Lead)</h4>
                </div>
                <div className="chat-bubble" style={{ backgroundColor: 'white', padding: '12px', borderRadius: '12px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', maxWidth: '280px' }}>
                    {headerText && <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>{headerText}</div>}
                    <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', color: '#333', lineHeight: '1.4' }}>{bodyText}</div>
                    {footerText && <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '6px', borderTop: '1px solid #eee', paddingTop: '4px' }}>{footerText}</div>}
                </div>
            </div>
        );
    };

    const startDispatch = async () => {
        if (!config.token || !config.phoneId) return addToast('Configure as credenciais primeiro.', 'error');

        try {
            const checkRes = await fetch(`/api/flow-sessions/active-check/${user.id}`, {
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
            if (checkRes.ok) {
                const data = await checkRes.json();
                if (data.isBusy) {
                    setBusyData(data);
                    return;
                }
            }
        } catch (e) { console.error(e); }

        if ((dispatchSource === 'ambev' || dispatchMode === 'template') && !templateName) return addToast('Informe o template.', 'error');
        if (dispatchSource === 'outros' && dispatchMode === 'flow' && !selectedFlowId) return addToast('Selecione um fluxo.', 'error');
        if (!campaignData) return addToast('Carregue uma base.', 'error');
        if (dispatchSource === 'outros' && !mapping.phone) return addToast('Mapeie o telefone.', 'error');

        const leads = campaignData.map(row => ({
            'Nome fantasia': row[mapping['fantasy_name']] || row['Nome fantasia'],
            'Nº do Pedido': row[mapping['order_number']] || row['Nº do Pedido'],
            'Tel. Promax': row[mapping.phone] || row['Tel. Promax'] || row['phone'] || row['tel'],
            ...row
        }));

        let finalVariables = { ...templateVariables };
        if (dispatchSource === 'ambev' && Object.keys(finalVariables).length === 0) {
            const dl = getDateLogic();
            finalVariables = {
                "b_1": { component: 'BODY', index: '1', type: 'column', value: 'Nome fantasia', order: 1 },
                "b_2": { component: 'BODY', index: '2', type: 'column', value: 'Nº do Pedido', order: 2 },
                "b_3": { component: 'BODY', index: '3', type: 'manual', value: dl.old, order: 3 },
                "b_4": { component: 'BODY', index: '4', type: 'manual', value: dl.new, order: 4 }
            };
        }

        try {
            const res = await fetch(`/api/dispatch/${user.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify({
                    dispatchSource,
                    dispatchType: dispatchSource === 'ambev' ? 'template' : dispatchMode,
                    templateName: (dispatchSource === 'ambev' || dispatchMode === 'template') ? templateName : 'Fluxo',
                    flowId: selectedFlowId,
                    variables: finalVariables,
                    leads
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                addToast('Campanha iniciada!', 'success');
                setActiveDispatch({ id: data.dispatchId, status: 'running', currentIndex: 0, totalLeads: leads.length, successCount: 0, errorCount: 0 });
                fetchDispatches();
            } else {
                addToast(data.error || 'Erro ao iniciar.', 'error');
            }
        } catch (err) { addToast('Erro ao iniciar.', 'error'); }
    };

    const controlDispatch = async (action, dispatchId = null) => {
        const id = dispatchId || activeDispatch?.id;
        if (!id) return;
        try {
            const res = await fetch(`/api/dispatch/${id}/control`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
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
            const res = await fetch(`/api/dispatch/${dispatchId}/retry`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
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
            const res = await fetch(`/api/user-config/${user.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify({ ...tempConfig, templateName, mapping })
            });
            if (res.ok) {
                setConfig({ ...tempConfig, templateName, mapping });
                setLastSyncConfig({ ...tempConfig, templateName, mapping });
                setIsEditing(false);
                addToast('Configurações salvas!', 'success');
                // Refresh user data to ensure everything is in sync
                await fetchUserData();
            } else {
                const errorData = await res.json();
                addToast(errorData.error || 'Erro ao salvar.', 'error');
            }
        } catch (err) {
            addToast('Erro de conexão ao salvar.', 'error');
        }
    };

    return (
        <div className="dashboard-container">
            <aside className="sidebar">
                <div className="logo-small">
                    <img src="/android-chrome-512x512.png" alt="tiZAP!" className="rounded-logo" style={{ width: '40px', height: '40px', objectFit: 'cover' }} />
                    <span style={{ textTransform: 'lowercase' }}>tizap!</span>
                </div>
                <nav>
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(item.id)}
                        >
                            <item.icon size={20} /> {item.label}
                        </button>
                    ))}
                </nav>
                <div className="user-profile">
                    <div className="user-info">
                        <span className="user-email">{user.email}</span>
                    </div>
                    <button className="logout-btn" onClick={onLogout} title="Sair">
                        <LogOut size={18} />
                    </button>
                </div>
            </aside>

            <main className="content">
                {activeTab === 'fluxos' ? (
                    <FlowBuilder user={user} addToast={addToast} />
                ) : (
                    <>
                        <header className="content-header">
                            <h1>
                                {activeTab === 'disparos' ? 'Automação de Notificações' :
                                    activeTab === 'historico' ? 'Histórico' :
                                        activeTab === 'recebidas' ? 'Mensagens Recebidas' : 'Configurações'}
                            </h1>
                            {activeTab === 'disparos' && activeDispatch?.status === 'running' && <div className="badge-live">Live</div>}
                        </header>

                        {activeTab === 'disparos' && (
                            <AutomationTab
                                user={user}
                                config={config}
                                activeDispatch={activeDispatch}
                                setActiveDispatch={setActiveDispatch}
                                fetchDispatches={fetchDispatches}
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
                                addToast={addToast}
                                templateDetails={templateDetails}
                                setTemplateDetails={setTemplateDetails}
                                templateVariables={templateVariables}
                                setTemplateVariables={setTemplateVariables}
                                isLoadingTemplate={isLoadingTemplate}
                                setIsLoadingTemplate={setIsLoadingTemplate}
                                controlDispatch={controlDispatch}
                                setSelectedLogDispatch={setSelectedLogDispatch}
                                REQUIRED_COLUMNS={REQUIRED_COLUMNS}
                                availableFlows={availableFlows}
                                selectedFlowId={selectedFlowId}
                                setSelectedFlowId={setSelectedFlowId}
                                dispatchMode={dispatchMode}
                                setDispatchMode={setDispatchMode}
                                dispatchSource={dispatchSource}
                                setDispatchSource={setDispatchSource}
                                startDispatch={startDispatch}
                                fetchMetaTemplate={fetchMetaTemplate}
                                renderTemplatePreview={renderTemplatePreview}
                                getDateLogic={getDateLogic}
                                handleFileUpload={handleFileUpload}
                            />
                        )}

                        {activeTab === 'recebidas' && (
                            <ReceivedTab
                                user={user}
                                config={config}
                                receivedMessages={receivedMessages}
                                setReceivedMessages={setReceivedMessages}
                                activeContact={activeContact}
                                setActiveContact={setActiveContact}
                                fetchMessages={fetchMessages}
                                isRefreshing={isRefreshing}
                                isDeleting={isDeleting}
                                setIsDeleting={setIsDeleting}
                                selectedContacts={selectedContacts}
                                setSelectedContacts={setSelectedContacts}
                                showDeleteConfirm={showDeleteConfirm}
                                setShowDeleteConfirm={setShowDeleteConfirm}
                                setShowProfileModal={setShowProfileModal}
                                fileInputRef={fileInputRef}
                                handleMediaUpload={handleMediaUpload}
                                isUploadingMedia={isUploadingMedia}
                                addToast={addToast}
                            />
                        )}

                        {activeTab === 'historico' && (
                            <HistoryTab
                                user={user}
                                dispatches={dispatches}
                                currentDispatchPage={currentDispatchPage}
                                setCurrentDispatchPage={setCurrentDispatchPage}
                                setSelectedLogDispatch={setSelectedLogDispatch}
                                retryFailed={retryFailed}
                                addToast={addToast}
                            />
                        )}

                        {activeTab === 'ajustes' && (
                            <SettingsTab
                                user={user}
                                config={config}
                                tempConfig={tempConfig}
                                setTempConfig={setTempConfig}
                                isEditing={isEditing}
                                setIsEditing={setIsEditing}
                                showToken={showToken}
                                setShowToken={setShowToken}
                                generateWebhook={generateWebhook}
                                saveConfig={saveConfig}
                                addToast={addToast}
                                onLogout={onLogout}
                            />
                        )}
                    </>
                )}
            </main>

            <div className="mobile-nav">
                <button className={`mobile-nav-item ${activeTab === 'disparos' ? 'active' : ''}`} onClick={() => setActiveTab('disparos')}>
                    <Send size={24} /> <span>Início</span>
                </button>
                <button className={`mobile-nav-item ${activeTab === 'recebidas' ? 'active' : ''}`} onClick={() => setActiveTab('recebidas')}>
                    <AlertCircle size={24} /> <span>Recebidas</span>
                </button>
                <button className={`mobile-nav-item ${activeTab === 'historico' ? 'active' : ''}`} onClick={() => setActiveTab('historico')}>
                    <History size={24} /> <span>Histórico</span>
                </button>
                <button className={`mobile-nav-item ${activeTab === 'ajustes' ? 'active' : ''}`} onClick={() => setActiveTab('ajustes')}>
                    <Settings size={24} /> <span>Ajustes</span>
                </button>
            </div>

            {selectedLogDispatch && <LogModal dispatch={selectedLogDispatch} onClose={() => setSelectedLogDispatch(null)} />}

            {showProfileModal && (
                <div className="profile-modal-overlay" onClick={() => setShowProfileModal(null)}>
                    <div className="profile-modal-content" onClick={e => e.stopPropagation()}>
                        <button className="profile-modal-close" onClick={() => setShowProfileModal(null)}><X size={20} /></button>
                        <img src={`/api/contacts/${showProfileModal.phone}/photo?name=${encodeURIComponent(showProfileModal.name)}`} alt="Profile" />
                    </div>
                </div>
            )}

            {showDeleteConfirm && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="card fade-in" style={{ width: '400px', padding: '24px', backgroundColor: 'white', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#e02424' }}><Trash2 size={28} /><h3 style={{ margin: 0, fontSize: '1.25rem' }}>Excluir Conversas</h3></div>
                        <p style={{ color: '#666', marginBottom: '24px' }}>Tem certeza que deseja excluir <strong>{selectedContacts.length}</strong> conversa(s)? Essa ação não pode ser desfeita.</p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)} style={{ padding: '8px 16px' }}>Cancelar</button>
                            <button className="btn-primary" style={{ backgroundColor: '#e02424', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '6px' }} onClick={async () => {
                                const normalize = p => {
                                    let s = String(p).replace(/\D/g, '');
                                    if (s.startsWith('55') && s.length === 12) return s.slice(0, 4) + '9' + s.slice(4);
                                    return s;
                                };
                                const uniquePhones = [...new Set(receivedMessages.filter(m => selectedContacts.includes(normalize(m.contactPhone))).map(m => m.contactPhone))];
                                try {
                                    await fetch('/api/messages/delete', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${user.token}`
                                        },
                                        body: JSON.stringify({ phones: uniquePhones, phoneId: config.phoneId, token: config.token })
                                    });
                                    addToast('Conversas excluídas.', 'success');
                                    if (activeContact && uniquePhones.some(p => normalize(p) === normalize(activeContact))) setActiveContact(null);
                                    setIsDeleting(false); setSelectedContacts([]); setShowDeleteConfirm(false);
                                    await fetchMessages();
                                } catch (e) { addToast('Falha ao excluir.', 'error'); }
                            }}>Excluir</button>
                        </div>
                    </div>
                </div>
            )}

            {showMediaModal && (
                <MediaPreviewModal
                    stagedMedia={stagedMedia}
                    setStagedMedia={setStagedMedia}
                    onSend={sendStagedMedia}
                    onClose={() => { stagedMedia.forEach(item => URL.revokeObjectURL(item.previewUrl)); setStagedMedia([]); setShowMediaModal(false); }}
                    onAddMore={() => fileInputRef.current?.click()}
                />
            )}

            {busyData && <FlowConcurrencyModal busyData={busyData} onCancel={() => setBusyData(null)} />}
        </div>
    );
}

export default Dashboard;
