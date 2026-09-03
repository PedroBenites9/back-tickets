import pool from './db.js';

/**
 * Migración automática: lleva la estructura de la base de datos de producción
 * al estado objetivo definido en init.sql.
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
            '📹 CCTV y Servidores',
            '🌐 Redes',
            '📊 Reportes',
            '🚨 Alarmas',
            '⚡ Cercos eléctricos',
            '🔐 Sistemas de Acceso',
            '⚙️ Procesos',
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
            ['Quincenal', ' Quincenal'],
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
            ['Diaria', 'Todos los días', 0],
            ['Semanal', 'Una vez por semana', 0],
            ['Quincenal', 'Cada 15 días', 1],
            ['Mensual', 'Una vez al mes', 0],
            ['Bimestral', 'Cada 2 meses', 0],
            ['Trimestral', 'Cada 3 meses', 0],
            ['Semestral', 'Cada 6 meses', 0],
            ['Anual', 'Una vez al año', 0],
            ['Dias Especificos', '📅 Días Específicos', 1],
            ['Fecha Unica', '🎯 Fecha Única', 1],
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
            ['Abierto', 'Abierto', 'danger'],
            ['En Proceso', 'En Proceso', 'warning'],
            ['Cerrado Definitivo', 'Cerrado Definitivo', 'dark'],
            ['Resuelto', 'Resuelto', 'success'],
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
            ['admin', 'Administrador'],
            ['tecnico', 'Técnico'],
            ['final', 'Usuario Final'],
            ['auxiliar', 'Auxiliar'],
            ['coordinador', 'Coordinador'],
            ['coordinador_gral', 'Coordinador Gral'],
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
        // 9. Columna 'fecha' en la tabla 'comentarios'
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
        // 10. Eliminar índices UNIQUE duplicados en la tabla 'clientes'
        // ─────────────────────────────────────────────────────────────────────
        console.log("🔍 Verificando índices duplicados en clientes...");
        const duplicados = [];
        for (let i = 2; i <= 63; i++) {
            duplicados.push(`nombre_${i}`);
        }

        const [indexes] = await pool.query("SHOW INDEX FROM clientes");
        const indexNames = new Set(indexes.map(row => row.Key_name));

        for (const idxName of duplicados) {
            if (indexNames.has(idxName)) {
                console.log(`   🗑️  Eliminando índice duplicado: ${idxName}`);
                await pool.query(`ALTER TABLE clientes DROP INDEX \`${idxName}\``);
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // 11S. Columna 'comentario' en 'historial_tareas'
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
        // const [colArchivo] = await pool.query(
        //     "SHOW COLUMNS FROM historial_tareas LIKE 'archivSo_adjunto'"
        // );
        // if (colArchivo.length === 0) {
        //     console.log("⚠️  Columna 'archivo_adjunto' no encontrada en historial_tareas. Agregándola...");
        //     await pool.query(
        //         "ALTER TABLE historial_tareas ADD COLUMN archivo_adjunto VARCHAR(512) AFTER comentario"
        //     );
        // }

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

        // ─────────────────────────────────────────────────────────────────────
        // 15. Normalización de la tabla 'usuarios' (Migración a IDs numéricos)
        // ─────────────────────────────────────────────────────────────────────
        const [colIdRol] = await pool.query(
            "SHOW COLUMNS FROM usuarios LIKE 'id_rol'"
        );

        if (colIdRol.length === 0) {
            console.log("⚠️  Iniciando normalización de usuarios: Agregando id_rol e id_area...");

            await pool.query("ALTER TABLE usuarios ADD COLUMN id_rol INT AFTER password");
            await pool.query("ALTER TABLE usuarios ADD COLUMN id_area INT AFTER id_rol");

            console.log("♻️  Migrando datos de texto a IDs en usuarios sin perder información...");

            await pool.query(`
                UPDATE usuarios u
                JOIN roles r ON u.rol = r.codigo
                SET u.id_rol = r.id
            `);
            await pool.query(`
                UPDATE usuarios u
                JOIN areas a ON u.area = a.codigo
                SET u.id_area = a.id
            `);

            console.log("🗑️  Eliminando columnas de texto antiguas de usuarios...");
            await pool.query("ALTER TABLE usuarios DROP COLUMN rol");
            await pool.query("ALTER TABLE usuarios DROP COLUMN area");

            console.log("🔗 Agregando llaves foráneas a usuarios...");
            await pool.query("ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_rol FOREIGN KEY (id_rol) REFERENCES roles(id)");
            await pool.query("ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_area FOREIGN KEY (id_area) REFERENCES areas(id)");

            console.log("✅ Normalización de usuarios completada con éxito.");
        }

        // ─────────────────────────────────────────────────────────────────────
        // 16. Normalización de la tabla 'tickets' (Migración a IDs numéricos)
        // ─────────────────────────────────────────────────────────────────────
        const [colIdAreaTickets] = await pool.query(
            "SHOW COLUMNS FROM tickets LIKE 'id_area'"
        );

        if (colIdAreaTickets.length === 0) {
            console.log("⚠️  Iniciando normalización de tickets: Agregando id_area...");

            // Agregamos la nueva columna de ID
            await pool.query("ALTER TABLE tickets ADD COLUMN id_area INT AFTER area_origen");

            console.log("♻️  Vinculando tickets con sus IDs de área correspondientes...");

            // Vinculamos cruzando el texto viejo (area_origen) con el nombre o código oficial
            await pool.query(`
                UPDATE tickets t
                JOIN areas a ON t.area_origen = a.codigo OR t.area_origen = a.nombre
                SET t.id_area = a.id
            `);

            console.log("🔗 Agregando llave foránea a tickets...");
            // Aseguramos la integridad referencial
            await pool.query("ALTER TABLE tickets ADD CONSTRAINT fk_tickets_area FOREIGN KEY (id_area) REFERENCES areas(id)");

            console.log("✅ Normalización de tickets completada con éxito.");
        }
        // ─────────────────────────────────────────────────────────────────────
        // 17. Limpieza Inteligente de Tickets Huérfanos (Los que tienen NULL)
        // ─────────────────────────────────────────────────────────────────────
        const [huerfanos] = await pool.query("SELECT COUNT(*) AS total FROM tickets WHERE id_area IS NULL");

        if (huerfanos[0].total > 0) {
            console.log(`⚠️  Se detectaron ${huerfanos[0].total} tickets sin área asignada (NULL). Iniciando rescate...`);

            // Verificamos si la columna vieja todavía existe para intentar rescatar por texto
            const [colAreaVieja] = await pool.query("SHOW COLUMNS FROM tickets LIKE 'area_origen'");
            if (colAreaVieja.length > 0) {
                await pool.query(`
                    UPDATE tickets t
                    JOIN areas a ON t.area_origen LIKE CONCAT('%', a.codigo, '%')
                    SET t.id_area = a.id
                    WHERE t.id_area IS NULL AND t.area_origen IS NOT NULL
                `);
            }

            // Rescate cruzando con la tabla de usuarios
            await pool.query(`
                UPDATE tickets t
                JOIN usuarios u ON t.solicitante = u.nombre
                SET t.id_area = u.id_area
                WHERE t.id_area IS NULL
            `);

            // Fallback: Todo lo que siga en NULL se va a Tecnología (ID 9)
            const [huerfanosRestantes] = await pool.query("SELECT COUNT(*) AS total FROM tickets WHERE id_area IS NULL");
            if (huerfanosRestantes[0].total > 0) {
                console.log(`♻️  Asignando ${huerfanosRestantes[0].total} tickets anónimos a Tecnología (ID: 9)...`);
                await pool.query("UPDATE tickets SET id_area = 9 WHERE id_area IS NULL");
            }
            console.log("✅ Rescate de tickets huérfanos completado.");
        }

        // ─────────────────────────────────────────────────────────────────────
        // 18. Sincronización Dinámica de Áreas y Limpieza Estructural
        // ─────────────────────────────────────────────────────────────────────
        console.log("🔄 Verificando cambios de área en los usuarios...");

        // Compara el id_area del ticket con el id_area actual del creador. 
        // Si el usuario se cambió de área (son distintos), actualiza el ticket.
        const [ticketsActualizados] = await pool.query(`
            UPDATE tickets t
            JOIN usuarios u ON t.solicitante = u.nombre
            SET t.id_area = u.id_area
            WHERE t.id_area != u.id_area
        `);

        if (ticketsActualizados.affectedRows > 0) {
            console.log(`✅ Se actualizaron las áreas de ${ticketsActualizados.affectedRows} tickets porque sus creadores fueron transferidos.`);
        }

        // Borrado final de la columna de texto (Misión cumplida para Gustavo)
        const [colAreaOrigenParaBorrar] = await pool.query("SHOW COLUMNS FROM tickets LIKE 'area_origen'");

        if (colAreaOrigenParaBorrar.length > 0) {
            console.log("🗑️  Eliminando la columna obsoleta 'area_origen' de la tabla tickets...");
            await pool.query("ALTER TABLE tickets DROP COLUMN area_origen");
            console.log("✅ Columna eliminada correctamente. Base de datos 100% normalizada.");
        }
        console.log("✅ Base de datos actualizada y lista.");

        // ─────────────────────────────────────────────────────────────────────
        // 19. Columna 'archivo_adjunto' en 'comentarios'
        // ─────────────────────────────────────────────────────────────────────
        const [colArchivoComentario] = await pool.query(
            "SHOW COLUMNS FROM comentarios LIKE 'archivo_adjunto'"
        );
        if (colArchivoComentario.length === 0) {
            console.log("⚠️  Columna 'archivo_adjunto' no encontrada en comentarios. Agregándola...");
            await pool.query(
                "ALTER TABLE comentarios ADD COLUMN archivo_adjunto VARCHAR(512) DEFAULT NULL AFTER mensaje"
            );
            console.log("✅ Columna 'archivo_adjunto' agregada a comentarios.");
        }
        // ─────────────────────────────────────────────────────────────────────
        // 20. Ampliar columna 'archivo_adjunto' para soportar múltiples archivos
        // ─────────────────────────────────────────────────────────────────────
        console.log("♻️  Ampliando columna 'archivo_adjunto' a TEXT para multi-archivos...");
        await pool.query(
            "ALTER TABLE comentarios MODIFY COLUMN archivo_adjunto TEXT"
        );

        // ─────────────────────────────────────────────────────────────────────
        // 21. Columna 'archivo_adjunto' en 'tickets' (Soporte Multi-Adjunto Inicial)
        // ─────────────────────────────────────────────────────────────────────
        const [colArchivoTicket] = await pool.query(
            "SHOW COLUMNS FROM tickets LIKE 'archivo_adjunto'"
        );
        if (colArchivoTicket.length === 0) {
            console.log("⚠️  Columna 'archivo_adjunto' no encontrada en tickets. Agregándola como TEXT...");
            await pool.query(
                "ALTER TABLE tickets ADD COLUMN archivo_adjunto TEXT DEFAULT NULL AFTER descripcion"
            );
            console.log("✅ Columna 'archivo_adjunto' agregada a tickets.");
        } else {
            // Si la columna ya existía como VARCHAR(512), la transformamos a TEXT para que no corte los JSONs largos
            if (colArchivoTicket[0].Type !== 'text') {
                console.log("♻️  Ampliando columna 'archivo_adjunto' de tickets a TEXT para multi-adjuntos...");
                await pool.query(
                    "ALTER TABLE tickets MODIFY COLUMN archivo_adjunto TEXT"
                );
                console.log("✅ Columna ampliada con éxito.");
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // 22. Columna 'usuario_asignado' en 'tareas_diarias' (Tablero Kanban)
        // ─────────────────────────────────────────────────────────────────────
        const [colUsuarioAsignado] = await pool.query(
            "SHOW COLUMNS FROM tareas_diarias LIKE 'usuario_asignado'"
        );

        if (colUsuarioAsignado.length === 0) {
            console.log("⚠️  Columna 'usuario_asignado' no encontrada en tareas_diarias. Agregándola...");
            await pool.query(
                "ALTER TABLE tareas_diarias ADD COLUMN usuario_asignado VARCHAR(100) DEFAULT NULL"
            );
            console.log("✅ Columna 'usuario_asignado' agregada con éxito a tareas_diarias.");
        } else {
            console.log("✏️  La columna 'usuario_asignado' en tareas_diarias ya existe, saltando...");
        }
        // ─────────────────────────────────────────────────────────────────────
        // 23. Tabla 'solicitudes' (Tablero Padre de Altas de Servicio)
        // ─────────────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS solicitudes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                titulo VARCHAR(255) NOT NULL,
                ubicacion VARCHAR(255) NULL,
                fecha_limite DATETIME NULL,
                creador_usuario VARCHAR(100) NOT NULL,
                estado_global VARCHAR(50) DEFAULT 'Pendiente',
                cliente_id INT NULL,
                status INT DEFAULT 1,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
            )
        `);
        console.log("✅ Tabla 'solicitudes' verificada/creada.");

        // ─────────────────────────────────────────────────────────────────────
        // 24. Tabla 'solicitud_tarjetas' (Tareas / Tarjetas por Área)
        // ─────────────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS solicitud_tarjetas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                solicitud_id INT NOT NULL,
                id_area INT NOT NULL,
                descripcion TEXT NOT NULL,
                tecnico_asignado VARCHAR(100) NULL,
                estado_tarjeta VARCHAR(50) DEFAULT 'Pendiente',
                status INT DEFAULT 1,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE,
                FOREIGN KEY (id_area) REFERENCES areas(id) ON DELETE CASCADE
            )
        `);
        console.log("✅ Tabla 'solicitud_tarjetas' verificada/creada.");

        // ─────────────────────────────────────────────────────────────────────
        // 25. Tabla 'solicitud_chat' (Comunicación dentro de la tarjeta)
        // ─────────────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS solicitud_chat (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tarjeta_id INT NOT NULL,
                autor VARCHAR(100) NOT NULL,
                mensaje TEXT NOT NULL,
                archivo_adjunto JSON NULL,
                status INT DEFAULT 1,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tarjeta_id) REFERENCES solicitud_tarjetas(id) ON DELETE CASCADE
            )
        `);
        console.log("✅ Tabla 'solicitud_chat' verificada/creada.");

        // ─────────────────────────────────────────────────────────────────────
        // 26. Columna 'instrucciones_tarea' en 'historial_tareas'
        // ─────────────────────────────────────────────────────────────────────
        const [colInstrucciones] = await pool.query(
            "SHOW COLUMNS FROM historial_tareas LIKE 'instrucciones_tarea'"
        );
        if (colInstrucciones.length === 0) {
            console.log("⚠️  Columna 'instrucciones_tarea' no encontrada en historial_tareas. Agregándola...");
            await pool.query(
                "ALTER TABLE historial_tareas ADD COLUMN instrucciones_tarea TEXT AFTER titulo_tarea"
            );
            console.log("✅ Columna 'instrucciones_tarea' agregada a historial_tareas.");
        }

    } catch (error) {
        console.error("❌ Error en la migración automática:", error);
        // Descomenta la siguiente línea si quieres que el contenedor falle
        // ante un error de migración (útil en producción):
        // process.exit(1);
    }
};

export default ejecutarMigraciones;