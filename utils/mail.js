import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const oAuth2Client = new google.auth.OAuth2(
    process.env.OAUTH_CLIENT_ID,
    process.env.OAUTH_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
);
oAuth2Client.setCredentials({ refresh_token: process.env.OAUTH_REFRESH_TOKEN });

const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

export const enviarCorreoMagico = async (destinatario, asunto, htmlContenido) => {
    try {
        const miCorreo = process.env.EMAIL_USER;
        const asuntoCodificado = `=?utf-8?B?${Buffer.from(asunto).toString('base64')}?=`;

        const mensajePuro = [
            `From: "Soporte Cruz de Malta" <${miCorreo}>`,
            `To: ${destinatario}`,
            `Subject: ${asuntoCodificado}`,
            "MIME-Version: 1.0",
            "Content-Type: text/html; charset=utf-8",
            "",
            htmlContenido
        ].join('\r\n');

        const encodedMensaje = Buffer.from(mensajePuro)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const respuesta = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: encodedMensaje },
        });

        console.log(`✉️ ¡Éxito REAL! Correo enviado a ${destinatario}. Recibo de Google: ${respuesta.data.id}`);
    } catch (error) {
        console.error("⚠️ Error enviando correo con Gmail API:", error);
    }
};

export const enviarCorreoResolucion = async (emailDestino, ticket) => {
    try {
        const asuntoTicket = `✅ Ticket Resuelto: ${ticket.codigo} - ${ticket.asunto}`;

        const plantillaHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #198754; text-align: center;">¡Tu incidencia ha sido resuelta!</h2>
        <p>Hola,</p>
        <p>El equipo de Tecnología ha marcado tu ticket como <strong>Resuelto</strong>.</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="margin-bottom: 8px;"><strong>🏷️ Código:</strong> ${ticket.codigo}</li>
            <li style="margin-bottom: 8px;"><strong>📌 Asunto:</strong> ${ticket.asunto}</li>
            <li style="margin-bottom: 8px;"><strong>📂 Categoría:</strong> ${ticket.categoria}</li>
            <li><strong>👨‍💻 Técnico:</strong> ${ticket.tecnico_asignado || 'Equipo IT'}</li>
          </ul>
        </div>
        <p style="font-size: 0.9em; color: #666;">Si consideras que el problema persiste o tienes dudas, por favor comunícate con nosotros antes de que el ticket se cierre definitivamente.</p>
        <p style="margin-top: 30px;">Saludos cordiales,<br><strong>Equipo de Soporte IT</strong></p>
      </div>
    `;

        await enviarCorreoMagico(emailDestino, asuntoTicket, plantillaHTML);
        console.log(`✉️ Correo de resolución procesado para: ${emailDestino}`);
    } catch (error) {
        console.error("❌ Error al armar/enviar el correo:", error);
    }
};
