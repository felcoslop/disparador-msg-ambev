import React from 'react';
import { History, List, RotateCcw } from 'lucide-react';
import Pagination from '../../components/Pagination';
import FlowSessionsHistory from './FlowSessionsHistory';

export function HistoryTab({
    user,
    dispatches,
    currentDispatchPage,
    setCurrentDispatchPage,
    setSelectedLogDispatch,
    retryFailed,
    addToast
}) {
    const rowsPerPage = 15;
    const totalPages = Math.ceil(dispatches.length / rowsPerPage);
    const paginatedDispatches = dispatches.slice((currentDispatchPage - 1) * rowsPerPage, currentDispatchPage * rowsPerPage);

    return (
        <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px', backgroundColor: 'white', padding: '2.5rem' }}>
            <div className="card ambev-flag" style={{ width: '100%', backgroundColor: 'white', padding: '1.5rem', boxSizing: 'border-box' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--ambev-blue)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '2rem' }}>
                    <History size={28} color="var(--ambev-blue)" /> Campanhas de Disparo
                </h3>

                {dispatches.length === 0 ? (
                    <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>Nenhuma campanha de disparo encontrada.</p>
                ) : (
                    <>
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
                                    {paginatedDispatches.map(d => (
                                        <tr key={d.id}>
                                            <td>#{d.id}</td>
                                            <td style={{ fontSize: '0.8rem' }}>{new Date(d.createdAt).toLocaleString()}</td>
                                            <td style={{ fontWeight: 600 }}>{d.totalLeads}</td>
                                            <td style={{ color: 'var(--ambev-green)', fontWeight: 700 }}>{d.successCount}</td>
                                            <td style={{ color: d.errorCount > 0 ? '#ff5555' : 'inherit', fontWeight: d.errorCount > 0 ? 700 : 400 }}>{d.errorCount}</td>
                                            <td>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    backgroundColor: d.status === 'completed' ? '#e8f5e9' : d.status === 'error' ? '#ffebee' : d.status === 'running' ? '#e3f2fd' : '#f5f5f5',
                                                    color: d.status === 'completed' ? '#388e3c' : d.status === 'error' ? '#d32f2f' : d.status === 'running' ? '#1976d2' : '#666',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {d.status === 'completed' ? 'Concluído' : d.status === 'error' ? 'Erro' : d.status === 'running' ? 'Em andamento' : d.status}
                                                </span>
                                            </td>
                                            <td style={{ display: 'flex', gap: '8px' }}>
                                                <button className="btn-icon" onClick={() => setSelectedLogDispatch(d)} title="Ver Logs" style={{ color: 'var(--ambev-blue)' }}><List size={18} /></button>
                                                {d.errorCount > 0 && d.status !== 'running' && (
                                                    <button className="btn-icon" onClick={() => retryFailed(d.id)} title="Reintentar Erros" style={{ color: 'var(--ambev-green)' }}><RotateCcw size={18} /></button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            currentPage={currentDispatchPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentDispatchPage}
                            className="mt-4"
                        />
                    </>
                )}
            </div>

            <FlowSessionsHistory userId={user.id} addToast={addToast} />
        </div>
    );
}

export default HistoryTab;
