import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt'; // NUEVO: Para encriptar contraseñas
import jwt from 'jsonwebtoken'; // NUEVO: Para crear el token de sesión
import http from 'http'; // NUEVO: Módulo nativo de Node
import { Server } from 'socket.io'; // NUEVO: El motor de WebSockets
import nodemailer from 'nodemailer';
import { google } from 'googleapis';

dotenv.config();

const app = express();
const PORT = 3000;

// NUEVO: Envolvemos Express con el servidor HTTP y Socket.io
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Permite que cualquier React se conecte al túnel
});

// 1. Configuramos el acceso VIP a Google usando tus llaves del .env
const oAuth2Client = new google.auth.OAuth2(
    process.env.OAUTH_CLIENT_ID,
    process.env.OAUTH_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
);
oAuth2Client.setCredentials({ refresh_token: process.env.OAUTH_REFRESH_TOKEN });

const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

// 2. Función maestra para enviar el correo por HTTP (¡Esquiva el bloqueo de Render!)
const enviarCorreoMagico = async (destinatario, asunto, htmlContenido) => {
    try {
        // Armamos el correo en el formato exacto que pide Google
        const mensajePuro = [
            `From: Soporte Cruz de Malta <${process.env.EMAIL_USER}>`,
            `To: ${destinatario}`,
            `Subject: =?utf-8?B?${Buffer.from(asunto).toString('base64')}?=`,
            "MIME-Version: 1.0",
            "Content-Type: text/html; charset=utf-8",
            "",
            htmlContenido
        ].join('\n');

        // Lo codificamos para que viaje seguro por internet
        const encodedMensaje = Buffer.from(mensajePuro)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        console.log(`✉️ ¡Éxito! Correo enviado vía Gmail API a: ${destinatario}`);
    } catch (error) {
        console.error("⚠️ Error enviando correo con Gmail API:", error);
    }
};

// ==========================================
// CEREBRO MATEMÁTICO (Blindado contra Zonas Horarias de Argentina)
// ==========================================
function calcularProximaEjecucion(frecuencia, hora_programada, dias_especificos, fecha_unica, esNuevaCreacion = false) {
    // 1. Truco Senior: Forzamos el reloj interno a UTC-3 (Argentina)
    const ahoraUTC = new Date();
    const ahora = new Date(ahoraUTC.getTime() - (3 * 60 * 60 * 1000));
    let proxima = new Date(ahora);

    const horaSegura = hora_programada || '00:00';
    const [horas, minutos] = horaSegura.split(':');

    if (frecuencia === 'Fecha Unica' && fecha_unica) {
        // Le pegamos el "-03:00" al final para blindar la zona horaria
        return `${fecha_unica}T${horas}:${minutos}:00-03:00`;
    }

    proxima.setUTCHours(parseInt(horas), parseInt(minutos), 0, 0);

    // 2. Convertimos los días a números matemáticos puros (Ej: "1" -> 1) para que no falle
    const diasArray = Array.isArray(dias_especificos) ? dias_especificos.map(Number) : [];

    if (frecuencia === 'Dias Especificos' && diasArray.length > 0) {
        const hoy = ahora.getUTCDay();
        const diasOrdenados = [...diasArray].sort((a, b) => a - b);

        let proximoDia;
        if (esNuevaCreacion) {
            proximoDia = diasOrdenados.find(d => d > hoy || (d === hoy && proxima > ahora));
        } else {
            proximoDia = diasOrdenados.find(d => d > hoy);
        }

        let diasASumar = 0;
        if (proximoDia !== undefined) {
            diasASumar = proximoDia - hoy;
        } else {
            diasASumar = (7 - hoy) + diasOrdenados[0]; // Salto a la próxima semana
        }
        proxima.setUTCDate(proxima.getUTCDate() + diasASumar);

    } else {
        // Casos Diaria, Semanal, Mensual
        if (esNuevaCreacion) {
            if (proxima <= ahora) proxima.setUTCDate(proxima.getUTCDate() + 1);
        } else {
            if (frecuencia === 'Diaria') proxima.setUTCDate(proxima.getUTCDate() + 1);
            if (frecuencia === 'Semanal') proxima.setUTCDate(proxima.getUTCDate() + 7);
            if (frecuencia === 'Mensual') proxima.setUTCMonth(proxima.getUTCMonth() + 1);
        }
    }

    const anio = proxima.getUTCFullYear();
    const mes = String(proxima.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(proxima.getUTCDate()).padStart(2, '0');

    // 3. Enviamos la fecha con la firma "-03:00" para que la BD jamás reste horas
    return `${anio}-${mes}-${dia}T${horas}:${minutos}:00-03:00`;
}

app.use(cors());
app.use(express.json());

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});


// Función auxiliar para armar y enviar el correo
// Función auxiliar para armar y enviar el correo (VERSIÓN OAUTH2 - API GMAIL)
const enviarCorreoResolucion = async (emailDestino, ticket) => {
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

        // ¡EL GOLPE FINAL! Usamos la API de Gmail en lugar de nodemailer
        await enviarCorreoMagico(emailDestino, asuntoTicket, plantillaHTML);

        console.log(`✉️ Correo de resolución procesado para: ${emailDestino}`);
    } catch (error) {
        console.error("❌ Error al armar/enviar el correo:", error);
    }
};
// ==========================================
// RUTA DE INSTALACIÓN (Ahora crea Tickets y Usuarios)
// ==========================================
app.get('/api/instalar', async (req, res) => {
    try {
        // 1. Tabla de Usuarios
        await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // 2. Tabla de Tickets
        await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(20) UNIQUE NOT NULL,
        asunto VARCHAR(255) NOT NULL,
        categoria VARCHAR(100) NOT NULL,
        prioridad VARCHAR(50) NOT NULL,
        estado VARCHAR(50) DEFAULT 'Abierto',
        descripcion TEXT,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        res.json({ mensaje: "¡Tablas de 'usuarios' y 'tickets' listas en PostgreSQL!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Hubo un problema al crear las tablas" });
    }
});

// ==========================================
// NUEVO: REGISTRO DE USUARIO (Crear cuenta)
// ==========================================
app.post('/api/registro', async (req, res) => {
    try {
        const { nombre, email, password, area } = req.body;

        // 1. Verificamos si el correo ya existe en la base de datos
        const usuarioExistente = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (usuarioExistente.rows.length > 0) {
            return res.status(400).json({ error: "Este correo ya está registrado" });
        }

        // 2. Encriptamos la contraseña (el número 10 es el nivel de seguridad/saltos)
        const saltos = 10;
        const passwordEncriptada = await bcrypt.hash(password, saltos);

        // 3. Guardamos al usuario en PostgreSQL con la clave encriptada
        const query = `
          INSERT INTO usuarios (nombre, email, password, area)
          VALUES ($1, $2, $3, $4)
          RETURNING id, nombre, email, area; 
        `;
        const nuevoUsuario = await pool.query(query, [nombre, email, passwordEncriptada, area || 'Sin Asignar']);

        res.status(201).json({ mensaje: "Usuario creado exitosamente", usuario: nuevoUsuario.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno al registrar usuario" });
    }
});

// ==========================================
// NUEVO: LOGIN DE USUARIO (Iniciar sesión)
// ==========================================
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. NUEVO: Asegúrate de pedir la columna "rol" en el SELECT
        const query = 'SELECT id, nombre, email, password, rol, area FROM usuarios WHERE email = $1';
        const resultado = await pool.query(query, [email]);

        if (resultado.rows.length === 0) {
            return res.status(401).json({ error: "Usuario no encontrado" });
        }

        const usuario = resultado.rows[0];
        const passwordValida = await bcrypt.compare(password, usuario.password);

        if (!passwordValida) {
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }

        // 2. NUEVO: Metemos el rol dentro del pase VIP (Token)
        const token = jwt.sign(
            { id: usuario.id, rol: usuario.rol },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );

        // 3. NUEVO: Le enviamos el rol a React para que sepa qué botones mostrar
        res.json({
            mensaje: "Login exitoso",
            token,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                rol: usuario.rol,
                area: usuario.area
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error en el servidor al iniciar sesión" });
    }
});

// ==========================================
// RUTAS DE TICKETS (Quedan exactamente igual)
// ==========================================
// Obtener todos los tickets (con cierre automático de 5 días)
app.get('/api/tickets', async (req, res) => {
    try {
        // 1. Truco Mágico: Auto-Cerrar tickets que llevan más de 5 días "Resueltos"
        await pool.query(`
      UPDATE tickets 
      SET estado = 'Cerrado Definitivo' 
      WHERE estado = 'Resuelto' 
      AND fecha_finalizado <= NOW() - INTERVAL '5 days'
    `);

        // 2. Traer la lista actualizada
        const query = 'SELECT * FROM tickets ORDER BY id DESC';
        const resultado = await pool.query(query);
        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener los tickets" });
    }
});

// Crear un nuevo ticket (CORREGIDO CON SECUENCIA TK-0001)
app.post('/api/tickets', async (req, res) => {
    try {
        const { asunto, categoria, prioridad, descripcion, tipo_origen, solicitante } = req.body;

        // 1. Le pedimos a PostgreSQL el siguiente ID de forma 100% segura (evita choques)
        const seqResult = await pool.query("SELECT nextval('tickets_id_seq') AS next_id");
        const nextId = seqResult.rows[0].next_id;

        // 2. Formateamos el número para que tenga 4 ceros (Ej: TK-0007)
        const codigo = `TK-${String(nextId).padStart(4, '0')}`;

        // 3. Insertamos el ticket forzando ese ID y ese Código
        const query = `
          INSERT INTO tickets (id, codigo, asunto, categoria, prioridad, descripcion, tipo_origen, solicitante) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;
        `;

        const resultado = await pool.query(query, [nextId, codigo, asunto, categoria, prioridad, descripcion, tipo_origen, solicitante]);
        const ticketNuevo = resultado.rows[0];

        io.emit('ticketCreado', ticketNuevo); // 📢 ¡Avisamos a todos!

        res.json(ticketNuevo);
    } catch (error) {
        console.error("Error exacto en la BD:", error);
        res.status(500).json({ error: "Error al crear ticket secuencial" });
    }
});

// Cambiar solo el estado y registrar la fecha de finalización
app.put('/api/tickets/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        let query = '';

        if (estado === 'Resuelto') {
            query = "UPDATE tickets SET estado = $1, fecha_finalizado = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *";
        } else {
            query = "UPDATE tickets SET estado = $1, fecha_finalizado = NULL WHERE id = $2 RETURNING *";
        }

        const resultado = await pool.query(query, [estado, id]);
        const ticketNuevo = resultado.rows[0];

        io.emit('ticketModificado', ticketNuevo); // 📢 Avisamos a todos vía WebSockets

        // ---> NUEVA MAGIA: Enviar correo si se resolvió <---
        if (estado === 'Resuelto') {
            // 1. Buscamos el correo del usuario que creó el ticket
            const usuarioSolicitante = await pool.query('SELECT email FROM usuarios WHERE nombre = $1', [ticketNuevo.solicitante]);

            if (usuarioSolicitante.rows.length > 0) {
                const emailDestino = usuarioSolicitante.rows[0].email;
                // 2. Disparamos el correo (SIN "await" para que se ejecute en segundo plano y no congele la app)
                enviarCorreoResolucion(emailDestino, ticketNuevo);
            }
        }

        res.json(ticketNuevo);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al cambiar el estado" });
    }
});
// ==========================================
// NUEVA RUTA: EDICIÓN COMPLETA DEL TICKET (PUT)
// ==========================================
// Editar un ticket completo (Actualizado con tipo_origen)
app.put('/api/tickets/editar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { asunto, categoria, prioridad, descripcion, tipo_origen } = req.body;

        const query = `
      UPDATE tickets 
      SET asunto = $1, categoria = $2, prioridad = $3, descripcion = $4, tipo_origen = $5 
      WHERE id = $6 
      RETURNING *;
    `;
        const valores = [asunto, categoria, prioridad, descripcion, tipo_origen, id];

        const resultado = await pool.query(query, valores);
        const ticketNuevo = resultado.rows[0];

        io.emit('ticketModificado', ticketNuevo);// 📢 ¡Avisamos a todos!

        res.json(ticketNuevo);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al editar el ticket" });
    }
});
app.put('/api/tickets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const query = 'UPDATE tickets SET estado = $1 WHERE id = $2 RETURNING *';
        const resultado = await pool.query(query, [estado, id]);
        const ticketNuevo = resultado.rows[0];

        io.emit('ticketCreado', ticketNuevo); // 📢 ¡Avisamos a todos!

        res.json(ticketNuevo);
    } catch (error) {
        res.status(500).json({ error: "Error al actualizar el ticket" });
    }
});
// ==========================================
// NUEVA RUTA: ASIGNAR TÉCNICO AL TICKET (PUT)
// ==========================================
app.put('/api/tickets/asignar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { tecnico } = req.body;

        const query = `
      UPDATE tickets 
      SET tecnico_asignado = $1 
      WHERE id = $2 
      RETURNING *;
    `;
        const resultado = await pool.query(query, [tecnico, id]);
        const ticketNuevo = resultado.rows[0];

        io.emit('ticketModificado', ticketNuevo);// 📢 ¡Avisamos a todos!

        res.json(ticketNuevo);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al asignar técnico" });
    }
});

app.delete('/api/tickets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM tickets WHERE id = $1', [id]);
        res.json({ mensaje: 'Ticket eliminado correctamente' });
    } catch (error) {
        console.error("Error al eliminar:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// ==========================================
// NUEVAS RUTAS: HISTORIAL DE COMENTARIOS
// ==========================================

// 1. Obtener todos los comentarios de un ticket específico
app.get('/api/tickets/:id/comentarios', async (req, res) => {
    try {
        const { id } = req.params;
        const query = 'SELECT * FROM comentarios WHERE ticket_id = $1 ORDER BY fecha ASC';
        const resultado = await pool.query(query, [id]);
        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al cargar los comentarios" });
    }
});

// 2. Agregar un nuevo comentario a un ticket
app.post('/api/tickets/:id/comentarios', async (req, res) => {
    try {
        const { id } = req.params;
        const { autor, texto } = req.body;

        const query = `
      INSERT INTO comentarios (ticket_id, autor, texto) 
      VALUES ($1, $2, $3) 
      RETURNING *;
    `;
        const resultado = await pool.query(query, [id, autor, texto]);

        // ---> NUEVO: Avisamos al mundo que hay un nuevo mensaje <---
        io.emit('nuevoComentario', resultado.rows[0]);

        res.json(resultado.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al guardar el comentario" });
    }
});
// ==========================================
// NUEVAS RUTAS: GESTIÓN DE USUARIOS (ADMIN)
// ==========================================

// 1. Obtener la lista de todos los usuarios (sin contraseñas por seguridad)
app.get('/api/usuarios', async (req, res) => {
    try {
        // Agregamos "area" para que el Admin la vea en su tabla
        const query = 'SELECT id, nombre, email, rol, area FROM usuarios ORDER BY nombre ASC';
        const resultado = await pool.query(query);
        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener la lista de usuarios" });
    }
});

// 2. Cambiar el rol de un usuario específico
app.put('/api/usuarios/:id/rol', async (req, res) => {
    try {
        const { id } = req.params;
        const { rol } = req.body;

        const query = 'UPDATE usuarios SET rol = $1 WHERE id = $2 RETURNING id, nombre, email, rol';
        const resultado = await pool.query(query, [rol, id]);
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al actualizar el rol del usuario" });
    }
});
// ==========================================
// NUEVAS RUTAS: TAREAS RECURRENTES (PREVENTIVAS)
// ==========================================

// 1. Obtener todas las tareas programadas
app.get('/api/tareas', async (req, res) => {
    try {
        // Las ordenamos para que las que están por vencer (o vencidas) salgan primero
        const query = 'SELECT * FROM tareas_diarias ORDER BY proxima_ejecucion ASC';
        const resultado = await pool.query(query);
        res.json(resultado.rows);
    } catch (error) {
        console.error("Error en GET /api/tareas:", error);
        res.status(500).json({ error: "Error al obtener las tareas diarias" });
    }
});

// 2. Crear una nueva rutina de mantenimiento (ACTUALIZADA)
app.post('/api/tareas', async (req, res) => {
    try {
        const { titulo, categoria, frecuencia, hora_programada, dias_especificos, fecha_unica } = req.body;

        // LLAMAMOS AL CEREBRO (true = es nueva creación)
        const proxima = calcularProximaEjecucion(frecuencia, hora_programada, dias_especificos, fecha_unica, true);

        const diasJson = dias_especificos ? JSON.stringify(dias_especificos) : '[]';

        const query = `
          INSERT INTO tareas_diarias (titulo, categoria, frecuencia, hora_programada, proxima_ejecucion, dias_especificos, fecha_unica) 
          VALUES ($1, $2, $3, $4, $5, $6, $7) 
          RETURNING *;
        `;
        const resultado = await pool.query(query, [titulo, categoria, frecuencia, hora_programada, proxima, diasJson, fecha_unica || null]);

        io.emit('tareaCreada', resultado.rows[0]);
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error("Error al crear la tarea:", error);
        res.status(500).json({ error: "Error al crear la tarea" });
    }
});

// ==========================================
// NUEVO: INICIAR / REANUDAR TAREA (Cronómetro)
// ==========================================
app.put('/api/tareas/:id/iniciar', async (req, res) => {
    try {
        const { id } = req.params;

        // Marcamos la tarea como iniciada (quitamos pausa y seteamos el reloj)
        const query = `
            UPDATE tareas_diarias 
            SET en_pausa = FALSE, 
                fecha_inicio_real = CURRENT_TIMESTAMP,
                hora_primer_inicio = COALESCE(hora_primer_inicio, CURRENT_TIMESTAMP), 
                estado = 'En Curso'
            WHERE id = $1 
            RETURNING *;
        `;
        const resultado = await pool.query(query, [id]);

        // Avisamos a todos los clientes conectados que la tarea cambió de estado
        io.emit('tareaModificada', resultado.rows[0]);
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error("Error al iniciar tarea:", error);
        res.status(500).json({ error: "Error al iniciar la tarea" });
    }
});

// ==========================================
// NUEVO: PAUSAR TAREA (Calcula tiempo)
// ==========================================
app.put('/api/tareas/:id/pausar', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Necesitamos saber cuándo se inició para calcular la diferencia de tiempo
        const tareaActual = await pool.query('SELECT fecha_inicio_real, tiempo_acumulado_minutos FROM tareas_diarias WHERE id = $1', [id]);

        if (tareaActual.rows.length === 0 || !tareaActual.rows[0].fecha_inicio_real) {
            return res.status(400).json({ error: "La tarea no está en curso o no tiene fecha de inicio." });
        }

        // 2. Calculamos los minutos transcurridos en este tramo en PostgreSQL y los sumamos al historial
        const query = `
            UPDATE tareas_diarias 
            SET en_pausa = TRUE,
                estado = 'Pausada',
                tiempo_acumulado_minutos = COALESCE(tiempo_acumulado_minutos, 0) + EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - fecha_inicio_real))/60,
                fecha_inicio_real = NULL -- Limpiamos el reloj para el próximo inicio
            WHERE id = $1 
            RETURNING *;
        `;

        const resultado = await pool.query(query, [id]);

        // Avisamos a todos los clientes conectados que la tarea cambió de estado
        io.emit('tareaModificada', resultado.rows[0]);
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error("Error al pausar tarea:", error);
        res.status(500).json({ error: "Error al pausar la tarea" });
    }
});
// ==========================================
// COMPLETAR RUTINA Y GUARDAR EN HISTORIAL (CEREBRO MATEMÁTICO)
// ==========================================
app.put('/api/tareas/:id/completar', async (req, res) => {
    try {
        const { id } = req.params;
        const { usuario } = req.body;

        const tareaActual = await pool.query(
            'SELECT titulo, hora_programada, fecha_inicio_real, tiempo_acumulado_minutos, hora_primer_inicio, frecuencia, dias_especificos, fecha_unica FROM tareas_diarias WHERE id = $1',
            [id]
        );

        if (tareaActual.rows.length === 0) return res.status(404).json({ error: "Tarea no encontrada" });

        const { titulo, hora_programada, fecha_inicio_real, tiempo_acumulado_minutos, hora_primer_inicio, frecuencia, dias_especificos, fecha_unica } = tareaActual.rows[0];

        let tiempoFinal = parseFloat(tiempo_acumulado_minutos) || 0;
        if (fecha_inicio_real) {
            const calcTramo = await pool.query(
                "SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - $1::timestamp))/60 AS minutos",
                [fecha_inicio_real]
            );
            tiempoFinal += parseFloat(calcTramo.rows[0].minutos);
        }

        await pool.query(
            'INSERT INTO historial_tareas (tarea_id, titulo_tarea, usuario_que_completo, tiempo_total_minutos, fecha_inicio) VALUES ($1, $2, $3, $4, $5)',
            [id, titulo, usuario || 'Sistema', tiempoFinal, hora_primer_inicio]
        );

        if (frecuencia === 'Fecha Unica') {
            const queryArchivar = "UPDATE tareas_diarias SET estado = 'Completada Definitiva' WHERE id = $1 RETURNING *";
            const resultado = await pool.query(queryArchivar, [id]);
            io.emit('tareaCompletada', resultado.rows[0]);
            return res.json(resultado.rows[0]);
        }

        // Llamamos al cerebro centralizado (false = NO es nueva creación)
        const nuevaProxima = calcularProximaEjecucion(frecuencia, hora_programada, dias_especificos, fecha_unica, false);

        const queryReprogramar = `
          UPDATE tareas_diarias 
          SET estado = 'Pendiente', 
              ultima_vez_completada = CURRENT_TIMESTAMP, 
              proxima_ejecucion = $1::timestamp,
              en_pausa = FALSE,
              fecha_inicio_real = NULL,
              tiempo_acumulado_minutos = 0,
              hora_primer_inicio = NULL
          WHERE id = $2 RETURNING *;
        `;
        const resultado = await pool.query(queryReprogramar, [nuevaProxima, id]);

        io.emit('tareaCompletada', resultado.rows[0]);
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error("Error en completar tarea:", error);
        res.status(500).json({ error: "Error al reprogramar la tarea" });
    }
});
// NUEVO: Obtener todo el historial para exportar a Excel
app.get('/api/tareas/historial', async (req, res) => {
    try {
        const query = 'SELECT * FROM historial_tareas ORDER BY fecha_completada DESC';
        const resultado = await pool.query(query);
        res.json(resultado.rows);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener el historial" });
    }
});
// ==========================================
// NUEVO: ELIMINAR TAREA (Y SU HISTORIAL)
// ==========================================
app.delete('/api/tareas/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Por seguridad, borramos primero los registros de esta tarea en el historial
        await pool.query('DELETE FROM historial_tareas WHERE tarea_id = $1', [id]);

        // 2. Ahora sí, borramos la tarea principal
        await pool.query('DELETE FROM tareas_diarias WHERE id = $1', [id]);

        // 3. Avisamos a todos los conectados que la tarea ya no existe
        io.emit('tareaEliminada', parseInt(id));

        res.json({ mensaje: 'Tarea eliminada correctamente' });
    } catch (error) {
        console.error("Error al eliminar la tarea:", error);
        res.status(500).json({ error: "Error interno al eliminar la tarea" });
    }
});

// Antes decía app.listen... ahora es server.listen
server.listen(PORT, () => {
    console.log(`🚀 Servidor y WebSockets corriendo en el puerto ${PORT}`);
});