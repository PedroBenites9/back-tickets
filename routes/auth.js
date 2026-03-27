import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { enviarCorreoMagico } from '../utils/mail.js';

const router = express.Router();

// Registro
router.post('/registro', async (req, res) => {
    try {
        const { nombre, email, password, area } = req.body;
        const usuarioExistente = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (usuarioExistente.rows.length > 0) return res.status(400).json({ error: "Este correo ya está registrado" });

        const saltos = 10;
        const passwordEncriptada = await bcrypt.hash(password, saltos);

        const query = `INSERT INTO usuarios (nombre, email, password, area) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, area`;
        const nuevoUsuario = await pool.query(query, [nombre, email, passwordEncriptada, area || 'Sin Asignar']);
        res.status(201).json({ mensaje: "Usuario creado exitosamente", usuario: nuevoUsuario.rows[0] });
    } catch (error) {
        res.status(500).json({ error: "Error interno al registrar usuario" });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const resultado = await pool.query('SELECT id, nombre, email, password, rol, area FROM usuarios WHERE email = $1', [email]);
        if (resultado.rows.length === 0) return res.status(401).json({ error: "Usuario no encontrado" });

        const usuario = resultado.rows[0];
        if (!await bcrypt.compare(password, usuario.password)) return res.status(401).json({ error: "Contraseña incorrecta" });

        const token = jwt.sign({ id: usuario.id, rol: usuario.rol }, process.env.JWT_SECRET, { expiresIn: '2h' });
        res.json({ mensaje: "Login exitoso", token, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, area: usuario.area } });
    } catch (error) {
        res.status(500).json({ error: "Error en el servidor al iniciar sesión" });
    }
});

// Rutas de recuperación (Vía /auth/...)
router.post('/auth/solicitar-recuperacion', async (req, res) => {
    const { email } = req.body;
    try {
        const usuarioRes = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (usuarioRes.rows.length === 0) return res.status(404).json({ error: "No existe un usuario con ese correo." });

        const codigo = Math.floor(100000 + Math.random() * 900000).toString();
        const vencimiento = new Date();
        vencimiento.setMinutes(vencimiento.getMinutes() + 15);

        await pool.query('UPDATE usuarios SET codigo_recuperacion = $1, vencimiento_codigo = $2 WHERE email = $3', [codigo, vencimiento, email]);

        const htmlContenido = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #0d6efd;">Recuperación de Contraseña</h2>
          <p>Has solicitado restablecer tu contraseña. Tu código de seguridad de 6 dígitos es:</p>
          <div style="font-size: 24px; font-weight: bold; background: #f8f9fa; padding: 10px; text-align: center; letter-spacing: 5px; border-radius: 5px; margin: 20px 0;">${codigo}</div>
          <p style="color: #dc3545; font-size: 0.9em;">Este código expirará en 15 minutos.</p>
        </div>`;

        await enviarCorreoMagico(email, '🔑 Código de Recuperación - Sistema de Tickets', htmlContenido);
        res.json({ mensaje: "Código enviado con éxito." });
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
});

router.post('/auth/cambiar-password', async (req, res) => {
    const { email, codigo, nuevaPassword } = req.body;
    try {
        const usuarioRes = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (usuarioRes.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado." });

        const usuario = usuarioRes.rows[0];
        if (usuario.codigo_recuperacion !== codigo) return res.status(400).json({ error: "El código es incorrecto." });

        const ahora = new Date();
        if (ahora > new Date(usuario.vencimiento_codigo)) return res.status(400).json({ error: "El código ha expirado." });

        const salt = await bcrypt.genSalt(10);
        const passwordEncriptada = await bcrypt.hash(nuevaPassword, salt);

        await pool.query('UPDATE usuarios SET password = $1, codigo_recuperacion = NULL, vencimiento_codigo = NULL WHERE email = $2', [passwordEncriptada, email]);
        res.json({ mensaje: "Contraseña actualizada correctamente." });
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
});

export default router;
