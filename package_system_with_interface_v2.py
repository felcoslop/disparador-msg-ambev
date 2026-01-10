import pandas as pd
import os
import sys
import re
from datetime import datetime, time
import requests
import tkinter as tk
from tkinter import messagebox, scrolledtext, Toplevel, Entry, Button, Label, ttk
from dotenv import load_dotenv
import base64
import threading
import time as time_module
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import json

# Twilio para SMS (opcional)
try:
    from twilio.rest import Client as TwilioClient
    TWILIO_AVAILABLE = True
except ImportError:
    TWILIO_AVAILABLE = False
    TwilioClient = None

# Tenta importar o tkcalendar, necessário para a nova funcionalidade de reserva.
try:
    from tkcalendar import DateEntry
except ImportError:
    DateEntry = None # Define como None se a biblioteca não estiver instalada.

# --- Carregamento de Variáveis de Ambiente ---
# override=True garante que o arquivo .env sempre tenha prioridade sobre o ambiente do sistema
load_dotenv(override=True)

# --- Diagnóstico de Inicialização ---
print("--- INICIALIZANDO CREDENCIAIS WHATSAPP (METADADO) ---")
wa_token = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
wa_phone_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
wa_waba_id = os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID", "")

def obfuscate(val):
    if not val: return "NÃO CONFIGURADO"
    if len(val) < 10: return "****"
    return f"{val[:5]}...{val[-5:]}"

print(f"TOKEN: {obfuscate(wa_token)}")
print(f"PHONE ID: {obfuscate(wa_phone_id)}")
print(f"WABA ID: {obfuscate(wa_waba_id)}")
print("--------------------------------------------------")

# ==============================================================================
# 1. CONSTANTES E CONFIGURAÇÕES GLOBAIS
# ==============================================================================

# --- Credenciais da API Oficial do WhatsApp (Meta/Facebook) ---
# Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
WHATSAPP_BUSINESS_ACCOUNT_ID = os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID")
WHATSAPP_API_VERSION = "v22.0"  # Versão da API do Meta
WHATSAPP_API_BASE_URL = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}"

# --- Templates de Mensagens (IDs aprovados pelo Meta) ---
TEMPLATE_PACKAGE_ARRIVAL = os.getenv("TEMPLATE_PACKAGE_ARRIVAL", "package_arrival")
TEMPLATE_PACKAGE_COLLECTED = os.getenv("TEMPLATE_PACKAGE_COLLECTED", "package_collected")
TEMPLATE_PACKAGE_REMINDER = os.getenv("TEMPLATE_PACKAGE_REMINDER", "package_reminder")
TEMPLATE_RESERVATION_COURT = os.getenv("TEMPLATE_RESERVATION_COURT", "reservation_court")
TEMPLATE_RESERVATION_POOL = os.getenv("TEMPLATE_RESERVATION_POOL", "reservation_pool")
TEMPLATE_RESERVATION_BBQ = os.getenv("TEMPLATE_RESERVATION_BBQ", "reservation_bbq")
TEMPLATE_RESERVATION_PARKING = os.getenv("TEMPLATE_RESERVATION_PARKING", "reservation_parking")
TEMPLATE_RESERVATION_PARKING_MONTHLY = os.getenv("TEMPLATE_RESERVATION_PARKING_MONTHLY", "reservation_parking_monthly")

# --- Credenciais da API Evolution ANTIGAS (mantidas para referência) ---
# EVOLUTION_API_URL = "https://evolution.felipecosta.me/message/sendText/village-liberdade"
# EVOLUTION_API_DOCUMENT_URL = "https://evolution.felipecosta.me/message/sendDocument/village-liberdade"
# EVOLUTION_INSTANCE_TOKEN = os.getenv("EVOLUTION_INSTANCE_TOKEN")
# EVOLUTION_API_KEY = os.getenv("EVOLUTION_API_KEY")

# --- Nomes de Arquivos ---
RESIDENTS_FILE_NAME = "residents.csv"
PACKAGES_FILE_NAME = "packages.csv"
REMINDER_TIMESTAMP_FILE_NAME = "last_reminder_timestamp.txt"
RESERVATIONS_FILE_NAME = "reservations.csv" # NOVO: Arquivo para reservas

# --- Status das Encomendas ---
STATUS_DELIVERED = "delivered"
STATUS_COLLECTED = "collected"
STATUS_PENDING_REGISTRATION = "pending_registration"
STATUS_NA = "N/A"

# --- Tipos de Reserva (NOVO) ---
AREA_COURT = "quadra"
AREA_POOL = "piscina"
AREA_BBQ = "churrasqueira"
AREA_PARKING = "garagem"  # NOVO: Área de garagem


# --- Configurações de Estilo da Interface ---
FONT_FAMILY = "Arial"
FONT_SIZE_NORMAL = 12
FONT_SIZE_LARGE = 14
FONT_SIZE_SMALL = 10
FONT_HEADER_SIZE = 16
FONT_WEIGHT_NORMAL = "normal"
FONT_WEIGHT_BOLD = "bold"

# --- Senha para acesso à aba de avisos ---
ADMIN_PASSWORD = "MERC1A"

# --- Senha para acesso à aba de disparos ---
DISPATCH_PASSWORD = "MERC1A"

# --- Configurações de Notificação de Falha da API ---
NOTIFICATION_PHONE = "+5531971404776"  # Número para receber SMS quando API cair
NOTIFICATION_EMAIL = "felipecostalopes44@gmail.com"  # Email para receber notificação quando API cair

# --- Configurações de Email ---
EMAIL_USER = os.getenv("EMAIL_USER", "felipecostalopes44@gmail.com")  # Valor padrão

# Detecta automaticamente o servidor SMTP baseado no email
if EMAIL_USER and EMAIL_USER.endswith('@gmail.com'):
    EMAIL_SMTP_SERVER = "smtp.gmail.com"
    EMAIL_SMTP_PORT = 587
else:
    EMAIL_SMTP_SERVER = "smtp.live.com"  # Outlook/Hotmail
    EMAIL_SMTP_PORT = 587

# Tentar ler configurações do arquivo de configuração
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")  # Do .env
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
SECOND_EMAIL_ALERT = os.getenv("SECOND_EMAIL_ALERT")  # Segundo email para alertas

if not EMAIL_PASSWORD or not TWILIO_ACCOUNT_SID:
    try:
        with open("config_notifications.txt", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("EMAIL_PASSWORD=") and not EMAIL_PASSWORD:
                    EMAIL_PASSWORD = line.split("=", 1)[1]
                elif line.startswith("SECOND_EMAIL_ALERT=") and not SECOND_EMAIL_ALERT:
                    SECOND_EMAIL_ALERT = line.split("=", 1)[1]
                elif line.startswith("TWILIO_ACCOUNT_SID=") and not TWILIO_ACCOUNT_SID:
                    TWILIO_ACCOUNT_SID = line.split("=", 1)[1]
                elif line.startswith("TWILIO_AUTH_TOKEN=") and not TWILIO_AUTH_TOKEN:
                    TWILIO_AUTH_TOKEN = line.split("=", 1)[1]
                elif line.startswith("TWILIO_PHONE_NUMBER=") and not TWILIO_PHONE_NUMBER:
                    TWILIO_PHONE_NUMBER = line.split("=", 1)[1]
    except FileNotFoundError:
        print("Arquivo config_notifications.txt não encontrado")
    except Exception as e:
        print(f"Erro ao ler config_notifications.txt: {e}")

# --- Configurações de SMS (TextBelt - BLOQUEADO PARA BRASIL) ---
SMS_API_URL = "https://textbelt.com/text"
SMS_API_KEY = "textbelt"  # Chave gratuita, limitada a 1 SMS por dia

# --- Configurações alternativas de SMS ---
# Para usar Twilio (pago mas confiável):
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")

# --- WhatsApp como alternativa para notificações ---
WHATSAPP_NOTIFICATION_ENABLED = True  # Se True, usa WhatsApp para notificações

# ==============================================================================
# 2. FUNÇÕES AUXILIARES
# ==============================================================================

def resource_path(relative_path):
    """Garante o caminho correto para arquivos, seja em desenvolvimento ou em um executável PyInstaller."""
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# --- Caminhos Absolutos para os Arquivos ---
RESIDENTS_FILE = resource_path(RESIDENTS_FILE_NAME)
PACKAGES_FILE = resource_path(PACKAGES_FILE_NAME)
REMINDER_TIMESTAMP_FILE = resource_path(REMINDER_TIMESTAMP_FILE_NAME)
RESERVATIONS_FILE = resource_path(RESERVATIONS_FILE_NAME) # NOVO
API_STATUS_FILE = resource_path("api_last_status.txt") # Arquivo para armazenar último status da API
PENDING_MESSAGES_FILE = resource_path("pending_messages.json") # Arquivo para mensagens pendentes
LAST_NOTIFICATION_FILE = resource_path("last_api_notification.txt") # Controle de notificações diárias

def send_whatsapp_template(phone, template_name, template_params, output_widget, status_callback=None, message_type='package'):
    """
    Envia uma mensagem via WhatsApp usando a API Oficial do Meta com templates aprovados.
    
    Args:
        phone: Número de telefone do destinatário
        template_name: Nome do template aprovado no Meta
        template_params: Lista de parâmetros para o template [{"type": "text", "text": "valor"}]
        output_widget: Widget para exibir mensagens
        status_callback: Callback para notificar erros

    Returns:
        dict: {
            'success': bool,
            'reason': str,
            'phone': str,
            'message_type': str
        }
    """
    result = {
        'success': False,
        'reason': '',
        'phone': phone,
        'message_type': 'package'
    }

    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        error_msg = "ERRO: CREDENCIAIS DA API WHATSAPP NÃO CONFIGURADAS NO ARQUIVO .ENV"
        output_widget.print_message(error_msg, style="error")
        output_widget.print_message(f"ACCESS TOKEN: {'Configurado' if WHATSAPP_ACCESS_TOKEN else 'NÃO CONFIGURADO'}", style="info")
        output_widget.print_message(f"PHONE NUMBER ID: {'Configurado' if WHATSAPP_PHONE_NUMBER_ID else 'NÃO CONFIGURADO'}", style="info")
        result['reason'] = 'Credenciais não configuradas'
        return result

    # Formata o número de telefone (deve incluir código do país)
    phone_number = phone.replace('+', '').replace(' ', '').replace('-', '')
    
    # Adiciona código do Brasil se não tiver código de país
    if len(phone_number) == 11 or len(phone_number) == 10:
        phone_number = f"55{phone_number}"
    elif not phone_number.startswith('55') and len(phone_number) < 13:
        phone_number = f"55{phone_number}"

    # Validação do número de telefone
    if not phone_number or len(phone_number) < 12:
        error_msg = f"ERRO: NÚMERO DE TELEFONE INVÁLIDO: {phone_number}"
        output_widget.print_message(error_msg, style="error")
        result['reason'] = 'Número de telefone inválido'
        return result

    url = f"{WHATSAPP_API_BASE_URL}/{WHATSAPP_PHONE_NUMBER_ID}/messages"

    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # Payload para envio de template
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone_number,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {
                "code": "pt_BR"
            },
            "components": [
                {
                    "type": "body",
                    "parameters": template_params
                }
            ] if template_params else []
        }
    }

    try:
        output_widget.print_message(f"ENVIANDO WHATSAPP PARA: {phone_number}", style="info")
        response = requests.post(url, json=payload, headers=headers, timeout=30)

        if response.status_code in [200, 201]:
            try:
                response_data = response.json()
                if 'messages' in response_data and len(response_data['messages']) > 0:
                    message_id = response_data['messages'][0].get('id', '')
                    output_widget.print_message(f"STATUS WHATSAPP: MENSAGEM ENVIADA COM SUCESSO! ID: {message_id[:20]}...", style="success")
                    result['success'] = True
                    result['reason'] = 'Mensagem enviada com sucesso'
                    result['message_id'] = message_id
                    return result
                else:
                    output_widget.print_message("STATUS WHATSAPP: MENSAGEM ENVIADA COM SUCESSO!", style="success")
                    result['success'] = True
                    result['reason'] = 'Mensagem enviada com sucesso'
                    return result
            except ValueError:
                output_widget.print_message("STATUS WHATSAPP: MENSAGEM ENVIADA COM SUCESSO!", style="success")
                result['success'] = True
                result['reason'] = 'Mensagem enviada com sucesso'
                return result
        else:
            try:
                error_data = response.json()
                error_info = error_data.get('error', {})
                error_message = error_info.get('message', 'Erro desconhecido')
                error_code = error_info.get('code', 'N/A')
                
                # Erros específicos do Meta
                if error_code == 131030:
                    result['reason'] = 'Número de telefone não registrado no WhatsApp'
                elif error_code == 131051:
                    result['reason'] = 'Template não encontrado ou não aprovado'
                elif error_code == 131047:
                    result['reason'] = 'Limite de mensagens excedido'
                elif error_code == 131031:
                    result['reason'] = 'Conta do WhatsApp Business não verificada'
                elif error_code == 100:
                    result['reason'] = f'Parâmetro inválido: {error_message}'
                elif error_code == 190:
                    result['reason'] = 'Token de acesso inválido ou expirado'
                    if status_callback:
                        status_callback()
                else:
                    result['reason'] = f'Erro {error_code}: {error_message}'
                
                output_widget.print_message(f"ERRO WHATSAPP: {result['reason']}", style="error")
                
                # Captura TODOS os erros para a fila de pendentes (Exceto telefones inválidos/templates inexistentes se desejar filtrar, mas por garantia capturamos tudo)
                add_pending_message(phone, None, result['message_type'], template_name=template_name, template_params=template_params)
                    
            except:
                result['reason'] = f'Erro HTTP {response.status_code}'
                output_widget.print_message(f"ERRO WHATSAPP: {result['reason']}", style="error")
                # Adiciona à fila mesmo em erro de parse
                add_pending_message(phone, None, result['message_type'], template_name=template_name, template_params=template_params)
            
            return result

    except requests.exceptions.Timeout:
        error_msg = "ERRO WHATSAPP: TIMEOUT - A API não respondeu em tempo hábil"
        output_widget.print_message(error_msg, style="error")
        result['reason'] = 'Timeout na conexão com a API'
        if status_callback:
            status_callback()
        add_pending_message(phone, None, result['message_type'], template_name=template_name, template_params=template_params)
        return result
    except requests.exceptions.ConnectionError:
        error_msg = "ERRO WHATSAPP: ERRO DE CONEXÃO - Verifique sua conexão com a internet"
        output_widget.print_message(error_msg, style="error")
        result['reason'] = 'Erro de conexão com a API'
        if status_callback:
            status_callback()
        add_pending_message(phone, None, result['message_type'], template_name=template_name, template_params=template_params)
        return result
    except requests.exceptions.RequestException as e:
        error_msg = f"ERRO WHATSAPP: FALHA AO ENVIAR: {e}"
        output_widget.print_message(error_msg, style="error")
        result['reason'] = f'Erro na requisição: {str(e)}'
        if status_callback:
            status_callback()
        add_pending_message(phone, None, result['message_type'], template_name=template_name, template_params=template_params)
        return result
    except Exception as e:
        output_widget.print_message(f"ERRO INESPERADO: FALHA AO ENVIAR WHATSAPP: {e}", style="error")
        result['reason'] = f'Erro inesperado: {str(e)}'
        # Em erro inesperado também tentamos enfileirar se tivermos os dados
        try:
            add_pending_message(phone, None, result['message_type'], template_name=template_name, template_params=template_params)
        except:
            pass
        return result


def send_whatsapp_message(phone, message, output_widget, status_callback=None):
    """
    Envia uma mensagem via WhatsApp usando a API Oficial do Meta.
    Esta função detecta o tipo de mensagem e usa o template apropriado.
    
    IMPORTANTE: A API oficial do WhatsApp só permite enviar mensagens usando
    templates aprovados pelo Meta. Mensagens de texto livre só podem ser
    enviadas em resposta a mensagens recebidas nas últimas 24 horas.
    
    Returns:
        dict: {
            'success': bool,
            'reason': str,
            'phone': str,
            'message_type': str
        }
    """
    result = {
        'success': False,
        'reason': '',
        'phone': phone,
        'message_type': 'package'
    }

    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        error_msg = "ERRO: CREDENCIAIS DA API WHATSAPP NÃO CONFIGURADAS NO ARQUIVO .ENV"
        output_widget.print_message(error_msg, style="error")
        output_widget.print_message(f"ACCESS TOKEN: {'Configurado' if WHATSAPP_ACCESS_TOKEN else 'NÃO CONFIGURADO'}", style="info")
        output_widget.print_message(f"PHONE NUMBER ID: {'Configurado' if WHATSAPP_PHONE_NUMBER_ID else 'NÃO CONFIGURADO'}", style="info")
        result['reason'] = 'Credenciais não configuradas'
        return result

    # Detecta o tipo de mensagem e extrai parâmetros
    template_name = None
    template_params = []
    
    # Detecta mensagem de chegada de encomenda
    if "chegou e está disponível para retirada" in message:
        template_name = TEMPLATE_PACKAGE_ARRIVAL
        # Extrai nome e código de rastreio da mensagem
        import re
        name_match = re.search(r'Prezado\(a\)\s*\*?([^*,]+)\*?', message)
        code_match = re.search(r'encomenda\s*\(\*?([^)*]+)\*?\)', message)
        
        recipient_name = name_match.group(1).strip() if name_match else "Morador"
        tracking_code = code_match.group(1).strip() if code_match else "N/A"
        
        template_params = [
            {"type": "text", "parameter_name": "nome_morador", "text": recipient_name},
            {"type": "text", "parameter_name": "codigo_rastreament", "text": tracking_code}
        ]
    
    # Detecta mensagem de retirada de encomenda
    elif "foi retirada em" in message:
        template_name = TEMPLATE_PACKAGE_COLLECTED
        import re
        name_match = re.search(r'Prezado\(a\)\s*\*?([^*,]+)\*?', message)
        code_match = re.search(r'encomenda\s*\(\*?([^)*]+)\*?\)', message)
        time_match = re.search(r'foi retirada em\s+(.+?)\.?$', message)
        
        recipient_name = name_match.group(1).strip() if name_match else "Morador"
        tracking_code = code_match.group(1).strip() if code_match else "N/A"
        collection_time = time_match.group(1).strip() if time_match else datetime.now().strftime("%d/%m/%Y às %H:%M")
        
        template_params = [
            {"type": "text", "parameter_name": "nome_morador", "text": recipient_name},
            {"type": "text", "parameter_name": "codigo_rastreamento", "text": tracking_code},
            {"type": "text", "parameter_name": "data_hora_retirada", "text": collection_time}
        ]
    
    # Detecta mensagem de lembrete (7+ dias)
    elif "LEMBRETE" in message and "há mais de 7 dias" in message:
        template_name = TEMPLATE_PACKAGE_REMINDER
        import re
        name_match = re.search(r'Prezado\(a\)\s*\*?([^*,]+)\*?', message)
        code_match = re.search(r'encomenda\s*\(\*?([^)*]+)\*?\)', message)
        
        recipient_name = name_match.group(1).strip() if name_match else "Morador"
        tracking_code = code_match.group(1).strip() if code_match else "N/A"
        
        template_params = [
            {"type": "text", "parameter_name": "nome_morador", "text": recipient_name},
            {"type": "text", "parameter_name": "codigo_rastreament", "text": tracking_code}
        ]
    
    # Se não detectou template, tenta enviar como mensagem de texto (só funciona dentro da janela de 24h)
    if not template_name:
        output_widget.print_message("AVISO: Mensagem não corresponde a nenhum template. Tentando enviar como texto...", style="info")
        return send_whatsapp_text_message(phone, message, output_widget, status_callback)
    
    # Envia usando o template detectado
    result = send_whatsapp_template(phone, template_name, template_params, output_widget, status_callback, message_type=result['message_type'])
    return result


def send_whatsapp_text_message(phone, message, output_widget, status_callback=None):
    """
    Envia uma mensagem de texto livre via WhatsApp.
    NOTA: Só funciona se o usuário enviou uma mensagem nas últimas 24 horas.
    
    Para mensagens fora da janela de 24h, use send_whatsapp_template com um template aprovado.
    """
    result = {
        'success': False,
        'reason': '',
        'phone': phone,
        'message_type': 'package'
    }

    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        result['reason'] = 'Credenciais não configuradas'
        return result

    # Formata o número de telefone
    phone_number = phone.replace('+', '').replace(' ', '').replace('-', '')
    if len(phone_number) == 11 or len(phone_number) == 10:
        phone_number = f"55{phone_number}"
    elif not phone_number.startswith('55') and len(phone_number) < 13:
        phone_number = f"55{phone_number}"

    if not phone_number or len(phone_number) < 12:
        result['reason'] = 'Número de telefone inválido'
        return result

    url = f"{WHATSAPP_API_BASE_URL}/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone_number,
        "type": "text",
        "text": {
            "preview_url": False,
            "body": message
        }
    }

    try:
        output_widget.print_message(f"ENVIANDO WHATSAPP (TEXTO) PARA: {phone_number}", style="info")
        response = requests.post(url, json=payload, headers=headers, timeout=30)

        if response.status_code in [200, 201]:
            output_widget.print_message("STATUS WHATSAPP: MENSAGEM ENVIADA COM SUCESSO!", style="success")
            result['success'] = True
            result['reason'] = 'Mensagem enviada com sucesso'
            return result
        else:
            try:
                error_data = response.json()
                error_info = error_data.get('error', {})
                error_code = error_info.get('code', 'N/A')
                error_message = error_info.get('message', 'Erro desconhecido')
                
                if error_code == 131047:
                    result['reason'] = 'Mensagem de texto só pode ser enviada em resposta (janela de 24h expirada). Use um template.'
                else:
                    result['reason'] = f'Erro {error_code}: {error_message}'
                    
                output_widget.print_message(f"ERRO WHATSAPP: {result['reason']}", style="error")
            except:
                result['reason'] = f'Erro HTTP {response.status_code}'
            return result

    except Exception as e:
        result['reason'] = f'Erro: {str(e)}'
        output_widget.print_message(f"ERRO WHATSAPP: {result['reason']}", style="error")
        return result

def send_whatsapp_pdf(phone, pdf_path, caption, output_widget):
    """
    Envia um PDF via WhatsApp usando a API Oficial do Meta.
    
    NOTA: A API oficial do Meta requer que o arquivo seja primeiro enviado para 
    o servidor da Meta (upload), e então a URL do arquivo é usada para enviar.
    Alternativamente, o arquivo pode estar hospedado em uma URL pública.
    """
    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        output_widget.print_message("ERRO: CREDENCIAIS DA API WHATSAPP NÃO CONFIGURADAS NO ARQUIVO .ENV", style="error")
        return False

    if not os.path.exists(pdf_path):
        output_widget.print_message(f"ERRO: ARQUIVO PDF NÃO ENCONTRADO: {pdf_path}", style="error")
        return False

    # Formata o número de telefone
    phone_number = phone.replace('+', '').replace(' ', '').replace('-', '')
    if len(phone_number) == 11 or len(phone_number) == 10:
        phone_number = f"55{phone_number}"
    elif not phone_number.startswith('55') and len(phone_number) < 13:
        phone_number = f"55{phone_number}"
    
    file_name = os.path.basename(pdf_path)

    try:
        # Passo 1: Upload do arquivo para a API do Meta
        upload_url = f"{WHATSAPP_API_BASE_URL}/{WHATSAPP_PHONE_NUMBER_ID}/media"
        
        with open(pdf_path, 'rb') as pdf_file:
            files = {
                'file': (file_name, pdf_file, 'application/pdf')
            }
            data = {
                'messaging_product': 'whatsapp',
                'type': 'application/pdf'
            }
            headers_upload = {
                "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"
            }
            
            output_widget.print_message(f"ENVIANDO PDF PARA: {phone_number}", style="info")
            upload_response = requests.post(upload_url, headers=headers_upload, files=files, data=data, timeout=60)
        
        if upload_response.status_code not in [200, 201]:
            try:
                error_data = upload_response.json()
                error_msg = error_data.get('error', {}).get('message', 'Erro no upload')
                output_widget.print_message(f"ERRO WHATSAPP: FALHA NO UPLOAD DO PDF: {error_msg}", style="error")
            except:
                output_widget.print_message(f"ERRO WHATSAPP: FALHA NO UPLOAD DO PDF (código {upload_response.status_code})", style="error")
            return False
        
        upload_data = upload_response.json()
        media_id = upload_data.get('id')
        
        if not media_id:
            output_widget.print_message("ERRO WHATSAPP: NÃO FOI POSSÍVEL OBTER O ID DO ARQUIVO", style="error")
            return False
        
        # Passo 2: Enviar o documento usando o media_id
        send_url = f"{WHATSAPP_API_BASE_URL}/{WHATSAPP_PHONE_NUMBER_ID}/messages"
        
        headers_send = {
            "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone_number,
            "type": "document",
            "document": {
                "id": media_id,
            "caption": caption,
                "filename": file_name
            }
        }

        response = requests.post(send_url, json=payload, headers=headers_send, timeout=30)
        
        if response.status_code in [200, 201]:
            output_widget.print_message(f"PDF ENVIADO COM SUCESSO PARA {phone_number}!", style="success")
            return True
        else:
            try:
                error_data = response.json()
                error_msg = error_data.get('error', {}).get('message', 'Erro desconhecido')
                output_widget.print_message(f"ERRO WHATSAPP: FALHA AO ENVIAR PDF: {error_msg}", style="error")
            except:
                output_widget.print_message(f"ERRO WHATSAPP: FALHA AO ENVIAR PDF (código {response.status_code})", style="error")
            return False
        
    except requests.exceptions.RequestException as e:
        output_widget.print_message(f"ERRO WHATSAPP: FALHA AO ENVIAR PDF: {e}", style="error")
        return False
    except Exception as e:
        output_widget.print_message(f"ERRO INESPERADO: FALHA AO ENVIAR PDF: {e}", style="error")
        return False


def save_last_reminder_timestamp():
    """Salva o timestamp atual no arquivo de controle de lembretes."""
    try:
        with open(REMINDER_TIMESTAMP_FILE, "w") as f:
            f.write(datetime.now().isoformat())
    except IOError as e:
        print(f"Erro ao salvar o timestamp do lembrete: {e}")

def load_last_reminder_timestamp():
    """Carrega o último timestamp salvo do arquivo de controle."""
    if not os.path.exists(REMINDER_TIMESTAMP_FILE):
        return None
    try:
        with open(REMINDER_TIMESTAMP_FILE, "r") as f:
            return datetime.fromisoformat(f.read().strip())
    except (IOError, ValueError):
        # Retorna None se o arquivo estiver vazio ou corrompido
        return None

def load_data(file_path, columns, dtypes, keep_na=False):
    """Carrega dados de um arquivo CSV, criando o arquivo se ele não existir."""
    if os.path.exists(file_path):
        return pd.read_csv(file_path, dtype=dtypes, keep_default_na=keep_na, na_values=[''])
    else:
        return pd.DataFrame(columns=columns)

def save_data(df, file_path):
    """Salva um DataFrame em um arquivo CSV."""
    try:
        df.to_csv(file_path, index=False)
        return True
    except Exception as e:
        print(f"Erro ao salvar dados em {file_path}: {e}")
        return False

def load_residents():
    """Carrega os dados dos moradores, tratando campos vazios para evitar 'NaN'."""
    df = load_data(
        RESIDENTS_FILE,
        columns=["name", "block", "apartment", "phone"],
        dtypes={"name": str, "block": str, "apartment": str, "phone": str},
        keep_na=False
    )
    # Garante que a coluna 'name' não tenha valores nulos que possam virar 'NaN'
    df['name'] = df['name'].fillna('')
    return df

def save_residents(df):
    """Salva os dados dos moradores."""
    save_data(df, RESIDENTS_FILE)

def load_packages():
    """Carrega os dados das encomendas."""
    return load_data(
        PACKAGES_FILE,
        columns=["tracking_code", "block", "apartment", "recipient", "phone", "scan_datetime", "status"],
        dtypes={"block": str, "apartment": str, "phone": str}
    )

def save_packages(df):
    """Salva os dados das encomendas."""
    save_data(df, PACKAGES_FILE)

# --- NOVAS FUNÇÕES PARA RESERVAS ---
def load_reservations():
    """Carrega os dados das reservas."""
    try:
        df = load_data(
            RESERVATIONS_FILE,
            columns=["area", "date", "start_time", "end_time", "block", "apartment",
                     "resident_name", "visitors", "payment_status", "doorman_name", "parking_spot"],
            dtypes={"block": str, "apartment": str}
        )
        # Garante que não há valores NaN
        df = df.fillna("")
        return df
    except Exception as e:
        print(f"Erro ao carregar reservas: {e}")
        # Retorna DataFrame vazio em caso de erro
        return pd.DataFrame(columns=["area", "date", "start_time", "end_time", "block", "apartment",
                                   "resident_name", "visitors", "payment_status", "doorman_name", "parking_spot"])

def save_reservations(df):
    """Salva os dados das reservas."""
    try:
        if save_data(df, RESERVATIONS_FILE):
            print(f"Reservas salvas com sucesso. Total: {len(df)}")
            return True
        else:
            print("Falha ao salvar reservas")
            return False
    except Exception as e:
        print(f"Erro ao salvar reservas: {e}")
        return False
# --- FIM DAS NOVAS FUNÇÕES ---


def validate_block_apt(block, apartment):
    """Valida se o formato do bloco e do apartamento é permitido."""
    valid_blocks = [str(i) for i in range(1, 9)]
    if not (block in valid_blocks and apartment and len(apartment) == 3 and apartment.isdigit()):
        return False
        
    floor = apartment[0]
    door = apartment[1:]
    
    return floor in [str(i) for i in range(2, 9)] and door in [f"0{i}" for i in range(1, 5)]

def get_residents_for_apt(residents, block, apartment):
    """Retorna uma lista de moradores para um bloco e apartamento específicos."""
    return residents[(residents["block"] == block) & (residents["apartment"] == apartment)]

def parse_block_apt(input_str):
    """Extrai o bloco e o apartamento de uma string de entrada (ex: '4201' -> '4', '201')."""
    if not input_str or len(input_str) != 4:
        return None, None
    block = input_str[0]
    apartment = input_str[1:]
    return block, apartment

# ==============================================================================
# 3. CLASSES DE INTERFACE GRÁFICA (GUI)
# ==============================================================================

class StyledScrolledText(scrolledtext.ScrolledText):
    """Um ScrolledText customizado com métodos para impressão estilizada e centralizada."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.configure(
            state='disabled',
            font=(FONT_FAMILY, FONT_SIZE_LARGE)
        )
        self._configure_tags()

    def _configure_tags(self):
        """Define os estilos (tags) para o texto."""
        self.tag_configure("header", font=(FONT_FAMILY, FONT_HEADER_SIZE, FONT_WEIGHT_BOLD), justify='center', spacing3=15, foreground="#003366")
        self.tag_configure("subheader", font=(FONT_FAMILY, FONT_SIZE_LARGE, FONT_WEIGHT_BOLD), justify='center', spacing1=10, spacing3=5, foreground="#004080")
        self.tag_configure("bold", font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD))
        self.tag_configure("normal", font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_NORMAL))
        self.tag_configure("success", font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), foreground="#006400")
        self.tag_configure("error", font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), foreground="#B22222")
        self.tag_configure("info", font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_NORMAL), foreground="#555555")
        # Tag específica para forçar a centralização de linhas
        self.tag_configure("center_line", justify='center')

    def _insert_and_tag_line(self, text, tags):
        """Método interno para inserir texto, aplicar tags e garantir a centralização."""
        self.configure(state='normal')
        # Marca o início da linha antes da inserção
        start_index = self.index(tk.END + "-1c")
        self.insert(tk.END, text, tags)
        # Aplica a tag de centralização a toda a linha que acabou de ser inserida
        self.tag_add("center_line", start_index, tk.END + "-1c")
        self.see(tk.END)
        self.configure(state='disabled')

    def print_header(self, text):
        self._insert_and_tag_line(f"\n{text.upper()}\n", ("header",))

    def print_subheader(self, text):
        self._insert_and_tag_line(f"\n{text.upper()}\n", ("subheader",))
        
    def print_styled(self, label, value="", style="normal", end="\n"):
        """Imprime uma linha de dados (label e valor) de forma centralizada."""
        self.configure(state='normal')
        start_index = self.index(tk.END + "-1c")
        
        if label:
            label_text = f"{label.upper()}: " if not label.endswith(': ') else label.upper()
            self.insert(tk.END, label_text, "bold")
        if value:
            self.insert(tk.END, str(value).upper(), style)
        self.insert(tk.END, end)

        self.tag_add("center_line", start_index, tk.END + "-1c")
        self.see(tk.END)
        self.configure(state='disabled')
        
    def print_message(self, message, style="info"):
        """Imprime uma única mensagem de status de forma centralizada."""
        self._insert_and_tag_line(f"{message.upper()}\n", (style,))

    def print_separator(self, char="="):
        self._insert_and_tag_line(f"{char * 110}\n", ("info",))
        
    def clear(self):
        self.configure(state='normal')
        self.delete(1.0, tk.END)
        self.configure(state='disabled')


class CustomDialog(Toplevel):
    """Classe base para diálogos customizados, com estilo e centralização."""
    def __init__(self, parent, title):
        super().__init__(parent)
        self.title(title)
        self.transient(parent)
        self.grab_set()
        self.result = None
        
        # Configura o protocolo de fechar com X
        self.protocol("WM_DELETE_WINDOW", self._on_cancel)
        
        # Configura o binding da tecla Escape
        self.bind('<Escape>', lambda e: self._on_cancel())
        
        # Configura o diálogo como modal
        self.focus_force()
        self.grab_set()
        
        # Impede redimensionamento
        self.resizable(False, False)
        
        self.configure(bg="#f0f0f0")

        self.main_frame = tk.Frame(self, padx=25, pady=20, bg="#f0f0f0")
        self.main_frame.pack(expand=True, fill="both")

    def _center_dialog(self, parent):
        """Centraliza o diálogo na tela."""
        self.update_idletasks()
        width = self.winfo_width()
        height = self.winfo_height()
        x = parent.winfo_x() + (parent.winfo_width() // 2) - (width // 2)
        y = parent.winfo_y() + (parent.winfo_height() // 2) - (height // 2)
        self.geometry(f'{width}x{height}+{x}+{y}')

    def _on_cancel(self):
        """Função chamada quando o usuário cancela ou fecha o diálogo."""
        self.result = None
        self.grab_release()
        self.destroy()

    def show(self):
        """Mostra o diálogo e aguarda o fechamento."""
        self.deiconify()
        self._center_dialog(self.master)
        self.wait_window()
        return self.result


class ScrollableAskStringDialog(CustomDialog):
    """Diálogo para solicitar uma string com validação opcional via regex e barra de rolagem para textos longos."""
    def __init__(self, parent, title, prompt, validation_regex=None, error_message=None, uppercase=False, show_password=False):
        super().__init__(parent, title)
        self.validation_regex = validation_regex
        self.error_message = error_message or "ENTRADA INVÁLIDA."
        self.uppercase = uppercase
        self.show_password = show_password

        # Frame principal
        main_content_frame = tk.Frame(self.main_frame, bg="#f0f0f0")
        main_content_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Frame para o prompt com scroll (altura limitada)
        prompt_frame = tk.Frame(main_content_frame, bg="#f0f0f0")
        prompt_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 15))
        
        # Canvas para scroll do prompt
        canvas = tk.Canvas(prompt_frame, bg="#f0f0f0", highlightthickness=0, height=250)
        scrollbar = tk.Scrollbar(prompt_frame, orient="vertical", command=canvas.yview)
        scrollable_frame = tk.Frame(canvas, bg="#f0f0f0")
        
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        # Adiciona o prompt com quebra de linha automática
        prompt_label = tk.Label(scrollable_frame, text=prompt, font=(FONT_FAMILY, FONT_SIZE_NORMAL), 
                               bg="#f0f0f0", wraplength=500, justify="left")
        prompt_label.pack(pady=10, anchor="w")
        
        # Configura o canvas e scrollbar
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Frame fixo para input e instrução (SEMPRE VISÍVEIS)
        fixed_frame = tk.Frame(main_content_frame, bg="#f0f0f0")
        fixed_frame.pack(fill=tk.X, pady=(0, 20))
        
        # Texto de instrução em negrito (SEMPRE VISÍVEL)
        instruction_label = tk.Label(fixed_frame, text="Digite o número da encomenda (1, 2, 3, etc.):", 
                                   font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                                   bg="#f0f0f0", fg="#000000")
        instruction_label.pack(pady=(0, 10))
        
        # Campo de entrada (SEMPRE VISÍVEL)
        show_chars = "*" if self.show_password else ""
        self.entry = tk.Entry(fixed_frame, font=(FONT_SIZE_LARGE), width=35, 
                             relief="solid", bd=1, justify='center', show=show_chars)
        self.entry.pack(pady=(0, 10))
        
        # Botões (SEMPRE VISÍVEIS)
        button_frame = tk.Frame(main_content_frame, bg="#f0f0f0")
        button_frame.pack(pady=(0, 10))
        
        Button(button_frame, text="OK", command=self._on_ok, 
               font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
               width=24, default='active').pack(side=tk.LEFT, padx=(0, 5))
        Button(button_frame, text="CANCELAR", command=self._on_cancel, 
               font=(FONT_FAMILY, FONT_SIZE_NORMAL), width=24).pack(side=tk.LEFT)
        
        # Bindings
        self.entry.bind('<Return>', lambda e: self._on_ok())
        self.entry.bind('<Escape>', lambda e: self._on_cancel())
        
        # Configura o tamanho da janela (aumentado)
        self.geometry("550x500")
        self.resizable(False, False)
        
        self.after(50, lambda: self.entry.focus_force())
        self._center_dialog(parent)

    def _on_ok(self):
        value = self.entry.get().strip()
        if self.uppercase:
            value = value.upper()

        if self.validation_regex and not re.fullmatch(self.validation_regex, value):
            messagebox.showerror("ERRO DE VALIDAÇÃO", self.error_message, parent=self)
            self.entry.focus_force()  # Mantém o foco no campo para correção
        else:
            self.result = value
            self.grab_release()
            self.destroy()

    def _on_cancel(self):
        """Função chamada quando o usuário cancela ou fecha o diálogo."""
        self.result = None
        self.grab_release()
        self.destroy()


class VisitorNamesDialog(CustomDialog):
    """Diálogo para coletar nomes de visitantes com validação de quantidade."""
    def __init__(self, parent, title, max_visitors, area_name):
        super().__init__(parent, title)
        self.max_visitors = max_visitors
        self.area_name = area_name
        
        # Frame principal
        main_content_frame = tk.Frame(self.main_frame, bg="#f0f0f0")
        main_content_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Título e instruções
        title_label = tk.Label(main_content_frame, text=f"RESERVA - {area_name.upper()}", 
                              font=(FONT_FAMILY, FONT_SIZE_LARGE, FONT_WEIGHT_BOLD), 
                              bg="#f0f0f0", fg="#005a9c")
        title_label.pack(pady=(0, 10))
        
        # Instruções
        instruction_text = f"Digite os nomes dos visitantes (máximo {max_visitors}):\n\n" \
                          f"• Cada nome deve estar em uma linha separada\n" \
                          f"• A quantidade de linhas deve ser igual ao número de visitantes informado\n" \
                          f"• Pressione Enter para criar nova linha"
        
        instruction_label = tk.Label(main_content_frame, text=instruction_text, 
                                   font=(FONT_FAMILY, FONT_SIZE_NORMAL), 
                                   bg="#f0f0f0", fg="#333333", justify="left")
        instruction_label.pack(pady=(0, 15))
        
        # Frame para o campo de texto
        text_frame = tk.Frame(main_content_frame, bg="#f0f0f0")
        text_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 15))
        
        # Campo de texto com scroll
        self.text_widget = tk.Text(text_frame, font=(FONT_FAMILY, FONT_SIZE_NORMAL), 
                                  width=50, height=15, relief="solid", bd=1, wrap="none")
        scrollbar_y = tk.Scrollbar(text_frame, orient="vertical", command=self.text_widget.yview)
        scrollbar_x = tk.Scrollbar(text_frame, orient="horizontal", command=self.text_widget.xview)
        
        self.text_widget.configure(yscrollcommand=scrollbar_y.set, xscrollcommand=scrollbar_x.set)
        
        # Layout dos widgets
        self.text_widget.grid(row=0, column=0, sticky="nsew")
        scrollbar_y.grid(row=0, column=1, sticky="ns")
        scrollbar_x.grid(row=1, column=0, sticky="ew")
        
        text_frame.grid_rowconfigure(0, weight=1)
        text_frame.grid_columnconfigure(0, weight=1)
        
        # Bindings para Enter e Escape
        self.text_widget.bind('<Return>', self._on_enter)
        self.text_widget.bind('<Escape>', lambda e: self._on_cancel())
        
        # Botões
        button_frame = tk.Frame(main_content_frame, bg="#f0f0f0")
        button_frame.pack(pady=(0, 10))
        
        Button(button_frame, text="CONFIRMAR", command=self._on_ok, 
               font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
               width=20, default='active', bg="#28a745", fg="white").pack(side=tk.LEFT, padx=(0, 10))
        Button(button_frame, text="CANCELAR", command=self._on_cancel, 
               font=(FONT_FAMILY, FONT_SIZE_NORMAL), width=20).pack(side=tk.LEFT)
        
        # Configura o tamanho da janela
        self.geometry("600x700")
        self.resizable(False, False)
        
        self.after(50, lambda: self.text_widget.focus_force())
        self._center_dialog(parent)
    
    def _on_enter(self, event):
        """Adiciona nova linha quando Enter é pressionado."""
        self.text_widget.insert(tk.INSERT, "\n")
        return "break"  # Previne o comportamento padrão do Enter
    
    def _on_ok(self):
        """Valida e confirma os nomes dos visitantes."""
        text_content = self.text_widget.get("1.0", tk.END).strip()
        
        if not text_content:
            messagebox.showerror("ERRO", "Por favor, digite pelo menos um nome de visitante.", parent=self)
            return
        
        # Divide o texto em linhas e remove linhas vazias
        lines = [line.strip() for line in text_content.split('\n') if line.strip()]
        
        if len(lines) > self.max_visitors:
            messagebox.showerror("ERRO", 
                               f"Quantidade de nomes excede o limite!\n\n"
                               f"Você informou {len(lines)} nomes, mas o máximo para {self.area_name} é {self.max_visitors}.\n\n"
                               f"Por favor, remova {len(lines) - self.max_visitors} nome(s).", parent=self)
            return
        
        if len(lines) < self.max_visitors:
            messagebox.showerror("ERRO", 
                               f"Quantidade de nomes insuficiente!\n\n"
                               f"Você informou {len(lines)} nomes, mas precisa informar exatamente {self.max_visitors} nomes para {self.area_name}.\n\n"
                               f"Por favor, adicione {self.max_visitors - len(lines)} nome(s).", parent=self)
            return
        
        # Valida se todos os nomes têm pelo menos 2 caracteres
        invalid_names = [name for name in lines if len(name) < 2]
        if invalid_names:
            messagebox.showerror("ERRO", 
                               f"Nomes inválidos encontrados:\n\n"
                               f"{', '.join(invalid_names)}\n\n"
                               f"Todos os nomes devem ter pelo menos 2 caracteres.", parent=self)
            return
        
        self.result = lines
        self.grab_release()
        self.destroy()
    
    def _on_cancel(self):
        """Função chamada quando o usuário cancela ou fecha o diálogo."""
        self.result = None
        self.grab_release()
        self.destroy()


class AskStringDialog(CustomDialog):
    """Diálogo para solicitar uma string com validação opcional via regex."""
    def __init__(self, parent, title, prompt, validation_regex=None, error_message=None, uppercase=False, show_password=False):
        super().__init__(parent, title)
        self.validation_regex = validation_regex
        self.error_message = error_message or "ENTRADA INVÁLIDA."
        self.uppercase = uppercase
        self.show_password = show_password

        Label(self.main_frame, text=prompt.upper(), font=(FONT_FAMILY, FONT_SIZE_LARGE), bg="#f0f0f0").pack(pady=(0, 15))
        
        # Apenas campos de senha mostram asteriscos
        show_chars = "*" if self.show_password else ""
        self.entry = Entry(self.main_frame, font=(FONT_FAMILY, FONT_SIZE_LARGE), width=35, relief="solid", bd=1, justify='center', show=show_chars)
        self.entry.pack(pady=(0, 20))
        self.entry.bind('<Return>', lambda e: self._on_ok())
        self.entry.bind('<Escape>', lambda e: self._on_cancel())

        Button(self.main_frame, text="OK", command=self._on_ok, font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), width=24, default='active').pack()
        Button(self.main_frame, text="CANCELAR", command=self._on_cancel, font=(FONT_FAMILY, FONT_SIZE_NORMAL), width=24).pack(pady=(5, 0))

        self.after(50, lambda: self.entry.focus_force())
        self._center_dialog(parent)

    def _on_ok(self):
        value = self.entry.get().strip()
        if self.uppercase:
            value = value.upper()

        if self.validation_regex and not re.fullmatch(self.validation_regex, value):
            messagebox.showerror("ERRO DE VALIDAÇÃO", self.error_message, parent=self)
            self.entry.focus_force()  # Mantém o foco no campo para correção
        else:
            self.result = value
            self.grab_release()
            self.destroy()

    def _on_cancel(self):
        """Função chamada quando o usuário cancela ou fecha o diálogo."""
        self.result = None
        self.grab_release()
        self.destroy()


class BlockAptDialog(CustomDialog):
    """Diálogo para entrada de Bloco/Apto com opções especiais."""
    def __init__(self, parent, title, prompt, show_no_block_button=True):
        super().__init__(parent, title)
        
        Label(self.main_frame, text=prompt.upper(), font=(FONT_FAMILY, FONT_SIZE_LARGE), bg="#f0f0f0").pack(pady=(0, 15))

        self.entry = Entry(self.main_frame, font=(FONT_FAMILY, FONT_SIZE_LARGE), width=35, relief="solid", bd=1, justify='center')
        self.entry.pack(pady=(0, 20))
        self.entry.bind('<Return>', lambda e: self._on_ok())
        self.entry.bind('<Escape>', lambda e: self._on_cancel())
        
        Button(self.main_frame, text="OK", command=self._on_ok, font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), width=28, default='active').pack(pady=4)
        
        if show_no_block_button:
            Button(self.main_frame, text="ENCOMENDA SEM BLOCO/APTO", command=self._on_no_block_apt, font=(FONT_FAMILY, FONT_SIZE_NORMAL), width=28, bg="#ffc107").pack(pady=4)
        
        Button(self.main_frame, text="CANCELAR", command=self._on_cancel, font=(FONT_FAMILY, FONT_SIZE_NORMAL), width=28).pack(pady=4)

        self.after(50, lambda: self.entry.focus_force())
        self._center_dialog(parent)

    def _on_ok(self):
        self.result = self.entry.get().strip()
        self.grab_release()
        self.destroy()

    def _on_no_block_apt(self):
        """Função para o novo botão, retorna um valor especial."""
        self.result = "SEM_BLOCO"
        self.grab_release()
        self.destroy()

    def _on_cancel(self):
        """Função chamada quando o usuário cancela ou fecha o diálogo."""
        self.result = None
        self.grab_release()
        self.destroy()

# --- NOVO: DIÁLOGO DE CALENDÁRIO ---
class CalendarDialog(CustomDialog):
    """Diálogo para selecionar uma data, mostrando horários já marcados ou datas ocupadas."""
    def __init__(self, parent, title, disabled_dates=None, area_type=None, dates_with_times=None, is_parking_multi_date=False):
        super().__init__(parent, title)
        self.disabled_dates = disabled_dates or []
        self.dates_with_times = dates_with_times or {}
        self.area_type = area_type
        self.is_parking_multi_date = is_parking_multi_date  # True para diálogo de garagem com duas datas

        Label(self.main_frame, text="SELECIONE A DATA DA RESERVA", font=(FONT_FAMILY, FONT_SIZE_LARGE), bg="#f0f0f0").pack(pady=(0, 15))
        
        # Mostra informações sobre datas ocupadas ou com horários marcados
        if self.disabled_dates:
            # Ordena as datas para melhor visualização
            sorted_dates = sorted(self.disabled_dates)
            dates_text = ", ".join([d.strftime('%d/%m') for d in sorted_dates[:5]])
            if len(sorted_dates) > 5:
                dates_text += f" e mais {len(sorted_dates) - 5} data(s)"
            
            # Frame para informações de datas ocupadas
            info_frame = tk.Frame(self.main_frame, bg="#f0f0f0", relief="solid", bd=1)
            info_frame.pack(pady=(0, 15), padx=10, fill="x")
            
            Label(info_frame, text="⚠️ DATAS OCUPADAS", font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                  bg="#f0f0f0", fg="#d32f2f").pack(pady=(5, 2))
            Label(info_frame, text=dates_text, font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                  bg="#f0f0f0", fg="#d32f2f").pack(pady=(0, 5))
            
            # Mostra total de datas ocupadas
            Label(info_frame, text=f"Total: {len(sorted_dates)} data(s) ocupada(s)", 
                  font=(FONT_FAMILY, FONT_SIZE_SMALL), bg="#f0f0f0", fg="#666666").pack(pady=(0, 5))
            
            # Instrução para o usuário
            Label(info_frame, text="💡 Estas datas não podem ser selecionadas", 
                  font=(FONT_FAMILY, FONT_SIZE_SMALL), bg="#f0f0f0", fg="#666666").pack(pady=(0, 5))
        elif self.dates_with_times:
            # Ordena as datas para melhor visualização
            sorted_dates = sorted(self.dates_with_times.keys())
            dates_text = ", ".join([d.strftime('%d/%m') for d in sorted_dates[:5]])
            if len(sorted_dates) > 5:
                dates_text += f" e mais {len(sorted_dates) - 5} data(s)"
            
            # Frame para informações de datas com horários
            info_frame = tk.Frame(self.main_frame, bg="#f0f0f0", relief="solid", bd=1)
            info_frame.pack(pady=(0, 15), padx=10, fill="x")
            
            Label(info_frame, text="📅 DATAS COM HORÁRIOS MARCADOS", font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                  bg="#f0f0f0", fg="#1976d2").pack(pady=(5, 2))
            Label(info_frame, text=dates_text, font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                  bg="#f0f0f0", fg="#1976d2").pack(pady=(0, 5))
            
            # Mostra total de datas com horários
            Label(info_frame, text=f"Total: {len(sorted_dates)} data(s) com horário(s) marcado(s)", 
                  font=(FONT_FAMILY, FONT_SIZE_SMALL), bg="#f0f0f0", fg="#666666").pack(pady=(0, 5))
            
            # Instrução para o usuário
            Label(info_frame, text="💡 Você pode selecionar qualquer data, mas evite conflitos de horário", 
                  font=(FONT_FAMILY, FONT_SIZE_SMALL), bg="#f0f0f0", fg="#666666").pack(pady=(0, 5))
        else:
            # Mostra mensagem de que não há datas ocupadas ou com horários
            # Para garagem, não mostra essa seção
            if self.area_type != 'garagem':
                info_frame = tk.Frame(self.main_frame, bg="#f0f0f0", relief="solid", bd=1)
                info_frame.pack(pady=(0, 15), padx=10, fill="x")
                
                Label(info_frame, text="✅ TODAS AS DATAS DISPONÍVEIS", font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                      bg="#f0f0f0", fg="#388e3c").pack(pady=(5, 2))
                Label(info_frame, text="Nenhuma data ocupada ou com horário marcado para esta área", 
                      font=(FONT_FAMILY, FONT_SIZE_SMALL), bg="#f0f0f0", fg="#666666").pack(pady=(0, 5))
        
        # Checkbox para locação mensal (apenas para garagem)
        self.is_monthly_var = tk.BooleanVar()
        if self.area_type == 'garagem':
            monthly_frame = tk.Frame(self.main_frame, bg="#f0f0f0")
            monthly_frame.pack(pady=(0, 15))
            
            monthly_checkbox = tk.Checkbutton(monthly_frame, text="🚗 Esta vaga será alugada mensalmente", 
                                            variable=self.is_monthly_var, 
                                            font=(FONT_FAMILY, FONT_SIZE_NORMAL),
                                            bg="#f0f0f0", fg="#8B4513",
                                            command=self._toggle_monthly)
            monthly_checkbox.pack()
            
            # Label explicativo
            tk.Label(monthly_frame, text="(Locação mensal bloqueia a vaga indefinidamente)", 
                    font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                    bg="#f0f0f0", fg="#666666").pack()
        
        # Calendário (mostra condicionalmente)
        if self.is_parking_multi_date:
            # Para múltiplas datas, mostra dois calendários
            self.dates_frame = tk.Frame(self.main_frame, bg="#f0f0f0")
            self.dates_frame.pack(pady=(0, 15))
            
            # Data inicial
            tk.Label(self.dates_frame, text="📅 DATA INICIAL", 
                    font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                    bg="#f0f0f0", fg="#1976d2").pack()
            
            self.cal_start = DateEntry(self.dates_frame, width=12, background='darkblue',
                                     foreground='white', borderwidth=2, date_pattern='dd/mm/yyyy',
                                     mindate=datetime.now().date())
            self.cal_start.pack(pady=5)
            
            # Data final
            tk.Label(self.dates_frame, text="📅 DATA FINAL", 
                    font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                    bg="#f0f0f0", fg="#1976d2").pack(pady=(10, 5))
            
            # Calendário final começa com mesma data do inicial
            self.cal_end = DateEntry(self.dates_frame, width=12, background='darkblue',
                                    foreground='white', borderwidth=2, date_pattern='dd/mm/yyyy',
                                    mindate=datetime.now().date())
            self.cal_end.pack(pady=5)
            
            # Aviso em vermelho
            self.warning_frame = tk.Frame(self.main_frame, bg="#f0f0f0")
            self.warning_frame.pack(pady=(5, 15))
            
            tk.Label(self.warning_frame, text="⚠️ ATENÇÃO", 
                    font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                    bg="#f0f0f0", fg="#d32f2f").pack()
            
            tk.Label(self.warning_frame, text="Deseja reservar para vários dias?", 
                    font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                    bg="#f0f0f0", fg="#d32f2f").pack()
            
            tk.Label(self.warning_frame, 
                    text="Deixe a data final diferente e superior à data inicial.", 
                    font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                    bg="#f0f0f0", fg="#d32f2f").pack()
        else:
            # Calendário normal
            self.cal = DateEntry(self.main_frame, width=12, background='darkblue',
                               foreground='white', borderwidth=2, date_pattern='dd/mm/yyyy',
                               mindate=datetime.now().date())
            self.cal.pack(pady=10, padx=10)
            self.cal_start = self.cal  # Para compatibilidade
            self.cal_end = None
        
        # Botão de confirmação
        Button(self.main_frame, text="CONFIRMAR DATA", command=self._on_ok, 
               font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
               bg="#28a745", fg="white", width=20).pack(pady=(10,0))
        
        self.bind('<Return>', lambda e: self._on_ok())
        self._center_dialog(parent)
        
    def _toggle_monthly(self):
        """Habilita/desabilita o calendário baseado no checkbox de locação mensal."""
        if self.area_type == 'garagem' and self.is_parking_multi_date:
            # Se for garagem com múltiplas datas, mostra/esconde os calendários
            if self.is_monthly_var.get():
                # Esconde os calendários para locação mensal
                self.dates_frame.pack_forget()
                self.warning_frame.pack_forget()
            else:
                # Mostra os calendários para locação diária
                self.dates_frame.pack(pady=(0, 15))
                self.warning_frame.pack(pady=(5, 15))
        elif not self.is_parking_multi_date:
            # Para calendário único
            if self.is_monthly_var.get():
                # Desabilita o calendário para locação mensal
                self.cal.configure(state='disabled')
                self.cal.configure(background='#cccccc')  # Cor cinza para indicar desabilitado
            else:
                # Habilita o calendário para locação diária
                self.cal.configure(state='normal')
                self.cal.configure(background='darkblue')

    def _on_ok(self):
        # Verifica se é locação mensal PRIMEIRO (para garagem)
        if self.area_type == 'garagem' and hasattr(self, 'is_monthly_var') and self.is_monthly_var.get():
            # Para locação mensal, retorna (None, True)
            self.result = (None, True)
            self.destroy()
            return
        
        # Para diálogo de múltiplas datas de garagem
        if self.is_parking_multi_date:
            start_date = self.cal_start.get_date()
            end_date = self.cal_end.get_date()
            
            # Validação: não permite datas passadas
            if start_date < datetime.now().date() or end_date < datetime.now().date():
                messagebox.showerror("DATA INVÁLIDA", "Não é possível selecionar uma data passada.", parent=self)
                return
            
            # Validação: data final deve ser >= data inicial
            if end_date < start_date:
                messagebox.showerror("DATA INVÁLIDA", 
                                   f"A data final ({end_date.strftime('%d/%m/%Y')}) não pode ser anterior à data inicial ({start_date.strftime('%d/%m/%Y')}).", 
                                   parent=self)
                return
            
            # Retorna ambas as datas
            self.result = (start_date, end_date)
            self.grab_release()
            self.destroy()
            return
        
        # Verifica se é locação mensal
        if hasattr(self, 'is_monthly_var') and self.is_monthly_var.get():
            # Para locação mensal, retorna uma tupla com None (sem data) e True (é mensal)
            self.result = (None, True)
            self.destroy()
            return
        
        # Para locação diária normal (não múltiplas datas)
        selected_date = self.cal.get_date()
        
        # Validação adicional: não permite datas passadas
        if selected_date < datetime.now().date():
            messagebox.showerror("DATA INVÁLIDA", "Não é possível selecionar uma data passada.", parent=self)
            return
        
        # Verifica se a data está ocupada (para áreas como churrasqueira)
        if selected_date in self.disabled_dates:
            messagebox.showerror("DATA OCUPADA", 
                               f"A data {selected_date.strftime('%d/%m/%Y')} já está reservada para esta área.\n\nPor favor, escolha outra data.", 
                               parent=self)
            return
        
        # Se a data selecionada tem horários marcados, mostra os horários para o usuário
        if selected_date in self.dates_with_times:
            times_info = self.dates_with_times[selected_date]
            times_text = "\n".join([f"• {start} - {end}" for start, end in times_info])
            
            messagebox.showinfo("HORÁRIOS JÁ MARCADOS", 
                              f"A data {selected_date.strftime('%d/%m/%Y')} já tem os seguintes horários marcados:\n\n{times_text}\n\n"
                              f"⚠️ ATENÇÃO: Evite selecionar horários que conflitem com os existentes!", 
                              parent=self)
        
        # Para locação diária, retorna uma tupla com a data e False (não é mensal)
        self.result = (selected_date, False)
        
        self.grab_release()
        self.destroy()

# --- NOVO: DIÁLOGO DE HORÁRIOS ---
class TimeSelectionDialog(CustomDialog):
    """Diálogo para selecionar horários de início e fim."""
    def __init__(self, parent, title, area_type, selected_date=None, existing_times=None):
        super().__init__(parent, title)
        self.area_type = area_type
        self.selected_date = selected_date
        self.existing_times = existing_times or []
        self.result = None

        Label(self.main_frame, text=f"SELECIONAR HORÁRIOS - {area_type.upper()}", font=(FONT_FAMILY, FONT_SIZE_LARGE), bg="#f0f0f0").pack(pady=(0, 15))
        
        # Mostra a data selecionada
        if self.selected_date:
            date_str = self.selected_date.strftime('%d/%m/%Y')
            Label(self.main_frame, text=f"📅 DATA: {date_str}", font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                  bg="#f0f0f0", fg="#1976d2").pack(pady=(0, 10))
        
        # Mostra horários já marcados nesta data (se houver)
        if self.existing_times:
            # Frame para horários existentes
            existing_frame = tk.Frame(self.main_frame, bg="#f0f0f0", relief="solid", bd=1)
            existing_frame.pack(pady=(0, 15), padx=10, fill="x")
            
            Label(existing_frame, text="⚠️ HORÁRIOS JÁ MARCADOS NESTA DATA:", 
                  font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                  bg="#f0f0f0", fg="#d32f2f").pack(pady=(5, 2))
            
            for start_time, end_time in self.existing_times:
                Label(existing_frame, text=f"   🕐 {start_time} - {end_time}", 
                      font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                      bg="#f0f0f0", fg="#d32f2f").pack(pady=1)
            
            Label(existing_frame, text="💡 Evite selecionar horários que conflitem com os existentes!", 
                  font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                  bg="#f0f0f0", fg="#666666").pack(pady=(5, 5))
        
        # Validação específica para quadra
       
        
        # Frame para horários
        time_frame = tk.Frame(self.main_frame, bg="#f0f0f0")
        time_frame.pack(pady=10)
        
        # Horário de início
        tk.Label(time_frame, text="HORA DE INÍCIO:", font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f0f0f0").grid(row=0, column=0, padx=5, pady=5)
        
        # Seletor de hora antigo para quadra (Combobox simples)
        if area_type.lower() == "quadra":
            # Combobox com valores de hora para quadra (7-21)
            hour_values = [str(i).zfill(2) for i in range(7, 22)]
            self.start_hour = ttk.Combobox(time_frame, values=hour_values, width=5, font=(FONT_FAMILY, FONT_SIZE_NORMAL), state="readonly")
            self.start_hour.set("07")  # Padrão 7h
        else:
            hour_values = [str(i).zfill(2) for i in range(0, 24)]
            self.start_hour = ttk.Combobox(time_frame, values=hour_values, width=5, font=(FONT_FAMILY, FONT_SIZE_NORMAL), state="readonly")
            self.start_hour.set("00")
            
        self.start_hour.grid(row=0, column=1, padx=5, pady=5)
        tk.Label(time_frame, text=":", font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f0f0f0").grid(row=0, column=2)
        
        # Seletor de minutos antigo para quadra (Combobox simples)
        if area_type.lower() == "quadra":
            minute_values = ["00", "15", "30", "45"]
            self.start_minute = ttk.Combobox(time_frame, values=minute_values, width=5, font=(FONT_FAMILY, FONT_SIZE_NORMAL), state="readonly")
            self.start_minute.set("00")
        else:
            minute_values = [str(i).zfill(2) for i in range(0, 60)]
            self.start_minute = ttk.Combobox(time_frame, values=minute_values, width=5, font=(FONT_FAMILY, FONT_SIZE_NORMAL), state="readonly")
            self.start_minute.set("00")
            
        self.start_minute.grid(row=0, column=3, padx=5, pady=5)
        
        # Horário de fim
        tk.Label(time_frame, text="HORA DE TÉRMINO:", font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f0f0f0").grid(row=1, column=0, padx=5, pady=5)
        
        # Seletor de hora para término
        if area_type.lower() == "quadra":
            self.end_hour = ttk.Combobox(time_frame, values=hour_values, width=5, font=(FONT_FAMILY, FONT_SIZE_NORMAL), state="readonly")
            self.end_hour.set("22")  # Padrão 22h
        else:
            self.end_hour = ttk.Combobox(time_frame, values=hour_values, width=5, font=(FONT_FAMILY, FONT_SIZE_NORMAL), state="readonly")
            self.end_hour.set("00")
            
        self.end_hour.grid(row=1, column=1, padx=5, pady=5)
        tk.Label(time_frame, text=":", font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f0f0f0").grid(row=1, column=2)
        
        # Seletor de minutos para término
        if area_type.lower() == "quadra":
            self.end_minute = ttk.Combobox(time_frame, values=minute_values, width=5, font=(FONT_FAMILY, FONT_SIZE_NORMAL), state="readonly")
            self.end_minute.set("00")
        else:
            self.end_minute = ttk.Combobox(time_frame, values=minute_values, width=5, font=(FONT_FAMILY, FONT_SIZE_NORMAL), state="readonly")
            self.end_minute.set("00")
            
        self.end_minute.grid(row=1, column=3, padx=5, pady=5)
        
        # Botões de atalho para quadra (seleção rápida de horários comuns)
        if area_type.lower() == "quadra":
            quick_frame = tk.Frame(self.main_frame, bg="#f0f0f0")
            quick_frame.pack(pady=10)
            
            tk.Label(quick_frame, text="HORÁRIOS RÁPIDOS:", font=(FONT_FAMILY, FONT_SIZE_SMALL), bg="#f0f0f0").pack()
            
            quick_buttons_frame = tk.Frame(quick_frame, bg="#f0f0f0")
            quick_buttons_frame.pack(pady=5)
            
            # Botões para horários comuns
            quick_times = [
                ("MANHÃ (7h-12h)", "07", "00", "12", "00"),
                ("TARDE (13h-18h)", "13", "00", "18", "00"),
                ("NOITE (18h-22h)", "18", "00", "22", "00"),
                ("2 HORAS (7h-9h)", "07", "00", "09", "00"),
                ("3 HORAS (19h-22h)", "19", "00", "22", "00")
            ]
            
            for i, (label, start_h, start_m, end_h, end_m) in enumerate(quick_times):
                btn = tk.Button(quick_buttons_frame, text=label, 
                              command=lambda sh=start_h, sm=start_m, eh=end_h, em=end_m: self._set_quick_time(sh, sm, eh, em),
                              font=(FONT_FAMILY, FONT_SIZE_SMALL), width=15)
                btn.grid(row=i//3, column=i%3, padx=2, pady=2)
        
        # Botões
        Button(self.main_frame, text="CONFIRMAR", command=self._on_ok, font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), width=15).pack(pady=(15,5))
        Button(self.main_frame, text="CANCELAR", command=self._on_cancel, font=(FONT_FAMILY, FONT_SIZE_NORMAL), width=15).pack(pady=5)
        
        self._center_dialog(parent)

    def _set_quick_time(self, start_h, start_m, end_h, end_m):
        """Define horários rápidos para quadra."""
        self.start_hour.set(start_h)
        self.start_minute.set(start_m)
        self.end_hour.set(end_h)
        self.end_minute.set(end_m)

    def _on_ok(self):
        try:
            start_time = time(int(self.start_hour.get()), int(self.start_minute.get()))
            end_time = time(int(self.end_hour.get()), int(self.end_minute.get()))
            
            # Validações específicas para quadra
            if self.area_type.lower() == "quadra":
                # Verifica se está dentro do horário permitido (7h-22h)
                if start_time < time(7, 0) or end_time > time(22, 0):
                    messagebox.showerror("HORÁRIO INVÁLIDO", 
                                       "A quadra só pode ser reservada entre 7h e 22h.", parent=self)
                    return
                
                # Verifica se o horário de início é pelo menos 7h
                if start_time < time(7, 0):
                    messagebox.showerror("HORÁRIO INVÁLIDO", 
                                       "A quadra só abre às 7h.", parent=self)
                    return
                
                # Verifica se o horário de término não passa das 22h
                if end_time > time(22, 0):
                    messagebox.showerror("HORÁRIO INVÁLIDO", 
                                       "A quadra fecha às 22h.", parent=self)
                    return
            
            if start_time >= end_time:
                messagebox.showerror("HORÁRIO INVÁLIDO", "O horário de término deve ser após o de início.", parent=self)
                return
            
            # Validação adicional: duração mínima de 1 hora para quadra
            if self.area_type.lower() == "quadra":
                from datetime import datetime, timedelta
                start_dt = datetime.combine(datetime.today(), start_time)
                end_dt = datetime.combine(datetime.today(), end_time)
                duration = end_dt - start_dt
                if duration < timedelta(hours=1):
                    messagebox.showerror("DURAÇÃO INVÁLIDA", 
                                       "A reserva da quadra deve ter pelo menos 1 hora de duração.", parent=self)
                    return
                
            self.result = (start_time, end_time)
            self.grab_release()
            self.destroy()
        except ValueError:
            messagebox.showerror("HORÁRIO INVÁLIDO", "Por favor, insira horários válidos.", parent=self)

    def _on_cancel(self):
        self.result = None
        self.grab_release()
        self.destroy()

# --- NOVO: DIÁLOGO DE VISUALIZAÇÃO DO CALENDÁRIO ---
class ReservationsCalendarDialog(CustomDialog):
    """Diálogo para visualizar todas as reservas em formato de calendário."""
    def __init__(self, parent, title, reservations_df):
        super().__init__(parent, title)
        self.reservations_df = reservations_df
        self.result = None
        self.current_filter = "all"  # Filtro atual: all, 7, 15, 30, 60
        
        # Configura o diálogo para duas colunas
        self.geometry("1200x700")
        
        # Frame principal com scroll
        main_scroll_frame = tk.Frame(self.main_frame, bg="#f0f0f0")
        main_scroll_frame.pack(fill="both", expand=True)
        
        # Canvas para scroll
        canvas = tk.Canvas(main_scroll_frame, bg="#f0f0f0")
        scrollbar = ttk.Scrollbar(main_scroll_frame, orient="vertical", command=canvas.yview)
        scrollable_frame = tk.Frame(canvas, bg="#f0f0f0")
        
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        # Título
        Label(scrollable_frame, text="CALENDÁRIO DE RESERVAS", font=(FONT_FAMILY, FONT_HEADER_SIZE, FONT_WEIGHT_BOLD), 
              bg="#f0f0f0", fg="#003366").pack(pady=(0, 20))
        
        # Frame para botões de filtro
        filter_frame = tk.Frame(scrollable_frame, bg="#f0f0f0")
        filter_frame.pack(fill="x", padx=10, pady=(0, 20))
        
        # Botão HISTÓRICO
        self.history_btn = tk.Button(filter_frame, text="📅 INTERVALO DE DATA", 
                                    command=self._show_history_dialog,
                                    font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                                    bg="#17A2B8", fg="white", relief="raised", bd=2, padx=15, pady=8)
        self.history_btn.pack(side="left", padx=(0, 10))
        
        # Label para mostrar filtro atual
        self.filter_label = tk.Label(filter_frame, text="Data Atual (hoje + futuro)", 
                                     font=(FONT_FAMILY, FONT_SIZE_NORMAL), 
                                     bg="#f0f0f0", fg="#666666")
        self.filter_label.pack(side="left", padx=10)
        
        # Frame para o conteúdo do calendário
        self.calendar_content_frame = tk.Frame(scrollable_frame, bg="#f0f0f0")
        self.calendar_content_frame.pack(fill="both", expand=True, padx=10)
        
        # Renderiza o calendário inicial
        self._render_calendar()
        
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Botão RESERVAS GARAGEM
        parking_btn = tk.Button(self.main_frame, text="RESERVAS GARAGEM", 
                               command=self._show_parking_reservations,
                               font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                               bg="#8B4513", fg="white", relief="raised", bd=2, padx=15, pady=10)
        parking_btn.pack(pady=10)
        
        # Botão fechar no final
        close_btn = tk.Button(self.main_frame, text="FECHAR", command=self._on_close, 
                             font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                             bg="#6c757d", fg="white", relief="raised", bd=2, padx=15, pady=10)
        close_btn.pack(pady=20)
        
        self._center_dialog(parent)
        
    def _show_parking_reservations(self):
        """Mostra as reservas de garagem dentro do diálogo de calendário."""
        # Limpa o conteúdo atual
        for widget in self.calendar_content_frame.winfo_children():
            widget.destroy()
        
        # Limpa os botões existentes
        for widget in self.main_frame.winfo_children():
            if isinstance(widget, tk.Button) and widget.cget('text') != "FECHAR":
                widget.destroy()
        
        # Oculta o botão INTERVALO DE DATA
        if hasattr(self, 'history_btn'):
            self.history_btn.pack_forget()
        
        # Cria um frame central para conter tudo
        center_frame = tk.Frame(self.calendar_content_frame, bg="#f0f0f0")
        center_frame.pack(expand=True, fill="both")
        
        # Centraliza todo o conteúdo
        center_frame.pack_configure(anchor="center")
        
        # Título para reservas de garagem
        title_label = Label(center_frame, text="RESERVAS DE VAGAS DE GARAGEM", 
                           font=(FONT_FAMILY, FONT_HEADER_SIZE, FONT_WEIGHT_BOLD), 
                           bg="#f0f0f0", fg="#003366")
        title_label.pack(pady=(0, 20))
        
        # Centraliza o título
        title_label.pack_configure(anchor="center")
        
        # Botão para mostrar vagas alugadas mensalmente
        monthly_btn = tk.Button(center_frame, text="MOSTRAR VAGAS ALUGADAS MENSAL", 
                               command=self._show_monthly_parking,
                               font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                               bg="#FF0000", fg="white", relief="raised", bd=2, padx=15, pady=8)
        monthly_btn.pack(pady=(0, 20))
        monthly_btn.pack_configure(anchor="center")
        
        # Filtra apenas reservas de garagem
        parking_reservations = self.reservations_df[self.reservations_df['area'] == 'garagem']
        
        # Debug: mostra informações sobre o filtro
        print(f"Total de reservas no DataFrame: {len(self.reservations_df)}")
        print(f"Colunas disponíveis: {list(self.reservations_df.columns)}")
        print(f"Valores únicos na coluna 'area': {self.reservations_df['area'].unique()}")
        print(f"Reservas de garagem encontradas: {len(parking_reservations)}")
        
        # Debug adicional: mostra todas as reservas de garagem
        if not parking_reservations.empty:
            print("=== RESERVAS DE GARAGEM ENCONTRADAS ===")
            for idx, row in parking_reservations.iterrows():
                print(f"  - Data: {row['date']}, Vaga: {row.get('parking_spot', 'N/A')}, Morador: {row['resident_name']}")
            print("=====================================")
        
        if parking_reservations.empty:
            empty_label = Label(center_frame, text="NENHUMA VAGA DE GARAGEM RESERVADA NO SISTEMA.", 
                               font=(FONT_FAMILY, FONT_SIZE_LARGE), 
                               bg="#f0f0f0", fg="#666666")
            empty_label.pack(pady=20)
            empty_label.pack_configure(anchor="center")
        else:
            # Filtra APENAS as reservas diárias (exclui as mensais primeiro)
            daily_parking = parking_reservations[parking_reservations['date'] != 'MENSAL']
            print(f"Reservas diárias encontradas: {len(daily_parking)}")
            
            if daily_parking.empty:
                empty_daily_label = Label(center_frame, text="NENHUMA VAGA DE GARAGEM RESERVADA DIARIAMENTE.", 
                                          font=(FONT_FAMILY, FONT_SIZE_LARGE), 
                                          bg="#f0f0f0", fg="#666666")
                empty_daily_label.pack(pady=20)
                empty_daily_label.pack_configure(anchor="center")
            else:
                # Ordena por data
                daily_parking = daily_parking.sort_values('date')
                
                # Converte para datetime APENAS as reservas diárias
                daily_parking['date_obj'] = pd.to_datetime(daily_parking['date'])
                
                # Filtra apenas reservas para datas futuras ou hoje
                today = datetime.now().date()
                print(f"Data de hoje: {today}")
                print(f"Antes do filtro de data: {len(daily_parking)} reservas")
                
                daily_parking = daily_parking[
                    (daily_parking['date_obj'].dt.date >= today)
                ]
                
                print(f"Depois do filtro de data: {len(daily_parking)} reservas")
                print(f"Filtro aplicado: data >= {today}")
                
                if daily_parking.empty:
                    empty_future_label = Label(center_frame, text="NENHUMA VAGA DE GARAGEM RESERVADA PARA DATAS FUTURAS.", 
                                              font=(FONT_FAMILY, FONT_SIZE_LARGE), 
                                              bg="#f0f0f0", fg="#666666")
                    empty_future_label.pack(pady=20)
                    empty_future_label.pack_configure(anchor="center")
                else:
                    # Agrupa reservas por data
                    reservations_by_date = {}
                    for _, reservation in daily_parking.iterrows():
                        reservation_date = reservation['date_obj']
                        date_str = reservation_date.strftime('%Y-%m-%d')
                        if date_str not in reservations_by_date:
                            reservations_by_date[date_str] = []
                        reservations_by_date[date_str].append(reservation)
                    
                    # Organiza as datas em grupos de três para três colunas
                    dates_list = list(reservations_by_date.keys())
                    
                    # Frame para organizar as colunas
                    columns_frame = tk.Frame(center_frame, bg="#f0f0f0")
                    columns_frame.pack(expand=True)
                    
                    # Centraliza o frame das colunas
                    columns_frame.pack_configure(anchor="center")
                    
                    # Centraliza o frame das colunas no center_frame
                    center_frame.pack_configure(anchor="center")
                    
                    # Configura o grid para três colunas
                    columns_frame.grid_columnconfigure(0, weight=1)
                    columns_frame.grid_columnconfigure(1, weight=1)
                    columns_frame.grid_columnconfigure(2, weight=1)
                    
                    # Processa as datas em grupos de três
                    for i in range(0, len(dates_list), 3):
                        row = i // 3
                        
                        # Primeira coluna (data atual)
                        if i < len(dates_list):
                            date1 = dates_list[i]
                            reservations1 = reservations_by_date[date1]
                            self._create_parking_date_column(columns_frame, date1, reservations1, 0, row)
                        
                        # Segunda coluna (próxima data, se existir)
                        if i + 1 < len(dates_list):
                            date2 = dates_list[i + 1]
                            reservations2 = reservations_by_date[date2]
                            self._create_parking_date_column(columns_frame, date2, reservations2, 1, row)
                        else:
                            # Se não há segunda data, deixa a coluna vazia
                            empty_frame = tk.Frame(columns_frame, bg="#f0f0f0")
                            empty_frame.grid(row=row, column=1, sticky="nsew", padx=5)
                        
                        # Terceira coluna (terceira data, se existir)
                        if i + 2 < len(dates_list):
                            date3 = dates_list[i + 2]
                            reservations3 = reservations_by_date[date3]
                            self._create_parking_date_column(columns_frame, date3, reservations3, 2, row)
                        else:
                            # Se não há terceira data, deixa a coluna vazia
                            empty_frame = tk.Frame(columns_frame, bg="#f0f0f0")
                            empty_frame.grid(row=row, column=2, sticky="nsew", padx=5)
                
                # Total de reservas
                total_frame = tk.Frame(center_frame, bg="#f0f0f0")
                total_frame.pack(pady=20)
                
                total_label = tk.Label(total_frame, text=f"📊 TOTAL DE RESERVAS DIÁRIAS: {len(daily_parking)}", 
                                     font=(FONT_SIZE_LARGE, FONT_WEIGHT_BOLD), 
                                     bg="#f0f0f0", fg="#003366")
                total_label.pack()
                
                # Centraliza o total
                total_label.pack_configure(anchor="center")
                total_frame.pack_configure(anchor="center")
        
        # Botão para voltar ao calendário
        back_btn = tk.Button(self.main_frame, text="VOLTAR AO CALENDÁRIO", 
                            command=self._return_to_calendar,
                            font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                            bg="#17A2B8", fg="white", relief="raised", bd=2, padx=15, pady=10)
        back_btn.pack(pady=10)
        
        # Centraliza o botão
        back_btn.pack_configure(anchor="center")
        self.main_frame.pack_configure(anchor="center")
        
    def _show_monthly_parking(self):
        """Mostra as vagas alugadas mensalmente."""
        # Limpa o conteúdo atual
        for widget in self.calendar_content_frame.winfo_children():
            widget.destroy()
        
        # Cria um frame central para conter tudo
        center_frame = tk.Frame(self.calendar_content_frame, bg="#f0f0f0")
        center_frame.pack(expand=True, fill="both")
        
        # Centraliza todo o conteúdo
        center_frame.pack_configure(anchor="center")
        
        # Título para vagas mensais
        title_label = Label(center_frame, text="VAGAS ALUGADAS MENSALMENTE", 
                           font=(FONT_FAMILY, FONT_HEADER_SIZE, FONT_WEIGHT_BOLD), 
                           bg="#f0f0f0", fg="#8B4513")
        title_label.pack(pady=(0, 20))
        title_label.pack_configure(anchor="center")
        
        # Filtra apenas reservas mensais de garagem
        monthly_reservations = self.reservations_df[
            (self.reservations_df['area'] == 'garagem') & 
            (self.reservations_df['date'] == 'MENSAL')
        ]
        
        if monthly_reservations.empty:
            empty_label = Label(center_frame, text="NENHUMA VAGA ALUGADA MENSALMENTE.", 
                               font=(FONT_FAMILY, FONT_SIZE_LARGE), 
                               bg="#f0f0f0", fg="#666666")
            empty_label.pack(pady=20)
            empty_label.pack_configure(anchor="center")
        else:
            # Ordena por número da vaga
            monthly_reservations = monthly_reservations.sort_values('parking_spot')
            
            # Frame para organizar as vagas em 3 colunas
            columns_frame = tk.Frame(center_frame, bg="#f0f0f0")
            columns_frame.pack(expand=True)
            columns_frame.pack_configure(anchor="center")
            
            # Configura o grid para três colunas
            columns_frame.grid_columnconfigure(0, weight=1)
            columns_frame.grid_columnconfigure(1, weight=1)
            columns_frame.grid_columnconfigure(2, weight=1)
            
            # Processa as vagas em grupos de três
            for i in range(0, len(monthly_reservations), 3):
                row = i // 3
                
                # Primeira coluna
                if i < len(monthly_reservations):
                    reservation1 = monthly_reservations.iloc[i]
                    self._create_monthly_parking_card(columns_frame, reservation1, 0, row)
                
                # Segunda coluna
                if i + 1 < len(monthly_reservations):
                    reservation2 = monthly_reservations.iloc[i + 1]
                    self._create_monthly_parking_card(columns_frame, reservation2, 1, row)
                else:
                    # Coluna vazia
                    empty_frame = tk.Frame(columns_frame, bg="#f0f0f0")
                    empty_frame.grid(row=row, column=1, sticky="nsew", padx=5)
                
                # Terceira coluna
                if i + 2 < len(monthly_reservations):
                    reservation3 = monthly_reservations.iloc[i + 2]
                    self._create_monthly_parking_card(columns_frame, reservation3, 2, row)
                else:
                    # Coluna vazia
                    empty_frame = tk.Frame(columns_frame, bg="#f0f0f0")
                    empty_frame.grid(row=row, column=2, sticky="nsew", padx=5)
            
            # Total de vagas mensais
            total_frame = tk.Frame(center_frame, bg="#f0f0f0")
            total_frame.pack(pady=20)
            total_frame.pack_configure(anchor="center")
            
            total_label = tk.Label(total_frame, text=f"📊 TOTAL DE VAGAS MENSAL: {len(monthly_reservations)}", 
                                 font=(FONT_FAMILY, FONT_SIZE_LARGE, FONT_WEIGHT_BOLD), 
                                 bg="#f0f0f0", fg="#8B4513")
            total_label.pack()
            total_label.pack_configure(anchor="center")
        
        # Botão para voltar às reservas de garagem
        back_btn = tk.Button(center_frame, text="VOLTAR ÀS RESERVAS DE GARAGEM", 
                            command=self._show_parking_reservations,
                            font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                            bg="#17A2B8", fg="white", relief="raised", bd=2, padx=15, pady=10)
        back_btn.pack(pady=10)
        back_btn.pack_configure(anchor="center")
        
    def _create_monthly_parking_card(self, parent_frame, reservation, column, row):
        """Cria um card para uma vaga alugada mensalmente."""
        # Frame da vaga
        card_frame = tk.Frame(parent_frame, bg="#f0f0f0", relief="solid", bd=1)
        card_frame.grid(row=row, column=column, sticky="nsew", padx=5, pady=5)
        
        # Cabeçalho da vaga
        parking_spot = reservation.get('parking_spot', 'N/A')
        try:
            # Converte para inteiro para garantir formato correto
            spot_number = int(float(parking_spot))
            if 1 <= spot_number <= 10:
                # 10 cores diferentes para as 10 vagas
                spot_colors = [
                    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
                    "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"
                ]
                area_color = spot_colors[spot_number - 1]
                # Garante que a vaga seja exibida como número inteiro
                parking_spot_display = str(spot_number)
            else:
                area_color = "#8B4513"
                parking_spot_display = str(parking_spot)
        except (ValueError, TypeError):
            area_color = "#8B4513"
            parking_spot_display = str(parking_spot)
        
        # Cabeçalho da reserva
        header_frame = tk.Frame(card_frame, bg=area_color)
        header_frame.pack(fill="x")
        
        Label(header_frame, text=f" 🚗 VAGA {parking_spot_display} - MENSAL", 
              font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
              bg=area_color, fg="white").pack(anchor="center")
        
        # Detalhes da reserva
        details_frame = tk.Frame(card_frame, bg="#f8f9fa")
        details_frame.pack(fill="both", expand=True, padx=8, pady=8)
        
        # Morador responsável
        tk.Label(details_frame, text=f"Morador: {reservation['resident_name']}", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa").pack(anchor="center")
        
        # Bloco/Apto
        tk.Label(details_frame, text=f"Bloco/Apto: {reservation['block']}/{reservation['apartment']}", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa").pack(anchor="center")
        
        # Status do pagamento
        payment_status = reservation['payment_status']
        payment_color = "#28a745" if payment_status == 'pago' else "#ffc107"
        tk.Label(details_frame, text=f"Pagamento: {payment_status.upper()}", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa", fg=payment_color).pack(anchor="center")
        
        # Porteiro
        tk.Label(details_frame, text=f"Porteiro: {reservation['doorman_name']}", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa").pack(anchor="center")
        
        # Botão EXCLUIR
        delete_btn = tk.Button(details_frame, text="EXCLUIR LOCAÇÃO", 
                              command=lambda r=reservation: self._delete_monthly_parking(r),
                              font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                              bg="#DC143C", fg="white", relief="raised", bd=2, padx=8, pady=4)
        delete_btn.pack(pady=(8, 0))
        delete_btn.pack_configure(anchor="center")
        
    def _delete_monthly_parking(self, reservation):
        """Remove uma locação mensal de garagem."""
        parking_spot = reservation.get('parking_spot', 'N/A')
        resident_name = reservation['resident_name']
        
        # Converte para inteiro para garantir formato correto
        try:
            parking_spot_display = str(int(float(parking_spot)))
        except (ValueError, TypeError):
            parking_spot_display = str(parking_spot)
        
        confirm = messagebox.askyesno(
            "CONFIRMAR EXCLUSÃO",
            f"Confirma a exclusão da LOCAÇÃO MENSAL da VAGA {parking_spot_display}?\n\n"
            f"Morador: {resident_name}\n\n"
            "Esta vaga voltará a ficar disponível para locação diária.",
            parent=self
        )
        
        if confirm:
            # Remove a reserva mensal
            self.reservations_df = self.reservations_df.drop(reservation.name)
            
            # Salva as alterações
            if save_reservations(self.reservations_df):
                messagebox.showinfo(
                    "EXCLUSÃO REALIZADA",
                    f"LOCAÇÃO MENSAL da VAGA {parking_spot_display} removida com sucesso!\n\n"
                    "A vaga está novamente disponível para locação diária.",
                    parent=self
                )
                # Atualiza a visualização
                self._show_monthly_parking()
            else:
                messagebox.showerror(
                    "ERRO",
                    "Erro ao salvar as alterações. Tente novamente.",
                    parent=self
                )
        
    def _return_to_calendar(self):
        """Retorna ao calendário principal."""
        # Limpa o conteúdo atual
        for widget in self.calendar_content_frame.winfo_children():
            widget.destroy()
        
        # Remove os botões adicionais
        for widget in self.main_frame.winfo_children():
            if isinstance(widget, tk.Button) and widget.cget('text') not in ["FECHAR", "RESERVAS GARAGEM"]:
                widget.destroy()
        
        # Mostra novamente o botão INTERVALO DE DATA
        if hasattr(self, 'history_btn'):
            self.history_btn.pack(side="left", padx=(0, 10))
        
        # Renderiza o calendário novamente
        self._render_calendar()

    def _show_reservation_details(self, parent_frame, reservation):
        """Mostra os detalhes de uma reserva específica."""
        try:
            print(f"DEBUG: _show_reservation_details iniciado para área {reservation.get('area', 'N/A')}")
            
            # Frame para a reserva
            res_frame = tk.Frame(parent_frame, bg="#f0f0f0", relief="solid", bd=1)
            res_frame.pack(fill="x", padx=5, pady=3)
            
            # Cor baseada no tipo de área
            area_colors = {
                AREA_COURT: "#228B22",  # Verde para quadra
                AREA_POOL: "#1E90FF",   # Azul para piscina
                AREA_BBQ: "#D2691E"     # Marrom para churrasqueira
            }
            
            area_color = area_colors.get(reservation['area'], "#666666")
            
            # Cabeçalho da reserva
            header_frame = tk.Frame(res_frame, bg=area_color)
            header_frame.pack(fill="x")
            
            area_name = {
                AREA_COURT: "QUADRA",
                AREA_POOL: "PISCINA", 
                AREA_BBQ: "CHURRASQUEIRA"
            }.get(reservation['area'], "ÁREA")
            
            Label(header_frame, text=f" {area_name}", font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                  bg=area_color, fg="white").pack(side="left")
            
            # Detalhes da reserva
            details_frame = tk.Frame(res_frame, bg="#f8f9fa")
            details_frame.pack(fill="both", expand=True, padx=8, pady=8)
            
            # Morador responsável
            tk.Label(details_frame, text=f"Morador: {reservation['resident_name']}", 
                    font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa").pack(anchor="w")
            
            # Bloco/Apto
            tk.Label(details_frame, text=f"Bloco/Apto: {reservation['block']}/{reservation['apartment']}", 
                    font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa").pack(anchor="w")
            
            # Horários (se aplicável)
            if reservation['start_time'] != 'N/A' and reservation['end_time'] != 'N/A':
                tk.Label(details_frame, text=f"Horário: {reservation['start_time']} - {reservation['end_time']}", 
                        font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa").pack(anchor="w")
            
            # Visitantes (se aplicável)
            if reservation['visitors'] != 'N/A':
                tk.Label(details_frame, text=f"Visitantes: {reservation['visitors']}", 
                        font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa").pack(anchor="w")
            
            # Status do pagamento (se aplicável)
            if reservation['payment_status'] != 'N/A':
                payment_color = "#28a745" if reservation['payment_status'] == 'pago' else "#ffc107"
                tk.Label(details_frame, text=f"Pagamento: {reservation['payment_status'].upper()}", 
                        font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa", fg=payment_color).pack(anchor="w")
            
            # Porteiro
            tk.Label(details_frame, text=f"Porteiro: {reservation['doorman_name']}", 
                    font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa").pack(anchor="w")
            
            # Frame para botões
            buttons_frame = tk.Frame(details_frame, bg="#f8f9fa")
            buttons_frame.pack(pady=(8, 0))
            
            # Botão EDITAR
            edit_btn = tk.Button(buttons_frame, text="EDITAR", 
                                command=lambda r=reservation: self._edit_reservation_from_calendar(r),
                                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                                bg="#FF1493", fg="white", relief="raised", bd=2, padx=8, pady=4)
            edit_btn.pack(side="left", padx=(0, 8))
            
            # Botão VISITANTES (apenas para quadra)
            if reservation['area'] == AREA_COURT and reservation['visitors'] != 'N/A':
                visitors_btn = tk.Button(buttons_frame, text="VISITANTES", 
                                       command=lambda r=reservation: self._show_visitors_list(r),
                                       font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                                       bg="#17A2B8", fg="white", relief="raised", bd=2, padx=8, pady=4)
                visitors_btn.pack(side="left", padx=(0, 8))
            
            # Botão EXCLUIR
            delete_btn = tk.Button(buttons_frame, text="EXCLUIR", 
                                  command=lambda r=reservation: self._delete_reservation_from_calendar(r),
                                  font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                                  bg="#DC143C", fg="white", relief="raised", bd=2, padx=8, pady=4)
            delete_btn.pack(side="left")
            
            print(f"DEBUG: _show_reservation_details concluído para área {reservation.get('area', 'N/A')}")
            
        except Exception as e:
            print(f"ERRO em _show_reservation_details: {e}")
            import traceback
            traceback.print_exc()

    def _edit_reservation_from_calendar(self, reservation):
        """Edita uma reserva diretamente do calendário."""
        # Fecha o diálogo do calendário
        self._on_close()
        
        # Chama a função de edição da classe principal
        # Precisamos passar a referência para a classe principal
        if hasattr(self, 'parent_app'):
            self.parent_app._edit_specific_reservation(reservation)
        else:
            # Fallback: mostra mensagem de erro
            messagebox.showerror("ERRO", "Não foi possível editar a reserva.", parent=self)
    
    def _delete_reservation_from_calendar(self, reservation):
        """Exclui uma reserva diretamente do calendário."""
        area_name = {"quadra": "QUADRA", "piscina": "PISCINA", "churrasqueira": "CHURRASQUEIRA"}[reservation['area']]
        date_str = datetime.strptime(reservation['date'], '%Y-%m-%d').strftime('%d/%m/%Y')
        
        if messagebox.askyesno("CONFIRMAR EXCLUSÃO", f"Confirma a EXCLUSÃO da reserva de {area_name} para {date_str} em nome de {reservation['resident_name']}?\n\nATENÇÃO: Esta ação não pode ser desfeita!", parent=self):
            # Fecha o diálogo do calendário
            self._on_close()
            
            # Chama a função de exclusão da classe principal
            if hasattr(self, 'parent_app'):
                self.parent_app._delete_reservation_from_calendar(reservation)
            else:
                # Fallback: mostra mensagem de erro
                messagebox.showerror("ERRO", "Não foi possível excluir a reserva.", parent=self)
    
    def _render_calendar(self):
        """Renderiza o calendário com base no filtro atual (excluindo garagem)."""
        try:
            print("DEBUG: Iniciando _render_calendar")
            
            # Limpa o frame de conteúdo
            for widget in self.calendar_content_frame.winfo_children():
                widget.destroy()
            
            print("DEBUG: Frame limpo")
            
            # Aplica o filtro baseado na seleção atual E exclui garagem
            filtered_df = self._apply_date_filter()
            print(f"DEBUG: Filtro aplicado, DataFrame com {len(filtered_df)} linhas")
            
            # Filtra para excluir garagem do calendário
            filtered_df = filtered_df[filtered_df['area'] != 'garagem']
            print(f"DEBUG: Garagem filtrada, DataFrame com {len(filtered_df)} linhas")
            
            if filtered_df.empty:
                Label(self.calendar_content_frame, text="NENHUMA RESERVA ENCONTRADA PARA O PERÍODO SELECIONADO.", 
                      font=(FONT_FAMILY, FONT_SIZE_LARGE), 
                      bg="#f0f0f0", fg="#666666").pack(pady=20)
                print("DEBUG: DataFrame vazio, retornando")
                return
            
            # Converte para datetime e ordena
            print("DEBUG: Convertendo para datetime")
            filtered_df['date_obj'] = pd.to_datetime(filtered_df['date'])
            filtered_df = filtered_df.sort_values('date_obj')
            print("DEBUG: Datetime convertido e ordenado")
            
            # Agrupa reservas por data
            print("DEBUG: Agrupando reservas por data")
            reservations_by_date = {}
            for _, reservation in filtered_df.iterrows():
                reservation_date = reservation['date_obj']
                date_str = reservation_date.strftime('%Y-%m-%d')
                if date_str not in reservations_by_date:
                    reservations_by_date[date_str] = []
                reservations_by_date[date_str].append(reservation)
            
            print(f"DEBUG: Reservas agrupadas em {len(reservations_by_date)} datas")
            
            # Organiza as datas em grupos de três para três colunas
            dates_list = list(reservations_by_date.keys())
            
            # Frame para organizar as colunas
            print("DEBUG: Criando frame de colunas")
            columns_frame = tk.Frame(self.calendar_content_frame, bg="#f0f0f0")
            columns_frame.pack(fill="both", expand=True)
            
            # Configura o grid para três colunas
            columns_frame.grid_columnconfigure(0, weight=1)
            columns_frame.grid_columnconfigure(1, weight=1)
            columns_frame.grid_columnconfigure(2, weight=1)
            print("DEBUG: Grid configurado")
            
            # Processa as datas em grupos de três
            print("DEBUG: Processando colunas de datas")
            for i in range(0, len(dates_list), 3):
                row = i // 3
                print(f"DEBUG: Processando linha {row}")
                
                # Primeira coluna (data atual)
                if i < len(dates_list):
                    date1 = dates_list[i]
                    reservations1 = reservations_by_date[date1]
                    print(f"DEBUG: Criando coluna 0 para data {date1}")
                    self._create_date_column(columns_frame, date1, reservations1, 0, row)
                
                # Segunda coluna (próxima data, se existir)
                if i + 1 < len(dates_list):
                    date2 = dates_list[i + 1]
                    reservations2 = reservations_by_date[date2]
                    print(f"DEBUG: Criando coluna 1 para data {date2}")
                    self._create_date_column(columns_frame, date2, reservations2, 1, row)
                else:
                    # Se não há segunda data, deixa a coluna vazia
                    print(f"DEBUG: Coluna 1 vazia para linha {row}")
                    empty_frame = tk.Frame(columns_frame, bg="#f0f0f0")
                    empty_frame.grid(row=row, column=1, sticky="nsew", padx=5)
                
                # Terceira coluna (terceira data, se existir)
                if i + 2 < len(dates_list):
                    date3 = dates_list[i + 2]
                    reservations3 = reservations_by_date[date3]
                    print(f"DEBUG: Criando coluna 2 para data {date3}")
                    self._create_date_column(columns_frame, date3, reservations3, 2, row)
                else:
                    # Se não há terceira data, deixa a coluna vazia
                    print(f"DEBUG: Coluna 2 vazia para linha {row}")
                    empty_frame = tk.Frame(columns_frame, bg="#f0f0f0")
                    empty_frame.grid(row=row, column=2, sticky="nsew", padx=5)
            
            print("DEBUG: _render_calendar concluído com sucesso")
            
        except Exception as e:
            print(f"ERRO em _render_calendar: {e}")
            import traceback
            traceback.print_exc()
    
    def _apply_date_filter(self):
        """Aplica o filtro de data baseado na seleção atual."""
        df_copy = self.reservations_df.copy()
        if 'date' not in df_copy.columns or df_copy['date'].isnull().all():
            return pd.DataFrame() # Retorna DF vazio se não houver datas

        # Filtra apenas reservas com datas válidas (exclui vagas mensais)
        df_copy = df_copy[df_copy['date'] != 'MENSAL']
        
        # Converte para datetime apenas as reservas com datas válidas
        df_copy['date_obj'] = pd.to_datetime(df_copy['date'])
        
        today = datetime.now().date()
        yesterday = today - pd.Timedelta(days=1)
        
        if self.current_filter == "all":
            return df_copy[df_copy['date_obj'].dt.date >= today]
        elif self.current_filter == "7":
            start_date = yesterday - pd.Timedelta(days=6)
            return df_copy[(df_copy['date_obj'].dt.date >= start_date) & (df_copy['date_obj'].dt.date <= yesterday)]
        elif self.current_filter == "15":
            start_date = yesterday - pd.Timedelta(days=14)
            return df_copy[(df_copy['date_obj'].dt.date >= start_date) & (df_copy['date_obj'].dt.date <= yesterday)]
        elif self.current_filter == "30":
            start_date = yesterday - pd.Timedelta(days=29)
            return df_copy[(df_copy['date_obj'].dt.date >= start_date) & (df_copy['date_obj'].dt.date <= yesterday)]
        elif self.current_filter == "60":
            start_date = yesterday - pd.Timedelta(days=59)
            return df_copy[(df_copy['date_obj'].dt.date >= start_date) & (df_copy['date_obj'].dt.date <= yesterday)]
        
        return pd.DataFrame()
    
    def _show_history_dialog(self):
        """Mostra o diálogo para seleção de período do histórico."""
        history_dialog = tk.Toplevel(self)
        history_dialog.title("INTERVALO DE DATA")
        history_dialog.geometry("500x400")
        history_dialog.configure(bg="#f0f0f0")
        history_dialog.transient(self)
        history_dialog.grab_set()
        
        # Centraliza o diálogo
        history_dialog.geometry("+%d+%d" % (self.winfo_rootx() + 50, self.winfo_rooty() + 50))
        
        # Título
        title_label = tk.Label(history_dialog, text="📅 INTERVALO DE DATA", 
                               font=(FONT_FAMILY, FONT_HEADER_SIZE, FONT_WEIGHT_BOLD), 
                               bg="#f0f0f0", fg="#003366")
        title_label.pack(pady=(20, 30))
        
        # Descrição
        desc_label = tk.Label(history_dialog, 
                              text="Selecione o intervalo de data para visualizar:", 
                              font=(FONT_FAMILY, FONT_SIZE_NORMAL), 
                              bg="#f0f0f0", fg="#666666")
        desc_label.pack(pady=(0, 20))
        
        # Frame para os botões de período
        buttons_frame = tk.Frame(history_dialog, bg="#f0f0f0")
        buttons_frame.pack(expand=True)
        
        # Botões de período
        periods = [
            ("Data Atual (hoje + futuro)", "all", "#28a745"),
            ("Últimos 7 dias", "7", "#20c997"),
            ("Últimos 15 dias", "15", "#17a2b8"),
            ("Últimos 30 dias", "30", "#ffc107"),
            ("Últimos 60 dias", "60", "#fd7e14")
        ]
        
        for text, value, color in periods:
            btn = tk.Button(buttons_frame, text=text, 
                          command=lambda v=value: self._select_period(v, history_dialog),
                          font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                          bg=color, fg="white", relief="raised", bd=2, 
                          padx=20, pady=10, width=35, height=1)
            btn.pack(pady=5)
        
        # Botão cancelar
        cancel_btn = tk.Button(history_dialog, text="CANCELAR", 
                               command=history_dialog.destroy,
                               font=(FONT_FAMILY, FONT_SIZE_NORMAL),
                               bg="#6c757d", fg="white", relief="raised", bd=2, 
                               padx=20, pady=8, width=20)
        cancel_btn.pack(pady=15)
    
    def _select_period(self, period, dialog):
        """Seleciona o período e atualiza o calendário."""
        self.current_filter = period
        
        # Atualiza o label do filtro
        period_names = {
            "7": "Últimos 7 dias (ontem + 6 dias atrás)",
            "15": "Últimos 15 dias (ontem + 14 dias atrás)",
            "30": "Últimos 30 dias (ontem + 29 dias atrás)", 
            "60": "Últimos 60 dias (ontem + 59 dias atrás)",
            "all": "Data Atual (hoje + futuro)"
        }
        
        self.filter_label.config(text=period_names.get(period, 'Desconhecido'))
        
        # Renderiza o calendário com o novo filtro
        self._render_calendar()
        
        # Fecha o diálogo
        dialog.destroy()
        
    def _create_parking_date_column(self, parent_frame, date_str, reservations, column, row):
        """Cria uma coluna para uma data específica com suas reservas de garagem."""
        # Frame da coluna
        column_frame = tk.Frame(parent_frame, bg="#f0f0f0", relief="solid", bd=1)
        column_frame.grid(row=row, column=column, sticky="nsew", padx=5, pady=5)
        
        # Cabeçalho da data
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        date_display = date_obj.strftime('%d/%m/%Y')
        
        date_header = tk.Frame(column_frame, bg="#8B4513", relief="solid", bd=2)  # Cor marrom para garagem
        date_header.pack(fill="x", pady=(0, 10))
        
        date_label = tk.Label(date_header, text=f"📅 {date_display}", 
                            font=(FONT_FAMILY, FONT_SIZE_LARGE, FONT_WEIGHT_BOLD), 
                            bg="#8B4513", fg="white")
        date_label.pack(pady=8, anchor="center")
        
        # Frame para as reservas desta data
        reservations_frame = tk.Frame(column_frame, bg="#f0f0f0")
        reservations_frame.pack(fill="both", expand=True, padx=5)
        
        # Centraliza o conteúdo da coluna
        column_frame.grid_columnconfigure(0, weight=1)
        column_frame.grid_rowconfigure(1, weight=1)
        
        # Mostra todas as reservas desta data
        for reservation in reservations:
            self._show_parking_reservation_details(reservations_frame, reservation)
        
    def _show_parking_reservation_details(self, parent_frame, reservation):
        """Mostra os detalhes de uma reserva de garagem específica."""
        # Frame para a reserva
        res_frame = tk.Frame(parent_frame, bg="#f0f0f0", relief="solid", bd=1)
        res_frame.pack(fill="x", padx=5, pady=3)
        
        # Centraliza o card da reserva
        res_frame.pack_configure(anchor="center")
        
        # Cores diferentes para cada vaga (1-10)
        parking_spot = reservation.get('parking_spot', 'N/A')
        try:
            # Converte para inteiro para garantir formato correto
            spot_number = int(float(parking_spot))
            if 1 <= spot_number <= 10:
                # 10 cores diferentes para as 10 vagas (tons escuros)
                spot_colors = [
                    "#DC143C",  # Vermelho escuro
                    "#006400",  # Verde escuro
                    "#000080",  # Azul escuro
                    "#228B22",  # Verde floresta
                    "#B8860B",  # Dourado escuro
                    "#800080",  # Roxo escuro
                    "#008B8B",  # Verde azulado escuro
                    "#DAA520",  # Dourado escuro
                    "#4B0082",  # Índigo escuro
                    "#191970"   # Azul meia-noite
                ]
                area_color = spot_colors[spot_number - 1]
                # Garante que a vaga seja exibida como número inteiro
                parking_spot_display = str(spot_number)
            else:
                area_color = "#8B4513"  # Marrom padrão
                parking_spot_display = str(parking_spot)
        except (ValueError, TypeError):
            area_color = "#8B4513"  # Marrom padrão
            parking_spot_display = str(parking_spot)
        
        # Cabeçalho da reserva
        header_frame = tk.Frame(res_frame, bg=area_color)
        header_frame.pack(fill="x")
        
        Label(header_frame, text=f" 🚗 VAGA {parking_spot_display}", font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
              bg=area_color, fg="white").pack(anchor="center")
        
        # Detalhes da reserva
        details_frame = tk.Frame(res_frame, bg="#f8f9fa")
        details_frame.pack(fill="both", expand=True, padx=8, pady=8)
        
        # Morador responsável
        tk.Label(details_frame, text=f"Morador: {reservation['resident_name']}", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa").pack(anchor="center")
        
        # Bloco/Apto
        tk.Label(details_frame, text=f"Bloco/Apto: {reservation['block']}/{reservation['apartment']}", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa").pack(anchor="center")
        
        # Visitantes - REMOVIDO (não faz sentido para garagem)
        
        # Status do pagamento
        payment_status = reservation['payment_status']
        payment_color = "#28a745" if payment_status == 'pago' else "#ffc107"
        tk.Label(details_frame, text=f"Pagamento: {payment_status.upper()}", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa", fg=payment_color).pack(anchor="center")
        
        # Porteiro
        tk.Label(details_frame, text=f"Porteiro: {reservation['doorman_name']}", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL), bg="#f8f9fa").pack(anchor="center")
    
    def _create_date_column(self, parent_frame, date_str, reservations, column, row):
        """Cria uma coluna para uma data específica com suas reservas."""
        try:
            print(f"DEBUG: _create_date_column iniciado para data {date_str}, coluna {column}, linha {row}")
            
            # Frame da coluna
            column_frame = tk.Frame(parent_frame, bg="#f0f0f0", relief="solid", bd=1)
            column_frame.grid(row=row, column=column, sticky="nsew", padx=5, pady=5)
            
            # Cabeçalho da data
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            date_display = date_obj.strftime('%d/%m/%Y')
            
            date_header = tk.Frame(column_frame, bg="#003366", relief="solid", bd=2)
            date_header.pack(fill="x", pady=(0, 10))
            
            date_label = tk.Label(date_header, text=f"📅 {date_display}", 
                                font=(FONT_FAMILY, FONT_SIZE_LARGE, FONT_WEIGHT_BOLD), 
                                bg="#003366", fg="white")
            date_label.pack(pady=8)
            
            # Frame para as reservas desta data
            reservations_frame = tk.Frame(column_frame, bg="#f0f0f0")
            reservations_frame.pack(fill="both", expand=True, padx=5)
            
            print(f"DEBUG: Processando {len(reservations)} reservas para data {date_str}")
            
            # Mostra todas as reservas desta data
            for i, reservation in enumerate(reservations):
                print(f"DEBUG: Processando reserva {i+1}/{len(reservations)}")
                # Converte para dicionário se for Series, senão usa como está
                if hasattr(reservation, 'to_dict'):
                    reservation_dict = reservation.to_dict()
                else:
                    reservation_dict = reservation
                self._show_reservation_details(reservations_frame, reservation_dict)
            
            print(f"DEBUG: _create_date_column concluído para data {date_str}")
            
        except Exception as e:
            print(f"ERRO em _create_date_column para data {date_str}: {e}")
            import traceback
            traceback.print_exc()
    
    def _show_visitors_list(self, reservation):
        """Mostra a lista de visitantes de uma reserva de quadra."""
        # Extrai a lista de visitantes
        visitors_str = reservation['visitors']
        if visitors_str == 'N/A' or not visitors_str:
            messagebox.showinfo("VISITANTES", "Nenhum visitante cadastrado para esta reserva.", parent=self)
            return
        
        # Separa os visitantes (assumindo que estão separados por ponto e vírgula)
        visitors_list = [v.strip() for v in visitors_str.split(';') if v.strip()]
        
        if not visitors_list:
            messagebox.showinfo("VISITANTES", "Nenhum visitante cadastrado para esta reserva.", parent=self)
            return
        
        # Cria o texto da mensagem
        area_name = {"quadra": "QUADRA"}[reservation['area']]
        date_str = datetime.strptime(reservation['date'], '%Y-%m-%d').strftime('%d/%m/%Y')
        
        message = f"🏟️ {area_name} - {date_str}\n"
        message += f"👤 Morador: {reservation['resident_name']}\n"
        message += f"🏢 Bloco/Apto: {reservation['block']}/{reservation['apartment']}\n"
        message += f"⏰ Horário: {reservation['start_time']} - {reservation['end_time']}\n\n"
        message += "👥 LISTA DE VISITANTES:\n"
        message += "─" * 30 + "\n"
        
        for i, visitor in enumerate(visitors_list, 1):
            message += f"{i}. {visitor}\n"
        
        message += "\n" + "─" * 30 + "\n"
        message += f"Total: {len(visitors_list)} visitante(s)"
        
        # Mostra a lista em um modal
        messagebox.showinfo("VISITANTES CADASTRADOS", message, parent=self)
    
    def _on_close(self):
        self.result = True
        self.grab_release()
        self.destroy()

# --- NOVO: FUNÇÕES PARA RESERVAS ---
def load_reservations():
    """Carrega os dados das reservas."""
    return load_data(
        RESERVATIONS_FILE,
        columns=["area", "date", "start_time", "end_time", "block", "apartment",
                 "resident_name", "visitors", "payment_status", "doorman_name", "parking_spot"],
        dtypes={"block": str, "apartment": str}
    )

def save_reservations(df):
    """Salva os dados das reservas."""
    try:
        if save_data(df, RESERVATIONS_FILE):
            print(f"Reservas salvas com sucesso. Total: {len(df)}")
            return True
        else:
            print("Falha ao salvar reservas")
            return False
    except Exception as e:
        print(f"Erro ao salvar reservas: {e}")
        return False

def send_reservation_confirmation_whatsapp(resident_phone, reservation_data, output_widget):
    """
    Envia confirmação de reserva via WhatsApp usando a API Oficial do Meta.
    Usa templates aprovados pelo Meta para cada tipo de reserva.
    """
    if not resident_phone or resident_phone in ["0", STATUS_NA]:
        output_widget.print_message("TELEFONE NÃO DISPONÍVEL PARA ENVIO DE CONFIRMAÇÃO.", style="info")
        return {'success': False, 'reason': 'Telefone não disponível', 'message_type': 'reservation'}
    
    # Handle monthly parking or other special date formats
    if reservation_data['date'] == 'MENSAL':
        date_str = "LOCAÇÃO MENSAL"
    else:
        date_str = datetime.strptime(reservation_data['date'], '%Y-%m-%d').strftime('%d/%m/%Y')
    
    # Seleciona o template e parâmetros baseado no tipo de reserva
    if reservation_data['area'] == AREA_BBQ:
        template_name = TEMPLATE_RESERVATION_BBQ
        template_params = [
            {"type": "text", "parameter_name": "data", "text": date_str},
            {"type": "text", "parameter_name": "nome_morador", "text": reservation_data['resident_name']},
            {"type": "text", "parameter_name": "bloco", "text": reservation_data['block']},
            {"type": "text", "parameter_name": "apartamento", "text": reservation_data['apartment']},
            {"type": "text", "parameter_name": "pagamento", "text": reservation_data['payment_status'].upper()},
            {"type": "text", "parameter_name": "porteiro", "text": reservation_data['doorman_name']}
        ]
    
    elif reservation_data['area'] == AREA_PARKING:
        # Mensagem específica para garagem
        parking_spot = reservation_data.get('parking_spot', 'N/A')
        try:
            parking_spot_display = str(int(float(parking_spot)))
        except (ValueError, TypeError):
            parking_spot_display = str(parking_spot)
        
        if reservation_data['date'] == 'MENSAL':
            template_name = TEMPLATE_RESERVATION_PARKING_MONTHLY
            template_params = [
                {"type": "text", "parameter_name": "vaga", "text": parking_spot_display},
                {"type": "text", "parameter_name": "nome_morador", "text": reservation_data['resident_name']},
                {"type": "text", "parameter_name": "bloco", "text": reservation_data['block']},
                {"type": "text", "parameter_name": "apartamento", "text": reservation_data['apartment']},
                {"type": "text", "parameter_name": "pagamento", "text": reservation_data['payment_status'].upper()},
                {"type": "text", "parameter_name": "porteiro", "text": reservation_data['doorman_name']}
            ]
        else:
            template_name = TEMPLATE_RESERVATION_PARKING
            template_params = [
                {"type": "text", "parameter_name": "data", "text": date_str},
                {"type": "text", "parameter_name": "vaga", "text": parking_spot_display},
                {"type": "text", "parameter_name": "nome_morador", "text": reservation_data['resident_name']},
                {"type": "text", "parameter_name": "bloco", "text": reservation_data['block']},
                {"type": "text", "parameter_name": "apartamento", "text": reservation_data['apartment']},
                {"type": "text", "parameter_name": "pagamento", "text": reservation_data['payment_status'].upper()},
                {"type": "text", "parameter_name": "porteiro", "text": reservation_data['doorman_name']}
            ]
    
    elif reservation_data['area'] == AREA_POOL:
        template_name = TEMPLATE_RESERVATION_POOL
        visitors = reservation_data.get('visitors', 'N/A')
        if visitors == 'N/A':
            visitors = '0'
        template_params = [
            {"type": "text", "parameter_name": "data", "text": date_str},
            {"type": "text", "parameter_name": "nome_morador", "text": reservation_data['resident_name']},
            {"type": "text", "parameter_name": "bloco", "text": reservation_data['block']},
            {"type": "text", "parameter_name": "apartamento", "text": reservation_data['apartment']},
            {"type": "text", "parameter_name": "visitantes", "text": str(visitors)},
            {"type": "text", "parameter_name": "porteiro", "text": reservation_data['doorman_name']}
        ]
    
    elif reservation_data['area'] == AREA_COURT:
        template_name = TEMPLATE_RESERVATION_COURT
        visitors = reservation_data.get('visitors', 'N/A')
        if visitors == 'N/A':
            visitors = '0'
        template_params = [
            {"type": "text", "parameter_name": "data", "text": date_str},
            {"type": "text", "parameter_name": "horario_inicio", "text": reservation_data.get('start_time', 'N/A')},
            {"type": "text", "parameter_name": "horario_fim", "text": reservation_data.get('end_time', 'N/A')},
            {"type": "text", "parameter_name": "nome_morador", "text": reservation_data['resident_name']},
            {"type": "text", "parameter_name": "bloco", "text": reservation_data['block']},
            {"type": "text", "parameter_name": "apartamento", "text": reservation_data['apartment']},
            {"type": "text", "parameter_name": "visitantes", "text": str(visitors)},
            {"type": "text", "parameter_name": "porteiro", "text": reservation_data['doorman_name']}
        ]
    
    else:
        # Tipo de reserva desconhecido - usa template genérico de quadra como fallback
        template_name = TEMPLATE_RESERVATION_COURT
        template_params = [
            {"type": "text", "parameter_name": "data", "text": date_str},
            {"type": "text", "parameter_name": "horario_inicio", "text": reservation_data.get('start_time', 'N/A')},
            {"type": "text", "parameter_name": "horario_fim", "text": reservation_data.get('end_time', 'N/A')},
            {"type": "text", "parameter_name": "nome_morador", "text": reservation_data['resident_name']},
            {"type": "text", "parameter_name": "bloco", "text": reservation_data['block']},
            {"type": "text", "parameter_name": "apartamento", "text": reservation_data['apartment']},
            {"type": "text", "parameter_name": "visitantes", "text": str(reservation_data.get('visitors', '0'))},
            {"type": "text", "parameter_name": "porteiro", "text": reservation_data['doorman_name']}
        ]
    
    # Envia usando o template
    result = send_whatsapp_template(resident_phone, template_name, template_params, output_widget, message_type='reservation')
    return result

def check_time_conflict(reservations_df, area, date_obj, new_start, new_end):
    """Verifica se há sobreposição de horários para uma reserva."""
    date_str = date_obj.strftime('%Y-%m-%d')
    day_reservations = reservations_df[(reservations_df['area'] == area) & (reservations_df['date'] == date_str)]
    
    if day_reservations.empty:
        return False

    for _, res in day_reservations.iterrows():
        if res['start_time'] == 'N/A' or res['end_time'] == 'N/A':
            continue
            
        try:
            existing_start = datetime.strptime(res['start_time'], '%H:%M').time()
            existing_end = datetime.strptime(res['end_time'], '%H:%M').time()
            # Checa sobreposição: (StartA < EndB) and (EndA > StartB)
            if new_start < existing_end and new_end > existing_start:
                return True # Conflito encontrado
        except ValueError:
            continue
            
    return False # Sem conflitos

def check_date_conflict(reservations_df, area, date_obj):
    """Verifica se uma data já está ocupada para uma área específica (para reservas de dia inteiro)."""
    date_str = date_obj.strftime('%Y-%m-%d')
    day_reservations = reservations_df[(reservations_df['area'] == area) & (reservations_df['date'] == date_str)]
    
    # Se há qualquer reserva para esta data e área, há conflito
    return not day_reservations.empty

def get_available_times_for_date(reservations_df, area, date_obj):
    """Retorna horários disponíveis para uma data específica."""
    date_str = date_obj.strftime('%Y-%m-%d')
    day_reservations = reservations_df[(reservations_df['area'] == area) & (reservations_df['date'] == date_str)]
    
    if day_reservations.empty:
        return []  # Dia completamente livre
    
    booked_times = []
    for _, res in day_reservations.iterrows():
        if res['start_time'] != 'N/A' and res['end_time'] != 'N/A':
            try:
                start = datetime.strptime(res['start_time'], '%H:%M').time()
                end = datetime.strptime(res['end_time'], '%H:%M').time()
                booked_times.append((start, end))
            except ValueError:
                continue
    
    return booked_times

# --- FIM DAS NOVAS FUNÇÕES ---

# --- FUNÇÕES DE VERIFICAÇÃO DE CONEXÃO DA API WHATSAPP (META) ---

def check_whatsapp_connection_status():
    """
    Verifica o status da conexão da API Oficial do WhatsApp (Meta).
    Retorna True se credenciais estiverem presentes. 
    Nota: A verificação via GET pode falhar em alguns tokens por falta de permissão de 'view',
    mesmo que o token tenha permissão de 'messaging' (envio).
    """
    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        return False

    # Se temos credenciais, assumimos que está 'conectado' para fins de interface
    # para evitar falsos alarmes de 'desconectado' quando o envio de mensagens funciona.
    # O sistema tentará o envio real e tratará o erro se o token for inválido.
    return True

# --- FUNÇÕES DE NOTIFICAÇÃO DE FALHA DA API ---

def send_sms_notification(phone_number, message):
    """
    Envia SMS de notificação usando TextBelt API.
    Retorna True se enviado com sucesso, False caso contrário.
    """
    try:
        # Formatar número para o padrão internacional
        if phone_number.startswith('+'):
            phone_number = phone_number[1:]  # Remove o +

        payload = {
            "phone": phone_number,
            "message": message[:160],  # Limitar tamanho da mensagem
            "key": SMS_API_KEY
        }

        print(f"Enviando SMS para {phone_number}...")
        response = requests.post(SMS_API_URL, json=payload, timeout=30)

        if response.status_code == 200:
            response_data = response.json()
            success = response_data.get('success', False)

            if success:
                print("SMS enviado com sucesso!")
                return True
            else:
                error_msg = response_data.get('error', 'Erro desconhecido')
                print(f"SMS falhou: {error_msg}")

                # TextBelt limita a 1 SMS por dia para chaves gratuitas
                if 'limit' in error_msg.lower():
                    print("Limite diário de SMS atingido (TextBelt gratuito = 1 SMS/dia)")

                return False
        else:
            print(f"Erro HTTP ao enviar SMS: {response.status_code}")
            return False

    except Exception as e:
        print(f"Erro de conexão ao enviar SMS: {e}")
        return False

def send_twilio_sms(phone_number, message):
    """
    Envia SMS usando Twilio API.
    Retorna True se enviado com sucesso, False caso contrário.
    """
    if not TWILIO_AVAILABLE:
        print("Biblioteca Twilio não instalada - execute: pip install twilio")
        return False

    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_PHONE_NUMBER:
        print("Twilio não configurado - configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_PHONE_NUMBER")
        return False

    try:
        client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

        message_obj = client.messages.create(
            body=message,
            from_=TWILIO_PHONE_NUMBER,
            to=phone_number
        )

        print(f"SMS Twilio enviado com sucesso! SID: {message_obj.sid}")
        return True

    except Exception as e:
        print(f"Erro ao enviar SMS via Twilio: {e}")
        return False

def send_email_notification(email_address, subject, message):
    """
    Envia email de notificação usando Outlook/Hotmail SMTP.
    Retorna True se enviado com sucesso, False caso contrário.
    """
    if not EMAIL_USER or not EMAIL_PASSWORD:
        print("Credenciais de email não configuradas - configure EMAIL_PASSWORD no .env")
        return False

    try:
        # Criar mensagem
        msg = MIMEMultipart()
        msg['From'] = EMAIL_USER
        msg['To'] = email_address
        msg['Subject'] = subject

        # Adicionar corpo da mensagem
        msg.attach(MIMEText(message, 'plain'))

        # Conectar ao servidor SMTP do Outlook
        print(f"Tentando conectar ao servidor SMTP: {EMAIL_SMTP_SERVER}:{EMAIL_SMTP_PORT}")
        server = smtplib.SMTP(EMAIL_SMTP_SERVER, EMAIL_SMTP_PORT)
        server.starttls()

        # Login
        print(f"Fazendo login com: {EMAIL_USER}")
        server.login(EMAIL_USER, EMAIL_PASSWORD)

        # Enviar email
        text = msg.as_string()
        server.sendmail(EMAIL_USER, email_address, text)
        server.quit()

        print("Email enviado com sucesso!")
        return True

    except smtplib.SMTPAuthenticationError:
        print("Erro de autenticação no email - verifique senha")
        return False
    except smtplib.SMTPConnectError:
        print("Erro de conexão com servidor de email")
        return False
    except Exception as e:
        print(f"Erro ao enviar email: {e}")
        return False

def get_last_api_status():
    """Lê o último status conhecido da API do arquivo."""
    try:
        if os.path.exists(API_STATUS_FILE):
            with open(API_STATUS_FILE, 'r') as f:
                return f.read().strip()
        return None
    except Exception as e:
        print(f"Erro ao ler status da API: {e}")
        return None

def save_api_status(status):
    """Salva o status atual da API no arquivo."""
    try:
        with open(API_STATUS_FILE, 'w') as f:
            f.write(status)
    except Exception as e:
        print(f"Erro ao salvar status da API: {e}")

def get_last_notification_date():
    """Lê a data da última notificação enviada."""
    try:
        if os.path.exists(LAST_NOTIFICATION_FILE):
            with open(LAST_NOTIFICATION_FILE, 'r') as f:
                return f.read().strip()
        return None
    except Exception as e:
        print(f"Erro ao ler data da última notificação: {e}")
        return None

def save_last_notification_date():
    """Salva a data de hoje como última notificação."""
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        with open(LAST_NOTIFICATION_FILE, 'w') as f:
            f.write(today)
    except Exception as e:
        print(f"Erro ao salvar data da notificação: {e}")

def can_send_notification_today():
    """Verifica se já foi enviada notificação hoje."""
    last_date = get_last_notification_date()
    today = datetime.now().strftime("%Y-%m-%d")

    if last_date == today:
        return False  # Já enviou hoje
    return True  # Pode enviar

def notify_api_failure():
    """
    Envia notificações por SMS, email e WhatsApp quando a API cai (sempre).
    """
    current_time = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    sms_message = f"🚨 Olá Mércia, o sistema de envio de WhatsApp saiu fora do ar, entre em contato com o Felipe Costa o quanto antes"
    email_message = f"🚨 ALERTA: API WhatsApp (Meta) desconectada em {current_time}. Verifique o status da conexão."

    print(f"Enviando notificações de falha da API...")

    notifications_sent = []

    # Enviar SMS (se disponível - tenta Twilio primeiro, depois TextBelt)
    sms_sent = False
    if NOTIFICATION_PHONE:
        # Verificar se já enviou SMS hoje (só SMS é limitado a 1x por dia)
        if can_send_notification_today():
            # Tentar Twilio primeiro (se configurado)
            if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER:
                print(f"Tentando enviar SMS via Twilio para {NOTIFICATION_PHONE}...")
                sms_sent = send_twilio_sms(NOTIFICATION_PHONE, sms_message)
                if sms_sent:
                    notifications_sent.append("SMS (Twilio)")
                    save_last_notification_date()  # Marcar que enviou hoje
            else:
                # Fallback para TextBelt (mesmo que bloqueado)
                print(f"Tentando enviar SMS via TextBelt para {NOTIFICATION_PHONE}...")
                sms_sent = send_sms_notification(NOTIFICATION_PHONE, sms_message)
                if sms_sent:
                    notifications_sent.append("SMS (TextBelt)")
                    save_last_notification_date()  # Marcar que enviou hoje
        else:
            print("SMS já enviado hoje - pulando...")
    else:
        print("Número de telefone para SMS não configurado")

    # Enviar emails (sempre tentar enviar)
    email_sent = False

    # Email principal (Felipe) - sempre tentar
    if EMAIL_PASSWORD:
        print(f"Tentando enviar email para {NOTIFICATION_EMAIL}...")
        email_sent_main = send_email_notification(
            NOTIFICATION_EMAIL,
            "🚨 ALERTA: API WhatsApp (Meta) Desconectada",
            email_message
        )
        if email_sent_main:
            notifications_sent.append("Email (Felipe)")
            email_sent = True

        # Email secundário (Mércia) - se configurado
        if SECOND_EMAIL_ALERT:
            print(f"Tentando enviar email para {SECOND_EMAIL_ALERT}...")
            mercia_message = f"🚨 ALERTA IMPORTANTE: O sistema de envio de WhatsApp está fora do ar desde {current_time}. Entre em contato com o Felipe Costa o quanto antes para resolver a situação."
            email_sent_secondary = send_email_notification(
                SECOND_EMAIL_ALERT,
                "🚨 SISTEMA WHATSAPP FORA DO AR",
                mercia_message
            )
            if email_sent_secondary:
                notifications_sent.append("Email (Mércia)")
                email_sent = True
    else:
        print("Email não configurado - configure EMAIL_PASSWORD no arquivo config_notifications.txt")

    # WhatsApp não é enviado quando API está desconectada (não faz sentido)

    success = sms_sent or email_sent

    # Resultado das notificações
    if success:
        print(f"Notificações enviadas com sucesso: {', '.join(notifications_sent)}")
    else:
        print("Nenhuma notificação pôde ser enviada!")
        print("Configure EMAIL_PASSWORD no arquivo config_notifications.txt")
        print("Ou use uma API SMS paga como Twilio")

    return success

# --- FUNÇÕES PARA GERENCIAR MENSAGENS PENDENTES ---

def load_pending_messages():
    """Carrega mensagens pendentes do arquivo."""
    try:
        if os.path.exists(PENDING_MESSAGES_FILE):
            with open(PENDING_MESSAGES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    except Exception as e:
        print(f"Erro ao carregar mensagens pendentes: {e}")
        return []

def save_pending_messages(pending_messages):
    """Salva mensagens pendentes no arquivo."""
    try:
        with open(PENDING_MESSAGES_FILE, 'w', encoding='utf-8') as f:
            json.dump(pending_messages, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Erro ao salvar mensagens pendentes: {e}")

def add_pending_message(phone, message, message_type, original_timestamp=None, template_name=None, template_params=None):
    """
    Adiciona uma mensagem à fila de pendentes de forma estruturada.

    Args:
        phone: Número do telefone
        message: Conteúdo da mensagem (texto livre ou string de template legada)
        message_type: Tipo da mensagem ('package' ou 'reservation')
        original_timestamp: Timestamp original (opcional)
        template_name: Nome do template (novo)
        template_params: Parâmetros do template (novo)
    """
    if original_timestamp is None:
        original_timestamp = datetime.now().isoformat()

    pending_messages = load_pending_messages()

    pending_message = {
        'id': f"{phone}_{int(time_module.time())}_{len(pending_messages)}",
        'phone': phone,
        'message': message,
        'message_type': message_type,
        'template_name': template_name,
        'template_params': template_params,
        'original_timestamp': original_timestamp,
        'retry_count': 0,
        'last_retry': None
    }

    pending_messages.append(pending_message)
    save_pending_messages(pending_messages)
    print(f"Mensagem adicionada à fila de pendentes: {phone} (Tipo: {message_type})")

def remove_pending_message(message_id):
    """Remove uma mensagem da fila de pendentes."""
    pending_messages = load_pending_messages()
    original_count = len(pending_messages)

    pending_messages = [msg for msg in pending_messages if msg['id'] != message_id]

    if len(pending_messages) < original_count:
        save_pending_messages(pending_messages)
    else:
        print(f"Aviso: Mensagem com ID {message_id} não encontrada na fila")

def retry_pending_messages(output_widget=None):
    """
    Tenta reenviar todas as mensagens pendentes de forma inteligente.
    Retorna o número de mensagens reenviadas com sucesso.
    """
    pending_messages = load_pending_messages()
    if not pending_messages:
        return 0

    successful_sends = 0
    print(f"Processando fila de {len(pending_messages)} mensagens pendentes...")

    # Usamos uma lista auxiliar para não alterar a ordem durante a iteração
    messages_to_process = list(pending_messages)

    for message in messages_to_process:
        try:
            # Se tem dados estruturados de template, usa send_whatsapp_template diretamente
            if message.get('template_name') and message.get('template_params'):
                result = send_whatsapp_template(
                    message['phone'], 
                    message['template_name'], 
                    message['template_params'], 
                    output_widget or DummyOutputWidget()
                )
            # Fallback para o antigo formato de string "TEMPLATE:name:params"
            elif message.get('message') and message['message'].startswith("TEMPLATE:"):
                try:
                    parts = message['message'].split(':', 2)
                    t_name = parts[1]
                    t_params = json.loads(parts[2])
                    result = send_whatsapp_template(
                        message['phone'], 
                        t_name, 
                        t_params, 
                        output_widget or DummyOutputWidget()
                    )
                except:
                    # Se falhar o parse do formato antigo, tenta o send_whatsapp_message genérico
                    result = send_whatsapp_message(message['phone'], message['message'], output_widget or DummyOutputWidget())
            else:
                # Envio genérico para mensagens de texto ou formatos desconhecidos
                result = send_whatsapp_message(message['phone'], message['message'], output_widget or DummyOutputWidget())

            if result['success']:
                # Mensagem enviada com sucesso, remove da fila
                remove_pending_message(message['id'])
                successful_sends += 1
                print(f"SUCESSO: Mensagem pendente para {message['phone']} enviada!")
            else:
                # Falhou novamente, atualiza na fila
                # Nota: Recarregamos para garantir que não sobrescrevemos outras mudanças
                current_pending = load_pending_messages()
                for m in current_pending:
                    if m['id'] == message['id']:
                        m['retry_count'] += 1
                        m['last_retry'] = datetime.now().isoformat()
                        
                        # Se tentou mais de 10 vezes, remove da fila para evitar bloqueios permanentes por spam
                        # (Aumentado de 5 para 10 para dar mais chances se a API demorar a voltar)
                        if m['retry_count'] >= 10:
                            print(f"REMOVENDO: Mensagem para {message['phone']} atingiu limite de 10 tentativas.")
                            current_pending.remove(m)
                        break
                save_pending_messages(current_pending)

        except Exception as e:
            print(f"Erro ao processar mensagem da fila: {e}")

    return successful_sends

class DummyOutputWidget:
    """Classe dummy para output quando não há widget disponível."""
    def print_message(self, message, style=None):
        print(message)

def custom_askstring(parent, title, prompt, validation_regex=None, error_message=None, uppercase=False, show_password=False):
    return AskStringDialog(parent, title, prompt, validation_regex, error_message, uppercase, show_password).show()

def custom_askstring_scrollable(parent, title, prompt, validation_regex=None, error_message=None, uppercase=False, show_password=False):
    return ScrollableAskStringDialog(parent, title, prompt, validation_regex, error_message, uppercase, show_password).show()

def custom_ask_block_apt(parent, title, prompt, show_no_block_button=True):
    return BlockAptDialog(parent, title, prompt, show_no_block_button).show()

# ==============================================================================
# 4. CLASSE PRINCIPAL DA APLICAÇÃO
# ==============================================================================

class PackageSystemApp:
    def __init__(self, root):
        self.root = root
        self.root.title("SISTEMA DE GESTÃO - VILLAGE LIBERDADE")
        self.root.geometry("1200x800")
        self.root.configure(bg="#e0e0e0")
        
        # Configura o protocolo de fechamento da janela principal
        self.root.protocol("WM_DELETE_WINDOW", self._on_closing)
        
        # Configura o binding da tecla Escape para fechar
        self.root.bind('<Escape>', lambda e: self._on_closing())

        self.residents = load_residents()
        self.packages = load_packages()
        self.reservations = load_reservations() # NOVO: Carrega as reservas

        # --- Status de Conexão ---
        self.connection_status = False  # Status inicial: desconectado
        self.connection_monitoring = True  # Flag para controlar o monitoramento
        self.disconnection_timer = None  # Timer para notificação atrasada (20min)
        self.disconnection_start_time = None  # Horário em que a desconexão começou
        self.notification_scheduled = False  # Flag para evitar múltiplas notificações

        # --- Mensagens Pendentes ---
        self.pending_messages_count = 0

        # --- Frame Superior para Status ---
        top_frame = tk.Frame(self.root, bg="#e0e0e0", height=30)
        top_frame.pack(fill=tk.X, side=tk.TOP)
        top_frame.pack_propagate(False)

        # Indicador de conexão no canto superior direito
        self.connection_indicator = tk.Label(
            top_frame,
            text="● API DESCONECTADA",
            font=(FONT_FAMILY, FONT_SIZE_SMALL, FONT_WEIGHT_BOLD),
            fg="red",
            bg="#e0e0e0"
        )
        self.connection_indicator.pack(side=tk.RIGHT, padx=10, pady=5)

        # --- Layout Principal ---
        main_frame = tk.Frame(self.root, padx=20, pady=20, bg="#e0e0e0")
        main_frame.pack(fill=tk.BOTH, expand=True)
        main_frame.grid_rowconfigure(1, weight=1) # output_text
        main_frame.grid_rowconfigure(2, weight=0) # context_button_frame
        main_frame.grid_columnconfigure(0, weight=1)

        # --- Frame dos Botões ---
        button_frame = tk.Frame(main_frame, bg="#e0e0e0")
        button_frame.grid(row=0, column=0, pady=(0, 20))
        
        buttons = [
            ("BIPAR CÓDIGO (B)", self.scan_code),
            ("GERENCIAR MORADORES (A)", self.manage_residents),
            ("PENDENTES POR APTO (P)", self.view_pending_by_apt),
            ("TODAS PENDENTES (T)", self.view_all_pending_packages),
            ("SEM BLOCO / APTO. (S)", self.view_no_block_apt_packages),
            ("DEST. NÃO CADASTRADO (D)", self.view_not_registered_packages),
            ("RESERVAS (R)", self.open_reservations_tab), # NOVO BOTÃO
            ("AVISOS (V)", self.open_announcements_tab),
            ("FECHAR", self._on_closing)
        ]
        
        for text, command in buttons:
            btn = tk.Button(button_frame, text=text, command=command, font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                            bg="#005a9c", fg="white", relief="raised", bd=2, padx=10, pady=10)
            btn.pack(side=tk.LEFT, padx=5, pady=5) # Ajustado o padx

        # --- Área de Saída de Texto Estilizada ---
        self.output_text = StyledScrolledText(main_frame, height=20, width=120)
        self.output_text.grid(row=1, column=0, sticky="nsew", padx=20)
        
        # --- Frame para botões contextuais ---
        self.context_button_frame = tk.Frame(main_frame, bg="#e0e0e0")
        self.context_button_frame.grid(row=2, column=0, pady=(10, 0), sticky="n")

        self._bind_shortcuts()
        self.output_text.print_header("BEM-VINDO AO SISTEMA DE GESTÃO")
        self.output_text.print_message("SELECIONE UMA OPÇÃO ACIMA PARA COMEÇAR.")

        # Inicia o monitoramento da conexão
        self._start_connection_monitoring()

    def _update_connection_indicator(self, is_connected):
        """Atualiza o indicador visual de conexão."""
        try:
            if is_connected:
                self.connection_indicator.config(text="● API CONECTADA", fg="green")
            else:
                self.connection_indicator.config(text="● API DESCONECTADA", fg="red")

            self.connection_status = is_connected
            self.pending_messages_count = len(load_pending_messages())

            # Força atualização da interface
            self.root.update_idletasks()

        except Exception as e:
            print(f"Erro ao atualizar indicador: {e}")

    def _check_connection_loop(self):
        """Loop de verificação de conexão que executa a cada 30 minutos."""
        last_status = get_last_api_status()
        retry_check_counter = 0  # Contador para verificar reenvio a cada 5 minutos

        while self.connection_monitoring:
            try:
                is_connected = check_whatsapp_connection_status()
                current_status = "connected" if is_connected else "disconnected"

                # Verifica se houve mudança de status
                if last_status != current_status:
                    self._handle_status_change(last_status, current_status, is_connected)
                    last_status = current_status
                    save_api_status(current_status)
                    retry_check_counter = 0  # Reset counter on status change

                # A cada 5 minutos (10 iterações de 30s), verifica se há mensagens para reenviar
                retry_check_counter += 1
                if retry_check_counter >= 10 and is_connected:
                    pending_count = len(load_pending_messages())
                    if pending_count > 0:
                        successful_retries = retry_pending_messages()
                        if successful_retries > 0:
                            print(f"Reenvio automático: {successful_retries} mensagens processadas")
                    retry_check_counter = 0

                # Atualiza o indicador na thread principal
                self.root.after(0, lambda: self._update_connection_indicator(is_connected))
            except Exception as e:
                print(f"Erro no monitoramento da API: {e}")
                # Em caso de erro, considera desconectado
                self.root.after(0, lambda: self._update_connection_indicator(False))
                current_status = "disconnected"

                # Verifica se houve mudança para desconectado
                if last_status != current_status:
                    self._handle_status_change(last_status, current_status, False)
                    last_status = current_status
                    save_api_status(current_status)

            # Aguarda 30 segundos para desenvolvimento (mudar para 1800 em produção)
            time_module.sleep(30)

    def _handle_status_change(self, last_status, current_status, is_connected):
        """Centraliza o tratamento de mudanças de status da API."""
        if current_status == "disconnected" and last_status == "connected":
            # API acabou de cair - iniciar timer de 20 minutos antes de notificar
            print("API WhatsApp (Meta) desconectada! Agendando notificação em 20 minutos...")
            self._start_disconnection_timer()

        elif current_status == "connected" and last_status == "disconnected":
            # API voltou a funcionar - cancelar timer se ativo e reenviar mensagens pendentes
            self._cancel_disconnection_timer()
            print("API WhatsApp (Meta) reconectada! Tentando reenviar mensagens pendentes...")
            pending_messages = load_pending_messages()
            print(f"Encontradas {len(pending_messages)} mensagens pendentes")

            if pending_messages:
                successful_retries = retry_pending_messages()
                print(f"Resultado: {successful_retries} mensagens reenviadas com sucesso")

    def _start_disconnection_timer(self):
        """Inicia um timer de 20 minutos para enviar notificação de desconexão."""
        # Cancela timer anterior se existir
        self._cancel_disconnection_timer()

        # Registra o horário da desconexão
        from datetime import datetime
        self.disconnection_start_time = datetime.now()

        # Inicia timer de 20 minutos (1200 segundos)
        self.disconnection_timer = threading.Timer(1200.0, self._send_delayed_notification)
        self.disconnection_timer.start()
        self.notification_scheduled = True

        print(f"Notificação de desconexão agendada para daqui 20 minutos ({self.disconnection_start_time.strftime('%H:%M:%S')})")

    def _cancel_disconnection_timer(self):
        """Cancela o timer de notificação se estiver ativo."""
        if self.disconnection_timer and self.disconnection_timer.is_alive():
            self.disconnection_timer.cancel()
            print("Timer de notificação cancelado - conexão restabelecida")
        self.disconnection_timer = None
        self.notification_scheduled = False
        self.disconnection_start_time = None

    def _send_delayed_notification(self):
        """Envia a notificação após 20 minutos de desconexão contínua."""
        print("20 minutos se passaram com API desconectada - enviando notificações...")
        notify_api_failure()
        self.notification_scheduled = False
        self.disconnection_start_time = None

    def _check_api_status_on_error(self):
        """
        Verifica o status da API quando uma mensagem falha ao enviar.
        Chamado automaticamente quando há erro no envio.
        """
        try:
            is_connected = check_whatsapp_connection_status()
            current_status = "connected" if is_connected else "disconnected"
            last_status = get_last_api_status()

            # Se houve mudança de status, trata a mudança
            if last_status != current_status:
                self._handle_status_change(last_status, current_status, is_connected)

            # Atualiza o indicador na thread principal
            self.root.after(0, lambda: self._update_connection_indicator(is_connected))

            return is_connected
        except Exception as e:
            print(f"Erro ao verificar status da API após falha: {e}")
            return False

    def _start_connection_monitoring(self):
        """Inicia o monitoramento da conexão em uma thread separada."""
        # Verificação inicial
        initial_status = check_whatsapp_connection_status()
        self._update_connection_indicator(initial_status)

        # Salva o status inicial se não existir
        if get_last_api_status() is None:
            initial_status_str = "connected" if initial_status else "disconnected"
            save_api_status(initial_status_str)

        # Inicia o loop de monitoramento em background
        monitoring_thread = threading.Thread(target=self._check_connection_loop, daemon=True)
        monitoring_thread.start()

    def _on_closing(self):
        """Função chamada quando o usuário tenta fechar a janela principal."""
        if messagebox.askokcancel("SAIR", "Tem certeza que deseja sair do sistema?", parent=self.root):
            self.connection_monitoring = False  # Para o monitoramento
            self.root.quit()
            self.root.destroy()
        
    def _clear_context_buttons(self):
        """Limpa quaisquer botões do frame contextual."""
        for widget in self.context_button_frame.winfo_children():
            widget.destroy()
        
        # Reset completo do layout ao trocar de tela (corrige expansão após aba de Reservas)
        try:
            # Restaura configurações padrão do output_text
            self.output_text.configure(height=20)
            
            # Força o context_button_frame a voltar ao tamanho padrão
            self.context_button_frame.grid_configure(sticky="n")
            self.context_button_frame.grid_propagate(True)
            
            # Restaura geometria padrão da janela principal
            self.root.update_idletasks()
            self.root.geometry("1200x800")
            
            # Força atualização do layout
            self.root.update()
        except Exception:
            pass
    
    def _reset_context_frame_height(self):
        """Reset específico da altura da div cinza (context_button_frame)."""
        try:
            # Força o context_button_frame a voltar ao tamanho padrão
            self.context_button_frame.grid_configure(sticky="n")
            self.context_button_frame.grid_propagate(True)
            
            # Força atualização do layout
            self.root.update_idletasks()
            self.root.update()
        except Exception:
            pass

    def _bind_shortcuts(self):
        """Define os atalhos de teclado para as funções principais."""
        self.root.bind('<b>', lambda e: self.scan_code())
        self.root.bind('<B>', lambda e: self.scan_code())
        self.root.bind('<p>', lambda e: self.view_pending_by_apt())
        self.root.bind('<P>', lambda e: self.view_pending_by_apt())
        self.root.bind('<t>', lambda e: self.view_all_pending_packages())
        self.root.bind('<T>', lambda e: self.view_all_pending_packages())
        self.root.bind('<s>', lambda e: self.view_no_block_apt_packages())
        self.root.bind('<S>', lambda e: self.view_no_block_apt_packages())
        self.root.bind('<d>', lambda e: self.view_not_registered_packages())
        self.root.bind('<D>', lambda e: self.view_not_registered_packages())
        self.root.bind('<a>', lambda e: self.manage_residents())
        self.root.bind('<A>', lambda e: self.manage_residents())
        self.root.bind('<v>', lambda e: self.open_announcements_tab())
        self.root.bind('<V>', lambda e: self.open_announcements_tab())
        self.root.bind('<r>', lambda e: self.open_reservations_tab()) # NOVO ATALHO
        self.root.bind('<R>', lambda e: self.open_reservations_tab()) # NOVO ATALHO

    # --- MÓDULO DE AVISOS (EXISTENTE) ---
    def open_announcements_tab(self):
        """Abre a aba de avisos protegida por senha."""
        self._clear_context_buttons()
        
        # Verifica a senha
        password = custom_askstring(self.root, "ACESSO RESTRITO", "DIGITE A SENHA DE ADMINISTRADOR:", uppercase=False, show_password=True)
        if not password:
            self.output_text.print_message("ACESSO CANCELADO.", style="info")
            return
            
        if password != ADMIN_PASSWORD:
            self.output_text.print_message("SENHA INCORRETA. ACESSO NEGADO.", style="error")
            return
            
        # Abre a aba de avisos
        self._show_announcements_interface()

    def open_dispatch_tab(self):
        """Abre a aba de disparos protegida por senha."""
        self._clear_context_buttons()
        
        # Verifica a senha
        password = custom_askstring(self.root, "ACESSO RESTRITO", "DIGITE A SENHA DE DISPAROS:", uppercase=False, show_password=True)
        if not password:
            self.output_text.print_message("ACESSO CANCELADO.", style="info")
            return
            
        if password != DISPATCH_PASSWORD:
            self.output_text.print_message("SENHA INCORRETA. ACESSO NEGADO.", style="error")
            return
            
        # Abre a aba de disparos
        self._show_dispatch_interface()

    def _show_announcements_interface(self):
        """Mostra a interface de avisos."""
        self.output_text.clear()
        self.output_text.print_header("SISTEMA DE AVISOS - VILLAGE LIBERDADE")
        self.output_text.print_subheader("ENVIAR PDF PARA MORADORES")
        
        # Botões para diferentes tipos de avisos
        self._create_announcement_buttons()

    def _create_announcement_buttons(self):
        """Cria os botões para diferentes tipos de avisos."""
        
        # Frame para seleção de bloco
        block_selection_frame = tk.Frame(self.context_button_frame, bg="#e0e0e0")
        block_selection_frame.pack(pady=10, fill="x", padx=20)
        
        # Label para o dropdown de blocos
        block_label = tk.Label(
            block_selection_frame,
            text="ESCOLHA O BLOCO NO QUAL DESEJA ENVIAR O ARQUIVO PARA OS MORADORES:",
            font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
            bg="#e0e0e0", fg="#333333"
        )
        block_label.pack(pady=(0, 10))
        
        # Dropdown para seleção de bloco
        self.block_var = tk.StringVar()
        self.block_var.set("1")  # Valor padrão
        
        # Obtém os blocos únicos dos moradores
        unique_blocks = sorted(self.residents['block'].unique())
        
        block_dropdown = ttk.Combobox(
            block_selection_frame,
            textvariable=self.block_var,
            values=unique_blocks,
            state="readonly",
            font=(FONT_FAMILY, FONT_SIZE_NORMAL),
            width=15
        )
        block_dropdown.pack(pady=(0, 15))
        
        # Checkbox para enviar para todos os blocos
        self.send_all_blocks_var = tk.BooleanVar()
        send_all_checkbox = tk.Checkbutton(
            block_selection_frame,
            text="ENVIAR PARA TODOS OS BLOCOS",
            variable=self.send_all_blocks_var,
            font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
            bg="#e0e0e0", fg="#333333",
            command=self._toggle_block_selection
        )
        send_all_checkbox.pack(pady=(0, 15))
        
        # Botão para selecionar PDF
        select_pdf_btn = tk.Button(
            self.context_button_frame,
            text="SELECIONAR ARQUIVO PDF",
            command=self._select_pdf_file,
            font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
            bg="#28a745", fg="white", relief="raised", bd=2, padx=15, pady=10
        )
        select_pdf_btn.pack(pady=10)
        
        # Botão para voltar ao menu principal
        back_btn = tk.Button(
            self.context_button_frame,
            text="VOLTAR AO MENU PRINCIPAL",
            command=self._return_to_main_menu,
            font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
            bg="#6c757d", fg="white", relief="raised", bd=2, padx=15, pady=10
        )
        back_btn.pack(pady=5)
        
    def _toggle_block_selection(self):
        """Habilita/desabilita o dropdown de blocos baseado no checkbox."""
        if self.send_all_blocks_var.get():
            # Se marcou "enviar para todos", desabilita o dropdown
            for widget in self.context_button_frame.winfo_children():
                if isinstance(widget, tk.Frame) and len(widget.winfo_children()) > 0:
                    # Encontra o dropdown dentro do frame
                    for child in widget.winfo_children():
                        if isinstance(child, ttk.Combobox):
                            child.configure(state="disabled")
                            break
        else:
            # Se desmarcou, habilita o dropdown
            for widget in self.context_button_frame.winfo_children():
                if isinstance(widget, tk.Frame) and len(widget.winfo_children()) > 0:
                    # Encontra o dropdown dentro do frame
                    for child in widget.winfo_children():
                        if isinstance(child, ttk.Combobox):
                            child.configure(state="readonly")
                            break

    def _create_dispatch_buttons(self):
        """Cria os botões para diferentes tipos de disparos."""
        # Botão para enviar mensagem de texto
        text_msg_btn = tk.Button(
            self.context_button_frame,
            text="ENVIAR MENSAGEM DE TEXTO",
            command=self._send_text_message,
            font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
            bg="#007bff", fg="white", relief="raised", bd=2, padx=15, pady=10
        )
        text_msg_btn.pack(pady=10)
        
        # Botão para enviar PDF
        pdf_btn = tk.Button(
            self.context_button_frame,
            text="ENVIAR ARQUIVO PDF",
            command=self._send_pdf_dispatch,
            font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
            bg="#28a745", fg="white", relief="raised", bd=2, padx=15, pady=10
        )
        pdf_btn.pack(pady=5)
        
        # Botão para disparo de teste
        test_dispatch_btn = tk.Button(
            self.context_button_frame,
            text="DISPARO DE TESTE (1 MORADOR)",
            command=self._send_test_dispatch,
            font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
            bg="#ffc107", fg="black", relief="raised", bd=2, padx=15, pady=10
        )
        test_dispatch_btn.pack(pady=5)
        
        # Botão para voltar ao menu principal
        back_btn = tk.Button(
            self.context_button_frame,
            text="VOLTAR AO MENU PRINCIPAL",
            command=self._return_to_main_menu,
            font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
            bg="#6c757d", fg="white", relief="raised", bd=2, padx=15, pady=10
        )
        back_btn.pack(pady=5)

    def _select_pdf_file(self):
        """Permite ao usuário selecionar um arquivo PDF."""
        from tkinter import filedialog
        
        pdf_path = filedialog.askopenfilename(
            title="SELECIONAR ARQUIVO PDF",
            filetypes=[("Arquivos PDF", "*.pdf"), ("Todos os arquivos", "*.*")]
        )
        
        if pdf_path:
            self._show_pdf_preview(pdf_path)
        else:
            self.output_text.print_message("NENHUM ARQUIVO SELECIONADO.", style="info")

    def _show_pdf_preview(self, pdf_path):
        """Mostra uma prévia do PDF selecionado e opções de envio."""
        self.output_text.clear()
        self.output_text.print_header("PDF SELECIONADO")
        self.output_text.print_styled("ARQUIVO", os.path.basename(pdf_path))
        self.output_text.print_styled("CAMINHO", pdf_path)
        self.output_text.print_styled("TAMANHO", f"{os.path.getsize(pdf_path) / 1024:.1f} KB")
        
        # Solicita a legenda do PDF
        caption = custom_askstring(
            self.root, 
            "LEGENDA DO PDF", 
            "DIGITE A LEGENDA QUE APARECERÁ COM O PDF:"
        )
        
        if caption:
            self._confirm_bulk_send(pdf_path, caption)
        else:
            self.output_text.print_message("OPERAÇÃO CANCELADA.", style="info")

    def _confirm_bulk_send(self, pdf_path, caption):
        """Confirma o envio em massa do PDF."""
        self.output_text.print_subheader("CONFIRMAÇÃO DE ENVIO")
        self.output_text.print_styled("ARQUIVO", os.path.basename(pdf_path))
        self.output_text.print_styled("LEGENDA", caption)
        
        # Determina os moradores alvo baseado na seleção
        if self.send_all_blocks_var.get():
            # Enviar para todos os blocos
            target_residents = self.residents[
                (self.residents['phone'].notna()) & 
                (self.residents['phone'] != '') & 
                (self.residents['phone'] != '0')
            ]
            target_description = "TODOS OS BLOCOS"
        else:
            # Enviar apenas para o bloco selecionado
            selected_block = self.block_var.get()
            target_residents = self.residents[
                (self.residents['block'] == selected_block) &
                (self.residents['phone'].notna()) & 
                (self.residents['phone'] != '') & 
                (self.residents['phone'] != '0')
            ]
            target_description = f"BLOCO {selected_block}"
        
        # Conta moradores com telefone
        residents_with_phone = self.residents[
            (self.residents['phone'].notna()) & 
            (self.residents['phone'] != '') & 
            (self.residents['phone'] != '0')
        ]
        
        self.output_text.print_styled("TOTAL DE MORADORES", str(len(self.residents)))
        self.output_text.print_styled("MORADORES COM TELEFONE", str(len(residents_with_phone)))
        self.output_text.print_styled("DESTINO SELECIONADO", target_description)
        self.output_text.print_styled("MORADORES NO DESTINO", str(len(target_residents)))
        
        if len(target_residents) == 0:
            self.output_text.print_message("NENHUM MORADOR ENCONTRADO PARA O DESTINO SELECIONADO.", style="error")
            return
        
        confirm = messagebox.askyesno(
            "CONFIRMAR ENVIO",
            f"Deseja enviar o PDF '{os.path.basename(pdf_path)}' para {len(target_residents)} moradores do {target_description}?\n\n"
            "ATENÇÃO: Esta operação pode demorar alguns minutos e consumir créditos da API.",
            parent=self.root
        )
        
        if confirm:
            self._send_pdf_to_target_residents(pdf_path, caption, target_residents, target_description)
        else:
            self.output_text.print_message("ENVIO CANCELADO.", style="info")

    def _send_pdf_to_target_residents(self, pdf_path, caption, target_residents, target_description):
        """Envia o PDF para os moradores do destino selecionado."""
        self.output_text.clear()
        self.output_text.print_header("ENVIANDO PDF")
        self.output_text.print_styled("ARQUIVO", os.path.basename(pdf_path))
        self.output_text.print_styled("DESTINO", target_description)
        self.output_text.print_styled("TOTAL DE DESTINATÁRIOS", str(len(target_residents)))
        
        success_count = 0
        error_count = 0
        
        for index, resident in target_residents.iterrows():
            self.output_text.print_styled("ENVIANDO PARA", f"{resident['name'].upper()} ({resident['phone']})")
            self.output_text.print_styled("BLOCO/APT", f"{resident['block']}/{resident['apartment']}")
            
            if send_whatsapp_pdf(resident['phone'], pdf_path, caption, self.output_text):
                success_count += 1
            else:
                error_count += 1
            
            # Pequena pausa entre envios para não sobrecarregar a API
            self.root.after(1000)
            self.root.update()
        
        # Resumo final
        self.output_text.print_separator("=")
        self.output_text.print_subheader("RESUMO DO ENVIO")
        self.output_text.print_styled("DESTINO", target_description)
        self.output_text.print_styled("TOTAL ENVIADO", str(success_count), style="success")
        self.output_text.print_styled("ERROS", str(error_count), style="error")
        self.output_text.print_styled("ARQUIVO", os.path.basename(pdf_path))
        
        # Botão para voltar
        back_btn = tk.Button(
            self.context_button_frame,
            text="VOLTAR AO MENU PRINCIPAL",
            command=self._return_to_main_menu,
            font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
            bg="#6c757d", fg="white", relief="raised", bd=2, padx=15, pady=10
        )
        back_btn.pack(pady=10)

    def _send_test_announcement(self):
        """Envia um aviso de teste para um morador específico."""
        self.output_text.clear()
        self.output_text.print_header("ENVIO DE TESTE")
        
        # Seleciona o primeiro morador com telefone
        residents_with_phone = self.residents[
            (self.residents['phone'].notna()) & 
            (self.residents['phone'] != '') & 
            (self.residents['phone'] != '0')
        ]
        
        if residents_with_phone.empty:
            self.output_text.print_message("NENHUM MORADOR COM TELEFONE CADASTRADO.", style="error")
            return
            
        test_resident = residents_with_phone.iloc[0]
        
        # Cria um PDF de teste simples
        test_pdf_path = self._create_test_pdf()
        
        if test_pdf_path:
            self.output_text.print_styled("ENVIANDO TESTE PARA", f"{test_resident['name'].upper()}")
            self.output_text.print_styled("TELEFONE", test_resident['phone'])
            
            caption = "TESTE: Este é um aviso de teste do sistema Village Liberdade."
            
            if send_whatsapp_pdf(test_resident['phone'], test_pdf_path, caption, self.output_text):
                self.output_text.print_message("TESTE ENVIADO COM SUCESSO!", style="success")
            else:
                self.output_text.print_message("FALHA NO ENVIO DO TESTE.", style="error")
            
            # Remove o arquivo de teste
            try:
                os.remove(test_pdf_path)
            except:
                pass
        else:
            self.output_text.print_message("ERRO AO CRIAR PDF DE TESTE.", style="error")

    def _create_test_pdf(self):
        """Cria um PDF de teste simples."""
        try:
            from reportlab.pdfgen import canvas
            from reportlab.lib.pagesizes import letter
            
            test_pdf_path = "teste_village.pdf"
            c = canvas.Canvas(test_pdf_path, pagesize=letter)
            
            # Adiciona conteúdo ao PDF
            c.setFont("Helvetica-Bold", 16)
            c.drawString(100, 750, "TESTE - VILLAGE LIBERDADE")
            
            c.setFont("Helvetica", 12)
            c.drawString(100, 720, "Este é um PDF de teste para verificar")
            c.drawString(100, 700, "o funcionamento do sistema de avisos.")
            
            c.drawString(100, 650, f"Data: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
            c.drawString(100, 630, "Sistema de Gestão de Encomendas")
            
            c.save()
            return test_pdf_path
            
        except ImportError:
            self.output_text.print_message("BIBLIOTECA REPORTLAB NÃO INSTALADA. INSTALE COM: pip install reportlab", style="error")
            return None
        except Exception as e:
            self.output_text.print_message(f"ERRO AO CRIAR PDF: {e}", style="error")
            return None

    def _return_to_main_menu(self):
        """Retorna ao menu principal."""
        self._clear_context_buttons()
        self.output_text.clear()
        self.output_text.print_header("BEM-VINDO AO SISTEMA DE GESTÃO")
        self.output_text.print_message("SELECIONE UMA OPÇÃO ACIMA PARA COMEÇAR.")


    # --- INÍCIO DO NOVO MÓDULO DE RESERVAS ---
    def open_reservations_tab(self):
        """Abre a tela principal do módulo de reservas."""
        if DateEntry is None:
            messagebox.showerror(
                "Biblioteca Faltando",
                "A funcionalidade de calendário requer a biblioteca 'tkcalendar'.\n\n"
                "Por favor, instale-a executando o comando:\n"
                "pip install tkcalendar",
                parent=self.root
            )
            return

        self._clear_context_buttons()
        self.output_text.clear()
        self.output_text.print_header("MÓDULO DE RESERVAS - VILLAGE LIBERDADE")
        self.output_text.print_message("Selecione a opção desejada.")
        self._create_reservation_buttons()

    def _create_reservation_buttons(self):
        """Cria os botões para as opções de reserva."""
        buttons_config = [
            ("RESERVAR ÁREA DE CHURRASCO", lambda: self._start_bbq_reservation(), "#D2691E"),
            ("RESERVAR QUADRA", lambda: self._start_court_reservation(), "#228B22"),
            ("RESERVAR PISCINA", lambda: self._start_pool_reservation(), "#1E90FF"),
            ("RESERVAR VAGA DE GARAGEM", lambda: self._start_parking_reservation(), "#8B4513"),  # NOVO: Botão para garagem
            ("AGENDA (EDITAR/EXCLUIR)", lambda: self._show_reservations_calendar(), "#FF8C00"),
            ("VOLTAR AO MENU PRINCIPAL", self._return_to_main_menu, "#6c757d")
        ]

        for text, command, color in buttons_config:
            btn = tk.Button(
                self.context_button_frame, text=text, command=command,
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                bg=color, fg="white", relief="raised", bd=2, padx=15, pady=10
            )
            btn.pack(side=tk.LEFT, padx=5, pady=5)

    def _show_reservations_calendar(self):
        """Mostra o calendário com todas as reservas (excluindo garagem)."""
        self.output_text.clear()
        self.output_text.print_header("CALENDÁRIO DE RESERVAS")
        
        # Recarrega as reservas
        self.reservations = load_reservations()
        
        if self.reservations.empty:
            self.output_text.print_message("NENHUMA RESERVA CADASTRADA NO SISTEMA.")
            return
        
        # Filtra reservas excluindo garagem (conforme solicitado)
        filtered_reservations = self.reservations[self.reservations['area'] != AREA_PARKING]
        
        if filtered_reservations.empty:
            self.output_text.print_message("NENHUMA RESERVA DE QUADRA, PISCINA OU CHURRASQUEIRA CADASTRADA NO SISTEMA.")
            return
        
        # Abre o diálogo de calendário com TODAS as reservas (incluindo garagem)
        # O diálogo filtra internamente para mostrar apenas quadra, piscina e churrasqueira
        calendar_dialog = ReservationsCalendarDialog(self.root, "CALENDÁRIO DE RESERVAS", self.reservations)
        calendar_dialog.parent_app = self  # Passa referência para a classe principal
        calendar_dialog.show()



    def _start_bbq_reservation(self):
        """Inicia o fluxo de reserva para a área de churrasco."""
        self.output_text.clear()
        self.output_text.print_header("RESERVA DA ÁREA DE CHURRASCO")
        self.output_text.print_message("A área de churrasco é reservada para o dia inteiro.")
        
        # Recarrega as reservas
        self.reservations = load_reservations()

        # 1. Obter datas já reservadas para a churrasqueira
        booked_bbq_dates = self.reservations[self.reservations['area'] == AREA_BBQ]['date'].tolist()
        booked_dates_obj = [datetime.strptime(d, '%Y-%m-%d').date() for d in booked_bbq_dates if d]
        
        if booked_dates_obj:
            self.output_text.print_message(f"ENCONTRADAS {len(booked_dates_obj)} DATA(S) OCUPADA(S).")
        
        # 2. Abrir o calendário para seleção de data (com verificação de datas ocupadas)
        # Para churrasqueira, não pode ter múltiplas reservas no mesmo dia
        disabled_dates = self._get_disabled_dates_for_area(AREA_BBQ)
        
        result = CalendarDialog(self.root, "SELECIONAR DATA - CHURRASQUEIRA", disabled_dates=disabled_dates, area_type=AREA_BBQ).show()
        if not result:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        
        selected_date, is_monthly = result
        if is_monthly:
            self.output_text.print_message("RESERVA CANCELADA - Locação mensal não é válida para churrasqueira.", style="info")
            return
        
        date_str = selected_date.strftime('%d/%m/%Y')
        date_db_str = selected_date.strftime('%Y-%m-%d')
        self.output_text.print_styled("DATA SELECIONADA", date_str)

        # 3. Selecionar o morador responsável
        resident = self._select_resident()
        if not resident:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        self.output_text.print_styled("MORADOR RESPONSÁVEL", resident['name'])
        
        # 4. Obter número de visitantes (sem nomes individuais)
        try:
            num_visitors_str = custom_askstring(self.root, "NÚMERO DE VISITANTES", "QUANTOS VISITANTES? (MÁX: 30)", validation_regex=r"^\d{1,2}$")
            if num_visitors_str is None:
                self.output_text.print_message("RESERVA CANCELADA.", style="info")
                return

            num_visitors = int(num_visitors_str)
            if not (0 <= num_visitors <= 50):
                messagebox.showerror("LIMITE EXCEDIDO", "O número de visitantes deve ser entre 0 e 30.", parent=self.root)
                return None
            
            visitors_str = f"{num_visitors} pessoa(s)" if num_visitors > 0 else "NENHUM"
            self.output_text.print_styled("VISITANTES", visitors_str)
        except (ValueError, Exception) as e:
            print(f"Erro ao obter número de visitantes: {e}")
            self.output_text.print_message("ERRO AO OBTER NÚMERO DE VISITANTES.", style="error")
            return
        
        # 5. Perguntar sobre o pagamento (OBRIGATÓRIO para churrasqueira)
        payment_made = messagebox.askyesno("CONFIRMAÇÃO DE PAGAMENTO", "O pagamento da taxa de reserva foi realizado?\n\nATENÇÃO: Pagamento é OBRIGATÓRIO para reservar a churrasqueira.", parent=self.root)
        payment_status = "pago" if payment_made else "pendente"
        self.output_text.print_styled("STATUS DO PAGAMENTO", payment_status)

        # 6. Perguntar o nome do porteiro
        doorman_name = custom_askstring(self.root, "PORTEIRO RESPONSÁVEL", "NOME DO PORTEIRO RESPONSÁVEL:", uppercase=True)
        if not doorman_name:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        self.output_text.print_styled("PORTEIRO", doorman_name)

        # 7. Confirmar e salvar
        confirm = messagebox.askyesno(
            "Confirmar Reserva",
            f"Confirma a reserva da CHURRASQUEIRA para o dia {date_str} em nome de {resident['name'].upper()}?\n\nVISITANTES: {visitors_str}\nPAGAMENTO: {payment_status.upper()}",
            parent=self.root
        )
        if confirm:
            new_reservation = pd.DataFrame([{
                "area": AREA_BBQ, "date": date_db_str, "start_time": "N/A", "end_time": "N/A",
                "block": resident['block'], "apartment": resident['apartment'], "resident_name": resident['name'],
                "visitors": visitors_str, "payment_status": payment_status, "doorman_name": doorman_name
            }])
            self.reservations = pd.concat([self.reservations, new_reservation], ignore_index=True)
            if save_reservations(self.reservations):
                # Envia confirmação via WhatsApp
                if resident['phone'] and resident['phone'] not in ["0", STATUS_NA]:
                    send_result = send_reservation_confirmation_whatsapp(resident['phone'], new_reservation.iloc[0].to_dict(), self.output_text)

                    # Mostra status do envio na interface
                    if send_result['success']:
                        self.output_text.print_message("✅ CONFIRMAÇÃO WHATSAPP ENVIADA COM SUCESSO", style="success")
                    else:
                        self.output_text.print_message(f"⚠️  CONFIRMAÇÃO WHATSAPP NÃO ENVIADA: {send_result['reason']}", style="error")
                else:
                    self.output_text.print_message("ℹ️  NÃO FOI POSSÍVEL ENVIAR CONFIRMAÇÃO (TELEFONE NÃO CADASTRADO)", style="info")

                self.output_text.print_message("RESERVA DA CHURRASQUEIRA REALIZADA COM SUCESSO!", style="success")
            else:
                self.output_text.print_message("ERRO AO SALVAR A RESERVA. TENTE NOVAMENTE.", style="error")
        else:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")

    def _start_court_reservation(self):
        """Inicia o fluxo de reserva para a área de quadra."""
        self.output_text.clear()
        self.output_text.print_header("RESERVA DA ÁREA DE QUADRA")
        self.output_text.print_message("A área de quadra é reservada com horário específico - Máximo de 20 visitantes.")
        
        # Recarrega as reservas
        self.reservations = load_reservations()

        # 1. Selecionar data (com informações de horários já marcados)
        # Obtém datas que já têm horários marcados para a quadra
        dates_with_times = self._get_dates_with_times_for_area(AREA_COURT)
        
        result = CalendarDialog(self.root, "SELECIONAR DATA - QUADRA", dates_with_times=dates_with_times, area_type=AREA_COURT).show()
        if not result:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        
        selected_date, is_monthly = result
        if is_monthly:
            self.output_text.print_message("RESERVA CANCELADA - Locação mensal não é válida para quadra.", style="info")
            return
        
        date_str = selected_date.strftime('%d/%m/%Y')
        date_db_str = selected_date.strftime('%Y-%m-%d')
        self.output_text.print_styled("DATA SELECIONADA", date_str)



        # 2. Selecionar horários (passando horários já marcados nesta data)
        existing_times = dates_with_times.get(selected_date, [])
        time_result = TimeSelectionDialog(self.root, "SELECIONAR HORÁRIOS - QUADRA", "QUADRA", selected_date, existing_times).show()
        if not time_result:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        
        start_time, end_time = time_result
        start_time_str = start_time.strftime('%H:%M')
        end_time_str = end_time.strftime('%H:%M')
        self.output_text.print_styled("HORÁRIO", f"DAS {start_time_str} ÀS {end_time_str}")

        # 3. Checar conflitos
        if check_time_conflict(self.reservations, AREA_COURT, selected_date, start_time, end_time):
            self.output_text.print_message(f"CONFLITO DE HORÁRIO! JÁ EXISTE UMA RESERVA PARA ESTE PERÍODO.", style="error")
            messagebox.showerror("CONFLITO DE HORÁRIO", f"O horário das {start_time_str} às {end_time_str} no dia {date_str} não está disponível para a QUADRA.", parent=self.root)
            return

        # 4. Selecionar morador
        resident = self._select_resident()
        if not resident:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        self.output_text.print_styled("MORADOR RESPONSÁVEL", resident['name'])

        # 5. Obter lista de visitantes
        visitor_list = self._get_visitor_list(20, "QUADRA")
        if visitor_list is None:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        visitors_str = "; ".join(visitor_list) if visitor_list else "NENHUM"
        self.output_text.print_styled("VISITANTES", f"{len(visitor_list)} pessoa(s)")

        # 6. Nome do porteiro
        doorman_name = custom_askstring(self.root, "PORTEIRO RESPONSÁVEL", "NOME DO PORTEIRO:", uppercase=True)
        if not doorman_name:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        self.output_text.print_styled("PORTEIRO", doorman_name)

        # 7. Confirmar e salvar
        confirm_msg = f"Confirma a reserva da QUADRA para {resident['name'].upper()}?\n\nDATA: {date_str}\nHORÁRIO: {start_time_str} - {end_time_str}\nVISITANTES: {visitors_str}"
        if messagebox.askyesno("CONFIRMAR RESERVA", confirm_msg, parent=self.root):
            new_reservation = pd.DataFrame([{
                "area": AREA_COURT, "date": date_db_str, "start_time": start_time_str, "end_time": end_time_str,
                "block": resident['block'], "apartment": resident['apartment'], "resident_name": resident['name'],
                "visitors": visitors_str, "payment_status": "N/A", "doorman_name": doorman_name
            }])
            self.reservations = pd.concat([self.reservations, new_reservation], ignore_index=True)
            if save_reservations(self.reservations):
                # Envia confirmação via WhatsApp
                if resident['phone'] and resident['phone'] not in ["0", STATUS_NA]:
                    send_result = send_reservation_confirmation_whatsapp(resident['phone'], new_reservation.iloc[0].to_dict(), self.output_text)

                    # Mostra status do envio na interface
                    if send_result['success']:
                        self.output_text.print_message("✅ CONFIRMAÇÃO WHATSAPP ENVIADA COM SUCESSO", style="success")
                    else:
                        self.output_text.print_message(f"⚠️  CONFIRMAÇÃO WHATSAPP NÃO ENVIADA: {send_result['reason']}", style="error")
                else:
                    self.output_text.print_message("ℹ️  NÃO FOI POSSÍVEL ENVIAR CONFIRMAÇÃO (TELEFONE NÃO CADASTRADO)", style="info")

                self.output_text.print_message("RESERVA DA QUADRA REALIZADA COM SUCESSO!", style="success")
            else:
                self.output_text.print_message("ERRO AO SALVAR A RESERVA. TENTE NOVAMENTE.", style="error")
        else:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")

    def _start_pool_reservation(self):
        """Inicia o fluxo de reserva para a área de piscina."""
        self.output_text.clear()
        self.output_text.print_header("RESERVA DA ÁREA DE PISCINA")
        self.output_text.print_message("A área de piscina é reservada para o dia inteiro - Máximo de 2 visitantes por morador.")
        
        # Recarrega as reservas
        self.reservations = load_reservations()

        # 1. Selecionar data
        result = CalendarDialog(self.root, "SELECIONAR DATA - PISCINA").show()
        if not result:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        
        selected_date, is_monthly = result
        if is_monthly:
            self.output_text.print_message("RESERVA CANCELADA - Locação mensal não é válida para piscina.", style="info")
            return
        
        date_str = selected_date.strftime('%d/%m/%Y')
        date_db_str = selected_date.strftime('%Y-%m-%d')
        
        # Verifica se é segunda-feira (0 = segunda-feira em weekday())
        if selected_date.weekday() == 0:
            self.output_text.print_message(f"ERRO: A piscina não pode ser reservada às segundas-feiras!", style="error")
            messagebox.showerror("SEGUNDA-FEIRA BLOQUEADA", 
                               f"A data {date_str} é uma segunda-feira.\n\nA piscina não pode ser reservada às segundas-feiras por motivos de manutenção.", 
                               parent=self.root)
            return
        
        self.output_text.print_styled("DATA SELECIONADA", date_str)

        # 2. Selecionar o morador responsável
        resident = self._select_resident()
        if not resident:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        self.output_text.print_styled("MORADOR RESPONSÁVEL", resident['name'])
        
        # 3. Obter lista de visitantes (com nomes individuais)
        visitor_list = self._get_visitor_list(2, "PISCINA")
        if visitor_list is None:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        visitors_str = "; ".join(visitor_list) if visitor_list else "NENHUM"
        self.output_text.print_styled("VISITANTES", f"{len(visitor_list)} pessoa(s)")
        
        # 4. Perguntar o nome do porteiro
        doorman_name = custom_askstring(self.root, "PORTEIRO RESPONSÁVEL", "NOME DO PORTEIRO RESPONSÁVEL:", uppercase=True)
        if not doorman_name:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        self.output_text.print_styled("PORTEIRO", doorman_name)

        # 5. Confirmar e salvar
        confirm = messagebox.askyesno(
            "Confirmar Reserva",
            f"Confirma a reserva da PISCINA para o dia {date_str} em nome de {resident['name'].upper()}?\n\nVISITANTES: {visitors_str}",
            parent=self.root
        )
        if confirm:
            new_reservation = pd.DataFrame([{
                "area": AREA_POOL, "date": date_db_str, "start_time": "N/A", "end_time": "N/A",
                "block": resident['block'], "apartment": resident['apartment'], "resident_name": resident['name'],
                "visitors": visitors_str, "payment_status": "N/A", "doorman_name": doorman_name
            }])
            self.reservations = pd.concat([self.reservations, new_reservation], ignore_index=True)
            if save_reservations(self.reservations):
                # Envia confirmação via WhatsApp
                if resident['phone'] and resident['phone'] not in ["0", STATUS_NA]:
                    send_result = send_reservation_confirmation_whatsapp(resident['phone'], new_reservation.iloc[0].to_dict(), self.output_text)

                    # Mostra status do envio na interface
                    if send_result['success']:
                        self.output_text.print_message("✅ CONFIRMAÇÃO WHATSAPP ENVIADA COM SUCESSO", style="success")
                    else:
                        self.output_text.print_message(f"⚠️  CONFIRMAÇÃO WHATSAPP NÃO ENVIADA: {send_result['reason']}", style="error")
                else:
                    self.output_text.print_message("ℹ️  NÃO FOI POSSÍVEL ENVIAR CONFIRMAÇÃO (TELEFONE NÃO CADASTRADO)", style="info")

                self.output_text.print_message("RESERVA DA PISCINA REALIZADA COM SUCESSO!", style="success")
            else:
                self.output_text.print_message("ERRO AO SALVAR A RESERVA. TENTE NOVAMENTE.", style="error")
        else:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")

    def _start_parking_reservation(self):
        """Inicia o fluxo de reserva para a área de garagem."""
        self.output_text.clear()
        self.output_text.print_header("RESERVA DA ÁREA DE GARAGEM")
        self.output_text.print_message("A área de garagem é reservada para o dia inteiro - 10 vagas numeradas de 1 a 10.")
        
        # Recarrega as reservas
        self.reservations = load_reservations()

        # 1. Selecionar datas - já mostra data inicial e final no mesmo diálogo
        calendar_result = CalendarDialog(self.root, "SELECIONAR DATAS - GARAGEM", area_type='garagem', is_parking_multi_date=True).show()
        
        if not calendar_result:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        
        start_date, end_date = calendar_result
        
        dates_to_reserve = []
        is_monthly = False
        
        # Verifica se é locação mensal
        if start_date is None and end_date is True:
            # Locação mensal
            is_monthly = True
            dates_to_reserve = [("MENSAL", "LOCAÇÃO MENSAL")]
            self.output_text.print_styled("TIPO DE LOCAÇÃO", "MENSAL")
        else:
            # Locação diária
            is_monthly = False
            
            # Verifica se é período ou data única
            if end_date > start_date:
                # Múltiplos dias
                from datetime import timedelta
                current_date = start_date
                while current_date <= end_date:
                    date_display = current_date.strftime('%d/%m/%Y')
                    date_db = current_date.strftime('%Y-%m-%d')
                    dates_to_reserve.append((date_db, date_display))
                    current_date += timedelta(days=1)
                
                date_range_str = f"{start_date.strftime('%d/%m/%Y')} até {end_date.strftime('%d/%m/%Y')}"
                self.output_text.print_styled("PERÍODO DE LOCAÇÃO", f"{date_range_str} ({len(dates_to_reserve)} dias)")
                self.output_text.print_styled("TIPO DE LOCAÇÃO", "DIÁRIA")
            else:
                # Data única
                date_str = start_date.strftime('%d/%m/%Y')
                date_db_str = start_date.strftime('%Y-%m-%d')
                dates_to_reserve = [(date_db_str, date_str)]
                self.output_text.print_styled("DATA SELECIONADA", date_str)
                self.output_text.print_styled("TIPO DE LOCAÇÃO", "DIÁRIA")

        # 2. Selecionar o morador responsável
        resident = self._select_resident()
        if not resident:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        self.output_text.print_styled("MORADOR RESPONSÁVEL", resident['name'])
        
        # 3. Selecionar vaga de garagem (1 a 10)
        if is_monthly:
            # Para locação mensal, não precisa de data
            parking_spot = self._select_parking_spot(None, is_monthly=True)
        else:
            # Para locação diária, precisamos verificar se a vaga está disponível para TODAS as datas
            # Primeiro, verificar disponibilidade de TODAS as vagas para TODAS as datas
            if len(dates_to_reserve) > 1:
                # Para múltiplos dias, mostrar lista de vagas disponíveis para TODO o período
                from datetime import datetime as dt
                
                # Encontra todas as vagas disponíveis para TODO o período
                all_spots = [str(i) for i in range(1, 11)]
                unavailable_spots = set()
                
                for date_db, date_display in dates_to_reserve:
                    # Verifica vagas ocupadas para este dia específico
                    daily_reservations = self.reservations[
                        (self.reservations['area'] == AREA_PARKING) & 
                        (self.reservations['date'] == date_db)
                    ]
                    
                    for _, reservation in daily_reservations.iterrows():
                        if 'parking_spot' in reservation and reservation['parking_spot']:
                            try:
                                spot = str(int(float(reservation['parking_spot'])))
                                unavailable_spots.add(spot)
                            except (ValueError, TypeError):
                                continue
                    
                    # Verifica vagas ocupadas mensalmente (sempre indisponíveis)
                    monthly_reservations = self.reservations[
                        (self.reservations['area'] == AREA_PARKING) & 
                        (self.reservations['date'] == 'MENSAL')
                    ]
                    for _, reservation in monthly_reservations.iterrows():
                        if 'parking_spot' in reservation and reservation['parking_spot']:
                            try:
                                spot = str(int(float(reservation['parking_spot'])))
                                unavailable_spots.add(spot)
                            except (ValueError, TypeError):
                                continue
                
                available_spots = [spot for spot in all_spots if spot not in unavailable_spots]
                
                if not available_spots:
                    date_range = f"{dates_to_reserve[0][1]} até {dates_to_reserve[-1][1]}"
                    messagebox.showerror("GARAGEM LOTADA", 
                                       f"Nenhuma vaga disponível no período selecionado:\n\n{date_range}\n\n"
                                       f"Por favor, escolha outro período.", 
                                       parent=self.root)
                    return
                
                # Mostra um diálogo customizado com as vagas disponíveis
                parking_spot = self._select_parking_spot_multi_date(available_spots, dates_to_reserve)
            else:
                # Apenas um dia, usa o método normal
                parking_spot = self._select_parking_spot(start_date, is_monthly=False)
            
        if not parking_spot:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        
        self.output_text.print_styled("VAGA SELECIONADA", f"Vaga {parking_spot}")
        
        # 4. Define visitantes como "NENHUM" (não é necessário perguntar)
        visitors_str = "NENHUM"
        self.output_text.print_styled("VISITANTES", visitors_str)
        
        # 5. Perguntar sobre o pagamento (OBRIGATÓRIO para garagem)
        payment_made = messagebox.askyesno("CONFIRMAÇÃO DE PAGAMENTO", "O pagamento da taxa de reserva da vaga de garagem foi realizado?\n\nATENÇÃO: Pagamento é OBRIGATÓRIO para reservar a vaga.", parent=self.root)
        payment_status = "pago" if payment_made else "pendente"
        self.output_text.print_styled("STATUS DO PAGAMENTO", payment_status)
        
        # 6. Perguntar o nome do porteiro
        doorman_name = custom_askstring(self.root, "PORTEIRO RESPONSÁVEL", "NOME DO PORTEIRO RESPONSÁVEL:", uppercase=True)
        if not doorman_name:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")
            return
        self.output_text.print_styled("PORTEIRO", doorman_name)

        # 7. Confirmar e salvar
        dates_summary = ""
        if len(dates_to_reserve) > 1:
            dates_summary = f"\n📅 Período: {dates_to_reserve[0][1]} até {dates_to_reserve[-1][1]} ({len(dates_to_reserve)} dias)"
        elif len(dates_to_reserve) == 1:
            dates_summary = f"\n📅 Data: {dates_to_reserve[0][1]}"
        
        if is_monthly:
            confirm_message = f"Confirma a LOCAÇÃO MENSAL da VAGA {parking_spot} da GARAGEM em nome de {resident['name'].upper()}?\n\nPAGAMENTO: {payment_status.upper()}\n\nATENÇÃO: Esta vaga ficará indisponível para locação diária até ser removida."
        else:
            confirm_message = f"Confirma a reserva da VAGA {parking_spot} da GARAGEM{dates_summary} em nome de {resident['name'].upper()}?\n\nPAGAMENTO: {payment_status.upper()}"
        
        confirm = messagebox.askyesno("Confirmar Reserva", confirm_message, parent=self.root)
        if confirm:
            # Criar uma reserva para cada data
            new_reservations_list = []
            for date_db, date_display in dates_to_reserve:
                new_reservation = {
                    "area": AREA_PARKING, "date": date_db, "start_time": "N/A", "end_time": "N/A",
                    "block": resident['block'], "apartment": resident['apartment'], "resident_name": resident['name'],
                    "visitors": visitors_str, "payment_status": payment_status, "doorman_name": doorman_name,
                    "parking_spot": parking_spot  # NOVO: Campo para a vaga específica
                }
                new_reservations_list.append(new_reservation)
            
            new_reservations = pd.DataFrame(new_reservations_list)
            self.reservations = pd.concat([self.reservations, new_reservations], ignore_index=True)
            
            if save_reservations(self.reservations):
                # Envia confirmação via WhatsApp para cada data
                if resident['phone'] and resident['phone'] not in ["0", STATUS_NA]:
                    all_sent = True
                    failed_count = 0
                    for reservation in new_reservations_list:
                        send_result = send_reservation_confirmation_whatsapp(resident['phone'], reservation, self.output_text)

                        if not send_result['success']:
                            all_sent = False
                            failed_count += 1

                    # Mostra status geral do envio
                    if all_sent:
                        self.output_text.print_message("✅ TODAS AS CONFIRMAÇÕES WHATSAPP ENVIADAS COM SUCESSO", style="success")
                    elif failed_count == len(new_reservations_list):
                        self.output_text.print_message("⚠️  NENHUMA CONFIRMAÇÃO WHATSAPP FOI ENVIADA", style="error")
                    else:
                        self.output_text.print_message(f"⚠️  {len(new_reservations_list) - failed_count} DE {len(new_reservations_list)} CONFIRMAÇÕES WHATSAPP ENVIADAS", style="error")
                else:
                    self.output_text.print_message("ℹ️  NÃO FOI POSSÍVEL ENVIAR CONFIRMAÇÕES (TELEFONE NÃO CADASTRADO)", style="info")

                if len(dates_to_reserve) > 1:
                    self.output_text.print_message(f"RESERVA DE {len(dates_to_reserve)} DIAS DA VAGA DE GARAGEM REALIZADA COM SUCESSO!", style="success")
                else:
                    self.output_text.print_message("RESERVA DA VAGA DE GARAGEM REALIZADA COM SUCESSO!", style="success")
            else:
                self.output_text.print_message("ERRO AO SALVAR A RESERVA. TENTE NOVAMENTE.", style="error")
        else:
            self.output_text.print_message("RESERVA CANCELADA.", style="info")

    def _select_parking_spot_multi_date(self, available_spots, dates_to_reserve):
        """Seleciona uma vaga de garagem disponível para múltiplos dias."""
        dialog = tk.Toplevel(self.root)
        dialog.title("SELECIONAR VAGA DE GARAGEM")
        dialog.geometry("500x400")
        dialog.configure(bg="#f0f0f0")
        dialog.transient(self.root)
        dialog.grab_set()
        
        # Centraliza o diálogo
        dialog.update_idletasks()
        width = dialog.winfo_width()
        height = dialog.winfo_height()
        x = (dialog.winfo_screenwidth() // 2) - (width // 2)
        y = (dialog.winfo_screenheight() // 2) - (height // 2)
        dialog.geometry(f'{width}x{height}+{x}+{y}')
        
        # Título
        title_label = tk.Label(dialog, text="🚗 SELECIONAR VAGA DE GARAGEM", 
                               font=(FONT_FAMILY, FONT_HEADER_SIZE, FONT_WEIGHT_BOLD), 
                               bg="#f0f0f0", fg="#003366")
        title_label.pack(pady=(20, 10))
        
        # Período de datas
        date_range = f"{dates_to_reserve[0][1]} até {dates_to_reserve[-1][1]} ({len(dates_to_reserve)} dias)"
        date_label = tk.Label(dialog, text=f"📅 Período: {date_range}", 
                              font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                              bg="#f0f0f0", fg="#1976d2")
        date_label.pack(pady=(0, 20))
        
        # Informações sobre vagas
        info_frame = tk.Frame(dialog, bg="#f0f0f0", relief="solid", bd=1)
        info_frame.pack(pady=(0, 20), padx=20, fill="x")
        
        tk.Label(info_frame, text="📊 STATUS DAS VAGAS:", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                bg="#f0f0f0", fg="#d32f2f").pack(pady=(5, 2))
        
        tk.Label(info_frame, text=f"✅ Disponíveis para TODO o período: {', '.join(available_spots)}", 
                font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                bg="#f0f0f0", fg="#388e3c").pack(pady=1)
        
        tk.Label(info_frame, text=f"📈 Total disponível: {len(available_spots)} vaga(s)", 
                font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                bg="#f0f0f0", fg="#666666").pack(pady=(1, 5))
        
        # Seleção da vaga
        tk.Label(dialog, text="SELECIONE UMA VAGA DISPONÍVEL:", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                bg="#f0f0f0").pack(pady=(0, 10))
        
        # Combobox com vagas disponíveis
        spot_var = tk.StringVar()
        spot_combo = ttk.Combobox(dialog, textvariable=spot_var, values=available_spots, 
                                 state="readonly", font=(FONT_FAMILY, FONT_SIZE_LARGE), width=10)
        spot_combo.pack(pady=(0, 20))
        spot_combo.set(available_spots[0])  # Seleciona a primeira vaga disponível
        
        # Variável para armazenar o resultado
        result = [None]
        
        # Botões (CANCELAR à esquerda, CONFIRMAR à direita)
        button_frame = tk.Frame(dialog, bg="#f0f0f0")
        button_frame.pack(pady=10)
        
        def on_confirm():
            selected_spot = spot_var.get()
            if selected_spot:
                result[0] = selected_spot
                dialog.destroy()
            else:
                messagebox.showerror("ERRO", "Por favor, selecione uma vaga.", parent=dialog)
        
        tk.Button(button_frame, text="CONFIRMAR", command=on_confirm,
                 font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), bg="#28a745", fg="white", 
                 width=15).pack(side="left", padx=(0, 10))
        tk.Button(button_frame, text="CANCELAR", command=dialog.destroy,
                 font=(FONT_FAMILY, FONT_SIZE_NORMAL), width=15).pack(side="left")
        
        dialog.wait_window()
        return result[0]
    
    def _select_parking_spot(self, selected_date, is_monthly=False, hide_status=False):
        """Seleciona uma vaga de garagem disponível para a data selecionada ou mensal.
        Quando hide_status=True, oculta a seção de vagas disponíveis/ocupadas no primeiro modal.
        """
        # Todas as vagas disponíveis (1 a 10)
        all_spots = [str(i) for i in range(1, 11)]
        
        if is_monthly:
            # Para locação mensal, verifica vagas já alugadas mensalmente
            monthly_reservations = self.reservations[
                (self.reservations['area'] == AREA_PARKING) & 
                (self.reservations['date'] == 'MENSAL')
            ]
            
            # Obtém as vagas já ocupadas mensalmente
            occupied_monthly = []
            for _, reservation in monthly_reservations.iterrows():
                if 'parking_spot' in reservation and reservation['parking_spot']:
                    # Converte para inteiro e depois para string para garantir formato correto
                    spot = reservation['parking_spot']
                    try:
                        spot_int = int(float(spot))  # Converte float para int
                        occupied_monthly.append(str(spot_int))
                    except (ValueError, TypeError):
                        # Se não conseguir converter, ignora
                        continue
            
            # NOVO: Verifica também vagas alugadas diariamente (qualquer data futura)
            daily_reservations = self.reservations[
                (self.reservations['area'] == AREA_PARKING) & 
                (self.reservations['date'] != 'MENSAL') &
                (self.reservations['date'] >= datetime.now().strftime('%Y-%m-%d'))
            ]
            
            occupied_daily = []
            for _, reservation in daily_reservations.iterrows():
                if 'parking_spot' in reservation and reservation['parking_spot']:
                    try:
                        spot_int = int(float(reservation['parking_spot']))
                        occupied_daily.append(str(spot_int))
                    except (ValueError, TypeError):
                        continue
            
            # Combina vagas ocupadas (mensais + diárias futuras)
            all_occupied = list(set(occupied_monthly + occupied_daily))
            
            # Para locação mensal, só pode usar vagas não ocupadas (nem mensais, nem diárias futuras)
            available_spots = [spot for spot in all_spots if spot not in all_occupied]
            occupied_spots = all_occupied
            
            if not available_spots:
                messagebox.showerror("GARAGEM LOTADA", 
                                   "Todas as 10 vagas da garagem já estão alugadas (mensalmente ou diariamente).\n\n"
                                   "Por favor, aguarde uma vaga ficar disponível.", 
                                   parent=self.root)
                return None
        else:
            # Para locação diária, verifica vagas para a data específica E mensais
            date_str = selected_date.strftime('%Y-%m-%d')
            
            # Vagas ocupadas para a data específica
            daily_reservations = self.reservations[
                (self.reservations['area'] == AREA_PARKING) & 
                (self.reservations['date'] == date_str)
            ]
            occupied_daily = []
            for _, reservation in daily_reservations.iterrows():
                if 'parking_spot' in reservation and reservation['parking_spot']:
                    # Converte para inteiro e depois para string para garantir formato correto
                    spot = reservation['parking_spot']
                    try:
                        spot_int = int(float(spot))  # Converte float para int
                        occupied_daily.append(str(spot_int))
                    except (ValueError, TypeError):
                        # Se não conseguir converter, ignora
                        continue
            
            # Vagas ocupadas mensalmente (sempre indisponíveis para locação diária)
            monthly_reservations = self.reservations[
                (self.reservations['area'] == AREA_PARKING) & 
                (self.reservations['date'] == 'MENSAL')
            ]
            occupied_monthly = []
            for _, reservation in monthly_reservations.iterrows():
                if 'parking_spot' in reservation and reservation['parking_spot']:
                    # Converte para inteiro e depois para string para garantir formato correto
                    spot = reservation['parking_spot']
                    try:
                        spot_int = int(float(spot))  # Converte float para int
                        occupied_monthly.append(str(spot_int))
                    except (ValueError, TypeError):
                        # Se não conseguir converter, ignora
                        continue
            
            # Combina todas as vagas ocupadas (diárias + mensais)
            occupied_spots = occupied_daily + occupied_monthly
            available_spots = [spot for spot in all_spots if spot not in occupied_spots]
            
            if not available_spots:
                messagebox.showerror("GARAGEM LOTADA", 
                                   f"Todas as 10 vagas da garagem já estão ocupadas para {selected_date.strftime('%d/%m/%Y')}.\n\n"
                                   "Vagas podem estar ocupadas por reservas diárias ou locações mensais.\n"
                                   "Por favor, escolha outra data.", 
                                   parent=self.root)
                return None
        
        # Mostra vagas disponíveis e ocupadas
        occupied_text = ", ".join(occupied_spots) if occupied_spots else "NENHUMA"
        available_text = ", ".join(available_spots)
        
        # Cria o diálogo de seleção
        dialog = tk.Toplevel(self.root)
        dialog.title("SELECIONAR VAGA DE GARAGEM")
        dialog.geometry("500x400")
        dialog.configure(bg="#f0f0f0")
        dialog.transient(self.root)
        dialog.grab_set()
        
        # Título
        title_label = tk.Label(dialog, text="🚗 SELECIONAR VAGA DE GARAGEM", 
                               font=(FONT_FAMILY, FONT_HEADER_SIZE, FONT_WEIGHT_BOLD), 
                               bg="#f0f0f0", fg="#003366")
        title_label.pack(pady=(20, 10))
        
        # Data selecionada ou tipo de locação
        if is_monthly:
            date_label = tk.Label(dialog, text="🚗 LOCAÇÃO MENSAL - Sem data específica", 
                                  font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                                  bg="#f0f0f0", fg="#8B4513")
        else:
            date_label = tk.Label(dialog, text=f"📅 Data: {selected_date.strftime('%d/%m/%Y')}", 
                                  font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                                  bg="#f0f0f0", fg="#1976d2")
        date_label.pack(pady=(0, 20))
        
        # Informações sobre vagas (pode ser oculto na primeira abertura do modal)
        if not hide_status:
            info_frame = tk.Frame(dialog, bg="#f0f0f0", relief="solid", bd=1)
            info_frame.pack(pady=(0, 20), padx=20, fill="x")
            
            tk.Label(info_frame, text="📊 STATUS DAS VAGAS:", 
                    font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                    bg="#f0f0f0", fg="#d32f2f").pack(pady=(5, 2))
            
            if is_monthly:
                # Para locação mensal, mostra apenas vagas mensais ocupadas
                tk.Label(info_frame, text=f"🚫 Ocupadas mensalmente: {occupied_text}", 
                        font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                        bg="#f0f0f0", fg="#d32f2f").pack(pady=1)
            else:
                # Para locação diária, mostra detalhamento das vagas ocupadas
                # Separa vagas ocupadas diariamente e mensalmente
                daily_occupied = []
                monthly_occupied = []
                
                date_str = selected_date.strftime('%Y-%m-%d')
                daily_reservations = self.reservations[
                    (self.reservations['area'] == AREA_PARKING) & 
                    (self.reservations['date'] == date_str)
                ]
                for _, reservation in daily_reservations.iterrows():
                    if 'parking_spot' in reservation and reservation['parking_spot']:
                        spot = reservation['parking_spot']
                        try:
                            spot_int = int(float(spot))
                            daily_occupied.append(str(spot_int))
                        except (ValueError, TypeError):
                            continue
                
                monthly_reservations = self.reservations[
                    (self.reservations['area'] == AREA_PARKING) & 
                    (self.reservations['date'] == 'MENSAL')
                ]
                for _, reservation in monthly_reservations.iterrows():
                    if 'parking_spot' in reservation and reservation['parking_spot']:
                        spot = reservation['parking_spot']
                        try:
                            spot_int = int(float(spot))
                            monthly_occupied.append(str(spot_int))
                        except (ValueError, TypeError):
                            continue
                
                if daily_occupied:
                    daily_text = ", ".join(sorted(daily_occupied))
                    tk.Label(info_frame, text=f"🚫 Ocupadas diariamente: {daily_text}", 
                            font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                            bg="#f0f0f0", fg="#d32f2f").pack(pady=1)
                
                if monthly_occupied:
                    monthly_text = ", ".join(sorted(monthly_occupied))
                    tk.Label(info_frame, text=f"🔒 Ocupadas mensalmente: {monthly_text}", 
                            font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                            bg="#f0f0f0", fg="#8B4513").pack(pady=1)
            
            tk.Label(info_frame, text=f"✅ Disponíveis: {available_text}", 
                    font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                    bg="#f0f0f0", fg="#388e3c").pack(pady=1)
            
            tk.Label(info_frame, text=f"📈 Total disponível: {len(available_spots)} vaga(s)", 
                    font=(FONT_FAMILY, FONT_SIZE_SMALL), 
                    bg="#f0f0f0", fg="#666666").pack(pady=(1, 5))
        
        # Seleção da vaga
        tk.Label(dialog, text="SELECIONE UMA VAGA DISPONÍVEL:", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                bg="#f0f0f0").pack(pady=(0, 10))
        
        # Combobox com vagas disponíveis
        spot_var = tk.StringVar()
        spot_combo = ttk.Combobox(dialog, textvariable=spot_var, values=available_spots, 
                                 state="readonly", font=(FONT_FAMILY, FONT_SIZE_LARGE), width=10)
        spot_combo.pack(pady=(0, 20))
        spot_combo.set(available_spots[0])  # Seleciona a primeira vaga disponível
        
        # Variável para armazenar o resultado
        result = [None]
        
        # Botões (CANCELAR à esquerda, CONFIRMAR à direita)
        button_frame = tk.Frame(dialog, bg="#f0f0f0")
        button_frame.pack(pady=10)
        
        def on_confirm():
            selected_spot = spot_var.get()
            if selected_spot:
                result[0] = selected_spot
                dialog.destroy()
            else:
                messagebox.showerror("ERRO", "Por favor, selecione uma vaga.", parent=dialog)
        
        def on_cancel():
            dialog.destroy()
        
        # Botão CANCELAR à esquerda
        tk.Button(button_frame, text="CANCELAR", command=on_cancel,
                 font=(FONT_FAMILY, FONT_SIZE_NORMAL),
                 bg="#6c757d", fg="white", relief="raised", bd=2, padx=15, pady=8).pack(side=tk.LEFT, padx=(0, 10))
        
        # Botão CONFIRMAR à direita
        tk.Button(button_frame, text="CONFIRMAR", command=on_confirm,
                 font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                 bg="#28a745", fg="white", relief="raised", bd=2, padx=15, pady=8).pack(side=tk.LEFT)
        
        # Centraliza o diálogo na tela
        dialog.update_idletasks()
        width = dialog.winfo_width()
        height = dialog.winfo_height()
        x = self.root.winfo_x() + (self.root.winfo_width() // 2) - (width // 2)
        y = self.root.winfo_y() + (self.root.winfo_height() // 2) - (height // 2)
        dialog.geometry(f'{width}x{height}+{x}+{y}')
        
        # Configura o diálogo como modal
        dialog.focus_force()
        dialog.wait_window()
        
        return result[0]



    def _select_resident(self):
        """Função genérica para selecionar um morador. Retorna um dicionário com os dados ou None."""
        while True:
            block_apt_input = custom_askstring(self.root, "BLOCO E APTO DO RESPONSÁVEL", "DIGITE O BLOCO E APTO (EX: 4201):", validation_regex=r"^\d{4}$")
            if not block_apt_input:
                return None
            
            block, apartment = parse_block_apt(block_apt_input)
            if not validate_block_apt(block, apartment):
                messagebox.showerror("INVÁLIDO", "BLOCO/APTO INVÁLIDO.", parent=self.root)
                continue

            # Recarrega moradores para garantir dados atualizados
            self.residents = load_residents()
            apt_residents = get_residents_for_apt(self.residents, block, apartment)
            if apt_residents.empty:
                messagebox.showinfo("SEM MORADORES", "Nenhum morador cadastrado para este apartamento.", parent=self.root)
                continue

            # Converte para lista de dicionários para evitar problemas de referência
            options = []
            for _, res in apt_residents.iterrows():
                options.append({
                    'name': str(res['name']),
                    'block': str(res['block']),
                    'apartment': str(res['apartment']),
                    'phone': str(res['phone']) if pd.notna(res['phone']) else ''
                })

            menu_text = "SELECIONE O MORADOR RESPONSÁVEL:\n"
            for i, res in enumerate(options, 1):
                menu_text += f"\n{i} - {res['name'].upper()}"
            
            choice_str = custom_askstring(self.root, "SELECIONAR MORADOR", menu_text)
            if not choice_str or not choice_str.isdigit():
                continue

            choice = int(choice_str)
            if 1 <= choice <= len(options):
                return options[choice - 1] # Retorna o dicionário do morador
            else:
                messagebox.showwarning("OPÇÃO INVÁLIDA", "SELECIONE UM NÚMERO VÁLIDO.", parent=self.root)

    def _get_visitor_list(self, max_visitors, area_name):
        """Coleta a lista de nomes dos visitantes usando o novo diálogo."""
        try:
            # Primeiro, pergunta quantos visitantes
            num_visitors_str = custom_askstring(self.root, "NÚMERO DE VISITANTES", f"QUANTOS VISITANTES? (MÁX: {max_visitors})", validation_regex=r"^\d{1,2}$")
            if num_visitors_str is None:
                return None

            num_visitors = int(num_visitors_str)
            if not (0 <= num_visitors <= max_visitors):
                messagebox.showerror("LIMITE EXCEDIDO", f"O número de visitantes para a {area_name} deve ser entre 0 e {max_visitors}.", parent=self.root)
                return None
            if num_visitors == 0:
                return []

            # Agora usa o novo diálogo para coletar os nomes
            visitor_names_dialog = VisitorNamesDialog(self.root, f"NOMES DOS VISITANTES - {area_name.upper()}", num_visitors, area_name)
            visitor_list = visitor_names_dialog.show()
            
            if visitor_list is None:
                return None  # Usuário cancelou
            
            return visitor_list
            
        except (ValueError, Exception) as e:
            print(f"Erro na função _get_visitor_list: {e}")
            return None
    # --- FIM DO NOVO MÓDULO DE RESERVAS ---


    # --- Funções de Visualização ---
    
    def view_all_pending_packages(self):
        """Mostra APENAS encomendas pendentes com bloco/apto já identificados e oferece opção de lembrete."""
        self._clear_context_buttons()
        self.packages = load_packages()
        self.output_text.clear()
        self.output_text.print_header("TODAS AS ENCOMENDAS PENDENTES (COM DESTINO)")
        # Define o método de visualização atual para permitir refresh após ações
        self._current_view_method = self.view_all_pending_packages

        pending_identified = self.packages[
            (self.packages["status"] == STATUS_DELIVERED) &
            (self.packages["block"] != "0") &
            (self.packages["block"].notna())
        ].sort_values(by=["block", "apartment"])

        if pending_identified.empty:
            self.output_text.print_message("NENHUMA ENCOMENDA PENDENTE COM DESTINO IDENTIFICADO.")
            return

        self.output_text.print_styled("TOTAL DE ENCOMENDAS", str(len(pending_identified)), style="bold")
        self.output_text.print_separator("-")
        
        for _, pkg in pending_identified.iterrows():
            self.output_text.print_styled("BLOCO/APTO", f"{pkg['block']}/{pkg['apartment']}")
            self.output_text.print_styled("CÓDIGO", pkg['tracking_code'])
            self.output_text.print_styled("DESTINATÁRIO", pkg['recipient'])
            self.output_text.print_styled("DATA", pkg['scan_datetime'])
            self.output_text.print_separator("-")
        
        self.output_text.print_separator()
        
        # --- LÓGICA DO BOTÃO CONDICIONAL ---
        seven_days_ago = datetime.now() - pd.Timedelta(days=7)
        overdue_packages = []

        for index, pkg in pending_identified.iterrows():
            try:
                scan_date = datetime.strptime(pkg['scan_datetime'], "%d/%m/%Y %H:%M:%S")
                if scan_date < seven_days_ago:
                    overdue_packages.append(pkg)
            except (ValueError, TypeError):
                continue
        
        if overdue_packages:
            # =================== INÍCIO DA ALTERAÇÃO ===================
            
            last_sent_time = load_last_reminder_timestamp()
            can_send_reminder = True
            
            if last_sent_time:
                # Verifica se já se passaram 3 dias
                if (datetime.now() - last_sent_time).days < 3:
                    can_send_reminder = False

            reminder_button = tk.Button(
                self.context_button_frame,
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                fg="white", relief="raised", bd=2, padx=10, pady=10
            )

            if can_send_reminder:
                reminder_button.configure(
                    text=f"ENVIAR LEMBRETE PARA {len(overdue_packages)} ENCOMENDA(S) (> 7 DIAS)",
                    command=lambda: self._send_overdue_reminders(overdue_packages),
                    bg="#c00000", # Cor original (vermelho)
                    state="normal"
                )
            else:
                # Calcula o tempo restante para o próximo envio
                next_send_time = last_sent_time + pd.Timedelta(days=3)
                time_remaining = next_send_time - datetime.now()
                days_left = time_remaining.days
                hours_left, remainder = divmod(time_remaining.seconds, 3600)
                
                button_text = f"AGUARDE: PRÓXIMO ENVIO EM {days_left}d E {hours_left}h"
                
                reminder_button.configure(
                    text=button_text,
                    bg="#808080", # Cor cinza para desabilitado
                    state="disabled"
                )
                
            reminder_button.pack()

        # Adiciona botão para dar baixa em encomenda sem enviar mensagem (sempre visível nesta aba)
        if not pending_identified.empty:
            dar_baixa_btn = tk.Button(
                self.context_button_frame,
                text="DAR BAIXA EM ENCOMENDA SEM ENVIAR MENSAGEMP/ MORADOR",
                command=lambda: self._mark_package_collected_no_message_for_all_pending(pending_identified),
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                bg="#FF0000", fg="white", relief="raised", bd=2, padx=15, pady=10
            )
            dar_baixa_btn.pack(pady=10)
            
    def _send_overdue_reminders(self, overdue_packages):
        """Envia lembretes para a lista de encomendas atrasadas."""
        confirm_send = messagebox.askyesno(
            "ENVIAR LEMBRETES",
            f"Tem certeza que deseja enviar {len(overdue_packages)} lembrete(s) de retirada por WhatsApp agora?",
            parent=self.root
        )

        if confirm_send:
            self._clear_context_buttons() # Remove o botão após o uso
            self.output_text.print_subheader("ENVIANDO LEMBRETES DE WHATSAPP")
            for pkg in overdue_packages:
                recipient = pkg['recipient']
                phone = pkg['phone']
                tracking_code = pkg['tracking_code']
                
                if phone and phone not in ["0", STATUS_NA]:
                    self.output_text.print_styled("ENVIANDO PARA", f"{recipient.upper()} ({tracking_code})")
                    msg = f"LEMBRETE: Prezado(a) *{recipient.upper()}*, sua encomenda (*{tracking_code}*) está aguardando retirada na portaria do *Village Liberdade* há mais de 7 dias. (*NÃO RESPONDA ESTA MENSAGEM*)"
                    send_result = send_whatsapp_message(phone, msg, self.output_text, self._check_api_status_on_error)

                    # Mostra status do envio na interface
                    if send_result['success']:
                        self.output_text.print_message("  ✅ LEMBRETE ENVIADO COM SUCESSO", style="success")
                    else:
                        self.output_text.print_message(f"  ⚠️  LEMBRETE NÃO ENVIADO: {send_result['reason']}", style="error")
                else:
                    self.output_text.print_styled("NÃO ENVIADO (SEM TELEFONE)", f"{recipient.upper()} ({tracking_code})", style="error")
            self.output_text.print_message("ENVIO DE LEMBRETES CONCLUÍDO.", style="success")
            save_last_reminder_timestamp() # <-- SALVA A DATA E HORA DO ENVIO
            self.view_all_pending_packages() # <-- ATUALIZA A TELA PARA MOSTRAR O BOTÃO DESABILITADO


    def view_no_block_apt_packages(self):
        self._clear_context_buttons()
        self.packages = load_packages()
        self.output_text.clear()
        self.output_text.print_header("ENCOMENDAS SEM BLOCO/APTO OU AUSENTE")
        
        # Define o método de visualização atual para refresh
        self._current_view_method = self.view_no_block_apt_packages

        no_block_apt_pending = self.packages[
            (self.packages["block"] == "0") & 
            (self.packages["apartment"] == "0") & 
            (self.packages["status"] == STATUS_DELIVERED)
        ]

        if no_block_apt_pending.empty:
            self.output_text.print_message("NENHUMA ENCOMENDA NESTA CATEGORIA.")
        else:
            self.output_text.print_styled("TOTAL DE ENCOMENDAS", str(len(no_block_apt_pending)), style="bold")
            self.output_text.print_separator("-")
            for _, pkg in no_block_apt_pending.iterrows():
                self.output_text.print_styled("CÓDIGO", pkg['tracking_code'])
                self.output_text.print_styled("DESTINATÁRIO", pkg['recipient']) # Agora mostra o nome correto
                self.output_text.print_styled("DATA DE REGISTRO", pkg['scan_datetime'])
                self.output_text.print_separator("-")
        self.output_text.print_separator()
        
        # Adiciona botão para dar baixa em encomenda
        if not no_block_apt_pending.empty:
            dar_baixa_btn = tk.Button(
                self.context_button_frame,
                text="DAR BAIXA EM ENCOMENDA SEM ENVIAR MENSAGEMP/ MORADOR",
                command=self._mark_package_collected_no_message,
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                bg="#FF0000", fg="white", relief="raised", bd=2, padx=15, pady=10
            )
            dar_baixa_btn.pack(pady=10)

    def view_not_registered_packages(self):
        self._clear_context_buttons()
        self.packages = load_packages()
        self.output_text.clear()
        self.output_text.print_header("DESTINATÁRIO NÃO CADASTRADO (D)")
        
        # Define o método de visualização atual para refresh
        self._current_view_method = self.view_not_registered_packages

        not_registered = self.packages[self.packages["status"] == STATUS_PENDING_REGISTRATION]

        if not_registered.empty:
            self.output_text.print_message("NENHUMA ENCOMENDA NESTA CATEGORIA.")
        else:
            self.output_text.print_styled("TOTAL DE ENCOMENDAS", str(len(not_registered)), style="bold")
            self.output_text.print_separator("-")
            for _, pkg in not_registered.iterrows():
                self.output_text.print_styled("CÓDIGO", pkg['tracking_code'])
                self.output_text.print_styled("BLOCO", pkg['block'])
                self.output_text.print_styled("APARTAMENTO", pkg['apartment'])
                self.output_text.print_styled("DATA DE REGISTRO", pkg['scan_datetime'])
                self.output_text.print_separator("-")
        self.output_text.print_separator()
        
        # Adiciona botão para dar baixa em encomenda
        if not not_registered.empty:
            dar_baixa_btn = tk.Button(
                self.context_button_frame,
                text="DAR BAIXA EM ENCOMENDA SEM ENVIAR MENSAGEMP/ MORADOR",
                command=self._mark_package_collected_no_message,
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                bg="#FF0000", fg="white", relief="raised", bd=2, padx=15, pady=10
            )
            dar_baixa_btn.pack(pady=10)

    def manage_residents(self):
        """Função principal para gerenciar moradores com interface de busca."""
        self._clear_context_buttons()
        self.output_text.clear()
        self.output_text.print_header("GERENCIAR MORADORES")
        
        # Abre a janela de gerenciamento de moradores
        self._show_residents_management_dialog()
    
    def _show_residents_management_dialog(self):
        """Mostra o diálogo principal de gerenciamento de moradores."""
        # Cria a janela modal
        dialog = tk.Toplevel(self.root)
        dialog.title("GERENCIAR MORADORES")
        dialog.geometry("800x600")
        dialog.configure(bg="#f0f0f0")
        dialog.transient(self.root)
        dialog.grab_set()
        
        # Centraliza o diálogo
        dialog.update_idletasks()
        x = self.root.winfo_x() + (self.root.winfo_width() // 2) - (dialog.winfo_width() // 2)
        y = self.root.winfo_y() + (self.root.winfo_height() // 2) - (dialog.winfo_height() // 2)
        dialog.geometry(f'+{x}+{y}')
        
        # Frame principal
        main_frame = tk.Frame(dialog, bg="#f0f0f0", padx=20, pady=20)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Título
        title_label = tk.Label(main_frame, text="🏠 GERENCIAR MORADORES", 
                               font=(FONT_FAMILY, FONT_HEADER_SIZE, FONT_WEIGHT_BOLD), 
                               bg="#f0f0f0", fg="#003366")
        title_label.pack(pady=(0, 20))
        
        # Frame para campo de pesquisa
        search_frame = tk.Frame(main_frame, bg="#f0f0f0")
        search_frame.pack(fill=tk.X, pady=(0, 15))
        
        tk.Label(search_frame, text="🔍 PESQUISAR POR PRIMEIRO NOME:", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                bg="#f0f0f0").pack(anchor="w", pady=(0, 5))
        
        # Campo de entrada de pesquisa
        search_entry = tk.Entry(search_frame, font=(FONT_FAMILY, FONT_SIZE_LARGE), width=30)
        search_entry.pack(side=tk.LEFT, padx=(0, 10))
        
        # Validação para não permitir espaços
        def validate_search(event):
            current_text = search_entry.get()
            if ' ' in current_text:
                search_entry.delete(0, tk.END)
                search_entry.insert(0, current_text.replace(' ', ''))
                messagebox.showwarning("AVISO", "DIGITE APENAS O PRIMEIRO NOME (SEM ESPAÇOS).", parent=dialog)
        
        search_entry.bind('<KeyRelease>', validate_search)
        
        # Botão de pesquisar
        search_btn = tk.Button(search_frame, text="PESQUISAR", 
                              command=lambda: self._show_residents_by_search(dialog, search_entry.get().strip()),
                              font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                              bg="#17A2B8", fg="white", relief="raised", bd=2, padx=15, pady=5)
        search_btn.pack(side=tk.LEFT)
        
        # Separador
        tk.Label(main_frame, text="─" * 80, bg="#f0f0f0", fg="#666666").pack(pady=10)
        
        # Label para seleção por letra
        tk.Label(main_frame, text="📋 BUSCAR POR LETRA:", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                bg="#f0f0f0").pack(anchor="w", pady=(0, 10))
        
        # Frame para as letras do alfabeto
        letters_frame = tk.Frame(main_frame, bg="#f0f0f0")
        letters_frame.pack(fill=tk.BOTH, expand=True)
        
        # Cria botões para cada letra (A-Z)
        alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        buttons_per_row = 13
        
        for i, letter in enumerate(alphabet):
            row = i // buttons_per_row
            col = i % buttons_per_row
            
            btn = tk.Button(letters_frame, text=letter, 
                          command=lambda l=letter: self._show_residents_by_letter(dialog, l),
                          font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                          bg="#005a9c", fg="white", relief="raised", bd=2, 
                          width=4, height=2)
            btn.grid(row=row, column=col, padx=2, pady=2)
        
        # Frame para botões de ação
        action_frame = tk.Frame(main_frame, bg="#f0f0f0")
        action_frame.pack(fill=tk.X, pady=(20, 0))
        
        # Botão para adicionar novo morador
        add_btn = tk.Button(action_frame, text="➕ ADICIONAR NOVO MORADOR", 
                           command=lambda: self._add_new_resident_from_dialog(dialog),
                           font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                           bg="#28a745", fg="white", relief="raised", bd=2, padx=15, pady=10)
        add_btn.pack(side=tk.LEFT, padx=(0, 10))
        
        # Botão para fechar
        close_btn = tk.Button(action_frame, text="FECHAR", 
                             command=dialog.destroy,
                             font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                             bg="#6c757d", fg="white", relief="raised", bd=2, padx=15, pady=10)
        close_btn.pack(side=tk.RIGHT)
    
    def _show_residents_by_letter(self, parent_dialog, letter):
        """Mostra todos os moradores que começam com a letra selecionada."""
        # Recarrega moradores
        self.residents = load_residents()
        
        # Filtra moradores que começam com a letra
        filtered = self.residents[self.residents['name'].str.upper().str.startswith(letter.upper())]
        
        if filtered.empty:
            messagebox.showinfo("NENHUM RESULTADO", 
                              f"Nenhum morador encontrado com nome começando em '{letter}'.", 
                              parent=parent_dialog)
            return
        
        # Mostra a lista de moradores
        self._display_residents_list(parent_dialog, filtered, f"MORADORES - LETRA '{letter}'")
    
    def _show_residents_by_search(self, parent_dialog, search_term):
        """Mostra moradores que começam com o termo pesquisado."""
        if not search_term:
            messagebox.showwarning("AVISO", "DIGITE UM NOME PARA PESQUISAR.", parent=parent_dialog)
            return
        
        # Verifica se tem espaço
        if ' ' in search_term:
            messagebox.showerror("ERRO", "DIGITE APENAS O PRIMEIRO NOME (SEM ESPAÇOS).", parent=parent_dialog)
            return
        
        # Recarrega moradores
        self.residents = load_residents()
        
        # Filtra moradores que começam com o termo
        filtered = self.residents[self.residents['name'].str.upper().str.startswith(search_term.upper())]
        
        if filtered.empty:
            messagebox.showinfo("NENHUM RESULTADO", 
                              f"Nenhum morador encontrado com nome começando em '{search_term.upper()}'.", 
                              parent=parent_dialog)
            return
        
        # Mostra a lista de moradores
        self._display_residents_list(parent_dialog, filtered, f"MORADORES - PESQUISA: '{search_term.upper()}'")
    
    def _display_residents_list(self, parent_dialog, residents_df, title):
        """Exibe a lista de moradores com opções de editar e excluir."""
        # Cria nova janela para a lista
        list_dialog = tk.Toplevel(parent_dialog)
        list_dialog.title(title)
        list_dialog.geometry("900x600")
        list_dialog.configure(bg="#f0f0f0")
        list_dialog.transient(parent_dialog)
        list_dialog.grab_set()
        
        # Centraliza o diálogo
        list_dialog.update_idletasks()
        x = parent_dialog.winfo_x() + (parent_dialog.winfo_width() // 2) - (list_dialog.winfo_width() // 2)
        y = parent_dialog.winfo_y() + (parent_dialog.winfo_height() // 2) - (list_dialog.winfo_height() // 2)
        list_dialog.geometry(f'+{x}+{y}')
        
        # Frame principal
        main_frame = tk.Frame(list_dialog, bg="#f0f0f0", padx=20, pady=20)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Título
        title_label = tk.Label(main_frame, text=title, 
                              font=(FONT_FAMILY, FONT_SIZE_LARGE, FONT_WEIGHT_BOLD), 
                              bg="#f0f0f0", fg="#003366")
        title_label.pack(pady=(0, 10))
        
        # Label com total
        total_label = tk.Label(main_frame, text=f"📊 TOTAL: {len(residents_df)} MORADOR(ES)", 
                              font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                              bg="#f0f0f0", fg="#666666")
        total_label.pack(pady=(0, 15))
        
        # Frame com scroll para a lista
        canvas_frame = tk.Frame(main_frame, bg="#f0f0f0")
        canvas_frame.pack(fill=tk.BOTH, expand=True)
        
        canvas = tk.Canvas(canvas_frame, bg="#f0f0f0")
        scrollbar = ttk.Scrollbar(canvas_frame, orient="vertical", command=canvas.yview)
        scrollable_frame = tk.Frame(canvas, bg="#f0f0f0")
        
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        # Ordena por nome
        residents_sorted = residents_df.sort_values('name')
        
        # Cria um card para cada morador
        for idx, (_, resident) in enumerate(residents_sorted.iterrows()):
            self._create_resident_card(scrollable_frame, resident, list_dialog, idx)
        
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Botão para fechar
        close_btn = tk.Button(main_frame, text="FECHAR", 
                             command=list_dialog.destroy,
                             font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                             bg="#6c757d", fg="white", relief="raised", bd=2, padx=15, pady=10)
        close_btn.pack(pady=(10, 0))
    
    def _create_resident_card(self, parent_frame, resident, dialog, index):
        """Cria um card para exibir informações de um morador."""
        # Frame do card
        card_frame = tk.Frame(parent_frame, bg="#ffffff", relief="solid", bd=1)
        card_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # Cor de fundo alternada
        bg_color = "#f8f9fa" if index % 2 == 0 else "#ffffff"
        card_frame.configure(bg=bg_color)
        
        # Frame de informações
        info_frame = tk.Frame(card_frame, bg=bg_color)
        info_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=15, pady=10)
        
        # Nome do morador
        name_label = tk.Label(info_frame, text=f"👤 {resident['name'].upper()}", 
                             font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                             bg=bg_color, fg="#003366")
        name_label.pack(anchor="w")
        
        # Bloco e apartamento
        block_apt_label = tk.Label(info_frame, text=f"🏢 Bloco: {resident['block']} | Apto: {resident['apartment']}", 
                                   font=(FONT_FAMILY, FONT_SIZE_NORMAL), 
                                   bg=bg_color, fg="#666666")
        block_apt_label.pack(anchor="w")
        
        # Telefone
        phone_display = resident['phone'] if resident['phone'] not in ['0', '', 'nan'] else 'NÃO CADASTRADO'
        phone_label = tk.Label(info_frame, text=f"📱 Telefone: {phone_display}", 
                              font=(FONT_FAMILY, FONT_SIZE_NORMAL), 
                              bg=bg_color, fg="#666666")
        phone_label.pack(anchor="w")
        
        # Frame de botões
        buttons_frame = tk.Frame(card_frame, bg=bg_color)
        buttons_frame.pack(side=tk.RIGHT, padx=15, pady=10)
        
        # Botão editar
        edit_btn = tk.Button(buttons_frame, text="✏️ EDITAR", 
                            command=lambda r=resident: self._edit_resident_from_list(r, dialog),
                            font=(FONT_FAMILY, FONT_SIZE_SMALL, FONT_WEIGHT_BOLD),
                            bg="#FF8C00", fg="white", relief="raised", bd=2, padx=10, pady=5)
        edit_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        # Botão excluir
        delete_btn = tk.Button(buttons_frame, text="🗑️ EXCLUIR", 
                              command=lambda r=resident: self._delete_resident_from_list(r, dialog),
                              font=(FONT_FAMILY, FONT_SIZE_SMALL, FONT_WEIGHT_BOLD),
                              bg="#DC143C", fg="white", relief="raised", bd=2, padx=10, pady=5)
        delete_btn.pack(side=tk.LEFT)
    
    def _edit_resident_from_list(self, resident, parent_dialog):
        """Edita os dados de um morador."""
        # Cria diálogo de edição
        edit_dialog = tk.Toplevel(parent_dialog)
        edit_dialog.title("EDITAR MORADOR")
        edit_dialog.geometry("550x420")
        edit_dialog.configure(bg="#f0f0f0")
        edit_dialog.transient(parent_dialog)
        edit_dialog.grab_set()
        
        # Centraliza o diálogo
        edit_dialog.update_idletasks()
        x = parent_dialog.winfo_x() + (parent_dialog.winfo_width() // 2) - (edit_dialog.winfo_width() // 2)
        y = parent_dialog.winfo_y() + (parent_dialog.winfo_height() // 2) - (edit_dialog.winfo_height() // 2)
        edit_dialog.geometry(f'+{x}+{y}')
        
        # Frame principal
        main_frame = tk.Frame(edit_dialog, bg="#f0f0f0", padx=30, pady=20)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Título
        tk.Label(main_frame, text="✏️ EDITAR DADOS DO MORADOR", 
                font=(FONT_FAMILY, FONT_SIZE_LARGE, FONT_WEIGHT_BOLD), 
                bg="#f0f0f0", fg="#003366").pack(pady=(0, 20))
        
        # Campo: Nome
        tk.Label(main_frame, text="NOME COMPLETO:", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                bg="#f0f0f0").pack(anchor="w", pady=(0, 5))
        name_entry = tk.Entry(main_frame, font=(FONT_FAMILY, FONT_SIZE_NORMAL), width=40)
        name_entry.insert(0, resident['name'])
        name_entry.pack(pady=(0, 15))
        
        # Campo: Bloco/Apartamento
        tk.Label(main_frame, text="BLOCO E APARTAMENTO (EX: 4201):", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                bg="#f0f0f0").pack(anchor="w", pady=(0, 5))
        block_apt_entry = tk.Entry(main_frame, font=(FONT_FAMILY, FONT_SIZE_NORMAL), width=40)
        block_apt_entry.insert(0, f"{resident['block']}{resident['apartment']}")
        block_apt_entry.pack(pady=(0, 15))
        
        # Campo: Telefone
        tk.Label(main_frame, text="TELEFONE (SOMENTE NÚMEROS - DDD + NÚMERO):", 
                font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD), 
                bg="#f0f0f0").pack(anchor="w", pady=(0, 5))
        phone_entry = tk.Entry(main_frame, font=(FONT_FAMILY, FONT_SIZE_NORMAL), width=40)
        # Remove o +55 se existir
        phone_value = resident['phone'].replace('+55', '') if resident['phone'] not in ['0', '', 'nan'] else ''
        phone_entry.insert(0, phone_value)
        phone_entry.pack(pady=(0, 15))
        
        # Função para salvar
        def save_changes():
            new_name = name_entry.get().strip().upper()
            new_block_apt = block_apt_entry.get().strip()
            new_phone = phone_entry.get().strip()
            
            if not new_name:
                messagebox.showerror("ERRO", "O nome não pode estar vazio.", parent=edit_dialog)
                return
            
            # Valida bloco/apartamento
            if not re.match(r'^\d{4}$', new_block_apt):
                messagebox.showerror("ERRO", "Bloco/Apartamento inválido. Digite 4 dígitos (ex: 4201).", parent=edit_dialog)
                return
            
            new_block, new_apartment = parse_block_apt(new_block_apt)
            if not validate_block_apt(new_block, new_apartment):
                messagebox.showerror("ERRO", "Bloco/Apartamento inválido. Verifique os valores.", parent=edit_dialog)
                return
            
            # Valida telefone se fornecido
            if new_phone and not re.match(r'^\d{10,11}$', new_phone):
                messagebox.showerror("ERRO", "Telefone inválido. Digite 10 ou 11 dígitos numéricos.", parent=edit_dialog)
                return
            
            # Adiciona +55 se telefone fornecido
            phone_to_save = f"+55{new_phone}" if new_phone else "0"
            
            # Confirma alteração
            if messagebox.askyesno("CONFIRMAR ALTERAÇÃO", 
                                 f"Confirma a alteração dos dados do morador?\n\n"
                                 f"Nome: {new_name}\n"
                                 f"Bloco/Apto: {new_block}/{new_apartment}\n"
                                 f"Telefone: {phone_to_save}", 
                                 parent=edit_dialog):
                # Atualiza no DataFrame
                self.residents = load_residents()
                mask = ((self.residents['name'] == resident['name']) & 
                       (self.residents['block'] == resident['block']) & 
                       (self.residents['apartment'] == resident['apartment']))
                
                self.residents.loc[mask, 'name'] = new_name
                self.residents.loc[mask, 'block'] = new_block
                self.residents.loc[mask, 'apartment'] = new_apartment
                self.residents.loc[mask, 'phone'] = phone_to_save
                
                save_residents(self.residents)
                messagebox.showinfo("SUCESSO", "Dados atualizados com sucesso!", parent=edit_dialog)
                edit_dialog.destroy()
                parent_dialog.destroy()  # Fecha a lista para atualizar
        
        # Botões
        buttons_frame = tk.Frame(main_frame, bg="#f0f0f0")
        buttons_frame.pack(pady=(10, 0))
        
        tk.Button(buttons_frame, text="💾 SALVAR", 
                 command=save_changes,
                 font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                 bg="#28a745", fg="white", relief="raised", bd=2, padx=20, pady=8).pack(side=tk.LEFT, padx=(0, 10))
        
        tk.Button(buttons_frame, text="CANCELAR", 
                 command=edit_dialog.destroy,
                 font=(FONT_FAMILY, FONT_SIZE_NORMAL),
                 bg="#6c757d", fg="white", relief="raised", bd=2, padx=20, pady=8).pack(side=tk.LEFT)
    
    def _delete_resident_from_list(self, resident, parent_dialog):
        """Exclui um morador com confirmação."""
        confirm = messagebox.askyesno(
            "CONFIRMAR EXCLUSÃO",
            f"Tem certeza que deseja excluir o morador:\n\n"
            f"Nome: {resident['name']}\n"
            f"Bloco: {resident['block']} | Apto: {resident['apartment']}\n\n"
            f"⚠️ ESTA AÇÃO NÃO PODE SER DESFEITA!",
            parent=parent_dialog
        )
        
        if confirm:
            # Remove do DataFrame
            self.residents = load_residents()
            mask = ((self.residents['name'] == resident['name']) & 
                   (self.residents['block'] == resident['block']) & 
                   (self.residents['apartment'] == resident['apartment']))
            
            self.residents = self.residents[~mask]
            save_residents(self.residents)
            
            messagebox.showinfo("SUCESSO", 
                              f"Morador '{resident['name']}' excluído com sucesso!", 
                              parent=parent_dialog)
            parent_dialog.destroy()  # Fecha a lista para atualizar
    
    def _add_new_resident_from_dialog(self, parent_dialog):
        """Adiciona um novo morador a partir do diálogo de gerenciamento."""
        # Solicita bloco e apartamento
        block_apt_input = custom_askstring(parent_dialog, "BLOCO E APARTAMENTO", 
                                          "DIGITE O BLOCO E APARTAMENTO (EX: 4201):", 
                                          validation_regex=r"^\d{4}$")
        if not block_apt_input:
            return
        
        block, apartment = parse_block_apt(block_apt_input)
        if not validate_block_apt(block, apartment):
            messagebox.showerror("INVÁLIDO", "BLOCO/APTO INVÁLIDO.", parent=parent_dialog)
            return
        
        # Solicita nome
        name = custom_askstring(parent_dialog, "NOVO MORADOR", "NOME COMPLETO:")
        if not name:
            return
        
        # Solicita telefone
        phone = custom_askstring(parent_dialog, "NOVO MORADOR", 
                                "TELEFONE (EX: 31900009999):", 
                                validation_regex=r"^\d{11}$", 
                                error_message="FORMATO INVÁLIDO. DIGITE 11 NÚMEROS (DDD+NUMERO).")
        if phone is None:
            phone = "0"
        
        phone_with_code = f"+55{phone}" if phone != "0" else "0"
        
        # Adiciona ao DataFrame
        new_resident_df = pd.DataFrame([{"name": name.upper(), "block": block, "apartment": apartment, "phone": phone_with_code}])
        self.residents = load_residents()
        self.residents = pd.concat([self.residents, new_resident_df], ignore_index=True)
        save_residents(self.residents)
        
        messagebox.showinfo("SUCESSO", 
                          f"Novo morador '{name.upper()}' adicionado com sucesso!", 
                          parent=parent_dialog)
        
        # Fecha a janela de gerenciamento de moradores e volta para a tela inicial
        parent_dialog.destroy()
        self.output_text.clear()
        self.output_text.print_header("BEM-VINDO AO SISTEMA DE GESTÃO")
        self.output_text.print_message("MORADOR ADICIONADO COM SUCESSO!")
        self.output_text.print_message("SELECIONE UMA OPÇÃO ACIMA PARA CONTINUAR.")
        
    def view_pending_by_apt(self):
        self._clear_context_buttons()
        self.output_text.clear()
        self.output_text.print_header("CONSULTAR PENDÊNCIAS POR APARTAMENTO")
        
        block_apt_input = custom_askstring(self.root, "BLOCO E APARTAMENTO", "DIGITE O BLOCO E APARTAMENTO (EX: 4201):", validation_regex=r"^\d{4}$")
        if not block_apt_input:
            self.output_text.print_message("OPERAÇÃO CANCELADA.", style="error")
            return

        block, apartment = parse_block_apt(block_apt_input)

        if not validate_block_apt(block, apartment):
            self.output_text.print_message(f"BLOCO/APARTAMENTO INVÁLIDO: '{block_apt_input}'. USE O FORMATO '1201'.", style="error")
            return

        self.packages = load_packages() # Recarrega os pacotes
        self.output_text.print_styled("BUSCANDO PARA BLOCO", block)
        self.output_text.print_styled("APARTAMENTO", apartment)
        
        pending = self.packages[
            (self.packages["block"] == block) & (self.packages["apartment"] == apartment) & (self.packages["status"] == STATUS_DELIVERED)
        ]

        if pending.empty:
            self.output_text.print_message("\nNENHUMA ENCOMENDA PENDENTE PARA ESTE APARTAMENTO.")
        else:
            self.output_text.print_subheader("ENCOMENDAS PENDENTES ENCONTRADAS")
            for _, pkg in pending.iterrows():
                self.output_text.print_styled("CÓDIGO", pkg['tracking_code'])
                self.output_text.print_styled("DESTINATÁRIO", pkg['recipient'])
                self.output_text.print_styled("DATA DE REGISTRO", pkg['scan_datetime'])
                self.output_text.print_separator("-")
            
            # --- LÓGICA DE BAIXA NA ENCOMENDA ---
            wants_to_collect = messagebox.askyesno(
                "SELECIONAR AÇÃO",
                "Deseja registrar a retirada (dar baixa) de uma encomenda agora?",
                parent=self.root
                )

            if wants_to_collect:
                self._collect_package_from_list(pending)
            else:
                self.output_text.print_message("CONSULTA FINALIZADA.", style="info")
            
            # Adiciona botão para dar baixa em encomenda sem enviar mensagem
            if not pending.empty:
                dar_baixa_sem_msg_btn = tk.Button(
                    self.context_button_frame,
                    text="DAR BAIXA EM ENCOMENDA SEM ENVIAR MENSAGEMP/ MORADOR",
                    command=lambda: self._mark_package_collected_no_message_for_resident(pending),
                    font=(FONT_FAMILY, FONT_SIZE_NORMAL, FONT_WEIGHT_BOLD),
                    bg="#FF0000", fg="white", relief="raised", bd=2, padx=15, pady=10
                )
                dar_baixa_sem_msg_btn.pack(pady=10)
            
        self.output_text.print_separator()

    # --- Função Principal de Operação ---

    def scan_code(self):
        self._clear_context_buttons()
        self.output_text.clear()
        self.packages = load_packages()
        
        tracking_code = custom_askstring(self.root, "CÓDIGO DE RASTREIO", "DIGITE OU BIPE O CÓDIGO DE RASTREIO:")
        if not tracking_code:
            self.output_text.print_message("OPERAÇÃO CANCELADA. CÓDIGO NÃO FORNECIDO.", style="error")
            return

        tracking_code = tracking_code.strip().upper()
        self.output_text.print_header(f"CÓDIGO PROCESSADO: {tracking_code}")
        
        existing_pkg_mask = self.packages["tracking_code"].astype(str).str.upper() == tracking_code
        existing_pkg_df = self.packages[existing_pkg_mask]

        if not existing_pkg_df.empty:
            self._handle_existing_package(existing_pkg_df.iloc[0].to_dict(), tracking_code)
        else:
            self._handle_new_package(tracking_code)
            
    def _mark_package_as_collected(self, pkg_data, tracking_code):
        """Lógica centralizada para marcar uma encomenda como retirada e notificar."""
        pkg_mask = self.packages["tracking_code"].str.upper() == tracking_code.upper()
        
        # Garante que estamos atualizando a instância correta do DataFrame
        self.packages.loc[pkg_mask, "status"] = STATUS_COLLECTED
        current_time = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        self.packages.loc[pkg_mask, "scan_datetime"] = current_time
        save_packages(self.packages)
        
        recipient = pkg_data['recipient']
        phone = pkg_data['phone']
        
        self.output_text.print_message(f"ENCOMENDA {tracking_code} MARCADA COMO RETIRADA!", style="success")

        if phone and phone not in ["0", STATUS_NA]:
            msg = f"Prezado(a) *{recipient.upper()}*, sua encomenda (*{tracking_code}*) foi retirada em {current_time}."
            send_result = send_whatsapp_message(phone, msg, self.output_text, self._check_api_status_on_error)

            # Mostra status do envio na interface
            if send_result['success']:
                self.output_text.print_message("✅ NOTIFICAÇÃO WHATSAPP ENVIADA COM SUCESSO", style="success")
            else:
                self.output_text.print_message(f"⚠️  NOTIFICAÇÃO WHATSAPP NÃO ENVIADA: {send_result['reason']}", style="error")
        else:
            self.output_text.print_message("ℹ️  NÃO FOI POSSÍVEL ENVIAR NOTIFICAÇÃO (TELEFONE NÃO CADASTRADO)", style="info")

    def _collect_package_from_list(self, pending_packages_df):
        """Abre um diálogo para selecionar e dar baixa em uma encomenda de uma lista."""
        options = [pkg for _, pkg in pending_packages_df.iterrows()]
        
        menu_text = "SELECIONE O NÚMERO DA ENCOMENDA PARA DAR BAIXA:\n"
        for i, pkg in enumerate(options, 1):
            menu_text += f"\n{i} - CÓD: {pkg['tracking_code']} (DEST: {pkg['recipient']})"
        
        choice_str = custom_askstring(self.root, "REGISTRAR RETIRADA", menu_text)
        if not choice_str:  # Se cancelou
            self.output_text.print_message("OPERAÇÃO DE RETIRADA CANCELADA.", style="info")
            return
        if not choice_str.isdigit():
            self.output_text.print_message("OPÇÃO INVÁLIDA.", style="error")
            return
            
        try:
            choice = int(choice_str)
            if 1 <= choice <= len(options):
                package_to_collect = options[choice - 1]
                tracking_code_to_collect = package_to_collect['tracking_code']
                
                confirm = messagebox.askyesno(
                    "CONFIRMAR RETIRADA", 
                    f"Deseja marcar a encomenda {tracking_code_to_collect} para {package_to_collect['recipient']} como RETIRADA AGORA?", 
                    parent=self.root
                )
                if confirm:
                    self._mark_package_as_collected(package_to_collect, tracking_code_to_collect)
                    self.output_text.print_message("\nOPERAÇÃO CONCLUÍDA. CONSULTE NOVAMENTE SE NECESSÁRIO.", "success")
                else:
                    self.output_text.print_message("RETIRADA CANCELADA PELO USUÁRIO.", "info")
            else:
                self.output_text.print_message("OPÇÃO INVÁLIDA.", "error")
        except (ValueError, IndexError):
            self.output_text.print_message("OPÇÃO INVÁLIDA.", "error")

    def _handle_existing_package(self, pkg_data, tracking_code):
        status = pkg_data["status"]
        self.output_text.print_subheader("ENCOMENDA JÁ REGISTRADA")
        self.output_text.print_styled("STATUS ATUAL", status, style="bold")

        if status == STATUS_COLLECTED:
            self.output_text.print_message("\nESTA ENCOMENDA JÁ FOI RETIRADA.", style="info")
            self.output_text.print_styled("DATA DA RETIRADA", pkg_data['scan_datetime'])
            self.output_text.print_styled("RETIRADA POR", pkg_data['recipient'])

        elif status == STATUS_PENDING_REGISTRATION:
            self.output_text.print_message("\nESTA ENCOMENDA AGUARDA IDENTIFICAÇÃO DE DESTINATÁRIO.", style="info")
            self.output_text.print_styled("BLOCO", pkg_data['block'])
            self.output_text.print_styled("APTO", pkg_data['apartment'])
            self._resolve_pending_registration(pkg_data)

        elif status == STATUS_DELIVERED:
            if str(pkg_data.get("block", "0")) == "0":
                self.output_text.print_message("\nESTA ENCOMENDA ESTÁ REGISTRADA COMO 'SEM BLOCO/APTO'.", style="info")
                self.output_text.print_message("É NECESSÁRIO VINCULAR A UM MORADOR.", style="info")
                self._resolve_no_block_apt_package(pkg_data)
                return

            self.output_text.print_message("\nESTA ENCOMENDA ESTÁ AGUARDANDO RETIRADA.", style="info")
            self.output_text.print_styled("BLOCO", pkg_data['block'])
            self.output_text.print_styled("APTO", pkg_data['apartment'])
            self.output_text.print_styled("DESTINATÁRIO", pkg_data['recipient'])
            
            confirm = messagebox.askyesno(
                "CONFIRMAR RETIRADA",
                "ESTA ENCOMENDA ESTÁ AGUARDANDO RETIRADA.\n\nDeseja marcar como RETIRADA AGORA?".upper(),
                parent=self.root
            )
            if confirm:
                self._mark_package_as_collected(pkg_data, tracking_code)
            else:
                self.output_text.print_message("OPERAÇÃO CANCELADA PELO USUÁRIO.", style="info")
        
        self.output_text.print_separator()

    def _resolve_pending_registration(self, pkg_data):
        """Resolve uma encomenda com status 'pending_registration', vinculando a um morador."""
        tracking_code = pkg_data['tracking_code']
        block = pkg_data['block']
        apartment = pkg_data['apartment']
        
        resident_info = self._select_resident_for_package(block, apartment, is_resolving=True)
        
        if resident_info:
            if resident_info['status'] == STATUS_PENDING_REGISTRATION:
                self.output_text.print_message("OPERAÇÃO CANCELADA. ENCOMENDA PERMANECE COMO 'NÃO CADASTRADO'.", "info")
                return
            
            self._update_package_with_resident(tracking_code, resident_info, block, apartment)
        else:
            self.output_text.print_message("OPERAÇÃO CANCELADA.", "info")

    def _resolve_no_block_apt_package(self, pkg_data):
        """Resolve uma encomenda registrada como 'Sem Bloco/Apto'."""
        tracking_code = pkg_data['tracking_code']

        block, apartment = self._ask_for_block_apt(show_no_block_button=False)
        
        if block is None: 
            self.output_text.print_message("OPERAÇÃO CANCELADA.", "info")
            return
        
        if block == "SEM_BLOCO":
            self.output_text.print_message("AÇÃO INVÁLIDA. A ENCOMENDA JÁ ESTÁ MARCADA COMO 'SEM BLOCO/APTO'.", "error")
            return

        resident_info = self._select_resident_for_package(block, apartment, is_resolving=True)
        
        if resident_info:
             if resident_info['status'] == STATUS_PENDING_REGISTRATION:
                self.output_text.print_message("OPERAÇÃO CANCELADA. ENCOMENDA PERMANECE COMO 'SEM BLOCO/APTO'.", "info")
                return
             self._update_package_with_resident(tracking_code, resident_info, block, apartment)
        else:
            self.output_text.print_message("OPERAÇÃO CANCELADA.", "info")

    def _update_package_with_resident(self, tracking_code, resident_info, block, apartment):
        """Atualiza uma encomenda com os dados do morador e notifica."""
        pkg_mask = self.packages["tracking_code"].str.upper() == tracking_code.upper()
        
        self.packages.loc[pkg_mask, "recipient"] = resident_info['name']
        self.packages.loc[pkg_mask, "phone"] = resident_info['phone']
        self.packages.loc[pkg_mask, "status"] = STATUS_DELIVERED
        self.packages.loc[pkg_mask, "block"] = block
        self.packages.loc[pkg_mask, "apartment"] = apartment
        save_packages(self.packages)
        
        self.output_text.print_message("DESTINATÁRIO ATRIBUÍDO COM SUCESSO!", style="success")
        
        phone = resident_info['phone']
        recipient = resident_info['name']
        if phone and phone not in ["0", STATUS_NA]:
            msg = f"Prezado(a) *{recipient.upper()}*, uma encomenda (*{tracking_code}*) chegou e está disponível para retirada na portaria do *Village Liberdade*. (*NÃO RESPONDA ESTA MENSAGEM*)"
            send_result = send_whatsapp_message(phone, msg, self.output_text, self._check_api_status_on_error)

            # Mostra status do envio na interface
            if send_result['success']:
                self.output_text.print_message("✅ NOTIFICAÇÃO WHATSAPP ENVIADA COM SUCESSO", style="success")
            else:
                self.output_text.print_message(f"⚠️  NOTIFICAÇÃO WHATSAPP NÃO ENVIADA: {send_result['reason']}", style="error")
        else:
            self.output_text.print_message("ℹ️  NÃO FOI POSSÍVEL ENVIAR NOTIFICAÇÃO (TELEFONE NÃO CADASTRADO)", style="info")
        
        if messagebox.askyesno("CONFIRMAR RETIRADA", "Deseja marcar esta encomenda como retirada agora?", parent=self.root):
            self.packages = load_packages()
            updated_pkg_data = self.packages[pkg_mask].iloc[0].to_dict()
            self._mark_package_as_collected(updated_pkg_data, tracking_code)

    def _handle_new_package(self, tracking_code):
        self.output_text.print_subheader("REGISTRO DE NOVA ENCOMENDA")

        block, apartment = self._ask_for_block_apt(show_no_block_button=True)

        if block is None:
            self.output_text.print_message("REGISTRO CANCELADO PELO USUÁRIO.", style="error")
            return
            
        if block == "SEM_BLOCO":
            self._handle_sem_bloco_by_name(tracking_code)
            return

        resident_info = self._select_resident_for_package(block, apartment, is_resolving=False)
        if not resident_info:
            self.output_text.print_message("REGISTRO CANCELADO.", style="error")
            return
        
        self._save_new_package(tracking_code, block, apartment, resident_info['name'], resident_info['phone'], resident_info['status'])

        if resident_info['status'] == STATUS_PENDING_REGISTRATION:
            self.view_not_registered_packages()

        self.output_text.print_separator()

    def _handle_sem_bloco_by_name(self, tracking_code):
        """Tenta encontrar morador pelo nome antes de salvar como 'Sem Bloco/Apto'."""
        first_name = custom_askstring(self.root, "BUSCAR POR NOME", "DIGITE O PRIMEIRO NOME DO DESTINATÁRIO:", 
                                      validation_regex=r"^\S+$", 
                                      error_message="DIGITE APENAS O PRIMEIRO NOME (UMA PALAVRA).")
        if not first_name:
            self.output_text.print_message("OPERAÇÃO CANCELADA.", "info")
            return

        self.residents = load_residents()
        # Filtro case-insensitive para nomes que começam com o texto digitado
        matches = self.residents[self.residents['name'].str.lower().str.startswith(first_name.lower())]

        if not matches.empty:
            menu_text = f"MORADORES ENCONTRADOS COM O NOME '{first_name.upper()}':\n"
            options = [res for _, res in matches.iterrows()]
            
            for i, res in enumerate(options, 1):
                menu_text += f"\n{i} - {res['name'].upper()} (Bloco: {res['block']}, Apto: {res['apartment']})"
            
            last_option_num = len(options) + 1
            menu_text += f"\n\n{last_option_num} - MORADOR NÃO ESTÁ NA LISTA"

            choice_str = custom_askstring(self.root, "SELECIONAR MORADOR", menu_text, validation_regex=r"^\d+$")

            if not choice_str:
                self.output_text.print_message("OPERAÇÃO CANCELADA.", "info")
                return

            choice = int(choice_str)

            if 1 <= choice <= len(options):
                selected_resident = options[choice - 1]
                self.output_text.print_message(f"MORADOR '{selected_resident['name'].upper()}' SELECIONADO.", "success")
                self._save_new_package(tracking_code, selected_resident['block'], selected_resident['apartment'], selected_resident['name'], selected_resident['phone'], STATUS_DELIVERED)
                return
            elif choice == last_option_num:
                # Se escolher que não está na lista, salva com o nome e sem bloco/apto
                self.output_text.print_message("MORADOR NÃO ENCONTRADO NA LISTA.", "info")
                self._save_new_package(tracking_code, "0", "0", first_name.upper(), "0", STATUS_DELIVERED)
                self.view_no_block_apt_packages()
                return
            else:
                self.output_text.print_message("OPÇÃO INVÁLIDA.", "error")
                return
        else:
            self.output_text.print_message(f"NENHUM MORADOR ENCONTRADO COM O NOME '{first_name.upper()}'.", "info")
            self._save_new_package(tracking_code, "0", "0", first_name.upper(), "0", STATUS_DELIVERED)
            self.view_no_block_apt_packages()

    def _ask_for_block_apt(self, show_no_block_button=True):
        """Pede Bloco/Apto e lida com a opção 'Sem Bloco/Apto'."""
        while True:
            block_apt_input = custom_ask_block_apt(
                self.root, 
                "BLOCO E APARTAMENTO", 
                "DIGITE O BLOCO E APTO (EX: 4201):",
                show_no_block_button=show_no_block_button
            )
            
            if not block_apt_input:
                return None, None
            
            if block_apt_input == "SEM_BLOCO":
                return "SEM_BLOCO", None
            
            block, apartment = parse_block_apt(block_apt_input)
            if validate_block_apt(block, apartment):
                self.output_text.print_styled("BLOCO SELECIONADO", block)
                self.output_text.print_styled("APTO SELECIONADO", apartment)
                return block, apartment
            
            messagebox.showerror("ENTRADA INVÁLIDA", "FORMATO DE BLOCO/APTO INVÁLIDO. USE 4 DÍGITOS (EX: 1201).", parent=self.root)

    def _select_resident_for_package(self, block, apartment, is_resolving=False):
        """Seleciona um morador ou ação para uma encomenda."""
        while True:
            self.residents = load_residents() 
            apt_residents = get_residents_for_apt(self.residents, block, apartment)
            options = [res for _, res in apt_residents.iterrows()]
            
            menu_text = "SELECIONE O DESTINATÁRIO:\n"
            for i, res in enumerate(options, 1):
                menu_text += f"\n{i} - {str(res['name']).upper()}"
            
            current_option = len(options) + 1
            option_map = {}

            menu_text += f"\n\n{current_option} - ADICIONAR NOVO MORADOR"
            option_map[current_option] = "ADD_NEW"
            current_option += 1
            
            if not is_resolving:
                menu_text += f"\n{current_option} - DESTINATÁRIO NÃO CADASTRADO"
                option_map[current_option] = "NOT_REGISTERED"
                current_option += 1

                menu_text += f"\n{current_option} - DIGITEI O APTO ERRADO"
                option_map[current_option] = "WRONG_APT"
                current_option += 1
                
                menu_text += f"\n{current_option} - EXCLUIR MORADOR DESTE APTO"
                option_map[current_option] = "DELETE_RESIDENT"
                current_option += 1

            choice_str = custom_askstring(self.root, "SELECIONAR MORADOR", menu_text)
            if not choice_str or not choice_str.isdigit():
                return None

            choice = int(choice_str)

            if 1 <= choice <= len(options):
                resident = options[choice - 1]
                return {"name": resident["name"], "phone": resident["phone"], "status": STATUS_DELIVERED}
            
            action = option_map.get(choice)

            if action == "ADD_NEW":
                return self._add_new_resident(block, apartment)
            
            elif action == "NOT_REGISTERED":
                return {"name": STATUS_NA, "phone": STATUS_NA, "status": STATUS_PENDING_REGISTRATION}
            
            elif action == "WRONG_APT":
                new_block, new_apartment = self._ask_for_block_apt()
                if not new_block or new_block == "SEM_BLOCO":
                    return None
                block, apartment = new_block, new_apartment
            
            elif action == "DELETE_RESIDENT":
                self._delete_resident_from_apt(block, apartment)
            
            else:
                messagebox.showwarning("OPÇÃO INVÁLIDA", "POR FAVOR, SELECIONE UM NÚMERO VÁLIDO.", parent=self.root)
        
    def _add_new_resident(self, block, apartment):
        """Adiciona um novo morador e retorna seus detalhes."""
        name = custom_askstring(self.root, "NOVO MORADOR", "NOME COMPLETO:")
        if not name:
            return None

        phone = custom_askstring(self.root, "NOVO MORADOR", "TELEFONE (EX: 31900009999):", validation_regex=r"^\d{11}$", error_message="FORMATO INVÁLIDO. DIGITE 11 NÚMEROS (DDD+NUMERO).")
        if phone is None: # Permite telefone vazio, mas não cancelamento
            phone = "0"
        
        phone_with_code = f"+55{phone}" if phone != "0" else "0"
        
        new_resident_df = pd.DataFrame([{"name": name.upper(), "block": block, "apartment": apartment, "phone": phone_with_code}])
        self.residents = pd.concat([self.residents, new_resident_df], ignore_index=True)
        save_residents(self.residents)
        
        self.output_text.print_message(f"NOVO MORADOR '{name.upper()}' ADICIONADO COM SUCESSO!", style="success")
        return {"name": name.upper(), "phone": phone_with_code, "status": STATUS_DELIVERED}

    def _delete_resident_from_apt(self, block, apartment):
        """Apresenta um menu para excluir um morador do apartamento selecionado."""
        self.output_text.print_subheader("EXCLUIR MORADOR")
        self.residents = load_residents()
        apt_residents_df = get_residents_for_apt(self.residents, block, apartment)

        if apt_residents_df.empty:
            self.output_text.print_message("NÃO HÁ MORADORES CADASTRADOS PARA ESTE APTO.", style="info")
            return

        options = [res for _, res in apt_residents_df.iterrows()]
        menu_text = "SELECIONE O NÚMERO DO MORADOR PARA EXCLUIR:\n"
        for i, res in enumerate(options, 1):
            resident_name = str(res['name']).upper() if str(res['name']).strip() else "[MORADOR SEM NOME]"
            menu_text += f"\n{i} - {resident_name}"
        
        choice_str = custom_askstring(self.root, "EXCLUIR MORADOR", menu_text)
        if not choice_str:
            self.output_text.print_message("EXCLUSÃO CANCELADA.", style="info")
            return
        if not choice_str.isdigit():
            self.output_text.print_message("OPÇÃO INVÁLIDA.", style="error")
            return

        choice = int(choice_str)

        if 1 <= choice <= len(options):
            resident_to_delete_index = apt_residents_df.index[choice - 1]
            resident_name_to_confirm = self.residents.loc[resident_to_delete_index, 'name']

            confirm = messagebox.askyesno(
                "CONFIRMAR EXCLUSÃO",
                f"Tem certeza que deseja excluir o morador '{resident_name_to_confirm}' do Bloco {block} / Apto {apartment}?\n\nESTA AÇÃO NÃO PODE SER DESFEITA.",
                parent=self.root
            )

            if confirm:
                self.residents.drop(resident_to_delete_index, inplace=True)
                save_residents(self.residents)
                self.output_text.print_message(f"MORADOR '{resident_name_to_confirm.upper()}' EXCLUÍDO COM SUCESSO!", style="success")
            else:
                self.output_text.print_message("EXCLUSÃO CANCELADA PELO USUÁRIO.", style="info")
        else:
            self.output_text.print_message("OPÇÃO INVÁLIDA. NENHUM MORADOR FOI EXCLUÍDO.", style="error")

    def _save_new_package(self, tracking_code, block, apartment, recipient, phone, status):
        current_time = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        
        new_package_df = pd.DataFrame([{
            "tracking_code": tracking_code, "block": block, "apartment": apartment, 
            "recipient": recipient, "phone": phone, "scan_datetime": current_time, "status": status
        }])
        
        self.packages = pd.concat([self.packages, new_package_df], ignore_index=True)
        save_packages(self.packages)

        self.output_text.print_message("ENCOMENDA REGISTRADA COM SUCESSO!", style="success")
        
        if status == STATUS_DELIVERED and phone not in ["0", STATUS_NA]:
            msg = f"Prezado(a) *{recipient.upper()}*, uma encomenda (*{tracking_code}*) chegou e está disponível para retirada na portaria do *Village Liberdade*. (*NÃO RESPONDA ESTA MENSAGEM*)"
            send_result = send_whatsapp_message(phone, msg, self.output_text, self._check_api_status_on_error)

            # Mostra status do envio na interface
            if send_result['success']:
                self.output_text.print_message("✅ NOTIFICAÇÃO WHATSAPP ENVIADA COM SUCESSO", style="success")
            else:
                self.output_text.print_message(f"⚠️  NOTIFICAÇÃO WHATSAPP NÃO ENVIADA: {send_result['reason']}", style="error")
        elif status == STATUS_PENDING_REGISTRATION:
            self.output_text.print_message("ENCOMENDA AGUARDA IDENTIFICAÇÃO NA RETIRADA.", style="info")
        elif block == "0":
            self.output_text.print_message("ENCOMENDA REGISTRADA SEM BLOCO/APTO.", style="info")
        else:
            self.output_text.print_message("ℹ️  NÃO FOI POSSÍVEL ENVIAR NOTIFICAÇÃO (TELEFONE NÃO CADASTRADO)", style="info")
    

    def _edit_reservations(self):
        """Permite editar reservas existentes."""
        self.output_text.clear()
        self.output_text.print_header("EDIÇÃO DE RESERVAS")
        
        # Recarrega as reservas
        self.reservations = load_reservations()
        
        if self.reservations.empty:
            self.output_text.print_message("NENHUMA RESERVA CADASTRADA NO SISTEMA.")
            return
        
        # Mostra todas as reservas
        self.output_text.print_subheader("RESERVAS EXISTENTES")
        for i, (index, reservation) in enumerate(self.reservations.iterrows(), 1):
            area_name = {"quadra": "QUADRA", "piscina": "PISCINA", "churrasqueira": "CHURRASQUEIRA"}[reservation['area']]
            date_str = datetime.strptime(reservation['date'], '%Y-%m-%d').strftime('%d/%m/%Y')
            
            self.output_text.print_styled(f"{i} - {area_name}", f"{date_str} - {reservation['resident_name']} - Bloco {reservation['block']}/Apto {reservation['apartment']}")
        
        # Solicita qual reserva editar
        try:
            choice_str = custom_askstring(self.root, "EDITAR RESERVA", "QUAL RESERVA DESEJA EDITAR? (NÚMERO):", validation_regex=r"^\d+$")
            if not choice_str:
                return
            
            choice = int(choice_str)
            if choice < 1 or choice > len(self.reservations):
                messagebox.showerror("OPÇÃO INVÁLIDA", "SELECIONE UM NÚMERO VÁLIDO.", parent=self.root)
                return
            
            # Obtém a reserva selecionada
            reservation_index = self.reservations.index[choice - 1]
            reservation = self.reservations.loc[reservation_index]
            
            # Mostra opções de edição
            self._show_edit_options(reservation, reservation_index)
            
        except (ValueError, IndexError):
            messagebox.showerror("ERRO", "OPÇÃO INVÁLIDA.", parent=self.root)
            return

    def _show_edit_options(self, reservation, reservation_index):
        """Mostra as opções de edição para uma reserva."""
        area_name = {"quadra": "QUADRA", "piscina": "PISCINA", "churrasqueira": "CHURRASQUEIRA"}[reservation['area']]
        date_str = datetime.strptime(reservation['date'], '%Y-%m-%d').strftime('%d/%m/%Y')
        
        options = [
            "ALTERAR DATA",
            "ALTERAR MORADOR RESPONSÁVEL",
            "ALTERAR STATUS DO PAGAMENTO",
            "ALTERAR NOME DO PORTEIRO",
            "EXCLUIR RESERVA"
        ]
        
        menu_text = f"EDITANDO RESERVA: {area_name} - {date_str}\n"
        menu_text += f"Morador: {reservation['resident_name']}\n"
        menu_text += f"Bloco/Apto: {reservation['block']}/{reservation['apartment']}\n\n"
        menu_text += "OPÇÕES:\n"
        for i, option in enumerate(options, 1):
            menu_text += f"{i} - {option}\n"
        
        choice_str = custom_askstring(self.root, "OPÇÃO DE EDIÇÃO", menu_text, validation_regex=r"^\d+$")
        if not choice_str:
            return
        
        try:
            choice = int(choice_str)
            if choice == 1:
                self._edit_reservation_date(reservation, reservation_index)
            elif choice == 2:
                self._edit_reservation_resident(reservation, reservation_index)
            elif choice == 3:
                self._edit_reservation_payment(reservation, reservation_index)
            elif choice == 4:
                self._edit_reservation_doorman(reservation, reservation_index)
            elif choice == 5:
                self._delete_reservation(reservation, reservation_index)
            else:
                messagebox.showerror("OPÇÃO INVÁLIDA", "SELECIONE UM NÚMERO VÁLIDO.", parent=self.root)
        except ValueError:
            messagebox.showerror("ERRO", "OPÇÃO INVÁLIDA.", parent=self.root)

    def _edit_reservation_date(self, reservation, reservation_index):
        """Edita a data de uma reserva."""
        area_name = {"quadra": "QUADRA", "piscina": "PISCINA", "churrasqueira": "CHURRASQUEIRA"}[reservation['area']]
        
        # Obtém datas já reservadas para a mesma área
        booked_dates = self.reservations[self.reservations['area'] == reservation['area']]['date'].tolist()
        booked_dates_obj = [datetime.strptime(d, '%Y-%m-%d').date() for d in booked_dates if d and d != reservation['date']]
        
        new_date = CalendarDialog(self.root, f"ALTERAR DATA - {area_name}", disabled_dates=booked_dates_obj).show()
        if not new_date:
            return
        
        new_date_str = new_date.strftime('%Y-%m-%d')
        new_date_display = new_date.strftime('%d/%m/%Y')
        
        if messagebox.askyesno("CONFIRMAR ALTERAÇÃO", f"Confirma a alteração da data de {area_name} de {datetime.strptime(reservation['date'], '%Y-%m-%d').strftime('%d/%m/%Y')} para {new_date_display}?", parent=self.root):
            self.reservations.loc[reservation_index, 'date'] = new_date_str
            save_reservations(self.reservations)
            messagebox.showinfo("SUCESSO", f"Data alterada para {new_date_display}!", parent=self.root)
            # Não recarrega a lista, pois o usuário está editando diretamente do calendário

    def _edit_reservation_resident(self, reservation, reservation_index):
        """Edita o morador responsável de uma reserva."""
        new_resident = self._select_resident()
        if not new_resident:
            return
        
        if messagebox.askyesno("CONFIRMAR ALTERAÇÃO", f"Confirma a alteração do morador responsável de {reservation['resident_name']} para {new_resident['name']}?", parent=self.root):
            self.reservations.loc[reservation_index, 'resident_name'] = new_resident['name']
            self.reservations.loc[reservation_index, 'block'] = new_resident['block']
            self.reservations.loc[reservation_index, 'apartment'] = new_resident['apartment']
            save_reservations(self.reservations)
            messagebox.showinfo("SUCESSO", f"Morador alterado para {new_resident['name']}!", parent=self.root)
            # Não recarrega a lista, pois o usuário está editando diretamente do calendário

    def _edit_reservation_payment(self, reservation, reservation_index):
        """Edita o status do pagamento de uma reserva."""
        current_status = reservation['payment_status']
        new_status = "pago" if current_status == "pendente" else "pendente"
        
        if messagebox.askyesno("CONFIRMAR ALTERAÇÃO", f"Confirma a alteração do status de pagamento de '{current_status}' para '{new_status}'?", parent=self.root):
            self.reservations.loc[reservation_index, 'payment_status'] = new_status
            save_reservations(self.reservations)
            messagebox.showinfo("SUCESSO", f"Status alterado para '{new_status}'!", parent=self.root)
            # Não recarrega a lista, pois o usuário está editando diretamente do calendário

    def _edit_reservation_doorman(self, reservation, reservation_index):
        """Edita o nome do porteiro de uma reserva."""
        new_doorman = custom_askstring(self.root, "ALTERAR PORTEIRO", f"PORTEIRO ATUAL: {reservation['doorman_name']}\nNOVO NOME DO PORTEIRO:", uppercase=True)
        if not new_doorman:
            return
        
        if messagebox.askyesno("CONFIRMAR ALTERAÇÃO", f"Confirma a alteração do porteiro de '{reservation['doorman_name']}' para '{new_doorman}'?", parent=self.root):
            self.reservations.loc[reservation_index, 'doorman_name'] = new_doorman
            save_reservations(self.reservations)
            messagebox.showinfo("SUCESSO", f"Porteiro alterado para '{new_doorman}'!", parent=self.root)
            # Não recarrega a lista, pois o usuário está editando diretamente do calendário

    def _delete_reservation(self, reservation, reservation_index):
        """Exclui uma reserva."""
        area_name = {"quadra": "QUADRA", "piscina": "PISCINA", "churrasqueira": "CHURRASQUEIRA"}[reservation['area']]
        date_str = datetime.strptime(reservation['date'], '%Y-%m-%d').strftime('%d/%m/%Y')
        
        if messagebox.askyesno("CONFIRMAR EXCLUSÃO", f"Confirma a EXCLUSÃO da reserva de {area_name} para {date_str} em nome de {reservation['resident_name']}?\n\nATENÇÃO: Esta ação não pode ser desfeita!", parent=self.root):
            self.reservations = self.reservations.drop(reservation_index)
            save_reservations(self.reservations)
            messagebox.showinfo("SUCESSO", "Reserva excluída com sucesso!", parent=self.root)
            # Não recarrega a lista, pois o usuário está editando diretamente do calendário

    def _edit_specific_reservation(self, reservation):
        """Edita uma reserva específica chamada diretamente do calendário."""
        # Encontra o índice da reserva
        reservation_index = None
        for idx, row in self.reservations.iterrows():
            if (row['area'] == reservation['area'] and 
                row['date'] == reservation['date'] and 
                row['resident_name'] == reservation['resident_name'] and
                row['block'] == reservation['block'] and
                row['apartment'] == reservation['apartment']):
                reservation_index = idx
                break
        
        if reservation_index is None:
            messagebox.showerror("ERRO", "Reserva não encontrada no sistema.", parent=self.root)
            return
        
        # Mostra opções de edição específicas para o tipo de reserva
        self._show_edit_options_smart(reservation, reservation_index)

    def _show_edit_options_smart(self, reservation, reservation_index):
        """Mostra opções de edição inteligentes baseadas no tipo de reserva."""
        area_name = {"quadra": "QUADRA", "piscina": "PISCINA", "churrasqueira": "CHURRASQUEIRA"}[reservation['area']]
        date_str = datetime.strptime(reservation['date'], '%Y-%m-%d').strftime('%d/%m/%Y')
        
        # Opções baseadas no tipo de reserva
        if reservation['area'] == AREA_COURT:
            # Quadra: pode alterar horário e visitantes
            options = [
                "ALTERAR DATA",
                "ALTERAR HORÁRIO",
                "ALTERAR VISITANTES",
                "ALTERAR MORADOR RESPONSÁVEL",
                "ALTERAR NOME DO PORTEIRO"
            ]
        elif reservation['area'] == AREA_POOL:
            # Piscina: NÃO pode alterar horário
            options = [
                "ALTERAR DATA",
                "ALTERAR MORADOR RESPONSÁVEL",
                "ALTERAR NOME DO PORTEIRO"
            ]
        else:
            # Churrasqueira: tem pagamento, sem horário
            options = [
                "ALTERAR DATA",
                "ALTERAR MORADOR RESPONSÁVEL",
                "ALTERAR STATUS DO PAGAMENTO",
                "ALTERAR NOME DO PORTEIRO"
            ]
        
        menu_text = f"EDITANDO RESERVA: {area_name} - {date_str}\n"
        menu_text += f"Morador: {reservation['resident_name']}\n"
        menu_text += f"Bloco/Apto: {reservation['block']}/{reservation['apartment']}\n\n"
        menu_text += "OPÇÕES:\n"
        for i, option in enumerate(options, 1):
            menu_text += f"{i} - {option}\n"
        
        choice_str = custom_askstring(self.root, "OPÇÃO DE EDIÇÃO", menu_text, validation_regex=r"^\d+$")
        if not choice_str:
            return
        
        try:
            choice = int(choice_str)
            if choice == 1:
                self._edit_reservation_date(reservation, reservation_index)
            elif choice == 2:
                if reservation['area'] == AREA_COURT:
                    self._edit_reservation_time(reservation, reservation_index)
                elif reservation['area'] == AREA_POOL:
                    self._edit_reservation_resident(reservation, reservation_index)
                else:
                    self._edit_reservation_resident(reservation, reservation_index)
            elif choice == 3:
                if reservation['area'] == AREA_COURT:
                    self._edit_reservation_visitors(reservation, reservation_index)
                elif reservation['area'] == AREA_POOL:
                    self._edit_reservation_doorman(reservation, reservation_index)
                else:
                    self._edit_reservation_payment(reservation, reservation_index)
            elif choice == 4:
                if reservation['area'] == AREA_COURT:
                    self._edit_reservation_resident(reservation, reservation_index)
                elif reservation['area'] == AREA_POOL:
                    # Piscina só tem 4 opções, então este é o último
                    pass
                else:
                    self._edit_reservation_doorman(reservation, reservation_index)
            elif choice == 5:
                if reservation['area'] == AREA_COURT:
                    self._edit_reservation_doorman(reservation, reservation_index)
                else:
                    self._edit_reservation_doorman(reservation, reservation_index)
            else:
                messagebox.showerror("OPÇÃO INVÁLIDA", "SELECIONE UM NÚMERO VÁLIDO.", parent=self.root)
        except ValueError:
            messagebox.showerror("ERRO", "OPÇÃO INVÁLIDA.", parent=self.root)

    def _edit_reservation_time(self, reservation, reservation_index):
        """Edita o horário de uma reserva (quadra ou piscina)."""
        area_name = {"quadra": "QUADRA", "piscina": "PISCINA"}[reservation['area']]
        
        # Obtém horários já reservados para a mesma área e data
        same_date_reservations = self.reservations[
            (self.reservations['area'] == reservation['area']) & 
            (self.reservations['date'] == reservation['date']) &
            (self.reservations.index != reservation_index)
        ]
        
        # Solicita novo horário de início
        new_start_time_str = custom_askstring(
            self.root, 
            f"ALTERAR HORÁRIO - {area_name}", 
            f"HORÁRIO ATUAL: {reservation['start_time']} - {reservation['end_time']}\nNOVO HORÁRIO DE INÍCIO (HH:MM):",
            validation_regex=r"^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
        )
        if not new_start_time_str:
            return
        
        # Solicita novo horário de fim
        new_end_time_str = custom_askstring(
            self.root, 
            f"ALTERAR HORÁRIO - {area_name}", 
            f"NOVO HORÁRIO DE FIM (HH:MM):",
            validation_regex=r"^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
        )
        if not new_end_time_str:
            return
        
        # Valida horários
        try:
            start_time = datetime.strptime(new_start_time_str, '%H:%M').time()
            end_time = datetime.strptime(new_end_time_str, '%H:%M').time()
            
            if start_time >= end_time:
                messagebox.showerror("HORÁRIO INVÁLIDO", "O horário de início deve ser anterior ao horário de fim.", parent=self.root)
                return
            
            # Verifica conflitos
            for _, other_reservation in same_date_reservations.iterrows():
                other_start = datetime.strptime(other_reservation['start_time'], '%H:%M').time()
                other_end = datetime.strptime(other_reservation['end_time'], '%H:%M').time()
                
                if (start_time < other_end and end_time > other_start):
                    messagebox.showerror("CONFLITO DE HORÁRIO", f"Este horário conflita com outra reserva: {other_start} - {other_end}", parent=self.root)
                    return
            
            # Confirma alteração
            if messagebox.askyesno("CONFIRMAR ALTERAÇÃO", f"Confirma a alteração do horário de {area_name} de {reservation['start_time']} - {reservation['end_time']} para {new_start_time_str} - {new_end_time_str}?", parent=self.root):
                self.reservations.loc[reservation_index, 'start_time'] = new_start_time_str
                self.reservations.loc[reservation_index, 'end_time'] = new_end_time_str
                save_reservations(self.reservations)
                messagebox.showinfo("SUCESSO", f"Horário alterado para {new_start_time_str} - {new_end_time_str}!", parent=self.root)
                
        except ValueError:
            messagebox.showerror("ERRO", "Formato de horário inválido. Use HH:MM (ex: 14:30)", parent=self.root)

    def _edit_reservation_visitors(self, reservation, reservation_index):
        """Edita os visitantes de uma reserva, pedindo quantidade e lista de nomes."""
        area_name = {"quadra": "QUADRA", "piscina": "PISCINA", "churrasqueira": "CHURRASQUEIRA"}[reservation['area']]
        
        if reservation['area'] == AREA_COURT:
            max_visitors = 20
            visitor_prompt = f"QUANTOS VISITANTES? (MÁX: {max_visitors})"
        elif reservation['area'] == AREA_POOL:
            max_visitors = 2
            visitor_prompt = f"QUANTOS VISITANTES? (MÁX: {max_visitors})"
        else:  # AREA_BBQ
            max_visitors = 30
            visitor_prompt = f"QUANTOS VISITANTES? (MÁX: {max_visitors})"
        
        try:
            # Pergunta a quantidade de visitantes
            num_visitors_str = custom_askstring(self.root, "ALTERAR VISITANTES - QUANTIDADE", visitor_prompt, validation_regex=r"^\d{1,2}$")
            if num_visitors_str is None:
                return

            num_visitors = int(num_visitors_str)
            if not (0 <= num_visitors <= max_visitors):
                messagebox.showerror("LIMITE EXCEDIDO", f"O número de visitantes deve ser entre 0 e {max_visitors}.", parent=self.root)
                return
            
            # Se não houver visitantes, atualiza direto
            if num_visitors == 0:
                if messagebox.askyesno("CONFIRMAR ALTERAÇÃO", f"Confirma a alteração dos visitantes para 'NENHUM'?", parent=self.root):
                    self.reservations.loc[reservation_index, 'visitors'] = "NENHUM"
                    save_reservations(self.reservations)
                    messagebox.showinfo("SUCESSO", f"Visitantes alterados para 'NENHUM'!", parent=self.root)
                return
            
            # Se houver visitantes, pede a lista de nomes
            visitor_names = VisitorNamesDialog(self.root, f"ALTERAR VISITANTES - {area_name}", num_visitors, area_name).show()
            if not visitor_names:
                self.output_text.print_message("EDICAO DE VISITANTES CANCELADA.", style="info")
                return
            
            # Verifica se a quantidade de nomes corresponde à quantidade informada
            if len(visitor_names) != num_visitors:
                messagebox.showerror("QUANTIDADE INCORRETA", 
                                   f"Você informou {num_visitors} visitante(s), mas forneceu {len(visitor_names)} nome(s).\n\n"
                                   f"É necessário fornecer exatamente {num_visitors} nome(s).", 
                                   parent=self.root)
                return
            
            # Formata a lista de visitantes
            visitors_str = ", ".join(visitor_names)
            
            # Confirma a alteração
            if messagebox.askyesno("CONFIRMAR ALTERAÇÃO", 
                                   f"Confirma a alteração dos visitantes?\n\n"
                                   f"ANTES: {reservation['visitors']}\n\n"
                                   f"DEPOIS: {visitors_str}", 
                                   parent=self.root):
                self.reservations.loc[reservation_index, 'visitors'] = visitors_str
                save_reservations(self.reservations)
                messagebox.showinfo("SUCESSO", f"Visitantes alterados com sucesso!", parent=self.root)
                
        except ValueError:
            messagebox.showerror("ERRO", "Número de visitantes inválido.", parent=self.root)

    def _delete_reservation_from_calendar(self, reservation):
        """Exclui uma reserva chamada diretamente do calendário."""
        # Encontra o índice da reserva
        reservation_index = None
        for idx, row in self.reservations.iterrows():
            if (row['area'] == reservation['area'] and 
                row['date'] == reservation['date'] and 
                row['resident_name'] == reservation['resident_name'] and
                row['block'] == reservation['block'] and
                row['apartment'] == reservation['apartment']):
                reservation_index = idx
                break
        
        if reservation_index is None:
            messagebox.showerror("ERRO", "Reserva não encontrada no sistema.", parent=self.root)
            return
        
        # Chama a função de exclusão existente
        self._delete_reservation(reservation, reservation_index)

    def _mark_package_collected_no_message(self):
        """Marca uma encomenda como coletada sem enviar mensagem de confirmação."""
        self.packages = load_packages()
        
        if not hasattr(self, '_current_view_method'):
            messagebox.showerror("ERRO", "Nenhuma visualização de pacotes ativa.", parent=self.root)
            return

        if self._current_view_method == self.view_no_block_apt_packages:
            current_packages = self.packages[
                (self.packages["block"] == "0") & (self.packages["status"] == STATUS_DELIVERED)
            ]
        elif self._current_view_method == self.view_not_registered_packages:
            current_packages = self.packages[self.packages["status"] == STATUS_PENDING_REGISTRATION]
        else:
            messagebox.showerror("ERRO", "Ação não suportada para esta visualização.", parent=self.root)
            return

        if current_packages.empty:
            messagebox.showinfo("INFO", "Não há encomendas nesta categoria para dar baixa.", parent=self.root)
            return

        packages_list_text = "Selecione o número da encomenda para dar baixa:\n\n"
        packages_map = {str(i+1): row.to_dict() for i, (_, row) in enumerate(current_packages.iterrows())}
        for i, pkg in packages_map.items():
            packages_list_text += f"{i} - CÓD: {pkg['tracking_code']} | BL/AP: {pkg['block']}/{pkg['apartment']}\n"

        dialog_func = custom_askstring_scrollable if len(current_packages) > 5 else custom_askstring
        choice_str = dialog_func(self.root, "DAR BAIXA EM ENCOMENDA", packages_list_text, validation_regex=r"^\d+$")

        if not choice_str or choice_str not in packages_map:
            if choice_str:
                messagebox.showerror("ERRO", "Número da encomenda inválido.", parent=self.root)
            return

        selected_pkg = packages_map[choice_str]
        tracking_code = selected_pkg['tracking_code']

        # O pacote precisa ser vinculado a um morador antes de ser coletado
        resident_linked = False
        if selected_pkg['status'] == STATUS_PENDING_REGISTRATION:
            resident_linked = self._link_package_to_resident(selected_pkg)
        elif str(selected_pkg.get('block', '0')) == '0':
            resident_linked = self._get_block_apt_for_package(selected_pkg)

        if not resident_linked:
            self.output_text.print_message("VÍNCULO COM MORADOR CANCELADO. OPERAÇÃO INTERROMPIDA.", "info")
            return

        # Recarrega os pacotes para garantir que temos a versão mais recente
        self.packages = load_packages()
        pkg_mask = self.packages["tracking_code"] == tracking_code
        if self.packages[pkg_mask].empty:
            messagebox.showerror("ERRO", "Não foi possível encontrar a encomenda após o vínculo.", parent=self.root)
            return

        confirm = messagebox.askyesno(
            "CONFIRMAR BAIXA FINAL",
            f"A encomenda {tracking_code} foi vinculada a um morador.\n\n"
            "Deseja marcá-la como COLETADA agora? (Sem mensagem)",
            parent=self.root
        )

        if confirm:
            self.packages.loc[pkg_mask, "status"] = STATUS_COLLECTED
            self.packages.loc[pkg_mask, "scan_datetime"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
            save_packages(self.packages)
            messagebox.showinfo("SUCESSO", f"Encomenda {tracking_code} marcada como COLETADA.", parent=self.root)
            self._current_view_method() 
        else:
            self.output_text.print_message("BAIXA CANCELADA. A encomenda permanece como pendente para o morador.", "info")
            self._current_view_method()
    
    def _mark_package_collected_no_message_for_resident(self, pending_packages_df):
        """Marca uma encomenda de morador cadastrado como coletada sem enviar mensagem de confirmação."""
        if pending_packages_df.empty:
            messagebox.showinfo("INFO", "Não há encomendas pendentes para dar baixa.", parent=self.root)
            return

        packages_list_text = "Selecione o número da encomenda para dar baixa:\n\n"
        packages_map = {str(i+1): row.to_dict() for i, (_, row) in enumerate(pending_packages_df.iterrows())}
        for i, pkg in packages_map.items():
            packages_list_text += f"{i} - CÓD: {pkg['tracking_code']} | DEST: {pkg['recipient']} | BL/AP: {pkg['block']}/{pkg['apartment']}\n"

        dialog_func = custom_askstring_scrollable if len(pending_packages_df) > 5 else custom_askstring
        choice_str = dialog_func(self.root, "DAR BAIXA EM ENCOMENDA", packages_list_text, validation_regex=r"^\d+$")

        if not choice_str or choice_str not in packages_map:
            if choice_str:
                messagebox.showerror("ERRO", "Número da encomenda inválido.", parent=self.root)
            return

        selected_pkg = packages_map[choice_str]
        tracking_code = selected_pkg['tracking_code']
        recipient = selected_pkg['recipient']

        confirm = messagebox.askyesno(
            "CONFIRMAR BAIXA FINAL",
            f"Encomenda: {tracking_code}\n"
            f"Destinatário: {recipient}\n"
            f"Bloco/Apto: {selected_pkg['block']}/{selected_pkg['apartment']}\n\n"
            "Deseja marcá-la como COLETADA agora? (Sem mensagem)",
            parent=self.root
        )

        if confirm:
            # Recarrega os pacotes para garantir que temos a versão mais recente
            self.packages = load_packages()
            pkg_mask = self.packages["tracking_code"] == tracking_code
            
            if self.packages[pkg_mask].empty:
                messagebox.showerror("ERRO", "Não foi possível encontrar a encomenda.", parent=self.root)
                return

            self.packages.loc[pkg_mask, "status"] = STATUS_COLLECTED
            self.packages.loc[pkg_mask, "scan_datetime"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
            save_packages(self.packages)
            
            messagebox.showinfo("SUCESSO", f"Encomenda {tracking_code} marcada como COLETADA.", parent=self.root)
            
            # Atualiza a visualização
            self.view_pending_by_apt()
        else:
            self.output_text.print_message("BAIXA CANCELADA. A encomenda permanece como pendente.", "info")
    
    def _mark_package_collected_no_message_for_all_pending(self, pending_packages_df):
        """Marca uma encomenda da lista de todas as pendentes como coletada sem enviar mensagem de confirmação."""
        if pending_packages_df.empty:
            messagebox.showinfo("INFO", "Não há encomendas pendentes para dar baixa.", parent=self.root)
            return

        packages_list_text = "Selecione o número da encomenda para dar baixa:\n\n"
        packages_map = {str(i+1): row.to_dict() for i, (_, row) in enumerate(pending_packages_df.iterrows())}
        for i, pkg in packages_map.items():
            packages_list_text += f"{i} - CÓD: {pkg['tracking_code']} | DEST: {pkg['recipient']} | BL/AP: {pkg['block']}/{pkg['apartment']}\n"

        dialog_func = custom_askstring_scrollable if len(pending_packages_df) > 5 else custom_askstring
        choice_str = dialog_func(self.root, "DAR BAIXA EM ENCOMENDA", packages_list_text, validation_regex=r"^\d+$")

        if not choice_str or choice_str not in packages_map:
            if choice_str:
                messagebox.showerror("ERRO", "Número da encomenda inválido.", parent=self.root)
            return

        selected_pkg = packages_map[choice_str]
        tracking_code = selected_pkg['tracking_code']
        recipient = selected_pkg['recipient']

        confirm = messagebox.askyesno(
            "CONFIRMAR BAIXA FINAL",
            f"Encomenda: {tracking_code}\n"
            f"Destinatário: {recipient}\n"
            f"Bloco/Apto: {selected_pkg['block']}/{selected_pkg['apartment']}\n\n"
            "Deseja marcá-la como COLETADA agora? (Sem mensagem)",
            parent=self.root
        )

        if confirm:
            # Recarrega os pacotes para garantir que temos a versão mais recente
            self.packages = load_packages()
            pkg_mask = self.packages["tracking_code"] == tracking_code
            
            if self.packages[pkg_mask].empty:
                messagebox.showerror("ERRO", "Não foi possível encontrar a encomenda.", parent=self.root)
                return

            self.packages.loc[pkg_mask, "status"] = STATUS_COLLECTED
            self.packages.loc[pkg_mask, "scan_datetime"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
            save_packages(self.packages)
            
            messagebox.showinfo("SUCESSO", f"Encomenda {tracking_code} marcada como COLETADA.", parent=self.root)
            
            # Atualiza a visualização
            self.view_all_pending_packages()
        else:
            self.output_text.print_message("BAIXA CANCELADA. A encomenda permanece como pendente.", "info")
    
    def _link_package_to_resident(self, package):
        """Vincula uma encomenda 'Não Cadastrada' a um morador."""
        tracking_code = package['tracking_code']
        block = package['block']
        apartment = package['apartment']
        
        resident_info = self._select_resident_for_package(block, apartment, is_resolving=True)
        
        if resident_info and resident_info['status'] != STATUS_PENDING_REGISTRATION:
            pkg_mask = self.packages['tracking_code'] == tracking_code
            self.packages.loc[pkg_mask, 'recipient'] = resident_info['name']
            self.packages.loc[pkg_mask, 'phone'] = resident_info['phone']
            self.packages.loc[pkg_mask, 'status'] = STATUS_DELIVERED
            save_packages(self.packages)
            self.output_text.print_message(f"Encomenda {tracking_code} vinculada com sucesso a {resident_info['name']}.", "success")
            return True
        return False
    
    def _get_block_apt_for_package(self, package):
        """Pede Bloco/Apto e vincula uma encomenda 'Sem Bloco/Apto'."""
        tracking_code = package['tracking_code']
        self.output_text.print_message(f"VINCULANDO ENCOMENDA {tracking_code}", "info")
        
        block, apartment = self._ask_for_block_apt(show_no_block_button=False)
        if not block:
            return False

        resident_info = self._select_resident_for_package(block, apartment, is_resolving=True)

        if resident_info and resident_info['status'] != STATUS_PENDING_REGISTRATION:
            pkg_mask = self.packages['tracking_code'] == tracking_code
            self.packages.loc[pkg_mask, 'block'] = block
            self.packages.loc[pkg_mask, 'apartment'] = apartment
            self.packages.loc[pkg_mask, 'recipient'] = resident_info['name']
            self.packages.loc[pkg_mask, 'phone'] = resident_info['phone']
            self.packages.loc[pkg_mask, 'status'] = STATUS_DELIVERED
            save_packages(self.packages)
            self.output_text.print_message(f"Encomenda {tracking_code} vinculada com sucesso a {resident_info['name']} (Bl/{block} Ap/{apartment}).", "success")
            return True
        return False
    
    def _add_new_resident_during_link(self, block, apartment):
        """Adiciona um novo morador durante o processo de vinculação de encomenda."""
        resident_name = custom_askstring(
            self.root,
            "ADICIONAR NOVO MORADOR",
            f"Bloco/Apto: {block}/{apartment}\n\nDIGITE O NOME DO NOVO MORADOR:",
            validation_regex=r"^[A-Za-zÀ-ÿ\s]+$",
            error_message="Nome deve conter apenas letras e espaços."
        )
        if not resident_name: return False
        
        resident_phone = custom_askstring(
            self.root,
            "ADICIONAR NOVO MORADOR",
            f"Morador: {resident_name}\nBloco/Apto: {block}/{apartment}\n\nDIGITE O TELEFONE (DDD+NUMERO):",
            validation_regex=r"^\d{10,11}$",
            error_message="Telefone deve conter 10 ou 11 dígitos numéricos."
        )
        if not resident_phone: return False

        if messagebox.askyesno(
            "CONFIRMAR ADIÇÃO",
            f"Confirma adicionar o morador:\n\n"
            f"Nome: {resident_name}\n"
            f"Bloco/Apto: {block}/{apartment}\n"
            f"Telefone: {resident_phone}",
            parent=self.root
        ):
            self.residents = load_residents()
            new_resident = {'name': resident_name.upper(),'block': str(block),'apartment': str(apartment),'phone': f"+55{resident_phone}"}
            new_residents_df = pd.DataFrame([new_resident])
            self.residents = pd.concat([self.residents, new_residents_df], ignore_index=True)
            save_residents(self.residents)
            messagebox.showinfo("SUCESSO",f"Morador {resident_name.upper()} adicionado com sucesso!",parent=self.root)
            return True
        return False

    def _get_disabled_dates_for_area(self, area):
        """Retorna uma lista de datas ocupadas para uma área específica."""
        if self.reservations.empty:
            return []
        
        # Filtra reservas para a área específica
        area_reservations = self.reservations[self.reservations['area'] == area]
        
        if area_reservations.empty:
            return []
        
        # Data atual para comparação
        current_date = datetime.now().date()
        
        # Obtém as datas únicas ocupadas
        booked_dates = area_reservations['date'].unique().tolist()
        
        # Converte para objetos date e filtra apenas datas futuras
        disabled_dates = []
        for date_str in booked_dates:
            if date_str and date_str != 'N/A':
                try:
                    date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
                    # Filtra apenas datas futuras (maiores ou iguais à data atual)
                    if date_obj >= current_date:
                        disabled_dates.append(date_obj)
                except ValueError:
                    continue
        
        return disabled_dates

    def _get_dates_with_times_for_area(self, area):
        """Retorna um dicionário com datas e seus horários marcados para uma área específica."""
        if self.reservations.empty:
            return {}
        
        # Filtra reservas para a área específica
        area_reservations = self.reservations[self.reservations['area'] == area]
        
        if area_reservations.empty:
            return {}
        
        # Data atual para comparação
        current_date = datetime.now().date()
        
        # Agrupa por data e coleta os horários (apenas datas futuras)
        dates_with_times = {}
        for _, reservation in area_reservations.iterrows():
            date_str = reservation['date']
            start_time = reservation['start_time']
            end_time = reservation['end_time']
            
            # Só inclui se tiver horários válidos
            if date_str and start_time != 'N/A' and end_time != 'N/A':
                try:
                    date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
                    # Filtra apenas datas futuras (maiores ou iguais à data atual)
                    if date_obj >= current_date:
                        if date_obj not in dates_with_times:
                            dates_with_times[date_obj] = []
                        dates_with_times[date_obj].append((start_time, end_time))
                except ValueError:
                    continue
        
        return dates_with_times


# ==============================================================================
# 5. PONTO DE ENTRADA DA APLICAÇÃO
# ==============================================================================

if __name__ == "__main__":
    root = tk.Tk()
    app = PackageSystemApp(root)
    root.mainloop()