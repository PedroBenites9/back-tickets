import express from 'express';
import pool from '../db.js';

const router = express.Router();

router.get('/instalar', async (req, res) => {
  try {
    // MariaDB usa INT AUTO_INCREMENT en vez de SERIAL
    await pool.query(`
          CREATE TABLE IF NOT EXISTS usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            rol VARCHAR(50) DEFAULT 'final',
            area VARCHAR(100) DEFAULT 'Sin Asignar',
            codigo_recuperacion VARCHAR(6),
            vencimiento_codigo DATETIME,
            status INT DEFAULT 1,
            fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

    await pool.query(`
          CREATE TABLE IF NOT EXISTS tickets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            codigo VARCHAR(20) UNIQUE,
            asunto VARCHAR(255) NOT NULL,
            categoria VARCHAR(100) NOT NULL,
            prioridad VARCHAR(50) NOT NULL,
            estado VARCHAR(50) DEFAULT 'Abierto',
            descripcion TEXT,
            tipo_origen VARCHAR(50) DEFAULT 'Interno',
            solicitante VARCHAR(100),
            cliente VARCHAR(150),
            tecnico_asignado VARCHAR(100),
            status INT DEFAULT 1,
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fecha_finalizado TIMESTAMP NULL
          );
        `);

    res.json({ mensaje: "¡Tablas de 'usuarios' y 'tickets' listas en MariaDB!" });
  } catch (error) {
    console.error("Error al instalar tablas:", error);
    res.status(500).json({ error: "Hubo un problema al crear las tablas en MariaDB" });
  }
});

export default router;