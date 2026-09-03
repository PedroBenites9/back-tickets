import express from 'express';
import pool from '../db.js';
import { calcularProximaEjecucion } from '../utils/scheduler.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de Multer para evidencias de tareas
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'upload', 'tareas');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `tarea-${req.params.id}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({ storage });

export default function tareaRoutes(io) {
    const router = express.Router();

    // Obtener todas las tareas activas con auto-cierre INTELIGENTE (Por Ciclo)
    router.get('/', async (req, res) => {
        try {
            // REVISIÓN DE CICLOS VENCIDOS
            const [tareasActivas] = await pool.query(`
                SELECT * FROM tareas_diarias 
                WHERE status = 1 
                  AND estado NOT IN ('En Curso', 'Pausada') 
                  AND en_pausa = 0
            `);

            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const diaSemanaHoy = hoy.getDay();

            for (const tarea of tareasActivas) {
                if (!tarea.proxima_ejecucion) continue;

                const fechaProx = new Date(tarea.proxima_ejecucion);
                fechaProx.setHours(0, 0, 0, 0);

                // Si la tarea es de hoy o del futuro, la ignoramos (está al día)
                if (fechaProx >= hoy) continue;

                let cicloVencido = false;

                // LÓGICA DE CICLO: Si hoy volvió a tocar el día de la tarea, el ciclo anterior caducó.
                if (tarea.frecuencia === 'Dias Especificos') {
                    let dias = [];
                    try {
                        dias = typeof tarea.dias_especificos === 'string' ? JSON.parse(tarea.dias_especificos) : tarea.dias_especificos;
                    } catch (e) {
                        dias = tarea.dias_especificos ? tarea.dias_especificos.split(',').map(Number) : [];
                    }

                    if (dias.includes(diaSemanaHoy)) {
                        cicloVencido = true;
                    }
                } else {
                    // Para otras frecuencias (Semanal, etc.), caduca si pasaron 7 días
                    const diasAtraso = Math.floor((hoy - fechaProx) / (1000 * 60 * 60 * 24));
                    if (diasAtraso >= 7) cicloVencido = true;
                }

                if (cicloVencido) {
                    // 1. Mandamos al historial la tarea que nadie hizo en toda la semana
                    await pool.query(`
                        INSERT INTO historial_tareas 
                        (tarea_id, titulo_tarea, usuario_que_completo, tiempo_total_minutos, fecha_inicio, status, fecha_completada, comentario)
                        VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
                    `, [tarea.id, tarea.titulo, 'Sistema (No realizada)', 0, null, 1, 'Rutina no realizada en la fecha estipulada (Salto de ciclo)']);

                    // 2. Reprogramamos la tarea para HOY (su nuevo ciclo)
                    if (tarea.frecuencia === 'Fecha Unica') {
                        await pool.query('UPDATE tareas_diarias SET status = 0 WHERE id = ?', [tarea.id]);
                    } else {
                        let tareaFormateada = { ...tarea };
                        if (typeof tarea.dias_especificos === 'string') {
                            try { tareaFormateada.dias_especificos = JSON.parse(tarea.dias_especificos); } catch (e) { }
                        }
                        try {
                            const nuevaProxima = calcularProximaEjecucion(tareaFormateada);
                            await pool.query('UPDATE tareas_diarias SET proxima_ejecucion = ?, estado = "Pendiente" WHERE id = ?', [nuevaProxima, tarea.id]);
                        } catch (e) {
                            await pool.query('UPDATE tareas_diarias SET estado = "Pendiente" WHERE id = ?', [tarea.id]);
                        }
                    }
                }
            }

            // 2. TRAER DATOS PARA EL FRONTEND
            const [tareas] = await pool.query(`
                SELECT *,
                CASE 
                    WHEN estado = 'En Curso' THEN 'En proceso'
                    WHEN estado = 'Pausada' THEN 'En pausa'
                    ELSE 'Pendiente'
                END as estado_visual
                FROM tareas_diarias 
                WHERE status = 1
            `);

            res.json(tareas);
        } catch (error) {
            console.error("Error al sincronizar tareas:", error);
            res.status(500).json({ error: "Error al obtener el listado de tareas" });
        }
    });

    // Crear tarea
    router.post('/', async (req, res) => {
        try {
            const { titulo, categoria, frecuencia, dias_especificos, fecha_unica, descripcion } = req.body;
            const hora_programada = '00:00';
            let proxima = calcularProximaEjecucion(frecuencia, hora_programada, dias_especificos, fecha_unica, true);

            if (frecuencia === 'Fecha Unica' && !proxima && fecha_unica) {
                proxima = `${fecha_unica} ${hora_programada}`;
            }

            const diasJson = dias_especificos ? JSON.stringify(dias_especificos) : '[]';

            const query = `
              INSERT INTO tareas_diarias (titulo, categoria, frecuencia, hora_programada, proxima_ejecucion, dias_especificos, fecha_unica, descripcion) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const [resultado] = await pool.query(query, [titulo, categoria, frecuencia, hora_programada, proxima, diasJson, fecha_unica || null, descripcion || null]);

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

            if (tareaActual.length === 0) {
                return res.status(404).json({ error: "Tarea no encontrada." });
            }

            const tieneInicioReal = !!tareaActual[0].fecha_inicio_real;

            // MariaDB: Usamos TIMESTAMPDIFF para calcular los minutos con decimales (segundos / 60)
            // Solo acumulamos tiempo si realmente estaba "Iniciada"
            const query = `
                UPDATE tareas_diarias 
                SET en_pausa = TRUE,
                    estado = 'Pausada',
                    tiempo_acumulado_minutos = ${tieneInicioReal ? 'COALESCE(tiempo_acumulado_minutos, 0) + (TIMESTAMPDIFF(SECOND, fecha_inicio_real, CURRENT_TIMESTAMP) / 60.0)' : 'COALESCE(tiempo_acumulado_minutos, 0)'},
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

    // Completar tarea (con comentario y archivos múltiples aditivos)
    router.put('/:id/completar', upload.array('archivos', 5), async (req, res) => {
        try {
            const { id } = req.params;
            const { usuario, comentario, archivosViejos } = req.body;

            // 1. Tomamos los nombres de los archivos NUEVOS
            const nombresNuevos = req.files ? req.files.map(f => f.filename) : [];

            // 2. Tomamos los nombres de los archivos que el usuario decidió MANTENER
            let nombresMantener = [];
            if (archivosViejos) {
                try {
                    nombresMantener = JSON.parse(archivosViejos);
                } catch (e) {
                    nombresMantener = Array.isArray(archivosViejos) ? archivosViejos : [archivosViejos];
                }
            }

            // 3. Unimos ambos grupos
            const totalArchivos = [...nombresMantener, ...nombresNuevos];
            const archivo_adjunto = totalArchivos.length > 0 ? JSON.stringify(totalArchivos) : null;

            const [tareaRow] = await pool.query(
                'SELECT titulo, hora_programada, fecha_inicio_real, tiempo_acumulado_minutos, hora_primer_inicio, frecuencia, dias_especificos, fecha_unica, descripcion FROM tareas_diarias WHERE id = ? AND status = 1',
                [id]
            );

            if (tareaRow.length === 0) return res.status(404).json({ error: "Tarea no encontrada" });

            const { titulo, hora_programada, fecha_inicio_real, tiempo_acumulado_minutos, hora_primer_inicio, frecuencia, dias_especificos, fecha_unica, descripcion } = tareaRow[0];

            let tiempoFinal = parseFloat(tiempo_acumulado_minutos) || 0;
            if (fecha_inicio_real) {
                const [calcTramo] = await pool.query(
                    "SELECT (TIMESTAMPDIFF(SECOND, ?, CURRENT_TIMESTAMP) / 60.0) AS minutos",
                    [fecha_inicio_real]
                );
                tiempoFinal += parseFloat(calcTramo[0].minutos);
            }

            await pool.query(
                'INSERT INTO historial_tareas (tarea_id, titulo_tarea, usuario_que_completo, tiempo_total_minutos, fecha_inicio, comentario, instrucciones_tarea, archivo_adjunto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [id, titulo, usuario || 'Sistema', tiempoFinal, hora_primer_inicio, comentario || null, descripcion || null, archivo_adjunto]
            );

            if (frecuencia === 'Fecha Unica') {
                await pool.query("UPDATE tareas_diarias SET estado = 'Completada Definitiva' WHERE id = ? AND status = 1", [id]);
                const [tareas] = await pool.query('SELECT * FROM tareas_diarias WHERE id = ? AND status = 1', [id]);
                io.emit('tareaCompletada', tareas[0]);
                return res.json(tareas[0]);
            }

            const nuevaProxima = calcularProximaEjecucion(frecuencia, '00:00', dias_especificos, fecha_unica, false);

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
            const { titulo, categoria, frecuencia, dias_especificos, fecha_unica, descripcion, hora_programada } = req.body;

            // 1. Nos aseguramos de tener una hora válida, si no viene del front, usamos 00:00
            const horaSegura = hora_programada ? hora_programada.substring(0, 5) : '00:00';

            // 2. Calculamos la próxima ejecución
            let proxima = calcularProximaEjecucion(frecuencia, horaSegura, dias_especificos, fecha_unica, false);

            // Si es Fecha Única y la función de cálculo falló, armamos el string manualmente
            if (frecuencia === 'Fecha Unica' && !proxima && fecha_unica) {
                proxima = `${fecha_unica} ${horaSegura}`;
            }

            const diasJson = dias_especificos ? JSON.stringify(dias_especificos) : '[]';

            // 3. Hacemos el UPDATE en la base de datos
            const query = `
              UPDATE tareas_diarias 
              SET titulo = ?, categoria = ?, frecuencia = ?, hora_programada = ?, proxima_ejecucion = ?, dias_especificos = ?, fecha_unica = ?, descripcion = ?
              WHERE id = ? AND status = 1
            `;

            const [result] = await pool.query(query, [
                titulo,
                categoria,
                frecuencia,
                horaSegura, // Guardamos la hora limpia
                proxima,    // Guardamos la nueva fecha calculada
                diasJson,
                fecha_unica || null,
                descripcion || null,
                id
            ]);

            if (result.affectedRows === 0) return res.status(404).json({ error: "Tarea no encontrada en la BD" });

            // 4. Traemos la tarea actualizada y la emitimos por WebSockets
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

    router.get('/historial/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const [historial] = await pool.query(
                'SELECT * FROM historial_tareas WHERE tarea_id = ? AND status = 1 ORDER BY fecha_completada DESC',
                [id]
            );
            res.json(historial);
        } catch (error) {
            console.error(`Error al obtener el historial de la tarea ${id}:`, error);
            res.status(500).json({ error: "Error al obtener el historial específico" });
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

            // B. Tareas Atrasadas (Ignorando las borradas Y las que ya están en curso/completadas)
            const [atrasadas] = await pool.query(`
        SELECT COUNT(*) as total FROM tareas_diarias 
        WHERE DATE(IFNULL(proxima_ejecucion, CONCAT(fecha_unica, ' ', hora_programada))) < CURDATE() 
          AND status = 1 
          AND (estado IS NULL OR estado = 'Pendiente')
    `);

            // C. Tareas Próximas (Ignorando las borradas Y finalizadas)
            const [proximas] = await pool.query(`
        SELECT COUNT(*) as total FROM tareas_diarias 
        WHERE DATE(IFNULL(proxima_ejecucion, CONCAT(fecha_unica, ' ', hora_programada))) >= CURDATE() 
          AND status = 1 
          AND (estado IS NULL OR estado = 'Pendiente')
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

    // Ruta para actualizar el usuario asignado
    router.put('/:id/asignar', async (req, res) => {
        const { id } = req.params;
        const { usuario_asignado } = req.body;
        try {
            await pool.query(
                "UPDATE tareas_diarias SET usuario_asignado = ? WHERE id = ?",
                [usuario_asignado, id]
            );

            // Buscamos la tarea actualizada para avisar a todos por bitácora/socket
            const [rows] = await pool.query("SELECT * FROM tareas_diarias WHERE id = ?", [id]);
            if (rows.length > 0) {
                io.emit('tareaModificada', rows[0]);
            }

            // Socket.io emission on task assignment to ensure real-time UI synchronization across clients.
            io.emit('tareaAsignada', { idTarea: id, usuarioAsignado: usuario_asignado });

            res.json({ message: "Usuario asignado con éxito" });
        } catch (error) {
            console.error("Error al asignar usuario:", error);
            res.status(500).json({ error: "Error interno al asignar usuario" });
        }
    });

    // Ruta para obtener el historial de una tarea específica (por su título)
    router.get('/historial/:id', async (req, res) => {
        const { id } = req.params;
        try {
            // 1. Obtenemos el título de la tarea actual
            const [tarea] = await pool.query("SELECT titulo FROM tareas_diarias WHERE id = ?", [id]);
            if (tarea.length === 0) return res.status(404).json({ error: "Tarea no encontrada" });

            const titulo = tarea[0].titulo;

            // 2. Buscamos en el historial todas las ejecuciones de esta tarea
            const [historial] = await pool.query(`
                SELECT * FROM historial_tareas 
                WHERE titulo_tarea = ? 
                ORDER BY fecha_completada DESC 
                LIMIT 50
            `, [titulo]);

            res.json(historial);
        } catch (error) {
            console.error("Error al obtener historial de tarea:", error);
            res.status(500).json({ error: "Error al obtener el historial" });
        }
    });

    router.get('/archivo/*', (req, res) => {
        try {
            // req.params[0] captura todo lo que venga después de /archivo/ 
            // (Ej: "/app/back-tickets/upload/tareas/tarea-5-xxx.xlsx" o "tarea-5-xxx.xlsx")
            const rutaOFilename = req.params[0];

            if (!rutaOFilename) {
                return res.status(400).json({ error: "No se especificó un archivo" });
            }

            // path.basename extrae SOLO el nombre final (tarea-5-xxx.xlsx), 
            // eliminando cualquier carpeta o barra delantera
            const filenameLimpio = path.basename(rutaOFilename);

            // Armamos el camino seguro hacia la carpeta de subidas
            const filePath = path.join(__dirname, '..', 'upload', 'tareas', filenameLimpio);

            // Verificamos si el archivo físico existe en el disco
            if (fs.existsSync(filePath)) {
                return res.download(filePath, filenameLimpio);
            } else {
                console.error(`❌ Archivo no encontrado en el servidor: ${filePath}`);
                return res.status(404).json({ error: "El archivo físico no existe en el servidor" });
            }
        } catch (error) {
            console.error("Error en la descarga de archivo de tarea:", error);
            res.status(500).json({ error: "Error interno al procesar la descarga" });
        }
    });

    return router;
}