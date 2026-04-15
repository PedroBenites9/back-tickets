import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Intentar encontrar los assets en producción (dentro de back-tickets/assets) o desarrollo
let logoPath = path.join(__dirname, '..', 'assets', 'logo.png');
let faviconPath = path.join(__dirname, '..', 'assets', 'favicon.png');

// Fallback para desarrollo si no existen en la ruta anterior
if (!fs.existsSync(logoPath)) {
    logoPath = path.join(__dirname, '..', '..', 'front-tickets', 'src', 'assets', 'logo.png');
    faviconPath = path.join(__dirname, '..', '..', 'front-tickets', 'src', 'assets', 'favicon.png');
}

// Crear el transportador de correo usando SMTP
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 465,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const getLayoutHTML = (contenido) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        .email-container { font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden; }
        .header { background-color: #0d6efd; padding: 20px; text-align: center; color: white; }
        .logo { max-height: 50px; margin-bottom: 10px; }
        .body { padding: 30px; color: #444; line-height: 1.6; }
        .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #e0e0e0; }
        .btn { display: inline-block; padding: 12px 25px; background-color: #0d6efd; color: white !important; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
        .highlight { color: #0d6efd; font-weight: bold; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <img src="cid:logo" alt="Logo" class="logo">
            <h2 style="margin:0;">Sistema de Tickets</h2>
        </div>
        <div class="body">
            ${contenido}
        </div>
        <div class="footer">
            <img src="cid:favicon" alt="Icon" style="width:16px; margin-bottom: -3px;">
            <strong>Cruz de Malta S.A.</strong><br>
            Este es un correo automático, por favor no respondas a este mensaje.
        </div>
    </div>
</body>
</html>
`;

export const enviarCorreoMagico = async (destinatario, asunto, htmlContenido) => {
    try {
        const mailOptions = {
            from: `"Soporte Cruz de Malta" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
            to: destinatario,
            subject: asunto,
            html: getLayoutHTML(htmlContenido),
            attachments: [
                { filename: 'logo.png', path: logoPath, cid: 'logo' },
                { filename: 'favicon.png', path: faviconPath, cid: 'favicon' }
            ]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✉️ ¡Éxito! Correo enviado a ${destinatario}. ID: ${info.messageId}`);
    } catch (error) {
        console.error("⚠️ Error enviando correo con SMTP:", error);
    }
};

export const enviarCorreoResolucion = async (emailDestino, ticket) => {
    try {
        const asuntoTicket = `✅ Ticket Resuelto: ${ticket.codigo} - ${ticket.asunto}`;

        const contenidoHTML = `
            <h3 style="color: #198754;">¡Hola! Tu ticket ha sido resuelto</h3>
            <p>Te informamos que el ticket <span class="highlight">${ticket.codigo}</span> ha sido marcado como <strong style="color: #198754;">Resuelto</strong> por el equipo técnico.</p>
            
            <div style="background-color: #f1f8f5; border-left: 4px solid #198754; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>🏷️ Asunto:</strong> ${ticket.asunto}</p>
                <p style="margin: 5px 0 0 0;"><strong>📂 Categoría:</strong> ${ticket.categoria}</p>
                <p style="margin: 5px 0 0 0;"><strong>👨‍💻 Técnico:</strong> ${ticket.tecnico_asignado || 'Equipo IT'}</p>
            </div>

            <p>Si el problema persiste o tienes alguna duda adicional, por favor ponte en contacto con nosotros.</p>
            <p>¡Gracias por tu paciencia!</p>
        `;

        await enviarCorreoMagico(emailDestino, asuntoTicket, contenidoHTML);
    } catch (error) {
        console.error("❌ Error al armar/enviar el correo de resolución:", error);
    }
};
