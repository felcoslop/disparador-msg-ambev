# 📱 Templates de Mensagens do WhatsApp - Village Liberdade

Este documento contém todos os modelos de mensagens que devem ser enviados para **aprovação no Meta Business Suite** para uso com a API oficial do WhatsApp Business.

---

## 📦 Como Criar Templates no Meta

1. Acesse: https://business.facebook.com/latest/whatsapp_manager/message_templates
2. Clique em **"Criar modelo"**
3. Para cada template abaixo:
   - **Categoria**: UTILITY (para notificações de serviço)
   - **Nome**: Use o nome indicado (em inglês, sem espaços, snake_case)
   - **Idioma**: Português (Brasil) - pt_BR
   - **Corpo**: Copie o texto do corpo
   - **Variáveis**: Configure conforme indicado ({{1}}, {{2}}, etc.)

---

## 📋 TEMPLATE 1: Chegada de Encomenda
**Nome do Template**: `package_arrival`  
**Categoria**: UTILITY  
**Idioma**: pt_BR  

> [!NOTE]
> **Variáveis Nomeadas vs. Numeradas**
> 
> A API do WhatsApp Meta aceita **AMBOS** os formatos:
> - **Variáveis nomeadas** (recomendado): `{{nome_morador}}`, `{{codigo_rastreamento}}` - mais descritivas e claras
> - **Variáveis numeradas**: `{{1}}`, `{{2}}` - formato tradicional
> 
> Este template usa **variáveis nomeadas** para maior clareza.

### Corpo da Mensagem:
```
Prezado(a) {{nome_morador}}, uma encomenda ({{codigo_rastreament}}) chegou e está disponível para retirada na portaria do Village Liberdade. (NÃO RESPONDA ESTA MENSAGEM)
```

### Variáveis:
| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| {{nome_morador}} | Nome do morador | JOÃO SILVA |
| {{codigo_rastreament}} | Código de rastreio | BR123456789 |

### Exemplo Preenchido:
```
Prezado(a) JOÃO SILVA, uma encomenda (BR123456789) chegou e está disponível para retirada na portaria do Village Liberdade. (NÃO RESPONDA ESTA MENSAGEM)
```

---

## 📋 TEMPLATE 2: Confirmação de Retirada
**Nome do Template**: `package_collected`  
**Categoria**: UTILITY  
**Idioma**: pt_BR  

### Corpo da Mensagem:
```
Prezado(a) {{nome_morador}},

A portaria do condomínio registra a retirada bem-sucedida da encomenda {{codigo_rastreamento}}.

Data e horário: {{data_hora_retirada}}.

Em caso de dúvidas, contate a portaria.
(NÃO RESPONDA ESTA MENSAGEM)
```

### Variáveis:
| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| {{nome_morador}} | Nome do morador | MARIA SANTOS |
| {{codigo_rastreamento}} | Código de rastreio | BR987654321 |
| {{data_hora_retirada}} | Data/hora da retirada | 04/01/2026 às 14:30 |

### Exemplo Preenchido:
```
Prezado(a) MARIA SANTOS,

A portaria do condomínio registra a retirada bem-sucedida da encomenda BR987654321.

Data e horário: 04/01/2026 às 14:30.

Em caso de dúvidas, contate a portaria.
(NÃO RESPONDA ESTA MENSAGEM)
```

---

## 📋 TEMPLATE 3: Lembrete de Retirada (7+ dias)
**Nome do Template**: `package_reminder`  
**Categoria**: UTILITY  
**Idioma**: pt_BR  

### Corpo da Mensagem:
```
LEMBRETE: Prezado(a) {{nome_morador}}, sua encomenda ({{codigo_rastreament}}) está aguardando retirada na portaria do Village Liberdade há mais de 7 dias. (NÃO RESPONDA ESTA MENSAGEM)
```

### Variáveis:
| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| {{nome_morador}} | Nome do morador | PEDRO COSTA |
| {{codigo_rastreament}} | Código de rastreio | BR111222333 |

### Exemplo Preenchido:
```
LEMBRETE: Prezado(a) PEDRO COSTA, sua encomenda (BR111222333) está aguardando retirada na portaria do Village Liberdade há mais de 7 dias. (NÃO RESPONDA ESTA MENSAGEM)
```

---

## 📋 TEMPLATE 4: Reserva de Quadra
**Nome do Template**: `reservation_court`  
**Categoria**: UTILITY  
**Idioma**: pt_BR  

### Corpo da Mensagem:
```
🏠 CONFIRMAÇÃO DE RESERVA - VILLAGE LIBERDADE

✅ QUADRA reservada com sucesso!

📅 Data: {{data}}
⏰ Horário: {{horario_inicio}} - {{horario_fim}}
👤 Responsável: {{nome_morador}}
🏢 Bloco/Apto: {{bloco}}/{{apartamento}}
👥 Visitantes: {{visitantes}}
🚪 Porteiro: {{porteiro}}

Sua reserva foi confirmada!
Não responda esta mensagem
```

### Variáveis:
| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| {{data}} | Data | 05/01/2026 |
| {{horario_inicio}} | Horário início | 14:00 |
| {{horario_fim}} | Horário fim | 16:00 |
| {{nome_morador}} | Nome do morador | JOSÉ OLIVEIRA |
| {{bloco}} | Bloco | A |
| {{apartamento}} | Apartamento | 101 |
| {{visitantes}} | Quantidade de visitantes | 5 |
| {{porteiro}} | Nome do porteiro | CARLOS |

---

## 📋 TEMPLATE 5: Reserva de Piscina
**Nome do Template**: `reservation_pool`  
**Categoria**: UTILITY  
**Idioma**: pt_BR  

### Corpo da Mensagem:
```
🏠 CONFIRMAÇÃO DE RESERVA - VILLAGE LIBERDADE

✅ PISCINA reservada com sucesso!

📅 Data: {{data}}
👤 Responsável: {{nome_morador}}
🏢 Bloco/Apto: {{bloco}}/{{apartamento}}
👥 Visitantes: {{visitantes}}
🚪 Porteiro: {{porteiro}}

Sua reserva foi confirmada!
Não responda esta mensagem
```

### Variáveis:
| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| {{data}} | Data | 06/01/2026 |
| {{nome_morador}} | Nome do morador | ANA LIMA |
| {{bloco}} | Bloco | B |
| {{apartamento}} | Apartamento | 202 |
| {{visitantes}} | Quantidade de visitantes | 3 |
| {{porteiro}} | Nome do porteiro | MARCOS |

---

## 📋 TEMPLATE 6: Reserva de Churrasqueira
**Nome do Template**: `reservation_bbq`  
**Categoria**: UTILITY  
**Idioma**: pt_BR  

### Corpo da Mensagem:
```
🏠 CONFIRMAÇÃO DE RESERVA - VILLAGE LIBERDADE

✅ ÁREA DE CHURRASCO reservada com sucesso!

📅 Data: {{data}}
👤 Responsável: {{nome_morador}}
🏢 Bloco/Apto: {{bloco}}/{{apartamento}}
💰 Pagamento: {{pagamento}}
🚪 Porteiro: {{porteiro}}

Sua reserva foi confirmada!
Não responda esta mensagem
```

### Variáveis:
| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| {{data}} | Data | 07/01/2026 |
| {{nome_morador}} | Nome do morador | FERNANDA SOUZA |
| {{bloco}} | Bloco | C |
| {{apartamento}} | Apartamento | 303 |
| {{pagamento}} | Status do pagamento | PAGO |
| {{porteiro}} | Nome do porteiro | ROBERTO |

---

## 📋 TEMPLATE 7: Reserva de Garagem (Diária)
**Nome do Template**: `reservation_parking`  
**Categoria**: UTILITY  
**Idioma**: pt_BR  

### Corpo da Mensagem:
```
🏠 CONFIRMAÇÃO DE RESERVA - VILLAGE LIBERDADE

✅ VAGA DE GARAGEM reservada com sucesso!

📅 Data: {{data}}
🚗 Vaga: {{vaga}}
👤 Responsável: {{nome_morador}}
🏢 Bloco/Apto: {{bloco}}/{{apartamento}}
💰 Pagamento: {{pagamento}}
🚪 Porteiro: {{porteiro}}

Sua reserva foi confirmada!
Não responda esta mensagem
```

### Variáveis:
| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| {{data}} | Data | 08/01/2026 |
| {{vaga}} | Número da vaga | 15 |
| {{nome_morador}} | Nome do morador | LUCAS FERREIRA |
| {{bloco}} | Bloco | D |
| {{apartamento}} | Apartamento | 404 |
| {{pagamento}} | Status do pagamento | PAGO |
| {{porteiro}} | Nome do porteiro | ANTÔNIO |

---

## 📋 TEMPLATE 8: Reserva de Garagem (Mensal)
**Nome do Template**: `reservation_parking_monthly`  
**Categoria**: UTILITY  
**Idioma**: pt_BR  

### Corpo da Mensagem:
```
🏠 CONFIRMAÇÃO DE RESERVA - VILLAGE LIBERDADE

✅ VAGA DE GARAGEM reservada com sucesso!

🚗 Vaga: {{vaga}}
📅 Tipo: LOCAÇÃO MENSAL
👤 Responsável: {{nome_morador}}
🏢 Bloco/Apto: {{bloco}}/{{apartamento}}
💰 Pagamento: {{pagamento}}
🚪 Porteiro: {{porteiro}}

Sua reserva foi confirmada!
Não responda esta mensagem
```

### Variáveis:
| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| {{vaga}} | Número da vaga | 22 |
| {{nome_morador}} | Nome do morador | PATRÍCIA ALMEIDA |
| {{bloco}} | Bloco | E |
| {{apartamento}} | Apartamento | 505 |
| {{pagamento}} | Status do pagamento | PAGO |
| {{porteiro}} | Nome do porteiro | JORGE |

---

## ⚠️ Observações Importantes

1. **Tempo de Aprovação**: O Meta geralmente leva de **24 horas a 7 dias úteis** para aprovar templates.

2. **Rejeições Comuns**:
   - Evite linguagem promocional
   - Não use palavras como "grátis", "promoção", "desconto"
   - Seja claro sobre o remetente (Village Liberdade)

3. **Categoria UTILITY**: Escolha esta categoria pois são mensagens transacionais/de serviço, não marketing.

4. **Após Aprovação**:
   - Anote o **nome exato** do template aprovado
   - Adicione no arquivo `.env` nas variáveis correspondentes
   - Os nomes devem corresponder exatamente ao que foi aprovado

5. **Limitações**:
   - Templates UTILITY não podem ser enviados fora da janela de 24h sem que o cliente tenha iniciado conversa
   - Há limites de mensagens por dia/mês dependendo do seu tier

---

## 🔧 Após Aprovação

Depois que os templates forem aprovados, atualize o arquivo `.env` com os nomes exatos:

```env
TEMPLATE_PACKAGE_ARRIVAL=package_arrival
TEMPLATE_PACKAGE_COLLECTED=package_collected
TEMPLATE_PACKAGE_REMINDER=package_reminder
TEMPLATE_RESERVATION_COURT=reservation_court
TEMPLATE_RESERVATION_POOL=reservation_pool
TEMPLATE_RESERVATION_BBQ=reservation_bbq
TEMPLATE_RESERVATION_PARKING=reservation_parking
TEMPLATE_RESERVATION_PARKING_MONTHLY=reservation_parking_monthly
```

---

## 📞 Suporte

Em caso de dúvidas sobre a aprovação de templates:
- [Documentação Oficial](https://developers.facebook.com/docs/whatsapp/message-templates)
- [Central de Ajuda do WhatsApp Business](https://www.facebook.com/business/help/whatsapp)
