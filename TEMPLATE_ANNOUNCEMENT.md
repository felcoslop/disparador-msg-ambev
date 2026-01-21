# 📄 Configuração de Template de Aviso (PDF) - Meta WhatsApp API

Para conseguir enviar avisos (PDFs) para os moradores em qualquer horário (mesmo fora da janela de 24h), você deve criar um **Template de Documento**.

---

## 🛠️ Passo a Passo no Meta Business Suite

1. Acesse o **Gerenciador do WhatsApp** -> **Modelos de Mensagem**.
2. Clique em **"Criar modelo"**.
3. **Categoria**: Marketing ou Utilidade (recomenda-se **Marketing** para avisos gerais).
4. **Nome**: `aviso_morador` (ou o nome que preferir, anote para colocar no `.env`).
5. **Idioma**: Português (Brasil).

### Estrutura do Modelo:

- **Cabeçalho (Header)**:
  - Selecione: **Mídia** -> **Documento**.
  - No exemplo/amostra, você pode subir qualquer PDF apenas para pré-visualização.

- **Corpo (Body)**:
  - Digite o texto: `Segue um aviso importante para os moradores do Condomínio Village Liberdade: {{1}}`
  - A variável `{{1}}` será preenchida com o texto/legenda que você digitar no sistema.

- **Rodapé (Footer)**: Opcional (ex: *Village Liberdade*).

---

## 🔧 Configuração no Sistema

Após a aprovação do Meta (que costuma ser rápida para este tipo de modelo), adicione ou atualize a seguinte linha no seu arquivo `.env`:

```env
TEMPLATE_ANNOUNCEMENT=aviso_morador
```

---

## 💡 Por que usar Template com Header?

Diferente do envio direto de documento, o Template com Header:
1. **Fura a janela de 24h**: Você pode enviar o aviso mesmo para quem nunca mandou mensagem para o sistema.
2. **PDF Dinâmico**: Você aprova o modelo uma vez, mas o arquivo PDF pode ser diferente a cada envio.
3. **Profissionalismo**: A mensagem chega com uma prévia organizada do documento.
