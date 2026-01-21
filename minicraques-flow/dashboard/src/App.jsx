import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutGrid, Users, MessageSquare, Mail, Settings } from 'lucide-react';
import Leads from './pages/Leads';
import Flows from './pages/Flows';
import Emails from './pages/Emails';
import Settings from './pages/Settings';
import './App.css';

function App() {
  return (
    <Router>
      <div className="dashboard-layout">
        <aside className="sidebar">
          <div className="logo">
            <span role="img" aria-label="ball">⚽</span> MiniCraques
          </div>
          <nav>
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <LayoutGrid size={20} /> Dashboard
            </NavLink>
            <NavLink to="/leads" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Users size={20} /> Leads (CSV/XLS)
            </NavLink>
            <NavLink to="/flows" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MessageSquare size={20} /> Fluxos Zap
            </NavLink>
            <NavLink to="/emails" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Mail size={20} /> Campanhas Email
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Settings size={20} /> Configurações
            </NavLink>
          </nav>

          <div style={{ marginTop: 'auto', padding: '10px', fontSize: '0.8rem', opacity: 0.5 }}>
            v1.0.0 | Admin: Felipe
          </div>
        </aside>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/flows" element={<Flows />} />
            <Route path="/emails" element={<Emails />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

function Home() {
  return (
    <div>
      <h1>Bem-vindo, Felipe! ⚽</h1>
      <p style={{ color: '#666' }}>Aqui está o resumo da sua loja MiniCraques.com</p>

      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-value">12.450</div>
          <div className="stat-label">Leads Totais</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">850</div>
          <div className="stat-label">Conversas Ativas</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">92%</div>
          <div className="stat-label">Taxa de Resposta</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">R$ 15k+</div>
          <div className="stat-label">Recuperado (Mês)</div>
        </div>
      </div>

      <div className="card">
        <h3>Próximos Disparos</h3>
        <p>A temporada 26/27 está em alta! Prepare sua lista de leads para o próximo fluxo.</p>
        <NavLink to="/leads" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          Iniciar Nova Campanha
        </NavLink>
      </div>
    </div>
  );
}

export default App;
