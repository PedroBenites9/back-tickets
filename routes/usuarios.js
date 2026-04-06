import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Obtener lista de usuarios
router.get('/', async (req, res) => {
    try {
        const [usuarios] = await pool.query('SELECT id, nombre, email, rol, area FROM usuarios ORDER BY nombre ASC');
        res.json(usuarios);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener la lista de usuarios" });
    }
});

// Cambiar el rol de un usuario
router.put('/:id/rol', async (req, res) => {
    try {
        const { id } = req.params;
        const { rol } = req.body;

        // 1. Actualizamos el rol usando ?
        await pool.query('UPDATE usuarios SET rol = ? WHERE id = ?', [rol, id]);

        // 2. Buscamos el usuario actualizado para devolverlo
        const [usuariosActualizados] = await pool.query('SELECT id, nombre, email, rol FROM usuarios WHERE id = ?', [id]);

        res.json(usuariosActualizados[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al actualizar el rol del usuario" });
    }
});

export default router;