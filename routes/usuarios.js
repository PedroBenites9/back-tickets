import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Obtener lista de usuarios
// Obtener lista de usuarios
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT 
                u.id, 
                u.nombre, 
                u.email, 
                u.id_rol, 
                u.id_area,
                r.nombre AS nombre_rol, 
                a.nombre AS nombre_area
            FROM usuarios u
            LEFT JOIN roles r ON u.id_rol = r.id
            LEFT JOIN areas a ON u.id_area = a.id
            WHERE u.status = 1 
            ORDER BY u.nombre ASC
        `;
        const [usuarios] = await pool.query(query);
        res.json(usuarios);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener la lista de usuarios" });
    }
});

//Obtener lista de areas
router.get('/areas', async (req, res) => {
    try {
        const [areas] = await pool.query('SELECT id, codigo, nombre FROM areas WHERE activa = 1 ORDER BY nombre ASC');
        res.json(areas);
    } catch (error) {
        res.status(500).json({ error: "Error obteniendo áreas" });
    }
}); ''
//Obtener lista de roles
router.get('/roles', async (req, res) => {
    try {
        const [roles] = await pool.query('SELECT id, codigo, nombre FROM roles');
        res.json(roles);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener los roles" });
    }
});

// Cambiar el rol de un usuario
router.put('/:id/rol', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_rol } = req.body;
        // 1. Actualizamos el rol usando ?
        await pool.query('UPDATE usuarios SET id_rol = ? WHERE id = ? AND status = 1', [id_rol, id]);

        // 2. Buscamos el usuario actualizado para devolverlo
        const [usuariosActualizados] = await pool.query('SELECT id, nombre, email, id_rol FROM usuarios WHERE id = ? AND status = 1', [id]);

        res.json({
            mensaje: "Rol actualizado exitosamente",
            usuario: usuariosActualizados[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al actualizar el rol del usuario" });
    }
});
// Cambiar el área de un usuario
router.put('/:id/area', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_area } = req.body;

        // 1. Actualizamos el área
        await pool.query('UPDATE usuarios SET id_area = ? WHERE id = ? AND status = 1', [id_area, id]);

        // 2. Devolvemos el usuario fresco para actualizar la tabla de React
        const [usuariosActualizados] = await pool.query('SELECT id, nombre, email, id_rol, id_area FROM usuarios WHERE id = ? AND status = 1', [id]);

        res.json({
            mensaje: "Área actualizada exitosamente",
            usuario: usuariosActualizados[0]
        });
    } catch (error) {
        console.error("Error al actualizar área:", error);
        res.status(500).json({ error: "Error al actualizar el área del usuario" });
    }
});

export default router;