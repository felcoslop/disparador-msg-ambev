# tiZAP! - Gerenciador de WhatsApp Business

Plataforma profissional para automação de mensagens via WhatsApp Meta Business API.

## 🚀 Principais Funcionalidades

- **Integração Nativa Meta API**: Envio oficial de mensagens via templates aprovados.
- **Disparos em Massa**: Automação de notificações com mapeamento dinâmico de variáveis (XLSX/CSV).
- **Flow Builder Visual**: Construtor de fluxos conversacionais interativos (React Flow).
- **Chat em Tempo Real**: Interface unificada para atendimento e respostas rápidas via WebSockets.
- **Gestão de Webhooks**: Sistema robusto para recebimento de mensagens e mídias.
- **Arquitetura Modular**: Backend organizado por rotas, serviços e middlewares para fácil manutenção.

## 🛠️ Stack Tecnológica

- **Frontend**: React (Vite), ReactFlow, Framer Motion, Lucide Icons.
- **Backend**: Node.js, Express (Arquitetura Modular).
- **Banco de Dados**: SQLite com Prisma ORM.
- **Comunicação**: WebSockets (WS), REST API.
- **Deploy**: Docker (Multi-stage build).

## 📂 Estrutura do Projeto

```text
/
├── server/             # Backend Modular
│   ├── config/         # Configurações (Email, Constantes)
│   ├── middleware/     # Middlewares (Auth, Logger)
│   ├── routes/         # Rotas da API (Auth, Flows, Msg, etc)
│   ├── services/       # Lógica de Negócio (WhatsApp, FlowEngine, Dispatch)
│   └── index.js        # Ponto de entrada do servidor
├── src/                # Frontend React
├── prisma/             # Schema e Migrações do Banco
└── public/             # Assets Estáticos
```

## ⚙️ Pré-requisitos

- Node.js (v20+)
- Conta de Desenvolvedor na Meta (Facebook)
- App configurado para WhatsApp Business API

## 🚀 Instalação e Uso

1. **Clone o repositório e instale as dependências:**
   ```bash
   npm install
   ```

2. **Configure as variáveis de ambiente (.env):**
   ```env
   PORT=3000
   EMAIL_USER=seu-email@gmail.com
   EMAIL_PASS=sua-senha-app-google
   JWT_SECRET=chave-secreta-segura
   ```

3. **Inicie o projeto (Desenvolvimento):**
   ```bash
   # Terminal 1: Backend + Prisma
   npm start

   # Terminal 2: Frontend
   npm run dev
   ```

## 🐳 Deploy com Docker

O projeto está pronto para deploy em ambientes como Easypanel, Coolify ou VPS pura:

```bash
docker build -t tizap .
docker run -p 3000:3000 -v tizap_data:/data tizap
```

## 📘 Guias Adicionais

- [Guia de Webhooks](./WEBHOOK_GUIDE.md) - Como configurar a recepção de mensagens.
- [Guia de Templates](./WHATSAPP_TEMPLATE_GUIDE.md) - Criando modelos no painel da Meta.

---
Desenvolvido com ❤️ para a equipe de Logística Ambev.
