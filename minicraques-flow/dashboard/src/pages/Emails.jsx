import React, { useState } from 'react';
import { Mail, Send, Eye, BarChart3, AlertCircle, Save } from 'lucide-react';
import axios from 'axios';

import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-markup';
import 'prismjs/themes/prism.css';

function Emails() {
    const [html, setHtml] = useState(`
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee;">
  <div style="background: #FF6B00; padding: 20px; text-align: center; color: #fff;">
    <h1>MiniCraques.com ⚽</h1>
  </div>
  <div style="padding: 20px;">
    <h2>Olá nome_pessoa!</h2>
    <p>Os novos conjuntos da temporada 26/27 chegaram!</p>
    <div style="text-align: center; margin: 30px;">
       <a href="https://minicraques.com" style="background: #000; color: #fff; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">VER COLEÇÃO AGORA</a>
    </div>
  </div>
</div>
    `);
    const [viewMode, setViewMode] = useState('desktop'); // desktop, mobile, outlook
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            await axios.post('/api/settings', { email_template: html });
            alert('Template de e-mail salvo!');
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleQuickBroadcast = async () => {
        const confirmBroadcast = window.confirm("Deseja disparar para TODOS os leads com e-mail?");
        if (!confirmBroadcast) return;
        setLoading(true);
        try {
            const res = await axios.get('/api/leads');
            const leadsWithEmail = res.data.filter(l => l.email).map(l => l.id);

            if (leadsWithEmail.length === 0) {
                alert("Nenhum lead com e-mail encontrado.");
                return;
            }

            await axios.post('/api/send-campaign', { leadIds: leadsWithEmail });
            alert(`Campanha iniciada para ${leadsWithEmail.length} leads!`);
        } catch (err) {
            console.error(err);
            alert("Erro ao disparar campanha de e-mail.");
        } finally {
            setLoading(false);
        }
    };

    const getPreviewStyle = () => {
        switch (viewMode) {
            case 'mobile': return { width: '375px', height: '600px', margin: '0 auto', border: '10px solid #333', borderRadius: '20px' };
            case 'outlook': return { width: '600px', height: '500px', border: '1px solid #ddd', padding: '10px' };
            default: return { width: '100%', minHeight: '500px' };
        }
    };

    return (
        <div className="animate-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <h2>Editor de Email Marketing</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-secondary" onClick={handleSave} disabled={loading}><Save size={18} /> Salvar Template</button>
                    <button className="btn btn-primary" onClick={handleQuickBroadcast} disabled={loading}><Send size={18} /> Disparar Campanha</button>
                </div>
            </div>

            <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                    <div style={{ background: '#f8f8f8', padding: '10px', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>HTML / CSS</span>
                    </div>
                    <div style={{ height: '500px', overflowY: 'auto', background: '#fff' }}>
                        <Editor
                            value={html}
                            onValueChange={code => setHtml(code)}
                            highlight={code => highlight(code, languages.markup)}
                            padding={20}
                            style={{
                                fontFamily: '"Fira code", "Fira Mono", monospace',
                                fontSize: 12,
                            }}
                        />
                    </div>
                </div>

                <div className="card" style={{ padding: '0', background: '#e5e5e5' }}>
                    <div style={{ background: '#f8f8f8', padding: '10px', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'center', gap: '15px' }}>
                        <button className={`btn ${viewMode === 'desktop' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 10px' }} onClick={() => setViewMode('desktop')}>Desktop</button>
                        <button className={`btn ${viewMode === 'mobile' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 10px' }} onClick={() => setViewMode('mobile')}>Mobile</button>
                        <button className={`btn ${viewMode === 'outlook' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 10px' }} onClick={() => setViewMode('outlook')}>Outlook (Sim)</button>
                    </div>
                    <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
                        <div style={{ background: '#fff', overflow: 'auto', ...getPreviewStyle() }}>
                            {viewMode === 'outlook' && (
                                <div style={{ borderBottom: '1px solid #ddd', padding: '10px', fontSize: '0.8rem', color: '#666', background: '#f9f9f9', marginBottom: '10px' }}>
                                    De: felipecostalopes44@gmail.com <br />
                                    Assunto: Novidades MiniCraques ⚽ Temporada 26/27
                                </div>
                            )}
                            <div dangerouslySetInnerHTML={{ __html: html }} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="card">
                <h3>Log de Envios</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '1rem', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #eee' }}>
                            <th style={{ padding: '10px' }}>Lead</th>
                            <th style={{ padding: '10px' }}>Template</th>
                            <th style={{ padding: '10px' }}>Data</th>
                            <th style={{ padding: '10px' }}>Resultado</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ padding: '10px' }}>felipe@exemplo.com</td>
                            <td style={{ padding: '10px' }}>promo_26_27</td>
                            <td style={{ padding: '10px' }}>13/01/2026 14:20</td>
                            <td style={{ padding: '10px' }}><span style={{ color: '#28a745' }}>● Sucesso</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default Emails;
