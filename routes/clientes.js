import express from 'express';
import pool from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM clientes ORDER BY nombre ASC');
        res.json(resultado.rows);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener clientes" });
    }
});

export default router;
