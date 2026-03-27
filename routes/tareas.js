import express from 'express';
import pool from '../db.js';
import { calcularProximaEjecucion } from '../utils/scheduler.js';

export default function tareaRoutes(io) {
    const router = express.Router();

    // Obtener todas las tareas
    router.get('/', async (req, res) => {
        try {
            const resultado = await pool.query('SELECT * FROM tareas_diarias ORDER BY proxima_ejecucion ASC');
            res.json(resultado.rows);
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
              VALUES ($1, $2, $3, $4, $5, $6, $7) 
              RETURNING *;
            `;
            const resultado = await pool.query(query, [titulo, categoria, frecuencia, hora_programada, proxima, diasJson, fecha_unica || null]);

            io.emit('tareaCreada', resultado.rows[0]);
            res.json(resultado.rows[0]);
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
                WHERE id = $1 
                RETURNING *;
            `;
            const resultado = await pool.query(query, [id]);
            io.emit('tareaModificada', resultado.rows[0]);
            res.json(resultado.rows[0]);
        } catch (error) {
            console.error("Error al iniciar tarea:", error);
            res.status(500).json({ error: "Error al iniciar la tarea" });
        }
    });

    // Pausar tarea
    router.put('/:id/pausar', async (req, res) => {
        try {
            const { id } = req.params;
            const tareaActual = await pool.query('SELECT fecha_inicio_real, tiempo_acumulado_minutos FROM tareas_diarias WHERE id = $1', [id]);

            if (tareaActual.rows.length === 0 || !tareaActual.rows[0].fecha_inicio_real) {
                return res.status(400).json({ error: "La tarea no está en curso o no tiene fecha de inicio." });
            }

            const query = `
                UPDATE tareas_diarias 
                SET en_pausa = TRUE,
                    estado = 'Pausada',
                    tiempo_acumulado_minutos = COALESCE(tiempo_acumulado_minutos, 0) + EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - fecha_inicio_real))/60,
                    fecha_inicio_real = NULL 
                WHERE id = $1 
                RETURNING *;
            `;
            const resultado = await pool.query(query, [id]);
            io.emit('tareaModificada', resultado.rows[0]);
            res.json(resultado.rows[0]);
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

            const tareaRow = await pool.query(
                'SELECT titulo, hora_programada, fecha_inicio_real, tiempo_acumulado_minutos, hora_primer_inicio, frecuencia, dias_especificos, fecha_unica FROM tareas_diarias WHERE id = $1',
                [id]
            );

            if (tareaRow.rows.length === 0) return res.status(404).json({ error: "Tarea no encontrada" });

            const { titulo, hora_programada, fecha_inicio_real, tiempo_acumulado_minutos, hora_primer_inicio, frecuencia, dias_especificos, fecha_unica } = tareaRow.rows[0];

            let tiempoFinal = parseFloat(tiempo_acumulado_minutos) || 0;
            if (fecha_inicio_real) {
                const calcTramo = await pool.query(
                    "SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - $1::timestamp))/60 AS minutos",
                    [fecha_inicio_real]
                );
                tiempoFinal += parseFloat(calcTramo.rows[0].minutos);
            }

            await pool.query(
                'INSERT INTO historial_tareas (tarea_id, titulo_tarea, usuario_que_completo, tiempo_total_minutos, fecha_inicio) VALUES ($1, $2, $3, $4, $5)',
                [id, titulo, usuario || 'Sistema', tiempoFinal, hora_primer_inicio]
            );

            if (frecuencia === 'Fecha Unica') {
                const resultado = await pool.query("UPDATE tareas_diarias SET estado = 'Completada Definitiva' WHERE id = $1 RETURNING *", [id]);
                io.emit('tareaCompletada', resultado.rows[0]);
                return res.json(resultado.rows[0]);
            }

            const nuevaProxima = calcularProximaEjecucion(frecuencia, hora_programada, dias_especificos, fecha_unica, false);

            const queryReprogramar = `
              UPDATE tareas_diarias 
              SET estado = 'Pendiente', 
                  ultima_vez_completada = CURRENT_TIMESTAMP, 
                  proxima_ejecucion = $1::timestamp,
                  en_pausa = FALSE,
                  fecha_inicio_real = NULL,
                  tiempo_acumulado_minutos = 0,
                  hora_primer_inicio = NULL
              WHERE id = $2 RETURNING *;
            `;
            const resultado = await pool.query(queryReprogramar, [nuevaProxima, id]);

            io.emit('tareaCompletada', resultado.rows[0]);
            res.json(resultado.rows[0]);
        } catch (error) {
            console.error("Error en completar tarea:", error);
            res.status(500).json({ error: "Error al reprogramar la tarea" });
        }
    });

    // Eliminar tarea
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query('DELETE FROM historial_tareas WHERE tarea_id = $1', [id]);
            await pool.query('DELETE FROM tareas_diarias WHERE id = $1', [id]);
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
              SET titulo = $1, categoria = $2, frecuencia = $3, hora_programada = $4, proxima_ejecucion = $5, dias_especificos = $6, fecha_unica = $7
              WHERE id = $8 
              RETURNING *;
            `;

            const result = await pool.query(query, [titulo, categoria, frecuencia, hora_programada, proxima, diasJson, fecha_unica || null, id]);
            if (result.rows.length === 0) return res.status(404).json({ error: "Tarea no encontrada en la BD" });

            io.emit('tareaModificada', result.rows[0]);
            res.json(result.rows[0]);
        } catch (error) {
            console.error("❌ Error al editar la tarea:", error);
            res.status(500).json({ error: "Error en el servidor al actualizar la tarea" });
        }
    });

    // Historial
    router.get('/historial', async (req, res) => {
        try {
            const resultado = await pool.query('SELECT * FROM historial_tareas ORDER BY fecha_completada DESC');
            res.json(resultado.rows);
        } catch (error) {
            res.status(500).json({ error: "Error al obtener el historial" });
        }
    });

    return router;
}
