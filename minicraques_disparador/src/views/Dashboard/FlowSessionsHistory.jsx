import React, { useState, useEffect } from 'react';
import { RefreshCw, Check, AlertCircle, Send, Clock, Download, XCircle, FileText, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import Pagination from '../../components/Pagination';

export function FlowSessionsHistory({ userId, addToast }) {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedSession, setExpandedSession] = useState(null);
    const [sessionLogs, setSessionLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [stoppingSession, setStoppingSession] = useState(null);
    const rowsPerPage = 15;

    const fetchSessions = async () => {
        try {
            const res = await fetch(`/api/flow-sessions/${userId}`);
            if (res.ok) {
                const data = await res.json();
                setSessions(data);
            }
        } catch (err) {
            console.error('Error fetching flow sessions:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, [userId]);

    const stopFlowSession = async (sessionId) => {
        try {
            const res = await fetch(`/api/flow-sessions/${sessionId}/stop`, { method: 'POST' });
            if (res.ok) {
                addToast('Fluxo interrompido', 'success');
            } else {
                addToast('Erro ao interromper fluxo no servidor', 'error');
            }
            setStoppingSession(null);
            fetchSessions();
        } catch (err) {
            console.error(err);
            addToast('Erro ao interromper fluxo', 'error');
        }
    };

    const totalPages = Math.ceil(sessions.length / rowsPerPage);
    const paginatedSessions = sessions.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    const toggleLogs = async (sessionId) => {
        if (expandedSession === sessionId) {
            setExpandedSession(null);
            setSessionLogs([]);
            return;
        }

        setExpandedSession(sessionId);
        setLoadingLogs(true);
        try {
            const res = await fetch(`/api/flow-session-logs/${sessionId}`);
            if (res.ok) {
                const data = await res.json();
                setSessionLogs(data);
            }
        } catch (err) {
            console.error('Error fetching logs:', err);
        } finally {
            setLoadingLogs(false);
        }
    };

    const getStatusBadge = (status) => {
        const colors = {
            'active': { bg: '#e3f2fd', color: '#1976d2', label: 'Ativo' },
            'waiting_reply': { bg: '#fff3e0', color: '#f57c00', label: 'Aguardando' },
            'completed': { bg: '#e8f5e9', color: '#388e3c', label: 'Concluído' },
            'error': { bg: '#ffebee', color: '#d32f2f', label: 'Erro' },
            'stopped': { bg: '#f5f5f5', color: '#9e9e9e', label: 'Interrompido' }
        };
        const style = colors[status] || { bg: '#f5f5f5', color: '#666', label: status };
        return (
            <span style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: style.bg,
                color: style.color,
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
            }}>
                {status === 'active' && <RefreshCw size={10} className="spinning" />}
                {status === 'completed' && <Check size={10} />}
                {status === 'error' && <AlertCircle size={10} />}
                {style.label}
            </span>
        );
    };

    const getActionIcon = (action) => {
        switch (action) {
            case 'sent_message': return <Send size={14} style={{ color: '#007bff' }} />;
            case 'waiting_reply': return <Clock size={14} style={{ color: '#f57c00' }} />;
            case 'received_reply': return <Download size={14} style={{ color: '#00a276' }} />;
            case 'invalid_reply': return <XCircle size={14} style={{ color: '#ff5555' }} />;
            case 'completed': return <CheckCircle2 size={14} style={{ color: '#388e3c' }} />;
            case 'error': return <AlertCircle size={14} style={{ color: '#d32f2f' }} />;
            default: return <FileText size={14} />;
        }
    };

    const getActionLabel = (action) => {
        switch (action) {
            case 'sent_message': return 'Mensagem enviada';
            case 'waiting_reply': return 'Aguardando resposta';
            case 'received_reply': return 'Resposta recebida';
            case 'invalid_reply': return 'Resposta inválida';
            case 'completed': return 'Fluxo concluído';
            case 'error': return 'Erro';
            case 'stopped': return 'Fluxo interrompido';
            default: return action;
        }
    };

    return (
        <div className="card ambev-flag" style={{ width: '100%', backgroundColor: 'white', padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--ambev-blue)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '2rem' }}>
                <FileText size={28} color="var(--ambev-blue)" /> Sessões de Fluxo
            </h3>
            {loading ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>Carregando...</p>
            ) : sessions.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>Nenhuma sessão de fluxo encontrada.</p>
            ) : (
                <>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="preview-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}></th>
                                    <th>ID Fluxo</th>
                                    <th>Telefone</th>
                                    <th>Fluxo</th>
                                    <th>Mensagem Atual</th>
                                    <th>Status</th>
                                    <th>Última Atualização</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedSessions.map(s => (
                                    <React.Fragment key={s.id}>
                                        <tr
                                            style={{ cursor: 'pointer', backgroundColor: expandedSession === s.id ? '#f5f5f5' : 'transparent' }}
                                            onClick={() => toggleLogs(s.id)}
                                        >
                                            <td style={{ textAlign: 'center' }}>{expandedSession === s.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                                            <td style={{ fontSize: '0.8rem', color: '#666' }}>{s.flowId}</td>
                                            <td style={{ fontFamily: 'monospace' }}>{s.contactPhone}</td>
                                            <td><strong>{s.flowName}</strong></td>
                                            <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.currentStepName}>
                                                {s.currentStepName}
                                            </td>
                                            <td>{getStatusBadge(s.status)}</td>
                                            <td style={{ fontSize: '0.8rem' }}>{new Date(s.updatedAt).toLocaleString('pt-BR')}</td>
                                            <td>
                                                {(s.status === 'active' || s.status === 'waiting_reply') && (
                                                    <button
                                                        className="btn-link"
                                                        style={{ color: '#d32f2f', fontSize: '11px', padding: '4px 8px' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setStoppingSession(s);
                                                        }}
                                                    >
                                                        Cancelar
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {expandedSession === s.id && (
                                            <tr>
                                                <td colSpan="8" style={{ padding: 0, backgroundColor: '#fafafa' }}>
                                                    <div style={{ padding: '12px 24px', borderLeft: '4px solid #280091' }}>
                                                        <strong style={{ fontSize: '12px', color: '#666' }}>Histórico de Ações:</strong>
                                                        {loadingLogs ? (
                                                            <p style={{ margin: '8px 0', color: '#999' }}>Carregando logs...</p>
                                                        ) : sessionLogs.length === 0 ? (
                                                            <p style={{ margin: '8px 0', color: '#999' }}>Nenhum log encontrado.</p>
                                                        ) : (
                                                            <div style={{ marginTop: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                                                {sessionLogs.map(log => (
                                                                    <div key={log.id} style={{
                                                                        display: 'flex',
                                                                        alignItems: 'flex-start',
                                                                        gap: '10px',
                                                                        padding: '8px 0',
                                                                        borderBottom: '1px solid #eee'
                                                                    }}>
                                                                        <div style={{ marginTop: '2px' }}>{getActionIcon(log.action)}</div>
                                                                        <div>
                                                                            <div style={{ fontSize: '13px', fontWeight: 600 }}>{getActionLabel(log.action)}</div>
                                                                            {log.content && <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{log.content}</div>}
                                                                            <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>{new Date(log.createdAt).toLocaleString('pt-BR')}</div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                    />
                </>
            )}
        </div>
    );
}

export default FlowSessionsHistory;
