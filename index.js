import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. IMPORTANTE: Cambiamos 'require' por 'import'
import { actualizarBaseDeDatos } from './db.js';
import pool from './db.js';
import ejecutarMigraciones from './migrator.js';

// Importar Rutas
import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import tareaRoutes from './routes/tareas.js';
import usuarioRoutes from './routes/usuarios.js';
import clienteRoutes from './routes/clientes.js';
import systemRoutes from './routes/system.js';
import solicitudesRoutes from './routes/solicitudes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3010;

// Configurar Servidor HTTP y Socket.io
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Middlewares (SIEMPRE van antes de las rutas)
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));
import fs from 'fs';

// Helper para servir archivos con nombre personalizado
const servirArchivoConNombre = (req, res, directorio) => {
    const filename = req.params.filename;
    const itemName = req.query.name || req.query.ticketName; // Soporte genérico para ticketName o name
    const filePath = path.join(directorio, filename);

    if (fs.existsSync(filePath)) {
        if (itemName) {
            const ext = path.extname(filename);
            // Formato de fecha YYYY-MM-DD_HH-MM-SS
            const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
            const cleanName = itemName.replace(/[^a-zA-Z0-9_\-\s]/g, '_').trim();
            const downloadName = `${cleanName}_${dateStr}${ext}`;

            res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
        }
        res.sendFile(filePath);
    } else {
        res.status(404).send('Archivo no encontrado');
    }
};

app.get('/api/tareas/archivo/:filename', (req, res) => servirArchivoConNombre(req, res, path.join(__dirname, 'upload/tareas')));
app.get('/api/tickets/archivo/:filename', (req, res) => servirArchivoConNombre(req, res, path.join(__dirname, 'upload/tickets')));


// Montar Rutas
app.use('/api', authRoutes);
app.use('/api/tickets', ticketRoutes(io));
app.use('/api/tareas', tareaRoutes(io));
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api', systemRoutes);
app.use('/api/solicitudes', solicitudesRoutes(io));

// Manejar rutas del frontend (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// FUNCIÓN PRINCIPAL DE ARRANQUE SEGURO
// ==========================================
const iniciarServidor = async () => {
    let intentos = 10;

    while (intentos > 0) {
        try {
            await pool.query('SELECT 1');
            console.log('✅ Base de datos conectada.');

            // Ejecutamos tu función antigua (si aún la usás)
            actualizarBaseDeDatos();

            // 2. EJECUTAMOS EL NUEVO SCRIPT DE MIGRACIÓN
            await ejecutarMigraciones();

            // 3. Levantamos el servidor (Solo UNA vez y usando 'server' por los Sockets)
            server.listen(PORT, () => {
                console.log(`🚀 Servidor y WebSockets corriendo en el puerto ${PORT}`);
            });

            // Si todo salió bien, rompemos el bucle de reintentos
            break;

        } catch (error) {
            intentos--;
            console.warn(`⏳ Base de datos no lista. Reintentando en 5s... (Quedan: ${intentos})`);

            if (intentos === 0) {
                console.error('❌ Error fatal: La base de datos nunca respondió.', error);
                process.exit(1);
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

iniciarServidor();