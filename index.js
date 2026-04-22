import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import { actualizarBaseDeDatos } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importar Rutas
import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import tareaRoutes from './routes/tareas.js';
import usuarioRoutes from './routes/usuarios.js';
import clienteRoutes from './routes/clientes.js';
import systemRoutes from './routes/system.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar Servidor HTTP y Socket.io
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar Base de Datos
actualizarBaseDeDatos();

// Montar Rutas
app.use('/api', authRoutes); // Maneja /api/login, /api/registro, /api/solicitar-recuperacion...
app.use('/api/tickets', ticketRoutes(io));
app.use('/api/tareas', tareaRoutes(io));
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api', systemRoutes);

// Manejar rutas del frontend (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Areas
(async () => {
    try {
        // 1. Crear tabla si no existe
        await pool.query(`
      CREATE TABLE IF NOT EXISTS areas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL UNIQUE,
        nombre VARCHAR(100) NOT NULL,
        activa TINYINT(1) DEFAULT 1
      )
    `);

        // 2. Cargar áreas iniciales
        const iniciales = [
            ['Tesoreria', 'Tesorería'],
            ['Sindico', 'Síndico'],
            ['Operaciones', 'Operaciones'],
            ['Comercial', 'Comercial'],
            ['Logistica', 'Logística'],
            ['RRHH', 'RRHH'],
            ['Incorporaciones', 'Incorporaciones'],
            ['Habilitaciones', 'Habilitaciones'],
            ['Tecnologia', 'Tecnología (IT)'],
            ['Presidencia', 'Presidencia'],
            ['CoordinadorGral', 'Coordinador Gral.']
        ];

        await pool.query('INSERT IGNORE INTO areas (codigo, nombre) VALUES ?', [iniciales]);
        console.log("🚀 Base de Datos: Tabla de áreas lista y cargada.");
    } catch (err) {
        console.error("❌ Error de inicialización DB:", err);
    }
})();

// Servidor
server.listen(PORT, () => {
    console.log(`🚀 Servidor y WebSockets corriendo en el puerto ${PORT}`);
});