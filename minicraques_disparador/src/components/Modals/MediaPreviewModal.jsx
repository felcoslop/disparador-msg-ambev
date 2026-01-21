import React from 'react';
import { Image as ImageIcon, X, Mic, FileText } from 'lucide-react';

export function MediaPreviewModal({ stagedMedia, setStagedMedia, onSend, onClose, onAddMore }) {
    if (stagedMedia.length === 0) return null;

    const updateCaption = (index, caption) => {
        setStagedMedia(prev => prev.map((item, i) => i === index ? { ...item, caption } : item));
    };

    const removeItem = (index) => {
        const item = stagedMedia[index];
        URL.revokeObjectURL(item.previewUrl);
        setStagedMedia(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content card ambev-flag" style={{ maxWidth: '600px', width: '90%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <ImageIcon size={20} /> Enviar Mídia ({stagedMedia.length})
                    </h3>
                    <button className="btn-icon" onClick={onClose}><X size={24} /></button>
                </header>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {stagedMedia.map((item, index) => (
                        <div key={index} style={{ borderBottom: '1px solid #eee', paddingBottom: '15px', position: 'relative' }}>
                            <button
                                onClick={() => removeItem(index)}
                                style={{ position: 'absolute', top: -10, right: -10, background: '#ff5555', color: 'white', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                                title="Remover"
                            >
                                <X size={16} />
                            </button>

                            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                                {item.type === 'image' ? (
                                    <img src={item.previewUrl} style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #ddd' }} alt="Preview" />
                                ) : (
                                    <div style={{ width: '100px', height: '100px', backgroundColor: '#f0f2f5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ddd' }}>
                                        {item.type === 'audio' ? <Mic size={40} color="#666" /> : <FileText size={40} color="#666" />}
                                    </div>
                                )}
                                <div style={{ flex: 1 }}>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#666', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.file.name}</p>
                                    <input
                                        type="text"
                                        placeholder="Legenda (opcional)..."
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.9rem' }}
                                        value={item.caption}
                                        onChange={(e) => updateCaption(index, e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && onSend()}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '2px solid #f0f2f5' }}>
                    <button className="btn-secondary" onClick={onAddMore} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                        <ImageIcon size={18} /> + Adicionar
                    </button>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <button className="btn-link" onClick={onClose} style={{ fontWeight: 600 }}>Cancelar</button>
                        <button className="btn-primary" onClick={onSend} style={{ backgroundColor: 'var(--ambev-blue)', color: 'white', padding: '12px 35px', borderRadius: '30px', fontWeight: 700, fontSize: '1rem' }}>
                            Enviar {stagedMedia.length > 1 ? `${stagedMedia.length} mídias` : 'mídia'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}

export default MediaPreviewModal;
