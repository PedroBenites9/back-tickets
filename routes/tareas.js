import express from 'express';
import pool from '../db.js';
import { calcularProximaEjecucion } from '../utils/scheduler.js';

export default function tareaRoutes(io) {
    const router = express.Router();

    // Obtener todas las tareas
    router.get('/', async (req, res) => {
        try {
            const [tareas] = await pool.query('SELECT * FROM tareas_diarias WHERE status = 1 ORDER BY proxima_ejecucion ASC');
            res.json(tareas);
        } catch (error) {
            console.error("Error en GET /api/tareas:", error);
            res.status(500).json({ error: "Error al obtener las tareas diarias" });
        }
    });

    // Crear tarea
    router.post('/', async (req, res) => {
        try {
            const { titulo, categoria, frecuencia, hora_programada, dias_especificos, fecha_unica } = req.body;
            const proxima = calcularProximaEjecucion(frecuencia, hora_programada, dias_especificos, fecha_unica, true);
            const diasJson = dias_especificos ? JSON.stringify(dias_especificos) : '[]';

            const query = `
              INSERT INTO tareas_diarias (titulo, categoria, frecuencia, hora_programada, proxima_ejecucion, dias_especificos, fecha_unica) 
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            const [resultado] = await pool.query(query, [titulo, categoria, frecuencia, hora_programada, proxima, diasJson, fecha_unica || null]);

            // En MariaDB usamos insertId para buscar la fila recién creada
            const [nuevaTareaRows] = await pool.query('SELECT * FROM tareas_diarias WHERE id = ? AND status = 1', [resultado.insertId]);
            const nuevaTarea = nuevaTareaRows[0];

            io.emit('tareaCreada', nuevaTarea);
            res.json(nuevaTarea);
        } catch (error) {
            console.error("Error al crear la tarea:", error);
            res.status(500).json({ error: "Error al crear la tarea" });
        }
    });

    // Iniciar tarea
    router.put('/:id/iniciar', async (req, res) => {
        try {
            const { id } = req.params;
            const query = `
                UPDATE tareas_diarias 
                SET en_pausa = FALSE, 
                    fecha_inicio_real = CURRENT_TIMESTAMP,
                    hora_primer_inicio = COALESCE(hora_primer_inicio, CURRENT_TIMESTAMP), 
                    estado = 'En Curso'
                WHERE id = ? AND status = 1
            `;
            await pool.query(query, [id]);

            const [tareas] = await pool.query('SELECT * FROM tareas_diarias WHERE id = ? AND status = 1', [id]);
            io.emit('tareaModificada', tareas[0]);
            res.json(tareas[0]);
        } catch (error) {
            console.error("Error al iniciar tarea:", error);
            res.status(500).json({ error: "Error al iniciar la tarea" });
        }
    });

    // Pausar tarea
    router.put('/:id/pausar', async (req, res) => {
        try {
            const { id } = req.params;
            const [tareaActual] = await pool.query('SELECT fecha_inicio_real, tiempo_acumulado_minutos FROM tareas_diarias WHERE id = ? AND status = 1', [id]);

            if (tareaActual.length === 0 || !tareaActual[0].fecha_inicio_real) {
                return res.status(400).json({ error: "La tarea no está en curso o no tiene fecha de inicio." });
            }

            // MariaDB: Usamos TIMESTAMPDIFF para calcular los minutos con decimales (segundos / 60)
            const query = `
                UPDATE tareas_diarias 
                SET en_pausa = TRUE,
                    estado = 'Pausada',
                    tiempo_acumulado_minutos = COALESCE(tiempo_acumulado_minutos, 0) + (TIMESTAMPDIFF(SECOND, fecha_inicio_real, CURRENT_TIMESTAMP) / 60.0),
                    fecha_inicio_real = NULL 
                WHERE id = ? AND status = 1
            `;
            await pool.query(query, [id]);

            const [tareas] = await pool.query('SELECT * FROM tareas_diarias WHERE id = ? AND status = 1', [id]);
            io.emit('tareaModificada', tareas[0]);
            res.json(tareas[0]);
        } catch (error) {
            console.error("Error al pausar tarea:", error);
            res.status(500).json({ error: "Error al pausar la tarea" });
        }
    });

    // Completar tarea
    router.put('/:id/completar', async (req, res) => {
        try {
            const { id } = req.params;
            const { usuario } = req.body;

            const [tareaRow] = await pool.query(
                'SELECT titulo, hora_programada, fecha_inicio_real, tiempo_acumulado_minutos, hora_primer_inicio, frecuencia, dias_especificos, fecha_unica FROM tareas_diarias WHERE id = ? AND status = 1',
                [id]
            );

            if (tareaRow.length === 0) return res.status(404).json({ error: "Tarea no encontrada" });

            const { titulo, hora_programada, fecha_inicio_real, tiempo_acumulado_minutos, hora_primer_inicio, frecuencia, dias_especificos, fecha_unica } = tareaRow[0];

            let tiempoFinal = parseFloat(tiempo_acumulado_minutos) || 0;
            if (fecha_inicio_real) {
                const [calcTramo] = await pool.query(
                    "SELECT (TIMESTAMPDIFF(SECOND, ?, CURRENT_TIMESTAMP) / 60.0) AS minutos",
                    [fecha_inicio_real]
                );
                tiempoFinal += parseFloat(calcTramo[0].minutos);
            }

            await pool.query(
                'INSERT INTO historial_tareas (tarea_id, titulo_tarea, usuario_que_completo, tiempo_total_minutos, fecha_inicio) VALUES (?, ?, ?, ?, ?)',
                [id, titulo, usuario || 'Sistema', tiempoFinal, hora_primer_inicio]
            );

            if (frecuencia === 'Fecha Unica') {
                await pool.query("UPDATE tareas_diarias SET estado = 'Completada Definitiva' WHERE id = ? AND status = 1", [id]);
                const [tareas] = await pool.query('SELECT * FROM tareas_diarias WHERE id = ? AND status = 1', [id]);
                io.emit('tareaCompletada', tareas[0]);
                return res.json(tareas[0]);
            }

            const nuevaProxima = calcularProximaEjecucion(frecuencia, hora_programada, dias_especificos, fecha_unica, false);

            const queryReprogramar = `
              UPDATE tareas_diarias 
              SET estado = 'Pendiente', 
                  ultima_vez_completada = CURRENT_TIMESTAMP, 
                  proxima_ejecucion = ?,
                  en_pausa = FALSE,
                  fecha_inicio_real = NULL,
                  tiempo_acumulado_minutos = 0,
                  hora_primer_inicio = NULL
              WHERE id = ? AND status = 1
            `;
            await pool.query(queryReprogramar, [nuevaProxima, id]);

            const [tareas] = await pool.query('SELECT * FROM tareas_diarias WHERE id = ? AND status = 1', [id]);
            io.emit('tareaCompletada', tareas[0]);
            res.json(tareas[0]);
        } catch (error) {
            console.error("Error en completar tarea:", error);
            res.status(500).json({ error: "Error al reprogramar la tarea" });
        }
    });

    // Eliminar tarea
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query('UPDATE historial_tareas SET status = 0 WHERE tarea_id = ?', [id]);
            await pool.query('UPDATE tareas_diarias SET status = 0 WHERE id = ?', [id]);
            io.emit('tareaEliminada', parseInt(id));
            res.json({ mensaje: 'Tarea eliminada correctamente' });
        } catch (error) {
            console.error("Error al eliminar la tarea:", error);
            res.status(500).json({ error: "Error interno al eliminar la tarea" });
        }
    });

    // Editar tarea
    router.put('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { titulo, categoria, frecuencia, hora_programada, dias_especificos, fecha_unica } = req.body;

            const proxima = calcularProximaEjecucion(frecuencia, hora_programada, dias_especificos, fecha_unica, false);
            const diasJson = dias_especificos ? JSON.stringify(dias_especificos) : '[]';

            const query = `
              UPDATE tareas_diarias 
              SET titulo = ?, categoria = ?, frecuencia = ?, hora_programada = ?, proxima_ejecucion = ?, dias_especificos = ?, fecha_unica = ?
              WHERE id = ? AND status = 1
            `;

            const [result] = await pool.query(query, [titulo, categoria, frecuencia, hora_programada, proxima, diasJson, fecha_unica || null, id]);
            if (result.affectedRows === 0) return res.status(404).json({ error: "Tarea no encontrada en la BD" });

            const [tareas] = await pool.query('SELECT * FROM tareas_diarias WHERE id = ? AND status = 1', [id]);

            io.emit('tareaModificada', tareas[0]);
            res.json(tareas[0]);
        } catch (error) {
            console.error("❌ Error al editar la tarea:", error);
            res.status(500).json({ error: "Error en el servidor al actualizar la tarea" });
        }
    });

    // Historial
    router.get('/historial', async (req, res) => {
        try {
            const [historial] = await pool.query('SELECT * FROM historial_tareas WHERE status = 1 ORDER BY fecha_completada DESC');
            res.json(historial);
        } catch (error) {
            res.status(500).json({ error: "Error al obtener el historial" });
        }
    });

    //indicar nueva tarea
    router.get('/indicadores/:nombreUsuario', async (req, res) => {
        const { nombreUsuario } = req.params;
        try {
            // A. Tareas Nuevas (Ahora SÍ filtramos por status = 1)
            const [nuevas] = await pool.query(`
        SELECT id FROM tareas_diarias 
        WHERE status = 1 AND id NOT IN (SELECT tarea_id FROM vistas_tareas WHERE nombre_usuario = ?)
    `, [nombreUsuario]);

            // B. Tareas Atrasadas (Ignorando las borradas)
            const [atrasadas] = await pool.query(`
        SELECT COUNT(*) as total FROM tareas_diarias 
        WHERE proxima_ejecucion < NOW() AND status = 1
    `);

            // C. Tareas Próximas (Ignorando las borradas)
            const [proximas] = await pool.query(`
        SELECT COUNT(*) as total FROM tareas_diarias 
        WHERE proxima_ejecucion >= NOW() AND status = 1
    `);

            res.json({
                cantidadNuevas: nuevas.length,
                idsNuevas: nuevas.map(t => t.id),
                atrasadas: atrasadas[0].total,
                proximas: proximas[0].total
            });
        } catch (error) {
            console.error("Error obteniendo indicadores:", error);
            res.status(500).json({ error: "Error calculando indicadores" });
        }
    });

    //marcar tarea como vista
    router.post('/:id/marcar-vista', async (req, res) => {
        const tareaId = req.params.id;
        const { nombreUsuario } = req.body;
        try {
            await pool.query(`
                INSERT IGNORE INTO vistas_tareas (nombre_usuario, tarea_id) VALUES (?, ?)
            `, [nombreUsuario, tareaId]);
            res.json({ message: "Registro guardado" });
        } catch (error) {
            console.error("Error marcando vista:", error);
            res.status(500).json({ error: "Error al registrar vista" });
        }
    });

    // Ruta para obtener las opciones dinámicas del formulario
    router.get('/configuracion/opciones', async (req, res) => {
        try {
            const [categorias] = await pool.query('SELECT nombre FROM categorias_rutinas');
            const [frecuencias] = await pool.query('SELECT codigo, nombre_mostrar FROM frecuencias_permitidas WHERE activa = 1');
            res.json({
                categorias: categorias.map(c => c.nombre),
                frecuencias: frecuencias
            });
        } catch (error) {
            console.error("Error al obtener opciones:", error);
            res.status(500).json({ error: "No se pudieron cargar las opciones" });
        }
    });
    router.put('/configuracion/frecuencias/:codigo/desactivar', async (req, res) => {
        const { codigo } = req.params;
        await pool.query("UPDATE frecuencias_permitidas SET activa = 0 WHERE codigo = ?", [codigo]);
        res.json({ mensaje: "Frecuencia eliminada con éxito" });
    });
    return router;
}