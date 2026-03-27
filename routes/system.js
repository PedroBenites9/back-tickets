import express from 'express';
import pool from '../db.js';

const router = express.Router();

router.get('/instalar', async (req, res) => {
    try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

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

export default router;
