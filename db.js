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
    queueLimit: 0
});

export const actualizarBaseDeDatos = async () => {
    try {
        // En MariaDB usamos INT AUTO_INCREMENT en lugar de SERIAL
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id INT AUTO_INCREMENT PRIMARY KEY, 
                nombre VARCHAR(150) UNIQUE NOT NULL
            );
        `);

        // MariaDB (versiones modernas) soporta IF NOT EXISTS en ADD COLUMN
        await pool.query(`
            ALTER TABLE tickets 
            ADD COLUMN IF NOT EXISTS cliente VARCHAR(150);
        `);

        console.log("✅ Base de datos verificada y actualizada (MariaDB).");
    } catch (error) {
        console.error("⚠️ Aviso al actualizar BD:", error.message);
    }
};

export default pool;