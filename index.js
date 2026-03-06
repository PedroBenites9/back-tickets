import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt'; // NUEVO: Para encriptar contraseñas
import jwt from 'jsonwebtoken'; // NUEVO: Para crear el token de sesión

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ==========================================
// RUTA DE INSTALACIÓN (Ahora crea Tickets y Usuarios)
// ==========================================
app.get('/api/instalar', async (req, res) => {
    try {
        // 1. Tabla de Usuarios
        await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // 2. Tabla de Tickets
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

// ==========================================
// NUEVO: REGISTRO DE USUARIO (Crear cuenta)
// ==========================================
app.post('/api/registro', async (req, res) => {
    try {
        const { nombre, email, password } = req.body;

        // 1. Verificamos si el correo ya existe en la base de datos
        const usuarioExistente = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (usuarioExistente.rows.length > 0) {
            return res.status(400).json({ error: "Este correo ya está registrado" });
        }

        // 2. Encriptamos la contraseña (el número 10 es el nivel de seguridad/saltos)
        const saltos = 10;
        const passwordEncriptada = await bcrypt.hash(password, saltos);

        // 3. Guardamos al usuario en PostgreSQL con la clave encriptada
        const query = `
      INSERT INTO usuarios (nombre, email, password)
      VALUES ($1, $2, $3)
      RETURNING id, nombre, email; 
    `;
        // Fíjate que devolvemos todo menos la contraseña por seguridad
        const nuevoUsuario = await pool.query(query, [nombre, email, passwordEncriptada]);

        res.status(201).json({ mensaje: "Usuario creado exitosamente", usuario: nuevoUsuario.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno al registrar usuario" });
    }
});

// ==========================================
// NUEVO: LOGIN DE USUARIO (Iniciar sesión)
// ==========================================
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. NUEVO: Asegúrate de pedir la columna "rol" en el SELECT
        const query = 'SELECT id, nombre, email, password, rol FROM usuarios WHERE email = $1';
        const resultado = await pool.query(query, [email]);

        if (resultado.rows.length === 0) {
            return res.status(401).json({ error: "Usuario no encontrado" });
        }

        const usuario = resultado.rows[0];
        const passwordValida = await bcrypt.compare(password, usuario.password);

        if (!passwordValida) {
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }

        // 2. NUEVO: Metemos el rol dentro del pase VIP (Token)
        const token = jwt.sign(
            { id: usuario.id, rol: usuario.rol },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );

        // 3. NUEVO: Le enviamos el rol a React para que sepa qué botones mostrar
        res.json({
            mensaje: "Login exitoso",
            token,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                rol: usuario.rol
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error en el servidor al iniciar sesión" });
    }
});

// ==========================================
// RUTAS DE TICKETS (Quedan exactamente igual)
// ==========================================
app.get('/api/tickets', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM tickets ORDER BY fecha_creacion DESC');
        res.json(resultado.rows);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener los tickets" });
    }
});

app.post('/api/tickets', async (req, res) => {
    try {
        const { asunto, categoria, prioridad, descripcion } = req.body;
        const codigo = "TK-" + Math.floor(Math.random() * 9000 + 1000);
        const query = 'INSERT INTO tickets (codigo, asunto, categoria, prioridad, descripcion) VALUES ($1, $2, $3, $4, $5) RETURNING *;';
        const resultado = await pool.query(query, [codigo, asunto, categoria, prioridad, descripcion]);
        res.status(201).json(resultado.rows[0]);
    } catch (error) {
        res.status(500).json({ error: "Error al crear el ticket" });
    }
});
// ==========================================
// NUEVA RUTA: EDICIÓN COMPLETA DEL TICKET (PUT)
// ==========================================
app.put('/api/tickets/editar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { asunto, categoria, prioridad, descripcion } = req.body;

        const query = `
      UPDATE tickets 
      SET asunto = $1, categoria = $2, prioridad = $3, descripcion = $4 
      WHERE id = $5 
      RETURNING *;
    `;
        const valores = [asunto, categoria, prioridad, descripcion, id];

        const resultado = await pool.query(query, valores);
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al editar el ticket" });
    }
});
app.put('/api/tickets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const query = 'UPDATE tickets SET estado = $1 WHERE id = $2 RETURNING *';
        const resultado = await pool.query(query, [estado, id]);
        res.json(resultado.rows[0]);
    } catch (error) {
        res.status(500).json({ error: "Error al actualizar el ticket" });
    }
});
// ==========================================
// NUEVA RUTA: ASIGNAR TÉCNICO AL TICKET (PUT)
// ==========================================
app.put('/api/tickets/asignar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { tecnico } = req.body;

        const query = `
      UPDATE tickets 
      SET tecnico_asignado = $1 
      WHERE id = $2 
      RETURNING *;
    `;
        const resultado = await pool.query(query, [tecnico, id]);
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al asignar técnico" });
    }
});

app.delete('/api/tickets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM tickets WHERE id = $1', [id]);
        res.json({ mensaje: 'Ticket eliminado correctamente' });
    } catch (error) {
        console.error("Error al eliminar:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// ==========================================
// NUEVAS RUTAS: HISTORIAL DE COMENTARIOS
// ==========================================

// 1. Obtener todos los comentarios de un ticket específico
app.get('/api/tickets/:id/comentarios', async (req, res) => {
    try {
        const { id } = req.params;
        const query = 'SELECT * FROM comentarios WHERE ticket_id = $1 ORDER BY fecha ASC';
        const resultado = await pool.query(query, [id]);
        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al cargar los comentarios" });
    }
});

// 2. Agregar un nuevo comentario a un ticket
app.post('/api/tickets/:id/comentarios', async (req, res) => {
    try {
        const { id } = req.params;
        const { autor, texto } = req.body;

        const query = `
      INSERT INTO comentarios (ticket_id, autor, texto) 
      VALUES ($1, $2, $3) 
      RETURNING *;
    `;
        const resultado = await pool.query(query, [id, autor, texto]);
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al guardar el comentario" });
    }
});
// ==========================================
// NUEVAS RUTAS: GESTIÓN DE USUARIOS (ADMIN)
// ==========================================

// 1. Obtener la lista de todos los usuarios (sin contraseñas por seguridad)
app.get('/api/usuarios', async (req, res) => {
    try {
        const query = 'SELECT id, nombre, email, rol FROM usuarios ORDER BY nombre ASC';
        const resultado = await pool.query(query);
        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener la lista de usuarios" });
    }
});

// 2. Cambiar el rol de un usuario específico
app.put('/api/usuarios/:id/rol', async (req, res) => {
    try {
        const { id } = req.params;
        const { rol } = req.body;

        const query = 'UPDATE usuarios SET rol = $1 WHERE id = $2 RETURNING id, nombre, email, rol';
        const resultado = await pool.query(query, [rol, id]);
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al actualizar el rol del usuario" });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});