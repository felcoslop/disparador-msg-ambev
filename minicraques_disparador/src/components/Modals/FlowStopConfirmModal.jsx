import React from 'react';
import { Trash2 } from 'lucide-react';

export function FlowStopConfirmModal({ session, onConfirm, onCancel }) {
    if (!session) return null;
    return (
        <div className="modal-overlay">
            <div className="modal-content card ambev-flag" style={{ maxWidth: '400px', width: '90%', padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#e02424' }}>
                    <Trash2 size={28} />
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Interromper Fluxo</h3>
                </div>
                <p style={{ color: '#666', marginBottom: '24px', lineHeight: '1.5' }}>
                    Tem certeza que deseja interromper o fluxo para o contato <strong>{session.contactPhone}</strong>?
                    O cliente não receberá mais as próximas etapas.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        className="btn-secondary"
                        onClick={onCancel}
                        style={{ padding: '8px 16px', fontWeight: 600 }}
                    >
                        Manter Fluxo
                    </button>
                    <button
                        className="btn-primary"
                        style={{
                            backgroundColor: '#e02424',
                            color: 'white',
                            padding: '8px 24px',
                            border: 'none',
                            borderRadius: '30px',
                            fontWeight: 700
                        }}
                        onClick={onConfirm}
                    >
                        Interromper
                    </button>
                </div>
            </div>
        </div>
    );
}

export default FlowStopConfirmModal;
