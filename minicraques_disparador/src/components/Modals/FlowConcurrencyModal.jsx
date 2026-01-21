import React from 'react';
import { AlertTriangle } from 'lucide-react';

export function FlowConcurrencyModal({ busyData, onCancel }) {
    if (!busyData) return null;
    return (
        <div className="modal-overlay">
            <div className="modal-content card ambev-flag" style={{ maxWidth: '450px', width: '95%', padding: '30px', borderTop: '6px solid var(--ambev-yellow)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px', color: 'var(--ambev-blue)' }}>
                    <AlertTriangle size={32} />
                    <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Atividade em Andamento</h3>
                </div>

                <div style={{ backgroundColor: '#fff8e1', padding: '16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #ffe082' }}>
                    <p style={{ color: '#5d4037', margin: 0, lineHeight: '1.6', fontSize: '0.95rem' }}>
                        Não é possível iniciar um novo disparo no momento. Identificamos as seguintes atividades ativas:
                    </p>
                    <ul style={{ marginTop: '12px', color: '#5d4037', paddingLeft: '20px', fontSize: '0.9rem' }}>
                        {busyData.hasActiveDispatch && (
                            <li><strong>Campanha Ativa:</strong> Existe um disparo em massa sendo processado.</li>
                        )}
                        {busyData.activeSessionCount > 0 && (
                            <li><strong>Sessões Ativas:</strong> {busyData.activeSessionCount} contato(s) estão em meio a um fluxo interativo.</li>
                        )}
                    </ul>
                </div>

                <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '25px', textAlign: 'center' }}>
                    Aguarde a conclusão das atividades atuais ou interrompa as sessões existentes na aba "Histórico" antes de tentar novamente.
                </p>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                        className="btn-primary"
                        onClick={onCancel}
                        style={{
                            padding: '12px 40px',
                            fontSize: '1rem',
                            borderRadius: '30px',
                            boxShadow: '0 4px 12px rgba(40, 0, 145, 0.2)'
                        }}
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
}

export default FlowConcurrencyModal;
