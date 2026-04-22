import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Obtener lista de usuarios
router.get('/', async (req, res) => {
    try {
        const [usuarios] = await pool.query('SELECT id, nombre, email, rol, area FROM usuarios WHERE status = 1 ORDER BY nombre ASC');
        res.json(usuarios);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener la lista de usuarios" });
    }
});

//Obtener lista de areas
router.get('/areas', async (req, res) => {
    try {
        const [areas] = await pool.query('SELECT codigo, nombre FROM areas WHERE activa = 1 ORDER BY nombre ASC');
        res.json(areas);
    } catch (error) {
        res.status(500).json({ error: "Error obteniendo áreas" });
    }
});

// Cambiar el rol de un usuario
router.put('/:id/rol', async (req, res) => {
    try {
        const { id } = req.params;
        const { rol } = req.body;

        // 1. Actualizamos el rol usando ?
        await pool.query('UPDATE usuarios SET rol = ? WHERE id = ? AND status = 1', [rol, id]);

        // 2. Buscamos el usuario actualizado para devolverlo
        const [usuariosActualizados] = await pool.query('SELECT id, nombre, email, rol FROM usuarios WHERE id = ? AND status = 1', [id]);

        res.json(usuariosActualizados[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al actualizar el rol del usuario" });
    }
});
// Cambiar el área de un usuario
router.put('/:id/area', async (req, res) => {
    try {
        const { id } = req.params;
        const { area } = req.body;

        // 1. Actualizamos el área
        await pool.query('UPDATE usuarios SET area = ? WHERE id = ? AND status = 1', [area, id]);

        // 2. Devolvemos el usuario fresco para actualizar la tabla de React
        const [usuariosActualizados] = await pool.query('SELECT id, nombre, email, rol, area FROM usuarios WHERE id = ? AND status = 1', [id]);

        res.json(usuariosActualizados[0]);
    } catch (error) {
        console.error("Error al actualizar área:", error);
        res.status(500).json({ error: "Error al actualizar el área del usuario" });
    }
});

export default router;