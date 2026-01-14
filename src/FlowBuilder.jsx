import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactFlow, {
    ReactFlowProvider,
    Controls,
    Background,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    Handle,
    Position,
    MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { X, Plus, Trash2, Edit3, Play, Save, ArrowLeft, Image, MessageSquare, MessageCircle, ListOrdered } from 'lucide-react';

// --- Custom Node Types ---

// Message Node Component
function MessageNode({ data, id, selected }) {
    const [isEditing, setIsEditing] = useState(false);
    const [tempLabel, setTempLabel] = useState(data.label || '');

    const handleSave = () => {
        data.onChange(id, { label: tempLabel });
        setIsEditing(false);
    };

    // Determine handles based on node config
    const hasOptions = data.options && data.options.length > 0;
    const waitForReply = data.waitForReply;

    return (
        <div className={`flow-node message-node ${selected ? 'selected' : ''}`}>
            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Top}
                id="target"
                style={{ background: '#555', width: 12, height: 12 }}
            />

            <div className="node-header">
                <MessageSquare size={16} />
                <span>Mensagem</span>
                <button className="node-edit-btn" onClick={() => setIsEditing(!isEditing)}>
                    <Edit3 size={12} />
                </button>
            </div>

            <div className="node-content">
                {isEditing ? (
                    <div className="edit-mode">
                        <textarea
                            value={tempLabel}
                            onChange={(e) => setTempLabel(e.target.value)}
                            placeholder="Escreva sua mensagem..."
                            rows={4}
                        />
                        <div className="edit-actions">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={data.waitForReply || false}
                                    onChange={(e) => data.onChange(id, { waitForReply: e.target.checked })}
                                />
                                Aguardar resposta
                            </label>
                            <button className="btn-small btn-primary" onClick={handleSave}>Salvar</button>
                        </div>
                    </div>
                ) : (
                    <p className="node-text">{data.label || 'Clique para editar...'}</p>
                )}
            </div>

            {/* Conditional output handles */}
            {!hasOptions && (
                <div className="handles-row">
                    {waitForReply ? (
                        <>
                            <Handle
                                type="source"
                                position={Position.Bottom}
                                id="source-green"
                                style={{ background: '#00a276', left: '30%' }}
                                title="Respondeu"
                            />
                            <Handle
                                type="source"
                                position={Position.Bottom}
                                id="source-red"
                                style={{ background: '#dc3545', left: '70%' }}
                                title="Não respondeu"
                            />
                        </>
                    ) : (
                        <Handle
                            type="source"
                            position={Position.Bottom}
                            id="source-gray"
                            style={{ background: '#6c757d' }}
                            title="Continuar"
                        />
                    )}
                </div>
            )}

            {hasOptions && (
                <div className="handles-row options-handles">
                    {data.options.map((opt, i) => (
                        <Handle
                            key={i}
                            type="source"
                            position={Position.Bottom}
                            id={`source-${i + 1}`}
                            style={{
                                background: '#fecb00',
                                left: `${((i + 1) / (data.options.length + 1)) * 100}%`
                            }}
                            title={`Opção ${i + 1}`}
                        />
                    ))}
                </div>
            )}

            <style>{`
                .flow-node {
                    background: white;
                    border: 2px solid #ddd;
                    border-radius: 12px;
                    min-width: 280px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    transition: all 0.2s;
                }
                .flow-node.selected {
                    border-color: #280091;
                    box-shadow: 0 0 0 3px rgba(40, 0, 145, 0.2);
                }
                .node-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 12px;
                    background: linear-gradient(135deg, #280091, #4a1dc1);
                    color: white;
                    border-radius: 10px 10px 0 0;
                    font-size: 13px;
                    font-weight: 600;
                }
                .node-header .node-edit-btn {
                    margin-left: auto;
                    background: rgba(255,255,255,0.2);
                    border: none;
                    padding: 4px;
                    border-radius: 4px;
                    cursor: pointer;
                    color: white;
                }
                .node-content {
                    padding: 12px;
                }
                .node-text {
                    margin: 0;
                    font-size: 13px;
                    color: #333;
                    white-space: pre-wrap;
                }
                .edit-mode textarea {
                    width: 100%;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    padding: 8px;
                    font-size: 13px;
                    resize: vertical;
                }
                .edit-actions {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 8px;
                }
                .edit-actions label {
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .btn-small {
                    padding: 6px 12px;
                    font-size: 12px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                }
                .btn-small.btn-primary {
                    background: #280091;
                    color: white;
                }
                .handles-row {
                    display: flex;
                    justify-content: center;
                    padding-bottom: 8px;
                    position: relative;
                    min-height: 20px;
                }
            `}</style>
        </div>
    );
}

// Options Node Component
function OptionsNode({ data, id, selected }) {
    const [isEditing, setIsEditing] = useState(false);
    const [tempLabel, setTempLabel] = useState(data.label || '');
    const [options, setOptions] = useState(data.options || ['Sim', 'Não']);

    const handleSave = () => {
        data.onChange(id, { label: tempLabel, options, waitForReply: true });
        setIsEditing(false);
    };

    const addOption = () => {
        setOptions([...options, `Opção ${options.length + 1}`]);
    };

    const removeOption = (index) => {
        setOptions(options.filter((_, i) => i !== index));
    };

    const updateOption = (index, value) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const displayOptions = data.options || options;

    return (
        <div className={`flow-node options-node ${selected ? 'selected' : ''}`}>
            <Handle type="target" position={Position.Top} id="target" style={{ background: '#555', width: 12, height: 12 }} />

            <div className="node-header options-header">
                <ListOrdered size={16} />
                <span>Menu de Opções</span>
                <button className="node-edit-btn" onClick={() => setIsEditing(!isEditing)}>
                    <Edit3 size={12} />
                </button>
            </div>

            <div className="node-content">
                {isEditing ? (
                    <div className="edit-mode">
                        <textarea
                            value={tempLabel}
                            onChange={(e) => setTempLabel(e.target.value)}
                            placeholder="Mensagem antes das opções..."
                            rows={3}
                        />
                        <div className="options-list">
                            {options.map((opt, i) => (
                                <div key={i} className="option-item">
                                    <span className="option-num">{i + 1}.</span>
                                    <input
                                        type="text"
                                        value={opt}
                                        onChange={(e) => updateOption(i, e.target.value)}
                                    />
                                    <button onClick={() => removeOption(i)} className="remove-opt">
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                            <button className="add-option-btn" onClick={addOption}>
                                <Plus size={14} /> Adicionar opção
                            </button>
                        </div>
                        <button className="btn-small btn-primary" onClick={handleSave}>Salvar</button>
                    </div>
                ) : (
                    <div className="options-display">
                        <p className="node-text">{data.label || 'Escolha uma opção:'}</p>
                        <div className="options-with-handles">
                            {displayOptions.map((opt, i) => (
                                <div key={i} className="option-row">
                                    <span><strong>{i + 1}.</strong> {opt}</span>
                                    <Handle
                                        type="source"
                                        position={Position.Right}
                                        id={`source-${i + 1}`}
                                        style={{
                                            background: '#fecb00',
                                            width: 14,
                                            height: 14,
                                            border: '2px solid #333',
                                            position: 'relative',
                                            right: '-8px',
                                            top: 'auto'
                                        }}
                                        title={`Opção ${i + 1}`}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Red handle for invalid response */}
            <div className="invalid-handle-wrapper">
                <span className="invalid-label">Inválido →</span>
                <Handle
                    type="source"
                    position={Position.Right}
                    id="source-invalid"
                    style={{ background: '#dc3545', width: 12, height: 12 }}
                    title="Resposta inválida"
                />
            </div>

            <style>{`
                .options-header {
                    background: linear-gradient(135deg, #fecb00, #f0a500) !important;
                    color: #333 !important;
                }
                .options-list {
                    margin: 10px 0;
                }
                .option-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 6px;
                }
                .option-num {
                    font-weight: 700;
                    color: #280091;
                }
                .option-item input {
                    flex: 1;
                    padding: 6px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 12px;
                }
                .remove-opt {
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 4px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .add-option-btn {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    background: none;
                    border: 1px dashed #999;
                    padding: 6px 10px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    color: #666;
                    width: 100%;
                    justify-content: center;
                }
                .options-display {
                    position: relative;
                }
                .options-with-handles {
                    margin-top: 8px;
                }
                .option-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 6px 0;
                    border-bottom: 1px solid #eee;
                    font-size: 12px;
                    position: relative;
                }
                .option-row:last-child {
                    border-bottom: none;
                }
                .invalid-handle-wrapper {
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    padding: 8px 12px;
                    background: #fff0f0;
                    border-radius: 0 0 10px 10px;
                    font-size: 11px;
                    color: #dc3545;
                    position: relative;
                }
                .invalid-label {
                    margin-right: 8px;
                }
            `}</style>
        </div>
    );
}

// Template Node Component (for Meta templates)
function TemplateNode({ data, id, selected }) {
    const [isEditing, setIsEditing] = useState(false);
    const [templateName, setTemplateName] = useState(data.templateName || '');
    const [params, setParams] = useState(data.params || []);

    const handleSave = () => {
        data.onChange(id, { templateName, params, isTemplate: true });
        setIsEditing(false);
    };

    const waitForReply = data.waitForReply;

    return (
        <div className={`flow-node template-node ${selected ? 'selected' : ''}`}>
            <Handle type="target" position={Position.Top} id="target" style={{ background: '#555', width: 12, height: 12 }} />

            <div className="node-header template-header">
                <MessageCircle size={16} />
                <span>Template Meta</span>
                <button className="node-edit-btn" onClick={() => setIsEditing(!isEditing)}>
                    <Edit3 size={12} />
                </button>
            </div>

            <div className="node-content">
                {isEditing ? (
                    <div className="edit-mode">
                        <input
                            type="text"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            placeholder="Nome do template..."
                            style={{ width: '100%', marginBottom: 8, padding: 8, borderRadius: 6, border: '1px solid #ddd' }}
                        />
                        <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Este template será enviado via API Meta Business.</p>
                        <div className="edit-actions">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={data.waitForReply || false}
                                    onChange={(e) => data.onChange(id, { waitForReply: e.target.checked })}
                                />
                                Aguardar resposta
                            </label>
                            <button className="btn-small btn-primary" onClick={handleSave}>Salvar</button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className="node-text" style={{ color: '#00a276' }}>
                            <strong>Template:</strong> {data.templateName || 'Nenhum selecionado'}
                        </p>
                        {waitForReply && <p style={{ fontSize: 11, color: '#666', marginTop: 4 }}>⏱ Aguardando resposta</p>}
                    </div>
                )}
            </div>

            {/* Conditional output handles */}
            <div className="handles-row">
                {waitForReply ? (
                    <>
                        <Handle
                            type="source"
                            position={Position.Bottom}
                            id="source-green"
                            style={{ background: '#00a276', left: '30%' }}
                            title="Respondeu"
                        />
                        <Handle
                            type="source"
                            position={Position.Bottom}
                            id="source-red"
                            style={{ background: '#dc3545', left: '70%' }}
                            title="Não respondeu"
                        />
                    </>
                ) : (
                    <Handle type="source" position={Position.Bottom} id="source-gray" style={{ background: '#6c757d' }} />
                )}
            </div>

            <style>{`
                .template-header {
                    background: linear-gradient(135deg, #00a276, #00c896) !important;
                }
            `}</style>
        </div>
    );
}

// Image Node Component
function ImageNode({ data, id, selected }) {
    const [isEditing, setIsEditing] = useState(false);
    const [imageUrl, setImageUrl] = useState(data.imageUrl || '');
    const [caption, setCaption] = useState(data.caption || '');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleSave = () => {
        data.onChange(id, { imageUrl, caption, hasImage: true });
        setIsEditing(false);
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await fetch('/api/upload-image', {
                method: 'POST',
                body: formData
            });
            const result = await res.json();
            if (res.ok && result.url) {
                setImageUrl(result.url);
                data.onChange(id, { imageUrl: result.url });
            } else {
                alert('Erro ao fazer upload: ' + (result.error || 'Desconhecido'));
            }
        } catch (err) {
            alert('Erro de conexão ao fazer upload.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className={`flow-node image-node ${selected ? 'selected' : ''}`}>
            <Handle type="target" position={Position.Top} id="target" style={{ background: '#555', width: 12, height: 12 }} />

            <div className="node-header image-header">
                <Image size={16} />
                <span>Imagem</span>
                <button className="node-edit-btn" onClick={() => setIsEditing(!isEditing)}>
                    <Edit3 size={12} />
                </button>
            </div>

            <div className="node-content">
                {isEditing ? (
                    <div className="edit-mode">
                        <div className="upload-section">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                accept="image/*"
                                style={{ display: 'none' }}
                            />
                            <button
                                className="btn-upload"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                            >
                                {uploading ? '⏳ Enviando...' : '📤 Fazer Upload'}
                            </button>
                            <span className="or-divider">ou</span>
                        </div>
                        <input
                            type="text"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            placeholder="Cole a URL da imagem..."
                            style={{ width: '100%', marginBottom: 8, padding: 8, borderRadius: 6, border: '1px solid #ddd' }}
                        />
                        {imageUrl && (
                            <img src={imageUrl} alt="preview" style={{ maxWidth: '100%', borderRadius: 6, marginBottom: 8 }} />
                        )}
                        <textarea
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            placeholder="Legenda (opcional)..."
                            rows={2}
                        />
                        <button className="btn-small btn-primary" onClick={handleSave}>Salvar</button>
                    </div>
                ) : (
                    <div>
                        {data.imageUrl ? (
                            <img src={data.imageUrl} alt="preview" style={{ maxWidth: '100%', borderRadius: 6 }} />
                        ) : (
                            <div style={{ background: '#f0f0f0', padding: 20, textAlign: 'center', borderRadius: 6, color: '#999' }}>
                                <Image size={32} />
                                <p style={{ fontSize: 12, margin: '8px 0 0' }}>Clique para adicionar imagem</p>
                            </div>
                        )}
                        {data.caption && <p className="node-text" style={{ marginTop: 8 }}>{data.caption}</p>}
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} id="source-gray" style={{ background: '#6c757d' }} />

            <style>{`
                .image-header {
                    background: linear-gradient(135deg, #e91e63, #f48fb1) !important;
                }
                .upload-section {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 8px;
                }
                .btn-upload {
                    padding: 8px 16px;
                    background: #e91e63;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .btn-upload:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .or-divider {
                    color: #999;
                    font-size: 12px;
                }
            `}</style>
        </div>
    );
}

// Node types registry
const nodeTypes = {
    messageNode: MessageNode,
    optionsNode: OptionsNode,
    templateNode: TemplateNode,
    imageNode: ImageNode
};

// --- Flow Editor Component ---
function FlowEditor({ flow, onSave, onBack, userId, addToast }) {
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [flowName, setFlowName] = useState(flow?.name || 'Novo Fluxo');
    const reactFlowWrapper = useRef(null);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);

    useEffect(() => {
        if (flow) {
            try {
                const loadedNodes = JSON.parse(flow.nodes || '[]');
                const loadedEdges = JSON.parse(flow.edges || '[]');
                setNodes(loadedNodes);
                setEdges(loadedEdges);
                setFlowName(flow.name);
            } catch (e) {
                console.error('Error loading flow:', e);
            }
        }
    }, [flow]);

    const onNodesChange = useCallback(
        (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
        []
    );

    const onEdgesChange = useCallback(
        (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        []
    );

    const onConnect = useCallback(
        (params) => {
            // Custom edge styling based on handle type
            let edgeStyle = { stroke: '#6c757d', strokeWidth: 2 };
            if (params.sourceHandle?.includes('green')) edgeStyle = { stroke: '#00a276', strokeWidth: 2 };
            if (params.sourceHandle?.includes('red')) edgeStyle = { stroke: '#dc3545', strokeWidth: 2 };
            if (params.sourceHandle?.includes('source-1') || params.sourceHandle?.includes('source-2') || params.sourceHandle?.includes('source-3')) {
                edgeStyle = { stroke: '#fecb00', strokeWidth: 2 };
            }

            setEdges((eds) => addEdge({
                ...params,
                type: 'smoothstep',
                animated: true,
                style: edgeStyle,
                markerEnd: { type: MarkerType.ArrowClosed }
            }, eds));
        },
        []
    );

    const handleNodeDataChange = useCallback((nodeId, newData) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === nodeId) {
                    return { ...node, data: { ...node.data, ...newData } };
                }
                return node;
            })
        );
    }, []);

    const addNode = (type) => {
        const id = `node_${Date.now()}`;
        const position = reactFlowInstance
            ? reactFlowInstance.project({ x: 250, y: 150 })
            : { x: 250, y: 150 };

        const defaultData = {
            onChange: handleNodeDataChange
        };

        if (type === 'messageNode') {
            defaultData.label = 'Nova mensagem';
            defaultData.waitForReply = false;
        } else if (type === 'optionsNode') {
            defaultData.label = 'Escolha uma opção:';
            defaultData.options = ['Opção 1', 'Opção 2'];
            defaultData.waitForReply = true;
        } else if (type === 'templateNode') {
            defaultData.templateName = '';
            defaultData.isTemplate = true;
        } else if (type === 'imageNode') {
            defaultData.imageUrl = '';
            defaultData.caption = '';
            defaultData.hasImage = true;
        }

        const newNode = {
            id,
            type,
            position,
            data: defaultData
        };

        setNodes((nds) => [...nds, newNode]);
    };

    const handleSave = async () => {
        // Prepare nodes for saving (remove onChange function)
        const nodesForSave = nodes.map(node => ({
            ...node,
            data: { ...node.data, onChange: undefined }
        }));

        try {
            const endpoint = flow?.id
                ? `/api/flows/${userId}/${flow.id}`
                : `/api/flows/${userId}`;
            const method = flow?.id ? 'PUT' : 'POST';

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: flowName, nodes: nodesForSave, edges })
            });

            if (res.ok) {
                addToast('Fluxo salvo com sucesso!', 'success');
                onSave();
            } else {
                addToast('Erro ao salvar fluxo.', 'error');
            }
        } catch (err) {
            addToast('Erro de conexão.', 'error');
        }
    };

    // Inject onChange handler after loading
    const nodesWithHandlers = useMemo(() => {
        return nodes.map(node => ({
            ...node,
            data: { ...node.data, onChange: handleNodeDataChange }
        }));
    }, [nodes, handleNodeDataChange]);

    return (
        <div className="flow-editor-container">
            <div className="editor-header">
                <button className="btn-secondary" onClick={onBack}>
                    <ArrowLeft size={18} /> Voltar
                </button>
                <input
                    type="text"
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                    className="flow-name-input"
                    placeholder="Nome do fluxo..."
                />
                <button className="btn-primary" onClick={handleSave}>
                    <Save size={18} /> Salvar
                </button>
            </div>

            <div className="editor-toolbar">
                <span className="toolbar-label">Adicionar:</span>
                <button onClick={() => addNode('messageNode')} title="Mensagem">
                    <MessageSquare size={18} /> Mensagem
                </button>
                <button onClick={() => addNode('optionsNode')} title="Menu de Opções">
                    <ListOrdered size={18} /> Opções
                </button>
                <button onClick={() => addNode('templateNode')} title="Template Meta">
                    <MessageCircle size={18} /> Template
                </button>
                <button onClick={() => addNode('imageNode')} title="Imagem">
                    <Image size={18} /> Imagem
                </button>
            </div>

            <div className="flow-canvas" ref={reactFlowWrapper}>
                <ReactFlow
                    nodes={nodesWithHandlers}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onInit={setReactFlowInstance}
                    nodeTypes={nodeTypes}
                    fitView
                    snapToGrid
                    snapGrid={[15, 15]}
                    deleteKeyCode={['Backspace', 'Delete']}
                >
                    <Background color="#aaa" gap={16} />
                    <Controls />
                </ReactFlow>
            </div>

            <div className="editor-legend">
                <span><span className="legend-dot green"></span> Respondeu</span>
                <span><span className="legend-dot red"></span> Não respondeu / Inválido</span>
                <span><span className="legend-dot gray"></span> Continuar</span>
                <span><span className="legend-dot yellow"></span> Opções (1, 2, 3...)</span>
            </div>

            <style>{`
                .flow-editor-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #f5f5f5;
                }
                .editor-header {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px;
                    background: white;
                    border-bottom: 1px solid #ddd;
                }
                .flow-name-input {
                    flex: 1;
                    padding: 10px 16px;
                    font-size: 16px;
                    font-weight: 600;
                    border: 2px solid #ddd;
                    border-radius: 8px;
                }
                .flow-name-input:focus {
                    border-color: #280091;
                    outline: none;
                }
                .editor-toolbar {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    background: #280091;
                    color: white;
                }
                .toolbar-label {
                    font-weight: 600;
                    margin-right: 8px;
                }
                .editor-toolbar button {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 14px;
                    background: rgba(255,255,255,0.15);
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 6px;
                    color: white;
                    cursor: pointer;
                    font-size: 13px;
                    transition: all 0.2s;
                }
                .editor-toolbar button:hover {
                    background: rgba(255,255,255,0.25);
                }
                .flow-canvas {
                    flex: 1;
                    background: #fafafa;
                }
                .editor-legend {
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    padding: 12px 16px;
                    background: white;
                    border-top: 1px solid #ddd;
                    font-size: 12px;
                    color: #666;
                }
                .legend-dot {
                    display: inline-block;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    margin-right: 6px;
                }
                .legend-dot.green { background: #00a276; }
                .legend-dot.red { background: #dc3545; }
                .legend-dot.gray { background: #6c757d; }
                .legend-dot.yellow { background: #fecb00; }
            `}</style>
        </div>
    );
}

// --- Main Flow Builder Component ---
export default function FlowBuilder({ user, addToast }) {
    const [flows, setFlows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingFlow, setEditingFlow] = useState(null);
    const [showEditor, setShowEditor] = useState(false);

    const fetchFlows = useCallback(async () => {
        if (!user?.id) return;
        try {
            const res = await fetch(`/api/flows/${user.id}`);
            if (res.ok) {
                const data = await res.json();
                setFlows(data);
            }
        } catch (err) {
            console.error('Error fetching flows:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        fetchFlows();
    }, [fetchFlows]);

    const handleCreate = () => {
        setEditingFlow(null);
        setShowEditor(true);
    };

    const handleEdit = (flow) => {
        setEditingFlow(flow);
        setShowEditor(true);
    };

    const handleDelete = async (flowId) => {
        if (!confirm('Tem certeza que deseja excluir este fluxo?')) return;

        try {
            const res = await fetch(`/api/flows/${user.id}/${flowId}`, { method: 'DELETE' });
            if (res.ok) {
                addToast('Fluxo excluído!', 'success');
                fetchFlows();
            } else {
                addToast('Erro ao excluir.', 'error');
            }
        } catch (err) {
            addToast('Erro de conexão.', 'error');
        }
    };

    const handleSaveComplete = () => {
        setShowEditor(false);
        setEditingFlow(null);
        fetchFlows();
    };

    const handleStartFlow = async (flowId) => {
        const phones = prompt('Digite os telefones separados por vírgula (ex: 11999999999, 21888888888):');
        if (!phones) return;

        const phoneList = phones.split(',').map(p => p.trim()).filter(p => p);
        if (phoneList.length === 0) return;

        try {
            const res = await fetch(`/api/flows/${flowId}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phones: phoneList })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                addToast(`Fluxo iniciado para ${data.count} contatos!`, 'success');
            } else {
                addToast(data.error || 'Erro ao iniciar.', 'error');
            }
        } catch (err) {
            addToast('Erro de conexão.', 'error');
        }
    };

    if (showEditor) {
        return (
            <ReactFlowProvider>
                <FlowEditor
                    flow={editingFlow}
                    onSave={handleSaveComplete}
                    onBack={() => setShowEditor(false)}
                    userId={user.id}
                    addToast={addToast}
                />
            </ReactFlowProvider>
        );
    }

    return (
        <div className="flows-page">
            <div className="flows-header">
                <h2>Fluxos de Conversa</h2>
                <button className="btn-primary" onClick={handleCreate}>
                    <Plus size={18} /> Novo Fluxo
                </button>
            </div>

            {loading ? (
                <div className="loading-state">Carregando fluxos...</div>
            ) : flows.length === 0 ? (
                <div className="empty-state">
                    <MessageSquare size={48} strokeWidth={1} />
                    <h3>Nenhum fluxo criado</h3>
                    <p>Crie seu primeiro fluxo de conversa para automatizar interações no WhatsApp.</p>
                    <button className="btn-primary" onClick={handleCreate}>
                        <Plus size={18} /> Criar Fluxo
                    </button>
                </div>
            ) : (
                <div className="flows-grid">
                    {flows.map(flow => (
                        <div key={flow.id} className="flow-card card ambev-flag">
                            <div className="flow-card-header">
                                <h3>{flow.name}</h3>
                                <span className="flow-date">
                                    {new Date(flow.updatedAt).toLocaleDateString('pt-BR')}
                                </span>
                            </div>
                            <div className="flow-card-body">
                                <p>{JSON.parse(flow.nodes || '[]').length} nós</p>
                            </div>
                            <div className="flow-card-actions">
                                <button className="btn-action edit" onClick={() => handleEdit(flow)} title="Editar">
                                    <Edit3 size={16} />
                                </button>
                                <button className="btn-action play" onClick={() => handleStartFlow(flow.id)} title="Executar">
                                    <Play size={16} />
                                </button>
                                <button className="btn-action delete" onClick={() => handleDelete(flow.id)} title="Excluir">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
                .flows-page {
                    padding: 24px;
                }
                .flows-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                }
                .flows-header h2 {
                    margin: 0;
                    color: #280091;
                }
                .empty-state {
                    text-align: center;
                    padding: 60px 20px;
                    color: #666;
                }
                .empty-state h3 {
                    margin: 16px 0 8px;
                    color: #333;
                }
                .empty-state p {
                    margin-bottom: 24px;
                    max-width: 400px;
                    margin-left: auto;
                    margin-right: auto;
                }
                .loading-state {
                    text-align: center;
                    padding: 40px;
                    color: #666;
                }
                .flows-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 20px;
                }
                .flow-card {
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .flow-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
                }
                .flow-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 12px;
                }
                .flow-card-header h3 {
                    margin: 0;
                    font-size: 16px;
                    color: #280091;
                }
                .flow-date {
                    font-size: 12px;
                    color: #999;
                }
                .flow-card-body {
                    margin-bottom: 16px;
                    color: #666;
                    font-size: 14px;
                }
                .flow-card-actions {
                    display: flex;
                    gap: 8px;
                }
                .btn-action {
                    padding: 8px 12px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 13px;
                    transition: all 0.2s;
                }
                .btn-action.edit {
                    background: #280091;
                    color: white;
                }
                .btn-action.play {
                    background: #00a276;
                    color: white;
                }
                .btn-action.delete {
                    background: #dc3545;
                    color: white;
                }
                .btn-action:hover {
                    opacity: 0.9;
                    transform: scale(1.05);
                }
            `}</style>
        </div>
    );
}
