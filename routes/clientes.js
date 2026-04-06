import express from 'express';
import pool from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        // Usamos desestructuración de arreglos [clientes]
        const [clientes] = await pool.query('SELECT * FROM clientes ORDER BY nombre ASC');
        res.json(clientes);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener clientes" });
    }
});

export default router;