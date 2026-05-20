import express from 'express';
import pool from '../db.js';
import { enviarCorreoResolucion } from '../utils/mail.js';

export default function ticketRoutes(io) {
    const router = express.Router();

    // Ruta para obtener tickets dependiendo del ROL y ÁREA
    router.get('/', async (req, res) => {
        try {
            const idRol = parseInt(req.query.id_rol) || 0;
            const idArea = parseInt(req.query.id_area) || 0;

            let query = '';
            let parametros = [];

            // t.* -> Trae todas las columnas del ticket
            // a.nombre -> Trae el nombre de la tabla áreas y lo renombra como nombre_area_origen
            const selectBase = `
                SELECT t.*, a.nombre AS nombre_area_origen 
                FROM tickets t
                LEFT JOIN areas a ON t.id_area = a.id
            `;

            if (idRol === 1 || idRol === 2 || idRol === 23) {
                // Admins y Técnicos ven todo
                query = `${selectBase} WHERE t.status = 1 ORDER BY t.fecha_creacion DESC`;
            } else {
                // Usuarios finales ven solo su área
                query = `${selectBase} WHERE t.id_area = ? AND t.status = 1 ORDER BY t.fecha_creacion DESC`;
                parametros = [idArea];
            }

            const [tickets] = await pool.query(query, parametros);
            res.json(tickets);
        } catch (error) {
            console.error("Error al obtener tickets con JOIN:", error);
            res.status(500).json({ error: "Error interno del servidor" });
        }
    });
    // Crear un nuevo ticket
    router.post('/', async (req, res) => {
        try {
            const { asunto, categoria, prioridad, descripcion, tipo_origen, solicitante, cliente, area_origen, id_area } = req.body;

            const areaParaGuardar = id_area || area_origen || null;

            // Manejo de Clientes: INSERT IGNORE evita errores si el nombre ya existe
            if (tipo_origen === 'Externo' && cliente) {
                const [clienteGuardado] = await pool.query('INSERT IGNORE INTO clientes (nombre) VALUES (?)', [cliente]);
                if (clienteGuardado.insertId) {
                    const [nuevoCliente] = await pool.query('SELECT * FROM clientes WHERE id = ? AND status = 1', [clienteGuardado.insertId]);
                    io.emit('clienteCreado', nuevoCliente[0]);
                }
            }

            // 1. Insertamos el ticket sin código todavía   
            const queryInsert = `
                INSERT INTO tickets 
                (asunto, categoria, prioridad, descripcion, tipo_origen, solicitante, cliente, id_area, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Abierto')
            `;
            const [resultadoInsert] = await pool.query(queryInsert, [
                asunto, categoria, prioridad, descripcion, tipo_origen, solicitante, cliente || null, areaParaGuardar
            ]);

            // 2. Usamos el ID autoincremental para armar el TK-XXXX
            const nextId = resultadoInsert.insertId;
            const codigo = `TK-${String(nextId).padStart(4, '0')}`;

            // 3. Actualizamos la fila con el código generado
            await pool.query('UPDATE tickets SET codigo = ? WHERE id = ?', [codigo, nextId]);

            // 4. Buscamos el ticket completo para devolverlo al Frontend y por Sockets
            const [ticketsNuevos] = await pool.query(`
            SELECT t.*, a.nombre AS nombre_area_origen 
            FROM tickets t 
            LEFT JOIN areas a ON t.id_area = a.id 
            WHERE t.id = ? AND t.status = 1
        `, [nextId]);
            const ticketNuevo = ticketsNuevos[0];
            io.emit('ticketCreado', ticketNuevo);

            res.json(ticketNuevo);
        } catch (error) {
            console.error("Error al crear ticket:", error);
            res.status(500).json({ error: "Error al crear ticket" });
        }
    });

    // Cambiar estado
    router.put('/:id/estado', async (req, res) => {
        try {
            const { id } = req.params;
            const { estado } = req.body;

            // Lógica condicional dentro de la consulta SQL para la fecha
            const query = `
              UPDATE tickets 
              SET estado = ?, 
                  fecha_finalizado = IF(? = 'Resuelto', CURRENT_TIMESTAMP, NULL) 
              WHERE id = ? AND status = 1
            `;
            await pool.query(query, [estado, estado, id]);

            // Recuperamos el ticket modificado
            const [ticketsModificados] = await pool.query('SELECT * FROM tickets WHERE id = ? AND status = 1', [id]);
            const ticketNuevo = ticketsModificados[0];

            io.emit('ticketModificado', ticketNuevo);

            // Enviar correo si está resuelto
            if (estado === 'Resuelto') {
                const [usuarioSolicitante] = await pool.query('SELECT email FROM usuarios WHERE nombre = ? AND status = 1', [ticketNuevo.solicitante]);
                if (usuarioSolicitante.length > 0) {
                    const emailDestino = usuarioSolicitante[0].email;
                    enviarCorreoResolucion(emailDestino, ticketNuevo);
                }
            }

            res.json(ticketNuevo);
        } catch (error) {
            console.error("Error al cambiar estado:", error);
            res.status(500).json({ error: "Error al cambiar el estado" });
        }
    });

    // Editar ticket completo
    router.put('/editar/:id', async (req, res) => {
        try {

            const { id } = req.params;
            const { asunto, categoria, prioridad, descripcion, tipo_origen, cliente, usuario_actual, solicitante } = req.body;

            const [ticketOriginal] = await pool.query('SELECT solicitante, descripcion FROM tickets WHERE id = ?', [id]);

            // 👇 AGREGÁ ESTOS DOS ESPÍAS ACÁ 👇
            console.log("=========================================");
            console.log("📥 LLEGÓ PETICIÓN DE EDICIÓN PARA TICKET ID:", id);
            console.log("📦 DATOS COMPLETOS DEL BODY:", req.body);
            console.log("=========================================");

            if (ticketOriginal.length === 0) {
                return res.status(404).json({ error: "Ticket no encontrado" });
            }

            const creador = ticketOriginal[0].solicitante;
            const descripcionOriginal = ticketOriginal[0].descripcion;

            // Si el frontend manda un solicitante nuevo, lo usamos. Si no, dejamos el que ya estaba.
            const solicitanteFinal = solicitante || creador;

            let descripcionFinal = descripcionOriginal;

            if (descripcion !== descripcionOriginal) {
                if (usuario_actual === creador) {
                    descripcionFinal = descripcion;
                }
            }

            if (tipo_origen === 'Externo' && cliente) {
                const [clienteGuardado] = await pool.query('INSERT IGNORE INTO clientes (nombre) VALUES (?)', [cliente]);
                if (clienteGuardado.insertId) {
                    const [nuevoCliente] = await pool.query('SELECT * FROM clientes WHERE id = ? AND status = 1', [clienteGuardado.insertId]);
                    io.emit('clienteCreado', nuevoCliente[0]);
                }
            }

            // 2. Modificamos el UPDATE para incluir solicitante e id_area
            const query = `
            UPDATE tickets 
            SET asunto = ?, categoria = ?, prioridad = ?, descripcion = ?, tipo_origen = ?, cliente = ?,
                solicitante = ?, 
                id_area = IFNULL((SELECT id_area FROM usuarios WHERE nombre = ? LIMIT 1), id_area)
            WHERE id = ? AND status = 1
        `;

            // ¡OJO ACÁ! Tienen que estar los dos 'solicitanteFinal' seguidos antes del 'id'
            await pool.query(query, [asunto, categoria, prioridad, descripcionFinal, tipo_origen, cliente || null, solicitanteFinal, solicitanteFinal, id]);

            // 3. Modificamos el SELECT final para traer el nombre de la nueva área y mandarlo por WebSocket
            const [ticketsModificados] = await pool.query(`
            SELECT t.*, a.nombre AS nombre_area_origen 
            FROM tickets t
            LEFT JOIN areas a ON t.id_area = a.id
            WHERE t.id = ? AND t.status = 1
        `, [id]);

            const ticketNuevo = ticketsModificados[0];

            io.emit('ticketModificado', ticketNuevo);
            res.json(ticketNuevo);
        } catch (error) {
            console.error("Error al editar:", error);
            res.status(500).json({ error: "Error al editar el ticket" });
        }
    });

    // Asignar técnico
    router.put('/asignar/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { tecnico } = req.body;

            await pool.query('UPDATE tickets SET tecnico_asignado = ? WHERE id = ? AND status = 1', [tecnico, id]);

            const [ticketsModificados] = await pool.query('SELECT * FROM tickets WHERE id = ? AND status = 1', [id]);
            const ticketNuevo = ticketsModificados[0];

            io.emit('ticketModificado', ticketNuevo);
            res.json(ticketNuevo);
        } catch (error) {
            console.error("Error al asignar técnico:", error);
            res.status(500).json({ error: "Error al asignar técnico" });
        }
    });

    // Eliminar ticket
    router.delete('/:id', async (req, res) => {
        const { id } = req.params;
        const { rol, nombre_usuario } = req.query; // Necesitamos que el front mande estos datos

        try {
            // 1. Buscamos el ticket para saber quién lo creó
            const [ticket] = await pool.query("SELECT solicitante FROM tickets WHERE id = ?", [id]);

            if (ticket.length === 0) return res.status(404).json({ error: "Ticket no encontrado" });

            // 2. Verificamos: ¿Es admin? ¿O es el dueño?
            if (rol === 'admin' || ticket[0].solicitante === nombre_usuario) {
                await pool.query("UPDATE tickets SET status = 0 WHERE id = ?", [id]); // Borrado lógico
                res.json({ message: "Ticket eliminado correctamente" });
            } else {
                res.status(403).json({ error: "No tienes permiso para eliminar este ticket" });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Comentarios
    router.get('/:id/comentarios', async (req, res) => {
        try {
            const { id } = req.params;
            const [comentarios] = await pool.query('SELECT * FROM comentarios WHERE ticket_id = ? AND status = 1 ORDER BY fecha_creacion ASC', [id]);
            res.json(comentarios);
        } catch (error) {
            console.error("Error en comentarios:", error);
            res.status(500).json({ error: "Error al cargar los comentarios" });
        }
    });

    router.post('/:id/comentarios', async (req, res) => {
        try {
            const { id } = req.params;
            const { autor, texto } = req.body;

            const [resultado] = await pool.query('INSERT INTO comentarios (ticket_id, autor, mensaje) VALUES (?, ?, ?)', [id, autor, texto]);

            const [nuevoComentario] = await pool.query('SELECT * FROM comentarios WHERE id = ? AND status = 1', [resultado.insertId]);
            io.emit('nuevoComentario', nuevoComentario[0]);
            res.json(nuevoComentario[0]);
        } catch (error) {
            console.error("Error al crear comentario:", error);
            res.status(500).json({ error: "Error al guardar el comentario" });
        }
    });

    return router;
}