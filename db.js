// import pg from 'pg';
// import dotenv from 'dotenv';

// dotenv.config();

// const { Pool } = pg;
// const pool = new Pool({
//     connectionString: process.env.DATABASE_URL,
//     ssl: { rejectUnauthorized: false }
// });

// export const actualizarBaseDeDatos = async () => {
//     try {
//         await pool.query(`CREATE TABLE IF NOT EXISTS clientes (id SERIAL PRIMARY KEY, nombre VARCHAR(150) UNIQUE NOT NULL);`);
//         await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cliente VARCHAR(150);`);
//         console.log("✅ Base de datos actualizada con soporte para Clientes Externos.");
//     } catch (error) {
//         console.error("⚠️ Aviso al actualizar BD:", error.message);
//     }
// };

// export default pool;

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Creamos el Pool de conexiones para MariaDB
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_tickets', // El nombre que Gustavo le ponga a la BD en Docker
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true // Permitir ejecutar el script completo
});

export const actualizarBaseDeDatos = async (intentos = 5) => {
    for (let i = 0; i < intentos; i++) {
        try {
            // 1. Verificar si la tabla 'usuarios' existe
            const [rows] = await pool.query("SHOW TABLES LIKE 'usuarios'");

            if (rows.length === 0) {
                console.log("⚠️ Base de datos vacía. Iniciando generación de tablas desde init.sql...");

                let sqlPath = path.join(__dirname, 'database', 'init.sql');
                if (!fs.existsSync(sqlPath)) {
                    sqlPath = path.join(__dirname, '..', 'database', 'init.sql');
                }

                if (fs.existsSync(sqlPath)) {
                    const sql = fs.readFileSync(sqlPath, 'utf8');
                    await pool.query(sql);
                    console.log("✅ Base de datos generada exitosamente desde init.sql.");
                } else {
                    console.error("❌ No se encontró el archivo init.sql en:", sqlPath);
                }
            } else {
                console.log("✅ Base de datos detectada. Verificando migraciones...");
                // Implementación estilo migration: aseguremos que el campo 'status' existe en todas las tablas
                const tablas = ['usuarios', 'clientes', 'tickets', 'tareas_diarias', 'comentarios', 'historial_tareas'];
                for (const tabla of tablas) {
                    await pool.query(`ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS status INT DEFAULT 1`);
                }

                // Asegurar columnas de recuperación en usuarios
                await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS codigo_recuperacion VARCHAR(6)`);
                await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS vencimiento_codigo DATETIME`);

                // Asegurar que el nombre de cliente sea único para evitar duplicados
                try {

                    await pool.query(`ALTER TABLE clientes ADD UNIQUE (nombre)`);
                    console.log("✅ Columna clientes.nombre ahora es UNIQUE.");
                } catch (e) {
                    // Si ya es UNIQUE o hay duplicados, no hacemos nada (el usuario deberá limpiar si hay duplicados previos)
                    if (e.code !== 'ER_DUP_KEYNAME') {
                        console.warn("⚠️ No se pudo aplicar UNIQUE a clientes.nombre (posibles duplicados previos o ya existe).");
                    }
                }

                console.log("✅ Migraciones de borrado lógico y recuperación verificadas.");
            }
            return; // Éxito, salir del bucle
        } catch (error) {
            console.error(`⚠️ Intento ${i + 1}/${intentos} - Error al conectar/inicializar BD:`, error.message);
            if (i < intentos - 1) {
                console.log("Esperando 5 segundos para reintentar...");
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                console.error("❌ Se agotaron los intentos de conexión con la base de datos.");
            }
        }
    }
};

export default pool;