import React from 'react';
import { Trash2, RefreshCw, Clock, Download, Paperclip, Mic, Send, AlertCircle, X } from 'lucide-react';

export function ReceivedTab({
    user,
    config,
    receivedMessages,
    setReceivedMessages,
    activeContact,
    setActiveContact,
    fetchMessages,
    isRefreshing,
    isDeleting,
    setIsDeleting,
    selectedContacts,
    setSelectedContacts,
    showDeleteConfirm,
    setShowDeleteConfirm,
    setShowProfileModal,
    fileInputRef,
    handleMediaUpload,
    isUploadingMedia,
    addToast
}) {
    const normalize = p => {
        let s = String(p || '').replace(/\D/g, '');
        if (s.startsWith('55') && s.length === 12) {
            return s.slice(0, 4) + '9' + s.slice(4);
        }
        return s;
    };

    const groups = {};
    receivedMessages.forEach(m => {
        const key = normalize(m.contactPhone);
        if (!groups[key]) groups[key] = [];
        groups[key].push(m);
    });

    const contactKeys = Object.keys(groups);

    return (
        <div className="card fade-in" style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="received-container" style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 320px)' }}>
                <div style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '1.5rem', backgroundColor: 'white', borderRadius: 'var(--radius-lg)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', borderTop: '4px solid var(--ambev-blue)' }}>
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
                        {contactKeys.map(phoneKey => {
                            const contactMsgs = groups[phoneKey];
                            const bestPhone = contactMsgs.find(m => String(m.contactPhone).replace(/\D/g, '').length === 13)?.contactPhone || contactMsgs[0].contactPhone;

                            const incomingMsg = contactMsgs.find(m => !m.isFromMe);
                            const outgoingMsg = contactMsgs.find(m => m.isFromMe);
                            const contactName = outgoingMsg ? outgoingMsg.contactName : (incomingMsg ? incomingMsg.contactName : bestPhone);

                            const hasUnread = contactMsgs.some(m => !m.isFromMe && !m.isRead);
                            const isSelected = normalize(activeContact) === phoneKey;

                            return (
                                <div
                                    key={phoneKey}
                                    className={`contact-item ${isSelected ? 'active' : ''}`}
                                    onClick={() => {
                                        setActiveContact(bestPhone);
                                        setReceivedMessages(prev => prev.map(m =>
                                            (normalize(m.contactPhone) === phoneKey && !m.isFromMe) ? { ...m, isRead: true } : m
                                        ));

                                        const groupPhones = [...new Set(contactMsgs.map(m => m.contactPhone))];

                                        fetch('/api/messages/mark-read', {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${user.token}`
                                            },
                                            body: JSON.stringify({ phones: groupPhones, phoneId: config.phoneId, token: config.token })
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
                                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '2px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ambev-blue)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contactName}</span>
                                            <span style={{ fontSize: '11px', color: '#999', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={10} />
                                                {(() => {
                                                    const sorted = [...contactMsgs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                                                    const lastMsg = sorted[0];
                                                    if (!lastMsg || !lastMsg.createdAt) return '';
                                                    const date = new Date(lastMsg.createdAt);
                                                    if (isNaN(date.getTime())) return '';
                                                    const pad = n => String(n).padStart(2, '0');
                                                    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
                                                })()}
                                            </span>
                                        </div>
                                        {hasUnread && <span className="unread-dot" style={{ marginLeft: 'auto' }}></span>}
                                    </div>
                                </div>
                            );
                        })}
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
                                                {msg.mediaUrl ? (
                                                    <div style={{ marginBottom: '4px' }}>
                                                        {msg.mediaType === 'image' ? (
                                                            <img src={msg.mediaUrl} alt="Mídia" style={{ width: '240px', height: '240px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer', display: 'block' }} onClick={() => window.open(msg.mediaUrl, '_blank')} />
                                                        ) : msg.mediaType === 'audio' ? (
                                                            <audio controls src={msg.mediaUrl} style={{ maxWidth: '100%' }} />
                                                        ) : (
                                                            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                <Download size={16} /> Baixar {msg.mediaType}
                                                            </a>
                                                        )}
                                                        {msg.messageBody && msg.messageBody !== `[${msg.mediaType?.toUpperCase()}]` && (
                                                            <div style={{ marginTop: '4px' }}>{msg.messageBody}</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    msg.messageBody
                                                )}
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
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${user.token}`
                                            },
                                            body: JSON.stringify({ phone: activeContact, body: text })
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
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={handleMediaUpload}
                                    accept="image/*,audio/*,video/*,application/pdf"
                                />
                                <button type="button" className="btn-icon" onClick={() => fileInputRef.current?.click()} disabled={isUploadingMedia} style={{ color: '#666', marginRight: '5px' }}>
                                    {isUploadingMedia ? <RefreshCw className="animate-spin" size={20} /> : <Paperclip size={20} />}
                                </button>
                                <input name="reply" type="text" placeholder="Digite uma resposta..." style={{ flex: 1, padding: '10px', borderRadius: '20px', border: '1px solid #ddd' }} />
                                <button type="button" className="btn-icon" style={{ color: '#666', marginRight: '5px' }} title="Gravar Áudio (Em breve)">
                                    <Mic size={20} />
                                </button>
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
    );
}

export default ReceivedTab;
