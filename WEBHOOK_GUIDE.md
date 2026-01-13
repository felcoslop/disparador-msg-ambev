# Guia: Recebendo Mensagens via Webhook (Meta API)

Para que a aba **Recebidas** funcione em tempo real, você precisa configurar um **Webhook** no seu aplicativo da Meta.

## ⚠️ O Desafio Técnico
O sistema atual é um **Frontend (React)**. Navegadores não podem receber mensagens diretamente da Meta por razões de segurança e arquitetura.

Para resolver isso, você tem duas opções principais:

---

### Opção 1: Usar o Easypanel com um "Proxy" (Recomendado)
Você pode criar um pequeno serviço (Backend) no Easypanel (usando Node.js ou Python) que recebe a mensagem da Meta e a "empurra" para o seu sistema.

**Passos na Meta:**
1. Vá em **WhatsApp > Configuração de Webhook**.
2. Cole a URL do seu serviço (ex: `https://seu-app.easypanel.host/webhook`).
3. Em **Webhook Fields**, marque a opção `messages`.

---

### Opção 2: Integração com Plataformas No-Code (n8n / Make)
Se você usa **n8n** ou **Make.com**, você pode:
1. Receber o Webhook da Meta neles.
2. Salvar em um Banco de Dados ou enviar direto para uma API que este sistema possa ler.

---

### Estrutura que o sistema espera
Para que as mensagens apareçam na aba, elas devem ser salvas no `localStorage` sob a chave `ambev_received_messages` no seguinte formato:

```json
[
  {
    "from": "5511999999999",
    "text": "Mensagem do cliente",
    "timestamp": "12/01/2026 18:30:00"
  }
]
```

---

### Como testar agora?
Eu adicionei **mensagens de exemplo** para você visualizar como a interface se comporta. Basta clicar na aba **Recebidas** no menu lateral. 

Você também verá um botão **"Ligar para Cliente"** que abre automaticamente o discador do seu celular ou computador com o número dele! 📞
