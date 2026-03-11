import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt'; // NUEVO: Para encriptar contraseñas
import jwt from 'jsonwebtoken'; // NUEVO: Para crear el token de sesión
import http from 'http'; // NUEVO: Módulo nativo de Node
import { Server } from 'socket.io'; // NUEVO: El motor de WebSockets

dotenv.config();

const app = express();
const PORT = 3000;

// NUEVO: Envolvemos Express con el servidor HTTP y Socket.io
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Permite que cualquier React se conecte al túnel
});

app.use(cors());
app.use(express.json());

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// NUEVO: Verificamos cuando alguien se conecta al túnel
io.on('connection', (socket) => {
    console.log('🟢 Un usuario se conectó a WebSockets');
});

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
            // Si se finaliza, guardamos la fecha y hora actual
            query = "UPDATE tickets SET estado = $1, fecha_finalizado = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *";
        } else {
            // Si se reabre, limpiamos la fecha de finalización
            query = "UPDATE tickets SET estado = $1, fecha_finalizado = NULL WHERE id = $2 RETURNING *";
        }

        const resultado = await pool.query(query, [estado, id]);
        const ticketNuevo = resultado.rows[0];

        io.emit('ticketCreado', ticketNuevo); // 📢 ¡Avisamos a todos!

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

        io.emit('ticketCreado', ticketNuevo); // 📢 ¡Avisamos a todos!

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

        io.emit('ticketCreado', ticketNuevo); // 📢 ¡Avisamos a todos!

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

// 2. Crear una nueva rutina de mantenimiento
app.post('/api/tareas', async (req, res) => {
    try {
        const { titulo, categoria, frecuencia, hora_programada, proxima_ejecucion } = req.body;
        const query = `
      INSERT INTO tareas_diarias (titulo, categoria, frecuencia, hora_programada, proxima_ejecucion) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *;
    `;
        const resultado = await pool.query(query, [titulo, categoria, frecuencia, hora_programada, proxima_ejecucion]);
        const tareaCreada = resultado.rows[0];

        // 📢 AVISAMOS A TODOS QUE HAY UNA NUEVA RUTINA
        io.emit('tareaCreada', tareaCreada);

        res.json(tareaCreada);
    } catch (error) {
        console.error("Error en POST /api/tareas:", error);
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
// COMPLETAR RUTINA Y GUARDAR EN HISTORIAL
// ==========================================
// ==========================================
// COMPLETAR RUTINA Y GUARDAR EN HISTORIAL
// ==========================================
app.put('/api/tareas/:id/completar', async (req, res) => {
    try {
        const { id } = req.params;
        const { usuario } = req.body;

        // 1. Obtenemos los datos actuales (AHORA INCLUYE hora_primer_inicio)
        const tareaActual = await pool.query(
            'SELECT titulo, hora_programada, fecha_inicio_real, tiempo_acumulado_minutos, hora_primer_inicio FROM tareas_diarias WHERE id = $1',
            [id]
        );

        if (tareaActual.rows.length === 0) return res.status(404).json({ error: "Tarea no encontrada" });

        const { titulo, hora_programada, fecha_inicio_real, tiempo_acumulado_minutos, hora_primer_inicio } = tareaActual.rows[0];

        // 2. Calculamos el tiempo total definitivo
        let tiempoFinal = parseFloat(tiempo_acumulado_minutos) || 0;

        if (fecha_inicio_real) {
            const calcTramo = await pool.query(
                "SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - $1::timestamp))/60 AS minutos",
                [fecha_inicio_real]
            );
            tiempoFinal += parseFloat(calcTramo.rows[0].minutos);
        }

        // 3. Guardamos en bitácora (AHORA INCLUIMOS LA FECHA DE INICIO)
        await pool.query(
            'INSERT INTO historial_tareas (tarea_id, titulo_tarea, usuario_que_completo, tiempo_total_minutos, fecha_inicio) VALUES ($1, $2, $3, $4, $5)',
            [id, titulo, usuario || 'Sistema', tiempoFinal, hora_primer_inicio]
        );

        // 4. Reprogramamos y limpiamos TODAS las variables del cronómetro
        const queryReprogramar = `
          UPDATE tareas_diarias 
          SET estado = 'Pendiente', 
              ultima_vez_completada = CURRENT_TIMESTAMP, 
              proxima_ejecucion = (CURRENT_DATE + INTERVAL '1 day') + $1::time,
              en_pausa = FALSE,
              fecha_inicio_real = NULL,
              tiempo_acumulado_minutos = 0,
              hora_primer_inicio = NULL -- <-- LIMPIAMOS PARA MAÑANA
          WHERE id = $2 RETURNING *;
        `;
        const resultado = await pool.query(queryReprogramar, [hora_programada, id]);
        const tareaActualizada = resultado.rows[0];

        io.emit('tareaCompletada', tareaActualizada);
        res.json(tareaActualizada);
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

// Antes decía app.listen... ahora es server.listen
server.listen(PORT, () => {
    console.log(`🚀 Servidor y WebSockets corriendo en el puerto ${PORT}`);
});