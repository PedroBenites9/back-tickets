import express from 'express';
import pool from '../db.js';
import { enviarCorreoResolucion } from '../utils/mail.js';

export default function ticketRoutes(io) {
    const router = express.Router();

    // Obtener todos los tickets
    router.get('/', async (req, res) => {
        try {
            // MariaDB usa INTERVAL X DAY en lugar de INTERVAL 'X days'
            await pool.query(`
              UPDATE tickets 
              SET estado = 'Cerrado Definitivo' 
              WHERE estado = 'Resuelto' 
              AND fecha_finalizado <= NOW() - INTERVAL 5 DAY
              AND status = 1
            `);

            const [tickets] = await pool.query('SELECT * FROM tickets WHERE status = 1 ORDER BY id DESC');
            res.json(tickets);
        } catch (error) {
            console.error("Error al obtener tickets:", error);
            res.status(500).json({ error: "Error al obtener los tickets" });
        }
    });

    // Crear un nuevo ticket
    router.post('/', async (req, res) => {
        try {
            const { asunto, categoria, prioridad, descripcion, tipo_origen, solicitante, cliente } = req.body;

            // Manejo de Clientes: INSERT IGNORE evita errores si el nombre ya existe
            if (tipo_origen === 'Externo' && cliente) {
                const [clienteGuardado] = await pool.query('INSERT IGNORE INTO clientes (nombre) VALUES (?)', [cliente]);
                if (clienteGuardado.insertId) { // Si insertId > 0, es un cliente nuevo
                    const [nuevoCliente] = await pool.query('SELECT * FROM clientes WHERE id = ? AND status = 1', [clienteGuardado.insertId]);
                    io.emit('clienteCreado', nuevoCliente[0]);
                }
            }

            // 1. Insertamos el ticket sin código todavía
            const queryInsert = `
              INSERT INTO tickets (asunto, categoria, prioridad, descripcion, tipo_origen, solicitante, cliente) 
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            const [resultadoInsert] = await pool.query(queryInsert, [asunto, categoria, prioridad, descripcion, tipo_origen, solicitante, cliente || null]);

            // 2. Usamos el ID autoincremental para armar el TK-XXXX
            const nextId = resultadoInsert.insertId;
            const codigo = `TK-${String(nextId).padStart(4, '0')}`;

            // 3. Actualizamos la fila con el código generado
            await pool.query('UPDATE tickets SET codigo = ? WHERE id = ?', [codigo, nextId]);

            // 4. Buscamos el ticket completo para devolverlo al Frontend y por Sockets
            const [ticketsNuevos] = await pool.query('SELECT * FROM tickets WHERE id = ? AND status = 1', [nextId]);
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
            const { asunto, categoria, prioridad, descripcion, tipo_origen, cliente, usuario_actual } = req.body;

            const [ticketOriginal] = await pool.query('SELECT solicitante, descripcion FROM tickets WHERE id = ?', [id]);

            if (ticketOriginal.length === 0) {
                return res.status(404).json({ error: "Ticket no encontrado" });
            }

            const creador = ticketOriginal[0].solicitante;
            const descripcionOriginal = ticketOriginal[0].descripcion;

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

            const query = `
              UPDATE tickets 
              SET asunto = ?, categoria = ?, prioridad = ?, descripcion = ?, tipo_origen = ?, cliente = ? 
              WHERE id = ? AND status = 1
            `;
            await pool.query(query, [asunto, categoria, prioridad, descripcionFinal, tipo_origen, cliente || null, id]);

            const [ticketsModificados] = await pool.query('SELECT * FROM tickets WHERE id = ? AND status = 1', [id]);
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
        try {
            const { id } = req.params;
            await pool.query('UPDATE comentarios SET status = 0 WHERE ticket_id = ?', [id]);
            await pool.query('UPDATE tickets SET status = 0 WHERE id = ?', [id]);
            res.json({ mensaje: 'Ticket eliminado correctamente' });
        } catch (error) {
            console.error("Error al eliminar:", error);
            res.status(500).json({ error: "Error interno del servidor" });
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