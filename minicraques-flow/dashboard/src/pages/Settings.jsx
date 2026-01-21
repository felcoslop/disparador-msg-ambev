import React, { useState, useEffect } from 'react';
import { Save, Shield, Key, Mail } from 'lucide-react';
import axios from 'axios';

function Settings() {
    const [settings, setSettings] = useState({
        WA_TOKEN: '',
        WA_PHONE_ID: '',
        WA_VERIFY_TOKEN: '',
        GMAIL_USER: '',
        GMAIL_PASS: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await axios.get('/api/settings');
                setSettings({ ...settings, ...res.data });
            } catch (err) {
                console.error('Failed to fetch settings:', err);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setLoading(true);
        try {
            await axios.post('/api/settings', settings);
            alert('Configurações salvas com sucesso! 🚀');
        } catch (err) {
            console.error(err);
            alert('Erro ao salvar configurações.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="animate-in">
            <div style={{ marginBottom: '2rem' }}>
                <h2>Configurações do Sistema</h2>
                <p style={{ color: '#666' }}>Gerencie suas credenciais do Meta e Gmail com segurança.</p>
            </div>

            <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="card">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Shield color="#FF6B00" /> WhatsApp Business API
                    </h3>
                    <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Access Token (Meta)</label>
                            <input
                                type="password"
                                className="w-full"
                                value={settings.WA_TOKEN}
                                onChange={(e) => setSettings({ ...settings, WA_TOKEN: e.target.value })}
                                style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ddd', width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Phone Number ID</label>
                            <input
                                type="text"
                                className="w-full"
                                value={settings.WA_PHONE_ID}
                                onChange={(e) => setSettings({ ...settings, WA_PHONE_ID: e.target.value })}
                                style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ddd', width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Verify Token (Webhook)</label>
                            <input
                                type="text"
                                className="w-full"
                                value={settings.WA_VERIFY_TOKEN}
                                onChange={(e) => setSettings({ ...settings, WA_VERIFY_TOKEN: e.target.value })}
                                style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ddd', width: '100%' }}
                            />
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Mail color="#FF6B00" /> Email Marketing (Gmail)
                    </h3>
                    <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Gmail User</label>
                            <input
                                type="text"
                                className="w-full"
                                value={settings.GMAIL_USER}
                                onChange={(e) => setSettings({ ...settings, GMAIL_USER: e.target.value })}
                                style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ddd', width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>App Password</label>
                            <input
                                type="password"
                                className="w-full"
                                value={settings.GMAIL_PASS}
                                onChange={(e) => setSettings({ ...settings, GMAIL_PASS: e.target.value })}
                                style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ddd', width: '100%' }}
                                placeholder="Gerado no Google My Account"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '2rem', textAlign: 'right' }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ padding: '12px 30px' }}>
                    <Save size={18} /> {loading ? 'Salvando...' : 'Salvar Configurações'}
                </button>
            </div>

            <div className="card" style={{ marginTop: '2rem', borderLeft: '4px solid #FF6B00' }}>
                <h4>🛡️ Segurança de Dados</h4>
                <p style={{ fontSize: '0.9rem', color: '#666' }}>
                    Suas credenciais são armazenadas localmente no banco de dados SQLite do servidor e nunca são compartilhadas.
                </p>
            </div>
        </div>
    );
}

export default Settings;
