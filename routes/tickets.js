import express from 'express';
import pool from '../db.js';
import { enviarCorreoResolucion } from '../utils/mail.js';

export default function ticketRoutes(io) {
    const router = express.Router();

    // Obtener todos los tickets
    router.get('/', async (req, res) => {
        try {
            await pool.query(`
              UPDATE tickets 
              SET estado = 'Cerrado Definitivo' 
              WHERE estado = 'Resuelto' 
              AND fecha_finalizado <= NOW() - INTERVAL '5 days'
            `);

            const query = 'SELECT * FROM tickets ORDER BY id DESC';
            const resultado = await pool.query(query);
            res.json(resultado.rows);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Error al obtener los tickets" });
        }
    });

    // Crear un nuevo ticket
    router.post('/', async (req, res) => {
        try {
            const { asunto, categoria, prioridad, descripcion, tipo_origen, solicitante, cliente } = req.body;

            if (tipo_origen === 'Externo' && cliente) {
                const clienteGuardado = await pool.query('INSERT INTO clientes (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING RETURNING *', [cliente]);
                if (clienteGuardado.rowCount > 0) {
                    io.emit('clienteCreado', clienteGuardado.rows[0]);
                }
            }

            const seqResult = await pool.query("SELECT nextval('tickets_id_seq') AS next_id");
            const nextId = seqResult.rows[0].next_id;
            const codigo = `TK-${String(nextId).padStart(4, '0')}`;

            const query = `
              INSERT INTO tickets (id, codigo, asunto, categoria, prioridad, descripcion, tipo_origen, solicitante, cliente) 
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;
            `;

            const resultado = await pool.query(query, [nextId, codigo, asunto, categoria, prioridad, descripcion, tipo_origen, solicitante, cliente || null]);
            const ticketNuevo = resultado.rows[0];
            io.emit('ticketCreado', ticketNuevo);
            res.json(ticketNuevo);
        } catch (error) {
            console.error("Error exacto en la BD:", error);
            res.status(500).json({ error: "Error al crear ticket" });
        }
    });

    // Cambiar estado
    router.put('/:id/estado', async (req, res) => {
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

            io.emit('ticketModificado', ticketNuevo);

            if (estado === 'Resuelto') {
                const usuarioSolicitante = await pool.query('SELECT email FROM usuarios WHERE nombre = $1', [ticketNuevo.solicitante]);
                if (usuarioSolicitante.rows.length > 0) {
                    const emailDestino = usuarioSolicitante.rows[0].email;
                    enviarCorreoResolucion(emailDestino, ticketNuevo);
                }
            }

            res.json(ticketNuevo);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Error al cambiar el estado" });
        }
    });

    // Editar ticket completo
    router.put('/editar/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { asunto, categoria, prioridad, descripcion, tipo_origen, cliente } = req.body;

            if (tipo_origen === 'Externo' && cliente) {
                const clienteGuardado = await pool.query(
                    'INSERT INTO clientes (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING RETURNING *',
                    [cliente]
                );
                if (clienteGuardado.rowCount > 0) {
                    io.emit('clienteCreado', clienteGuardado.rows[0]);
                }
            }

            const query = `
              UPDATE tickets 
              SET asunto = $1, categoria = $2, prioridad = $3, descripcion = $4, tipo_origen = $5, cliente = $6 
              WHERE id = $7 
              RETURNING *;
            `;
            const valores = [asunto, categoria, prioridad, descripcion, tipo_origen, cliente || null, id];

            const resultado = await pool.query(query, valores);
            const ticketNuevo = resultado.rows[0];

            io.emit('ticketModificado', ticketNuevo);
            res.json(ticketNuevo);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Error al editar el ticket" });
        }
    });

    // Asignar técnico
    router.put('/asignar/:id', async (req, res) => {
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

            io.emit('ticketModificado', ticketNuevo);
            res.json(ticketNuevo);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Error al asignar técnico" });
        }
    });

    // Eliminar ticket
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query('DELETE FROM tickets WHERE id = $1', [id]);
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
            const resultado = await pool.query('SELECT * FROM comentarios WHERE ticket_id = $1 ORDER BY fecha ASC', [id]);
            res.json(resultado.rows);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Error al cargar los comentarios" });
        }
    });

    router.post('/:id/comentarios', async (req, res) => {
        try {
            const { id } = req.params;
            const { autor, texto } = req.body;

            const query = `
          INSERT INTO comentarios (ticket_id, autor, texto) 
          VALUES ($1, $2, $3) 
          RETURNING *;
        `;
            const resultado = await pool.query(query, [id, autor, texto]);
            io.emit('nuevoComentario', resultado.rows[0]);
            res.json(resultado.rows[0]);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Error al guardar el comentario" });
        }
    });

    return router;
}
