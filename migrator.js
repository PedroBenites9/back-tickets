import pool from './db.js'; // Tu conexión actual

const ejecutarMigraciones = async () => {
    console.log("🚀 Iniciando comprobación de base de datos...");

    try {
        // 1. Asegurar columna 'area_origen' en tickets
        // En MariaDB/MySQL no hay "ADD COLUMN IF NOT EXISTS", así que usamos este truco:
        const [columnas] = await pool.query("SHOW COLUMNS FROM tickets LIKE 'area_origen'");
        if (columnas.length === 0) {
            console.log("⚠️ Columna 'area_origen' no encontrada. Agregándola...");
            await pool.query("ALTER TABLE tickets ADD COLUMN area_origen VARCHAR(100) AFTER cliente");
        }

        // 2. Asegurar tabla 'areas' y sus datos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS areas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                codigo VARCHAR(50) NOT NULL UNIQUE,
                nombre VARCHAR(100) NOT NULL,
                activa TINYINT(1) DEFAULT 1
            )
        `);

        // 3. Insertar datos maestros (INSERT IGNORE evita duplicados)
        const areasSincronizar = [
            ['Tesoreria', 'Tesorería'],
            ['Sindico', 'Síndico'],
            ['Tecnologia', 'Tecnología (IT)'],
            ['CoordinadorGral', 'Coordinador Gral.']
            // ... agregar todas las demás
        ];

        console.log("♻️ Sincronizando datos maestros...");
        for (const [codigo, nombre] of areasSincronizar) {
            await pool.query("INSERT IGNORE INTO areas (codigo, nombre) VALUES (?, ?)", [codigo, nombre]);
        }

        console.log("✅ Base de datos actualizada y lista.");
    } catch (error) {
        console.error("❌ Error en la migración automática:", error);
        // Opcional: process.exit(1) si quieres que el Docker falle si la DB no está lista
    }
};

export default ejecutarMigraciones;