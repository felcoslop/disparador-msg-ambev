import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export function Toast({ toasts }) {
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

export default Toast;
