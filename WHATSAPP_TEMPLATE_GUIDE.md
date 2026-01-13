# Guia: Criando o Template no Meta WhatsApp API (Versão Reagendamento)

Para que o sistema Ambev funcione corretamente com a nova lógica de reagendamento, siga estas instruções.

## 1. Acesse o Gerenciador do WhatsApp
Vá para [business.facebook.com](https://business.facebook.com) -> Configurações do Negócio -> Contas do WhatsApp -> Gerenciador do WhatsApp -> Modelos de Mensagem.

## 2. Criar Novo Modelo
- **Nome**: `reagendamento_entrega_ambev`
- **Categoria**: Utilidade.
- **Idioma**: Português (Brasil) - `pt_BR`.

## 3. Estrutura do Conteúdo (Corpo / Body)

Copie e cole o texto abaixo no campo **Corpo**:

```text
Olá, {{1}}.

Informamos que, devido a um imprevisto logístico, o pedido {{2}} não será entregue {{3}}.
A entrega foi reagendada e será realizada {{4}}.

Agradecemos a compreensão e seguimos à disposição.
```

### Variáveis (Amostras):
Ao solicitar aprovação, use os seguintes exemplos:
1. `MERCADO CENTRAL` (Nome do Cliente)
2. `987654` (Código do Pedido)
3. `hoje` (Data Antiga - o sistema enviará "hoje" ou "no dia DD/MM")
4. `amanhã` (Data Nova - o sistema enviará "amanhã" ou "no dia DD/MM")

## 4. Lógica Inteligente de Datas
O sistema possui uma lógica interna para tornar a mensagem mais humana:
- Se a data informada no dashboard for o dia atual, o sistema enviará a palavra **"hoje"**.
- Se a data informada for o dia seguinte, o sistema enviará a palavra **"amanhã"**.
- Caso contrário, o sistema enviará o texto **"no dia DD/MM"**.

Isso evita que o cliente receba uma mensagem redundante como "não será entregue no dia 12/01" quando o dia é hoje.

## 5. Submissão
Clique em **Enviar** para análise da Meta. Assim que aprovado, insira o nome do modelo no campo correspondente no Dashboard Ambev.
