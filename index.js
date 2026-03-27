import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import { actualizarBaseDeDatos } from './db.js';

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

// Inicializar Base de Datos
actualizarBaseDeDatos();

// Montar Rutas
app.use('/api', authRoutes); // Maneja /api/login, /api/registro, /api/solicitar-recuperacion...
app.use('/api/tickets', ticketRoutes(io));
app.use('/api/tareas', tareaRoutes(io));
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api', systemRoutes);

// Servidor
server.listen(PORT, () => {
    console.log(`🚀 Servidor y WebSockets corriendo en el puerto ${PORT}`);
});