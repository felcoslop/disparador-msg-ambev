# Guia de Configuração - MiniCraques Flow System

## 🚀 Sistema Rodando

- **Backend API**: http://localhost:3001
- **Dashboard**: http://192.168.18.244:5175 (acessível do celular na mesma rede)

---

## 📋 Pré-requisitos

### 1. Meta Business API (WhatsApp)
Acesse: https://developers.facebook.com/apps

1. Crie um App Business
2. Adicione o produto "WhatsApp"
3. Copie:
   - **Access Token** (WA_TOKEN)
   - **Phone Number ID** (WA_PHONE_ID)

### 2. Gmail App Password
Acesse: https://myaccount.google.com/apppasswords

1. Gere uma senha de app para "Mail"
2. Copie a senha de 16 caracteres

---

## ⚙️ Configuração (.env)

Edite o arquivo `minicraques-flow/.env`:

```env
WA_TOKEN=EAAxxxxxxxxxxxx
WA_PHONE_ID=123456789012345
WA_VERIFY_TOKEN=minicraques_verify_123
GMAIL_USER=felipecostalopes44@gmail.com
GMAIL_PASS=xxxx xxxx xxxx xxxx
PORT=3001
```

---

## 🔗 Webhook (Meta Developers)

### Expor o servidor localmente com ngrok:
```bash
ngrok http 3001
```

### Configurar no Meta:
1. Vá em **WhatsApp > Configuration**
2. Clique em "Edit" no Webhook
3. Preencha:
   - **Callback URL**: `https://seu-id.ngrok.io/webhook`
   - **Verify Token**: `minicraques_verify_123`
4. Inscreva-se em: `messages`

---

## 📊 Fluxo de Mensagens (Interactive)

### Estado 0 - Inicial (Botões)
```
Olá {nome} do bairro {bairro}! 👋
Sou o Felipe da MiniCraques.com ⚽

Quer ver os lançamentos da temporada 26/27?

[✅ Sim, me mostre!] [❌ Sair]
```

### Estado 2 - Catálogo (Botões)
```
Posso te mostrar meus conjuntos temporada 26/27?

[🇪🇺 Europeus] [🇧🇷 Brasileiros] [🧥 Frio]
```

### Estado 3 - Opções (Lista)
```
Gostou? Veja outras opções:

[Ver Opções ▼]
  🧥 Agasalhos
  🇧🇷 Times Brasileiros
  🇪🇺 Times Europeus
  💬 Falar com Felipe
  ❌ Sair do Fluxo
```

---

## 📤 Como Disparar Campanha

### 1. Upload de Leads (CSV/XLS)
Crie um arquivo com as colunas:
```csv
phone,nome_pessoa,nome_bairro,email
5531999990000,João Silva,Centro,joao@email.com
```

### 2. No Dashboard
1. Acesse **Leads**
2. Clique em "Selecionar Arquivo"
3. Escolha seu CSV/XLS
4. Clique em "Importar Agora"

### 3. Iniciar Disparo
1. Selecione os leads
2. Clique em "Disparar p/ Selecionados"
3. O sistema enviará:
   - WhatsApp com botões interativos
   - Email promocional (se tiver email cadastrado)

---

## 🎯 Recursos Implementados

✅ **Mensagens Interativas** (Botões e Listas nativas do WhatsApp)  
✅ **State Machine** (5 estados de conversa)  
✅ **Follow-ups Automáticos** (24h via cron)  
✅ **Email Marketing** (HTML responsivo com cupons reais)  
✅ **Dashboard React** (Upload CSV, visualização de fluxos)  
✅ **SQLite** (Persistência de leads e conversas)  
✅ **Botão "Sair"** em todas as etapas  

---

## 🛠️ Comandos Úteis

### Iniciar Backend
```bash
cd minicraques-flow
node server/server.js
```

### Iniciar Dashboard
```bash
cd minicraques-flow/dashboard
npm run dev -- --host
```

### Ver Logs do Banco
```bash
sqlite3 server/minicraques.sqlite
.tables
SELECT * FROM conversations;
```

---

## 📞 Suporte

**WhatsApp**: +55 31 7320-0750  
**Email**: felipecostalopes44@gmail.com

---

*Sistema desenvolvido com WhatsApp Business Cloud API oficial*
