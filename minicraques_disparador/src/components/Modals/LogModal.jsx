import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export function LogModal({ dispatch, onClose }) {
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
        </div>
    );
}

export default LogModal;
