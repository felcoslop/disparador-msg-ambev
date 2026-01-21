import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../../uploads');

export const sendWhatsApp = async (phone, config, templateName, components) => {
    try {
        let normalizedPhone = String(phone).replace(/\D/g, '');
        if (normalizedPhone && !normalizedPhone.startsWith('55')) {
            normalizedPhone = '55' + normalizedPhone;
        }

        const url = `https://graph.facebook.com/v21.0/${config.phoneId}/messages`;
        const finalTemplateName = String(templateName).trim();

        const metaComponents = [];

        if (components.header && components.header.length > 0) {
            metaComponents.push({
                type: "header",
                parameters: components.header.map(v => {
                    const param = { type: "text" };
                    if (typeof v === 'object' && v.name) {
                        if (isNaN(parseInt(v.name, 10))) {
                            param.parameter_name = v.name;
                        }
                        param.text = String(v.value || '').trim();
                    } else {
                        param.text = String(v || '').trim();
                    }
                    return param;
                })
            });
        }

        if (components.body && components.body.length > 0) {
            metaComponents.push({
                type: "body",
                parameters: components.body.map(v => {
                    const param = { type: "text" };
                    if (typeof v === 'object' && v.name) {
                        if (isNaN(parseInt(v.name, 10))) {
                            param.parameter_name = v.name;
                        }
                        param.text = String(v.value || '').trim();
                    } else {
                        param.text = String(v || '').trim();
                    }
                    return param;
                })
            });
        }

        const payload = {
            messaging_product: "whatsapp",
            to: normalizedPhone,
            type: "template",
            template: {
                name: finalTemplateName,
                language: { code: "pt_BR" },
                components: metaComponents
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('[WHATSAPP API ERROR]', JSON.stringify(data, null, 2));
            return { success: false, error: data.error?.message || 'Erro na Meta API' };
        }
        return { success: true, data };
    } catch (err) {
        console.error('[WHATSAPP SERVICE ERROR]', err);
        return { success: false, error: err.message };
    }
};

export const downloadMedia = async (mediaId, config) => {
    try {
        if (!mediaId) return null;

        const urlRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${config.token}` }
        });

        if (!urlRes.ok) return null;

        const urlData = await urlRes.json();
        const mediaUrl = urlData.url;
        const mimeType = urlData.mime_type;

        if (!mediaUrl) return null;

        const response = await fetch(mediaUrl, {
            headers: { 'Authorization': `Bearer ${config.token}` }
        });

        if (!response.ok) return null;

        const buffer = await response.arrayBuffer();
        const ext = mimeType ? mimeType.split('/')[1].split(';')[0] : 'bin';
        const filename = `${mediaId}.${ext}`;
        const filepath = path.join(uploadsDir, filename);

        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(filepath, Buffer.from(buffer));

        return `/uploads/${filename}`;
    } catch (err) {
        console.error('[DOWNLOAD MEDIA ERROR]', err);
        return null;
    }
};

export const uploadMediaToMeta = async (fileUrl, type, config) => {
    try {
        const relativePath = fileUrl.startsWith('/') ? fileUrl.substring(1) : fileUrl;
        const absolutePath = path.join(__dirname, '../../', relativePath);

        if (!fs.existsSync(absolutePath)) return null;

        const formData = new FormData();
        const fileBuffer = fs.readFileSync(absolutePath);
        const fileBlob = new Blob([fileBuffer], { type: type === 'image' ? 'image/jpeg' : 'audio/mpeg' });

        formData.append('file', fileBlob, path.basename(absolutePath));
        formData.append('type', type);
        formData.append('messaging_product', 'whatsapp');

        const url = `https://graph.facebook.com/v21.0/${config.phoneId}/media`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${config.token}` },
            body: formData
        });

        const data = await response.json();
        if (!response.ok) return null;
        return data.id;
    } catch (err) {
        console.error('[UPLOAD META ERROR]', err);
        return null;
    }
};
