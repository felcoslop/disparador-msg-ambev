import React, { useState } from 'react';
import { Upload, FileText, Search, Play } from 'lucide-react';
import axios from 'axios';

function Leads() {
    const [file, setFile] = useState(null);
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedLeads, setSelectedLeads] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchLeads = async () => {
        try {
            const res = await axios.get('/api/leads');
            setLeads(res.data);
        } catch (err) {
            console.error('Error fetching leads:', err);
        }
    };

    React.useEffect(() => {
        fetchLeads();
    }, []);

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await axios.post('/api/upload-leads', formData);
            alert(`${res.data.count} leads importados com sucesso!`);
            setFile(null);
            fetchLeads();
        } catch (err) {
            console.error(err);
            alert('Erro ao importar leads.');
        } finally {
            setLoading(false);
        }
    };

    const handleSendCampaign = async () => {
        if (selectedLeads.length === 0) {
            alert('Selecione pelo menos um lead para disparar.');
            return;
        }

        setLoading(true);
        try {
            await axios.post('/api/send-campaign', { leadIds: selectedLeads });
            alert('Campanha disparada com sucesso!');
            setSelectedLeads([]);
        } catch (err) {
            console.error(err);
            alert('Erro ao disparar campanha.');
        } finally {
            setLoading(false);
        }
    };

    const toggleSelect = (id) => {
        setSelectedLeads(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const filteredLeads = leads.filter(l =>
        l.nome_pessoa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.phone?.includes(searchTerm) ||
        l.nome_bairro?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="animate-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2>Base de Leads (CSV/XLS)</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="file"
                        id="csv-upload"
                        hidden
                        onChange={(e) => setFile(e.target.files[0])}
                        accept=".csv, .xlsx, .xls"
                    />
                    <label htmlFor="csv-upload" className="btn btn-primary" style={{ cursor: 'pointer' }}>
                        <Upload size={18} /> {file ? file.name : 'Selecionar Arquivo'}
                    </label>
                    {file && (
                        <button className="btn btn-primary" onClick={handleUpload} disabled={loading}>
                            {loading ? 'Subindo...' : 'Importar Agora'}
                        </button>
                    )}
                </div>
            </div>

            <div className="card">
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
                        <input
                            type="text"
                            placeholder="Pesquisar por nome, telefone ou bairro..."
                            className="w-full"
                            style={{ padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #ddd', width: '100%' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="btn btn-primary" onClick={handleSendCampaign} disabled={loading || selectedLeads.length === 0}>
                        <Play size={18} /> {loading ? 'Enviando...' : `Disparar p/ ${selectedLeads.length} selecionados`}
                    </button>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #eee', color: '#666', fontSize: '0.9rem' }}>
                            <th style={{ padding: '12px', width: '40px' }}>
                                <input
                                    type="checkbox"
                                    onChange={(e) => setSelectedLeads(e.target.checked ? filteredLeads.map(l => l.id) : [])}
                                    checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                                />
                            </th>
                            <th style={{ padding: '12px' }}>Nome</th>
                            <th style={{ padding: '12px' }}>Telefone</th>
                            <th style={{ padding: '12px' }}>Bairro</th>
                            <th style={{ padding: '12px' }}>E-mail</th>
                            <th style={{ padding: '12px' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLeads.map(lead => (
                            <tr key={lead.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '12px' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedLeads.includes(lead.id)}
                                        onChange={() => toggleSelect(lead.id)}
                                    />
                                </td>
                                <td style={{ padding: '12px' }}>{lead.nome_pessoa}</td>
                                <td style={{ padding: '12px' }}>{lead.phone}</td>
                                <td style={{ padding: '12px' }}>{lead.nome_bairro}</td>
                                <td style={{ padding: '12px' }}>{lead.email || '-'}</td>
                                <td style={{ padding: '12px' }}>
                                    <span style={{ background: '#e6f4ff', color: '#007bff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>Lead</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredLeads.length === 0 && (
                    <div style={{ marginTop: '2rem', textAlign: 'center', opacity: 0.5 }}>
                        <p>Nenhum lead encontrado. Use o botão acima para importar seu CSV.</p>
                    </div>
                )}
            </div>

            <div className="card" style={{ borderLeft: '4px solid #007bff' }}>
                <h4>Dica MiniCraques ⚽</h4>
                <p style={{ fontSize: '0.9rem', color: '#666' }}>
                    Sua planilha deve conter as colunas: <strong>phone, nome_pessoa, nome_bairro, email</strong>.
                </p>
            </div>
        </div>
    );
}

export default Leads;
