# Guia: Configuração de Webhook no Meta (WhatsApp)

Este guia explica como configurar o Webhook no Painel da Meta para que o sistema receba mensagens em tempo real na aba **Recebidas**.

## 1. Localização no Painel da Meta
1. Acesse o [Meta for Developers](https://developers.facebook.com/).
2. Selecione o seu App da Ambev/Disparador.
3. No menu lateral, expanda **WhatsApp** e clique em **Configuração**.

## 2. Configurando o Webhook
Localize a seção **Webhooks** e clique em **Editar/Configurar**:

- **URL de retorno (Callback URL):** 
  `https://seu-dominio.com/webhook/SEU_USER_ID`
  *(Substitua SEU_USER_ID pelo seu ID exibido no sistema)*
- **Token de verificação:** 
  `ambev_webhook_token_2026` 
  *(Este token deve ser o mesmo configurado no backend)*

> [!IMPORTANT]
> Certifique-se de salvar estas configurações. Após salvar, o Meta fará uma verificação automática no seu backend.

## 3. Selecionando Campos (Subscriptions)
Abaixo da URL que você acabou de configurar, clique em **Gerenciar**:
1. Procure pelo campo `messages`.
2. Clique em **Assinar (Subscribe)**.
3. Se desejar saber quando uma mensagem foi lida ou entregue, assine também o campo `message_status`.

## 4. Obtendo o Token de Acesso Permanente
Para enviar respostas pela aba Recebidas, o sistema precisa de um Token de Acesso do Sistema:
1. Vá em **Configurações do Negócio** (Business Settings).
2. Em **Usuários do Sistema**, crie um usuário ou selecione um existente.
3. Clique em **Gerar Novo Token**.
4. Selecione o App correto e marque as permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Copie e cole este token na aba **Configurações** do seu sistema.

---

## Como o backend processa isso?
Agora o sistema possui um endpoint real no `server.js` que:
1. Valida a conexão com a Meta.
2. Recebe a mensagem JSON.
3. Extrai o nome, número e texto.
4. Salva no banco de dados local (`database.sqlite`).
5. Notifica o frontend (que atualiza a aba automaticamente).

---

### Testando a conexão
Após configurar no Meta, envie um "Olá" para o número do WhatsApp Business. Em poucos segundos, a mensagem deve aparecer na aba **Recebidas** do seu dashboard.
