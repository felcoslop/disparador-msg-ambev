import React, { useState, useCallback, useEffect } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    applyNodeChanges,
    applyEdgeChanges,
    addEdge,
    Handle,
    Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Save, Plus, Zap, Image as ImageIcon, List, Trash2, Upload } from 'lucide-react';
import axios from 'axios';

// --- CUSTOM NODES ---

const TemplateNode = ({ data, id }) => {
    return (
        <div className="card" style={{ minWidth: '250px', border: '2px solid #007bff', padding: '15px' }}>
            <Handle type="target" position={Position.Top} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <Zap size={18} color="#007bff" />
                <strong>Template Whatsapp</strong>
            </div>
            <label style={{ fontSize: '0.8rem', opacity: 0.7 }}>Nome do Template:</label>
            <input
                type="text"
                defaultValue={data.templateName}
                onChange={(e) => data.onChange(id, 'templateName', e.target.value)}
                style={{ width: '100%', padding: '5px', borderRadius: '4px', border: '1px solid #ddd', marginTop: '5px' }}
                placeholder="ex: boas_vindas_v1"
            />
            <div style={{ marginTop: '15px' }}>
                <label style={{ fontSize: '0.8rem', opacity: 0.7 }}>Botões de Opção:</label>
                {(data.options || []).map((opt, idx) => (
                    <div key={idx} style={{ marginTop: '5px', background: '#f8f9fa', padding: '5px', borderRadius: '4px', fontSize: '0.8rem' }}>
                        {opt}
                    </div>
                ))}
            </div>
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
};

const ImageNode = ({ data, id }) => {
    const [uploading, setUploading] = useState(false);

    const onFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post('/api/upload-media', formData);
            data.onChange(id, 'imageUrl', res.data.url);
        } catch (err) {
            console.error(err);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="card" style={{ minWidth: '250px', border: '2px solid #28a745', padding: '15px' }}>
            <Handle type="target" position={Position.Top} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <ImageIcon size={18} color="#28a745" />
                <strong>Mensagem de Imagem</strong>
            </div>

            {data.imageUrl ? (
                <img src={data.imageUrl} style={{ width: '100%', borderRadius: '4px', marginBottom: '10px' }} alt="Preview" />
            ) : (
                <div style={{ width: '100%', height: '80px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', borderRadius: '4px' }}>
                    <ImageIcon opacity={0.3} />
                </div>
            )}

            <label className="btn btn-secondary w-full" style={{ fontSize: '0.8rem', cursor: 'pointer', textAlign: 'center' }}>
                <Upload size={14} /> {uploading ? 'Subindo...' : 'Subir PNG'}
                <input type="file" hidden onChange={onFileChange} accept="image/png,image/jpeg" />
            </label>

            <div style={{ marginTop: '15px' }}>
                <label style={{ fontSize: '0.8rem', opacity: 0.7 }}>Legenda:</label>
                <input
                    type="text"
                    defaultValue={data.caption}
                    onChange={(e) => data.onChange(id, 'caption', e.target.value)}
                    style={{ width: '100%', padding: '5px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
            </div>
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
};

const SelectionNode = ({ data, id }) => {
    const [newOpt, setNewOpt] = useState('');

    const addOpt = () => {
        if (!newOpt) return;
        const current = data.options || [];
        data.onChange(id, 'options', [...current, newOpt]);
        setNewOpt('');
    };

    return (
        <div className="card" style={{ minWidth: '250px', border: '2px solid #FF6B00', padding: '15px' }}>
            <Handle type="target" position={Position.Top} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <List size={18} color="#FF6B00" />
                <strong>Seletor de Opções</strong>
            </div>

            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                <input
                    type="text"
                    value={newOpt}
                    onChange={(e) => setNewOpt(e.target.value)}
                    style={{ flex: 1, padding: '5px', borderRadius: '4px', border: '1px solid #ddd' }}
                    placeholder="Opção..."
                />
                <button className="btn btn-primary" onClick={addOpt} style={{ padding: '5px 10px' }}>+</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {(data.options || []).map((opt, idx) => (
                    <div key={idx} style={{ background: '#fff5ec', border: '1px solid #FF6B0044', padding: '8px', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                        {opt}
                        <Trash2 size={12} style={{ cursor: 'pointer', color: '#dc3545' }} onClick={() => data.onChange(id, 'options', data.options.filter((_, i) => i !== idx))} />
                    </div>
                ))}
            </div>
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
};

const nodeTypes = {
    template: TemplateNode,
    image: ImageNode,
    selection: SelectionNode,
};

// --- MAIN COMPONENT ---

function Flows() {
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [loading, setLoading] = useState(true);

    const onNodesChange = useCallback(
        (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
        []
    );
    const onEdgesChange = useCallback(
        (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        []
    );
    const onConnect = useCallback(
        (params) => setEdges((eds) => addEdge(params, eds)),
        []
    );

    const updateNodeData = (nodeId, key, value) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === nodeId) {
                    return { ...node, data: { ...node.data, [key]: value } };
                }
                return node;
            })
        );
    };

    useEffect(() => {
        const fetchFlow = async () => {
            try {
                const res = await axios.get('/api/flow-config');
                if (res.data.nodes) {
                    const nds = res.data.nodes.map(n => ({ ...n, data: { ...n.data, onChange: updateNodeData } }));
                    setNodes(nds);
                    setEdges(res.data.edges || []);
                }
            } catch (err) {
                console.error('Failed to fetch flow:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchFlow();
    }, []);

    const addNode = (type) => {
        const newNode = {
            id: `${type}-${Date.now()}`,
            type: type,
            position: { x: Math.random() * 400, y: Math.random() * 400 },
            data: {
                onChange: updateNodeData,
                templateName: '',
                imageUrl: '',
                caption: '',
                options: []
            },
        };
        setNodes((nds) => nds.concat(newNode));
    };

    const onSave = async () => {
        try {
            await axios.post('/api/flow-config', { nodes, edges });
            alert('Fluxo salvo com sucesso! 🚀');
        } catch (err) {
            console.error(err);
            alert('Erro ao salvar fluxo.');
        }
    };

    if (loading) return <div>Carregando editor...</div>;

    return (
        <div style={{ height: 'calc(100vh - 150px)', width: '100%', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 5, display: 'flex', gap: '10px' }}>
                <button className="btn btn-secondary" onClick={() => addNode('template')}><Plus size={16} /> WhatsApp Template</button>
                <button className="btn btn-secondary" onClick={() => addNode('image')}><Plus size={16} /> Imagem PNG</button>
                <button className="btn btn-secondary" onClick={() => addNode('selection')}><Plus size={16} /> Seletor Opções</button>
                <button className="btn btn-primary" onClick={onSave}><Save size={16} /> Salvar Fluxo</button>
            </div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
            >
                <Background />
                <Controls />
            </ReactFlow>
        </div>
    );
}

export default Flows;
