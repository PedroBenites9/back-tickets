import pool from './db.js';

/**
 * Migración automática: lleva la estructura de la base de datos de producción
 * al estado objetivo definido en init.sql.
 *
 * Cambios que aplica:
 *  1.  Crea la tabla 'areas' si no existe e inserta los datos maestros.
 *  2.  Crea la tabla 'categorias_rutinas' si no existe e inserta los datos maestros.
 *  3.  Crea la tabla 'frecuencias_permitidas' si no existe e inserta los datos maestros.
 *  4.  Agrega la columna 'activa' a 'frecuencias_permitidas' si no existe.
 *  5.  Inserta los registros faltantes en 'frecuencias_permitidas' (Diaria, Semanal, etc.).
 *  6.  Crea la tabla 'estados_ticket' si no existe e inserta los datos maestros.
 *  7.  Crea la tabla 'roles' si no existe e inserta los datos maestros.
 *  8.  Crea la tabla 'vistas_tareas' si no existe.
 *  9.  Agrega la columna 'area_origen' a 'tickets' si no existe.
 *  10. Agrega la columna 'fecha' a 'comentarios' si no existe.
 *  11. Elimina los índices UNIQUE duplicados de la tabla 'clientes'.
 *  12. Agrega la columna 'comentario' a 'historial_tareas' si no existe.
 *  13. Agrega la columna 'archivo_adjunto' a 'historial_tareas' si no existe.
 *  14. Agrega la columna 'descripcion' a 'tareas_diarias' si no existe.
 */
const ejecutarMigraciones = async () => {
    console.log("🚀 Iniciando comprobación de base de datos...");

    try {
        // ─────────────────────────────────────────────────────────────────────
        // 1. Tabla 'areas'
        // ─────────────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS areas (
                id     INT AUTO_INCREMENT PRIMARY KEY,
                codigo VARCHAR(50)  NOT NULL UNIQUE,
                nombre VARCHAR(100) NOT NULL,
                activa TINYINT(1)   DEFAULT 1
            )
        `);

        const areasMaestras = [
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
            ['CoordinadorGral', 'Coordinador Gral.'],
        ];

        console.log("♻️  Sincronizando áreas...");
        for (const [codigo, nombre] of areasMaestras) {
            await pool.query(
                "INSERT IGNORE INTO areas (codigo, nombre) VALUES (?, ?)",
                [codigo, nombre]
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // 2. Tabla 'categorias_rutinas'
        // ─────────────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categorias_rutinas (
                id     INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL UNIQUE
            )
        `);

        const categoriasMaestras = [
            '🧹 Limpieza / General',
            '📹 CCTV y Serdonde está dores',
            '🌐 Redes',
            '📊 Reportes',
        ];

        console.log("♻️  Sincronizando categorías de rutinas...");
        for (const nombre of categoriasMaestras) {
            await pool.query(
                "INSERT IGNORE INTO categorias_rutinas (nombre) VALUES (?)",
                [nombre]
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // 3. Tabla 'frecuencias_permitidas'
        // ─────────────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS frecuencias_permitidas (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                codigo        VARCHAR(50)  NOT NULL UNIQUE,
                nombre_mostrar VARCHAR(100) NOT NULL
            )
        `);

        const frecuenciasMaestras = [
            ['Dias Especificos', '📅 Días Específicos'],
            ['Fecha Unica', '🎯 Fecha Única'],
        ];

        console.log("♻️  Sincronizando frecuencias permitidas...");
        for (const [codigo, nombre_mostrar] of frecuenciasMaestras) {
            await pool.query(
                "INSERT IGNORE INTO frecuencias_permitidas (codigo, nombre_mostrar) VALUES (?, ?)",
                [codigo, nombre_mostrar]
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // 4. Columna 'activa' en 'frecuencias_permitidas'
        // ─────────────────────────────────────────────────────────────────────
        const [colActiva] = await pool.query(
            "SHOW COLUMNS FROM frecuencias_permitidas LIKE 'activa'"
        );
        if (colActiva.length === 0) {
            console.log("⚠️  Columna 'activa' no encontrada en frecuencias_permitidas. Agregándola...");
            await pool.query(
                "ALTER TABLE frecuencias_permitidas ADD COLUMN activa TINYINT(1) DEFAULT 1"
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // 5. Registros completos en 'frecuencias_permitidas'
        // ─────────────────────────────────────────────────────────────────────
        const frecuenciasCompletas = [
            ['Diaria',          'Todos los días',        0],
            ['Semanal',         'Una vez por semana',    0],
            ['Mensual',         'Una vez al mes',        0],
            ['Bimestral',       'Cada 2 meses',          0],
            ['Trimestral',      'Cada 3 meses',          0],
            ['Semestral',       'Cada 6 meses',          0],
            ['Anual',           'Una vez al año',        0],
            ['Dias Especificos','📅 Días Específicos',   1],
            ['Fecha Unica',     '🎯 Fecha Única',        1],
        ];

        console.log("♻️  Sincronizando frecuencias completas...");
        for (const [codigo, nombre_mostrar, activa] of frecuenciasCompletas) {
            await pool.query(
                "INSERT IGNORE INTO frecuencias_permitidas (codigo, nombre_mostrar, activa) VALUES (?, ?, ?)",
                [codigo, nombre_mostrar, activa]
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // 6. Tabla 'estados_ticket'
        // ─────────────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS estados_ticket (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                codigo      VARCHAR(50) NOT NULL UNIQUE,
                nombre      VARCHAR(50) NOT NULL,
                color_badge VARCHAR(50) DEFAULT 'secondary'
            )
        `);

        const estadosMaestros = [
            ['Abierto',            'Abierto',            'danger'],
            ['En Proceso',         'En Proceso',         'warning'],
            ['Cerrado Definitivo', 'Cerrado Definitivo', 'dark'],
            ['Resuelto',           'Resuelto',           'success'],
        ];

        console.log("♻️  Sincronizando estados de ticket...");
        for (const [codigo, nombre, color_badge] of estadosMaestros) {
            await pool.query(
                "INSERT IGNORE INTO estados_ticket (codigo, nombre, color_badge) VALUES (?, ?, ?)",
                [codigo, nombre, color_badge]
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // 7. Tabla 'roles'
        // ─────────────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id     INT AUTO_INCREMENT PRIMARY KEY,
                codigo VARCHAR(50) NOT NULL UNIQUE,
                nombre VARCHAR(50) NOT NULL
            )
        `);

        const rolesMaestros = [
            ['admin',   'Administrador'],
            ['tecnico', 'Técnico'],
            ['final',   'Usuario Final'],
        ];

        console.log("♻️  Sincronizando roles...");
        for (const [codigo, nombre] of rolesMaestros) {
            await pool.query(
                "INSERT IGNORE INTO roles (codigo, nombre) VALUES (?, ?)",
                [codigo, nombre]
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // 8. Tabla 'vistas_tareas'
        // ─────────────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS vistas_tareas (
                nombre_usuario VARCHAR(100) NOT NULL,
                tarea_id       INT NOT NULL,
                fecha_vista    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (nombre_usuario, tarea_id),
                FOREIGN KEY (tarea_id) REFERENCES tareas_diarias(id) ON DELETE CASCADE
            )
        `);

        // ─────────────────────────────────────────────────────────────────────
        // 9. Columna 'area_origen' en la tabla 'tickets'
        // ─────────────────────────────────────────────────────────────────────
        const [colAreaOrigen] = await pool.query(
            "SHOW COLUMNS FROM tickets LIKE 'area_origen'"
        );
        if (colAreaOrigen.length === 0) {
            console.log("⚠️  Columna 'area_origen' no encontrada en tickets. Agregándola...");
            await pool.query(
                "ALTER TABLE tickets ADD COLUMN area_origen VARCHAR(100) AFTER cliente"
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // 10. Columna 'fecha' en la tabla 'comentarios'
        // ─────────────────────────────────────────────────────────────────────
        const [colFecha] = await pool.query(
            "SHOW COLUMNS FROM comentarios LIKE 'fecha'"
        );
        if (colFecha.length === 0) {
            console.log("⚠️  Columna 'fecha' no encontrada en comentarios. Agregándola...");
            await pool.query(
                "ALTER TABLE comentarios ADD COLUMN fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER mensaje"
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // 11. Eliminar índices UNIQUE duplicados en la tabla 'clientes'
        //     (nombre_2 … nombre_63 son artefactos del dump de producción)
        // ─────────────────────────────────────────────────────────────────────
        console.log("🔍 Verificando índices duplicados en clientes...");
        const duplicados = [];
        for (let i = 2; i <= 63; i++) {
            duplicados.push(`nombre_${i}`);
        }

        // Recuperamos los índices actuales de la tabla
        const [indexes] = await pool.query("SHOW INDEX FROM clientes");
        const indexNames = new Set(indexes.map(row => row.Key_name));

        for (const idxName of duplicados) {
            if (indexNames.has(idxName)) {
                console.log(`   🗑️  Eliminando índice duplicado: ${idxName}`);
                await pool.query(`ALTER TABLE clientes DROP INDEX \`${idxName}\``);
            }
        }
        
        // ─────────────────────────────────────────────────────────────────────
        // 12. Columna 'comentario' en 'historial_tareas'
        // ─────────────────────────────────────────────────────────────────────
        const [colComentario] = await pool.query(
            "SHOW COLUMNS FROM historial_tareas LIKE 'comentario'"
        );
        if (colComentario.length === 0) {
            console.log("⚠️  Columna 'comentario' no encontrada en historial_tareas. Agregándola...");
            await pool.query(
                "ALTER TABLE historial_tareas ADD COLUMN comentario TEXT AFTER fecha_completada"
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // 13. Columna 'archivo_adjunto' en 'historial_tareas'
        // ─────────────────────────────────────────────────────────────────────
        const [colArchivo] = await pool.query(
            "SHOW COLUMNS FROM historial_tareas LIKE 'archivo_adjunto'"
        );
        if (colArchivo.length === 0) {
            console.log("⚠️  Columna 'archivo_adjunto' no encontrada en historial_tareas. Agregándola...");
            await pool.query(
                "ALTER TABLE historial_tareas ADD COLUMN archivo_adjunto VARCHAR(512) AFTER comentario"
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // 14. Columna 'descripcion' en 'tareas_diarias'
        // ─────────────────────────────────────────────────────────────────────
        const [colDescTarea] = await pool.query(
            "SHOW COLUMNS FROM tareas_diarias LIKE 'descripcion'"
        );
        if (colDescTarea.length === 0) {
            console.log("⚠️  Columna 'descripcion' no encontrada en tareas_diarias. Agregándola...");
            await pool.query(
                "ALTER TABLE tareas_diarias ADD COLUMN descripcion TEXT AFTER titulo"
            );
        }

        console.log("✅ Base de datos actualizada y lista.");

    } catch (error) {
        console.error("❌ Error en la migración automática:", error);
        // Descomenta la siguiente línea si quieres que el contenedor falle
        // ante un error de migración (útil en producción):
        // process.exit(1);
    }
};

export default ejecutarMigraciones;