
// AGREGAR AL GITIGNORE

import express from 'express';
import pool from '../db.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 📂 Configuración de Multer para los archivos del chat de las Solicitudes
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'upload', 'solicitudes');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `solicitud-tarjeta-${req.params.id_tarjeta}-${uniqueSuffix}${ext}`);
    }
});
const upload = multer({ storage });

export default function solicitudesRoutes(io) {
    const router = express.Router();

    // ==========================================
    // 1. GESTIÓN DEL TABLERO PRINCIPAL (SOLICITUDES)
    // ==========================================

    // Obtener todas las Solicitudes
    router.get('/', async (req, res) => {
        try {
            const [solicitudes] = await pool.query(`
                SELECT * FROM solicitudes 
                WHERE status = 1 
                ORDER BY fecha_creacion DESC
            `);
            res.json(solicitudes);
        } catch (error) {
            console.error("Error al obtener solicitudes:", error);
            res.status(500).json({ error: "Error al obtener las solicitudes" });
        }
    });

    // Crear una nueva Solicitud (El tablero vacío)
    router.post('/', async (req, res) => {
        try {
            const { titulo, ubicacion, fecha_limite, creador_usuario, cliente_id } = req.body;
            const [resultado] = await pool.query(`
                INSERT INTO solicitudes (titulo, ubicacion, fecha_limite, creador_usuario, cliente_id)
                VALUES (?, ?, ?, ?, ?)
            `, [titulo, ubicacion, fecha_limite || null, creador_usuario, cliente_id || null]);

            const [nuevaSolicitud] = await pool.query('SELECT * FROM solicitudes WHERE id = ?', [resultado.insertId]);
            io.emit('solicitudCreada', nuevaSolicitud[0]); // WebSocket para actualizar en vivo
            res.json(nuevaSolicitud[0]);
        } catch (error) {
            console.error("Error al crear solicitud:", error);
            res.status(500).json({ error: "Error al crear la solicitud" });
        }
    });

    // ==========================================
    // 2. GESTIÓN DE TARJETAS (LAS TAREAS POR ÁREA)
    // ==========================================

    // Obtener las tarjetas de una solicitud específica
    router.get('/:id/tarjetas', async (req, res) => {
        try {
            const { id } = req.params;
            const [tarjetas] = await pool.query(`
                SELECT t.*, a.nombre AS nombre_area 
                FROM solicitud_tarjetas t
                JOIN areas a ON t.id_area = a.id
                WHERE t.solicitud_id = ? AND t.status = 1
                ORDER BY t.fecha_creacion ASC
            `, [id]);
            res.json(tarjetas);
        } catch (error) {
            console.error("Error al obtener tarjetas:", error);
            res.status(500).json({ error: "Error al obtener las tarjetas" });
        }
    });

    // Crear una tarjeta en un Área/Columna
    router.post('/:id/tarjetas', async (req, res) => {
        try {
            const { id } = req.params; // ID de la solicitud padre
            const { id_area, descripcion } = req.body;

            const [resultado] = await pool.query(`
                INSERT INTO solicitud_tarjetas (solicitud_id, id_area, descripcion)
                VALUES (?, ?, ?)
            `, [id, id_area, descripcion]);

            // Actualizamos la solicitud padre a "En Proceso" porque ya tiene tareas
            await pool.query("UPDATE solicitudes SET estado_global = 'En Proceso' WHERE id = ? AND estado_global = 'Pendiente'", [id]);

            const [nuevaTarjeta] = await pool.query(`
                SELECT t.*, a.nombre AS nombre_area FROM solicitud_tarjetas t
                JOIN areas a ON t.id_area = a.id WHERE t.id = ?
            `, [resultado.insertId]);

            io.emit('tarjetaCreada', nuevaTarjeta[0]);
            io.emit('solicitudActualizada', id); // Para refrescar el estado global en el front
            res.json(nuevaTarjeta[0]);
        } catch (error) {
            console.error("Error al crear tarjeta:", error);
            res.status(500).json({ error: "Error al crear la tarjeta" });
        }
    });

    // 🚀 MAGIA DE NEGOCIO: Actualizar estado de Tarjeta y verificar el Padre
    router.put('/tarjetas/:id_tarjeta/estado', async (req, res) => {
        try {
            const { id_tarjeta } = req.params;
            const { estado_tarjeta } = req.body; // Ej: "Completada"

            // 1. Buscamos a qué Solicitud pertenece esta tarjeta
            const [tarjetaInfo] = await pool.query('SELECT solicitud_id FROM solicitud_tarjetas WHERE id = ?', [id_tarjeta]);
            if (tarjetaInfo.length === 0) return res.status(404).json({ error: "Tarjeta no encontrada" });
            const solicitudId = tarjetaInfo[0].solicitud_id;

            // 2. Actualizamos el estado de la tarjeta
            await pool.query('UPDATE solicitud_tarjetas SET estado_tarjeta = ? WHERE id = ?', [estado_tarjeta, id_tarjeta]);

            // 3. LÓGICA DE AUTO-CIERRE: Revisamos si todas las tarjetas de esta Solicitud están "Completada"
            const [tarjetasPendientes] = await pool.query(`
                SELECT COUNT(*) as pendientes FROM solicitud_tarjetas 
                WHERE solicitud_id = ? AND estado_tarjeta != 'Completada' AND status = 1
            `, [solicitudId]);

            let nuevoEstadoGlobal = '';
            if (tarjetasPendientes[0].pendientes === 0) {
                // Si no hay ninguna pendiente, la solicitud entera está Finalizada
                nuevoEstadoGlobal = 'SOLICITUD FINALIZADA';
            } else {
                // Si todavía faltan tarjetas (o alguien desmarcó una), vuelve a En Proceso
                nuevoEstadoGlobal = 'En Proceso';
            }

            // Actualizamos la solicitud padre
            await pool.query('UPDATE solicitudes SET estado_global = ? WHERE id = ?', [nuevoEstadoGlobal, solicitudId]);

            // Devolvemos el estado actualizado al Frontend
            io.emit('tarjetaModificada', { id_tarjeta, estado_tarjeta });
            io.emit('solicitudEstadoCambiado', { id: solicitudId, estado_global: nuevoEstadoGlobal });

            res.json({ message: "Estado actualizado", nuevoEstadoGlobal });
        } catch (error) {
            console.error("Error al cambiar estado de tarjeta:", error);
            res.status(500).json({ error: "Error interno" });
        }
    });

    // ==========================================
    // 3. CHAT INTERNO DE CADA TARJETA
    // ==========================================

    router.get('/tarjetas/:id_tarjeta/chat', async (req, res) => {
        try {
            const [chat] = await pool.query('SELECT * FROM solicitud_chat WHERE tarjeta_id = ? AND status = 1 ORDER BY fecha_creacion ASC', [req.params.id_tarjeta]);
            res.json(chat);
        } catch (error) {
            res.status(500).json({ error: "Error al cargar el chat" });
        }
    });

    router.post('/tarjetas/:id_tarjeta/chat', upload.array('archivos', 5), async (req, res) => {
        try {
            const { id_tarjeta } = req.params;
            const { autor, mensaje } = req.body;

            let archivo_adjunto = null;
            if (req.files && req.files.length > 0) {
                const archivosData = req.files.map(file => ({ ruta: file.path, nombreOriginal: file.originalname }));
                archivo_adjunto = JSON.stringify(archivosData);
            }

            const [resultado] = await pool.query(`
                INSERT INTO solicitud_chat (tarjeta_id, autor, mensaje, archivo_adjunto) VALUES (?, ?, ?, ?)
            `, [id_tarjeta, autor, mensaje, archivo_adjunto]);

            const [nuevoMsj] = await pool.query('SELECT * FROM solicitud_chat WHERE id = ?', [resultado.insertId]);
            io.emit('nuevoMensajeSolicitud', nuevoMsj[0]);
            res.json(nuevoMsj[0]);
        } catch (error) {
            res.status(500).json({ error: "Error al enviar mensaje" });
        }
    });

    return router;
}