import React, { useState } from 'react';
import { Upload, CheckCircle2, Send, Eye, RefreshCw, GitBranch, Download } from 'lucide-react';

export function AutomationTab({
    user,
    config,
    activeDispatch,
    setActiveDispatch,
    fetchDispatches,
    campaignData,
    setCampaignData,
    headers,
    setHeaders,
    mapping,
    setMapping,
    templateName,
    setTemplateName,
    templatePreview,
    setTemplatePreview,
    dates,
    setDates,
    addToast,
    templateDetails,
    setTemplateDetails,
    templateVariables,
    setTemplateVariables,
    isLoadingTemplate,
    setIsLoadingTemplate,
    controlDispatch,
    setSelectedLogDispatch,
    REQUIRED_COLUMNS,
    availableFlows,
    selectedFlowId,
    setSelectedFlowId,
    dispatchMode,
    setDispatchMode,
    dispatchSource,
    setDispatchSource,
    startDispatch,
    fetchMetaTemplate,
    renderTemplatePreview,
    getDateLogic,
    handleFileUpload
}) {
    return (
        <div className="card fade-in" style={{ backgroundColor: 'white', padding: '2.5rem' }}>
            <section className="dashboard-grid">
                {activeDispatch && (['running', 'paused', 'stopped', 'completed', 'error'].includes(activeDispatch.status)) ? (
                    <div className="card ambev-flag progress-container" style={{ gridColumn: 'span 2' }}>
                        <div className="progress-header">
                            <span>#{activeDispatch.id} - Progresso: {activeDispatch.currentIndex} / {activeDispatch.totalLeads}</span>
                            <div className="status-group">
                                {activeDispatch.errorCount > 0 && <span className="error-badge">{activeDispatch.errorCount} erros</span>}
                                <span className={`status-badge ${activeDispatch.status}`}>{activeDispatch.status}</span>
                            </div>
                        </div>
                        <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: `${(activeDispatch.currentIndex / activeDispatch.totalLeads) * 100 || 0}%` }}></div>
                        </div>
                        <div className="progress-controls">
                            {activeDispatch.status === 'running' ? (
                                <button className="btn-pause" onClick={() => controlDispatch('pause')}><RefreshCw size={18} /> Pausar</button>
                            ) : (['completed', 'stopped', 'error'].includes(activeDispatch.status)) ? (
                                <button
                                    className="btn-secondary"
                                    onClick={() => setActiveDispatch(null)}
                                    style={{ backgroundColor: '#f0f2f5', color: '#666' }}
                                >
                                    <RefreshCw size={18} /> Novo Disparo / Voltar
                                </button>
                            ) : (
                                <button className="btn-resume" onClick={() => controlDispatch('resume')}><Send size={18} /> Continuar</button>
                            )}
                            {(!['completed', 'error'].includes(activeDispatch.status)) && <button className="btn-secondary" onClick={() => controlDispatch('stop')}>Parar tudo</button>}
                            <button className="btn-secondary" onClick={() => setSelectedLogDispatch(activeDispatch)}>Ver Logs</button>
                        </div>
                        {activeDispatch.lastLog && (
                            <div className="log-container">
                                <label>Último:</label>
                                <div className={`log-entry ${activeDispatch.lastLog.status === 'error' ? 'error' : ''}`}>
                                    {activeDispatch.lastLog.phone}: {activeDispatch.lastLog.status === 'success' ? '✓ OK' : `✗ ${activeDispatch.lastLog.message}`}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {!campaignData ? (
                            <div className="card ambev-flag upload-card" style={{ gridColumn: 'span 2' }}>
                                <h3><Upload size={18} /> Base de Dados</h3>
                                <div className="dropzone" onClick={() => document.getElementById('fileInput').click()}>
                                    <input type="file" id="fileInput" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                                    <div className="dropzone-label"><Upload size={48} strokeWidth={1} /><span>Clique ou arraste o arquivo</span></div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="card ambev-flag upload-success" style={{ gridColumn: 'span 2' }}>
                                    <CheckCircle2 size={48} color="var(--ambev-green)" />
                                    <h3>Base carregada: {campaignData.length} leads</h3>
                                    <button className="btn-link" onClick={() => setCampaignData(null)}>Trocar base</button>
                                </div>
                                <div className="card ambev-flag" style={{ gridColumn: 'span 2', maxHeight: '400px', overflow: 'auto', padding: '1rem' }}>
                                    <h3>Preview dos Dados</h3>
                                    <table className="preview-table">
                                        <thead>
                                            <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                            {campaignData.slice(0, 10).map((row, i) => (
                                                <tr key={i}>
                                                    {headers.map(h => <td key={h}>{row[h]}</td>)}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {campaignData.length > 10 && <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '10px' }}>Exibindo os primeiros 10 leads de {campaignData.length}.</p>}
                                </div>
                            </>
                        )}
                        {campaignData && (
                            <>
                                <div className="source-selector-container" style={{ gridColumn: 'span 2' }}>
                                    <div className="source-selector">
                                        <button
                                            className={dispatchSource === 'ambev' ? 'active' : ''}
                                            onClick={() => setDispatchSource('ambev')}
                                        >AMBEV</button>
                                        <button
                                            className={dispatchSource === 'outros' ? 'active' : ''}
                                            onClick={() => setDispatchSource('outros')}
                                        >OUTROS</button>
                                    </div>
                                </div>

                                {dispatchSource === 'ambev' && (
                                    <div className="card ambev-flag mapping-card" style={{ gridColumn: 'span 2' }}>
                                        <h3>Mapeamento Ambev</h3>
                                        <div className="mapping-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                                            {REQUIRED_COLUMNS.map(col => (
                                                <div key={col.id} className="input-group">
                                                    <label>{col.label}</label>
                                                    <select value={mapping[col.id] || ''} onChange={e => setMapping({ ...mapping, [col.id]: e.target.value })}>
                                                        <option value="">Coluna...</option>
                                                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="card ambev-flag template-card" style={{ gridColumn: 'span 2' }}>
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {dispatchSource === 'ambev' ? 'Configuração do Modelo' : 'Tipo de Disparo'}
                                    </h3>

                                    {dispatchSource === 'outros' && (
                                        <>
                                            <div className="input-group mb-4" style={{ padding: '16px', border: '1px solid #e1e8f0', borderRadius: '12px', backgroundColor: 'white', boxShadow: 'var(--shadow-sm)' }}>
                                                <label style={{ color: 'var(--ambev-blue)', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', marginBottom: '12px', display: 'block' }}>Coluna de Telefone (Destinatário)</label>
                                                <select value={mapping.phone || ''} onChange={e => setMapping({ ...mapping, phone: e.target.value })} style={{ width: '100%', padding: '12px' }}>
                                                    <option value="">Selecione uma coluna...</option>
                                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                                                <button className={`mode-btn ${dispatchMode === 'template' ? 'active' : ''}`} onClick={() => setDispatchMode('template')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: dispatchMode === 'template' ? '2px solid #280091' : '1px solid #ddd', background: dispatchMode === 'template' ? '#f0f4ff' : 'white', fontWeight: 600 }}>Template único</button>
                                                <button className={`mode-btn ${dispatchMode === 'flow' ? 'active' : ''}`} onClick={() => setDispatchMode('flow')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: dispatchMode === 'flow' ? '2px solid #280091' : '1px solid #ddd', background: dispatchMode === 'flow' ? '#f0f4ff' : 'white', fontWeight: 600 }}>Fluxo completo</button>
                                            </div>
                                        </>
                                    )}

                                    {dispatchSource === 'ambev' ? (
                                        <div className="ambev-controls fade-in">
                                            <div className="input-group">
                                                <label>Template Meta</label>
                                                <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="ex: agendamento_entrega" />
                                            </div>
                                            <div className="grid-2 mt-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                                <div className="input-group">
                                                    <label>Data Anterior tiZAP!</label>
                                                    <input type="text" value={dates.old} onChange={e => setDates({ ...dates, old: e.target.value })} placeholder="ex: 12/01" />
                                                </div>
                                                <div className="input-group">
                                                    <label>Nova Data tiZAP!</label>
                                                    <input type="text" value={dates.new} onChange={e => setDates({ ...dates, new: e.target.value })} placeholder="ex: 16/01" />
                                                </div>
                                            </div>
                                            <button className="btn-secondary mt-4" style={{ borderRadius: '8px', borderBottom: '2px solid #ddd' }} onClick={() => setTemplatePreview(true)}>Validar Modelo</button>
                                            {templatePreview && (
                                                <div className="card mt-4 ambev-preview-bubble" style={{ backgroundColor: 'white', border: '1px solid #eee', padding: '16px', borderRadius: '18px 18px 18px 0', maxWidth: '400px', boxShadow: '0 5px 15px rgba(0,0,0,0.05)', alignSelf: 'flex-start' }}>
                                                    <div style={{ fontSize: '0.9rem', color: '#1c1e21', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                                                        Olá, <strong>{campaignData[0][mapping['fantasy_name']] || campaignData[0]['Nome fantasia'] || '[NOME FANTASIA]'}</strong>.{"\n\n"}
                                                        Informamos que, devido a um imprevisto logístico, o pedido <strong>{campaignData[0][mapping['order_number']] || campaignData[0]['Nº do Pedido'] || '[PEDIDO]'}</strong> não será entregue <strong>{getDateLogic().old}</strong>.{"\n\n"}
                                                        A entrega foi reagendada e será realizada no dia <strong>{getDateLogic().new}</strong>.{"\n\n"}
                                                        Agradecemos a compreensão e seguimos à disposição.
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            {dispatchMode === 'template' ? (
                                                <div className="outros-template fade-in">
                                                    <div className="input-group">
                                                        <label>Template Meta</label>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Nome do modelo no Meta" style={{ flex: 1 }} />
                                                            <button className="btn-secondary" onClick={fetchMetaTemplate} disabled={isLoadingTemplate} style={{ padding: '0 12px', height: '42px', display: 'flex', alignItems: 'center' }}>
                                                                {isLoadingTemplate ? <RefreshCw className="spinning" size={16} /> : <Download size={16} />} Carregar
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {templateDetails && (
                                                        <div className="template-vars-box mt-3 fade-in" style={{ padding: '12px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#666', marginBottom: '10px' }}>MAPEAMENTO DE VARIÁVEIS:</div>
                                                            <div className="variable-inputs" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                                {Object.keys(templateVariables).sort((a, b) => (templateVariables[a].order || 0) - (templateVariables[b].order || 0)).map(key => {
                                                                    const info = templateVariables[key];
                                                                    if (!info || typeof info !== 'object') return null;
                                                                    return (
                                                                        <div key={key} className="variable-row" style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: '10px', alignItems: 'end' }}>
                                                                            <div className="input-group">
                                                                                <label style={{ fontSize: '0.7rem', color: '#888' }}>{info.component || 'BODY'} {`{{${info.index || '?'}}}`}</label>
                                                                                <select value={info.type} onChange={e => setTemplateVariables({ ...templateVariables, [key]: { ...info, type: e.target.value, value: '' } })} style={{ padding: '6px', fontSize: '0.8rem' }}>
                                                                                    <option value="manual">Texto Fixo</option>
                                                                                    <option value="column">Coluna Excel</option>
                                                                                </select>
                                                                            </div>
                                                                            <div className="input-group" style={{ gridColumn: 'span 2' }}>
                                                                                {info.type === 'manual' ? (
                                                                                    <input type="text" value={info.value || ''} onChange={e => setTemplateVariables({ ...templateVariables, [key]: { ...info, value: e.target.value } })} placeholder="Digite o texto..." style={{ padding: '6px' }} />
                                                                                ) : (
                                                                                    <select value={info.value || ''} onChange={e => setTemplateVariables({ ...templateVariables, [key]: { ...info, value: e.target.value } })} style={{ padding: '6px' }}>
                                                                                        <option value="">Selecione a coluna...</option>
                                                                                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                                                    </select>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            <button className="btn-secondary btn-sm mt-3" style={{ borderRadius: '8px', borderBottom: '2px solid #ddd' }} onClick={() => setTemplatePreview(true)}>Validar Outros</button>
                                                            {templatePreview && renderTemplatePreview()}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="outros-flow fade-in">
                                                    <div className="input-group">
                                                        <label>Selecione o Fluxo</label>
                                                        <select value={selectedFlowId || ''} onChange={e => setSelectedFlowId(e.target.value ? parseInt(e.target.value) : null)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}>
                                                            <option value="">Escolha um fluxo...</option>
                                                            {availableFlows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                                        </select>
                                                    </div>

                                                    {isLoadingTemplate ? (
                                                        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                                            <RefreshCw className="spinning" size={24} style={{ marginBottom: '8px' }} />
                                                            <p>Carregando variáveis dos templates...</p>
                                                        </div>
                                                    ) : (
                                                        selectedFlowId && Object.keys(templateVariables).length > 0 && (
                                                            <div className="template-vars-box mt-4 fade-in" style={{ padding: '12px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
                                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ambev-blue)', marginBottom: '15px', borderBottom: '2px solid var(--ambev-blue)', paddingBottom: '4px' }}>MAPEAMENTO DE VARIÁVEIS DO FLUXO:</div>

                                                                {Array.from(new Set(Object.values(templateVariables).map(v => v.nodeId))).map(nodeId => {
                                                                    const nodeVars = Object.keys(templateVariables)
                                                                        .filter(k => templateVariables[k].nodeId === nodeId)
                                                                        .sort((a, b) => (templateVariables[a].order || 0) - (templateVariables[b].order || 0));

                                                                    const firstVar = templateVariables[nodeVars[0]];

                                                                    return (
                                                                        <div key={nodeId} style={{ marginBottom: '20px', padding: '12px', background: 'white', borderRadius: '8px', border: '1px solid #e1e8f0' }}>
                                                                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#333', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                <GitBranch size={14} color="var(--ambev-blue)" />
                                                                                <span>{firstVar.nodeName}</span>
                                                                                <span style={{ fontWeight: 400, color: '#999', fontSize: '0.7rem' }}>({firstVar.templateName})</span>
                                                                            </div>
                                                                            <div className="variable-inputs" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                                                {nodeVars.map(key => {
                                                                                    const info = templateVariables[key];
                                                                                    return (
                                                                                        <div key={key} className="variable-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 130px) 1fr 1fr', gap: '10px', alignItems: 'end' }}>
                                                                                            <div className="input-group">
                                                                                                <label style={{ fontSize: '0.7rem', color: '#888' }}>{info.component || 'BODY'} {`{{${info.index}}}`}</label>
                                                                                                <select value={info.type} onChange={e => setTemplateVariables({ ...templateVariables, [key]: { ...info, type: e.target.value, value: '' } })} style={{ padding: '6px', fontSize: '0.8rem', border: '1px solid #ddd' }}>
                                                                                                    <option value="manual">Texto Fixo</option>
                                                                                                    <option value="column">Coluna Excel</option>
                                                                                                </select>
                                                                                            </div>
                                                                                            <div className="input-group" style={{ gridColumn: 'span 2' }}>
                                                                                                {info.type === 'manual' ? (
                                                                                                    <input type="text" value={info.value || ''} onChange={e => setTemplateVariables({ ...templateVariables, [key]: { ...info, value: e.target.value } })} placeholder="Digite o texto..." style={{ padding: '6px', border: '1px solid #ddd' }} />
                                                                                                ) : (
                                                                                                    <select value={info.value || ''} onChange={e => setTemplateVariables({ ...templateVariables, [key]: { ...info, value: e.target.value } })} style={{ padding: '6px', border: '1px solid #ddd' }}>
                                                                                                        <option value="">Selecione a coluna...</option>
                                                                                                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                                                                    </select>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                <div className="dispatch-actions" style={{ gridColumn: 'span 2' }}>
                                    {dispatchMode === 'template' ? (
                                        <button className="btn-primary btn-block btn-dispatch-pulse" onClick={startDispatch} style={{ maxWidth: '500px', height: '56px', borderRadius: '12px', fontSize: '1.1rem' }}><Send size={24} /> Disparar Template</button>
                                    ) : (
                                        <button
                                            className="btn-primary btn-block btn-dispatch-pulse"
                                            onClick={startDispatch}
                                            disabled={!selectedFlowId}
                                            style={{ maxWidth: '500px', height: '56px', borderRadius: '12px', fontSize: '1.1rem', opacity: selectedFlowId ? 1 : 0.5 }}
                                        >
                                            <GitBranch size={24} /> Iniciar Fluxo
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}

export default AutomationTab;
