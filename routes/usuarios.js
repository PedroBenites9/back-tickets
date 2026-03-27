import express from 'express';
import pool from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT id, nombre, email, rol, area FROM usuarios ORDER BY nombre ASC');
        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener la lista de usuarios" });
    }
});

router.put('/:id/rol', async (req, res) => {
    try {
        const { id } = req.params;
        const { rol } = req.body;
        const resultado = await pool.query('UPDATE usuarios SET rol = $1 WHERE id = $2 RETURNING id, nombre, email, rol', [rol, id]);
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al actualizar el rol del usuario" });
    }
});

export default router;
