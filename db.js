import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export const actualizarBaseDeDatos = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS clientes (id SERIAL PRIMARY KEY, nombre VARCHAR(150) UNIQUE NOT NULL);`);
        await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cliente VARCHAR(150);`);
        console.log("✅ Base de datos actualizada con soporte para Clientes Externos.");
    } catch (error) {
        console.error("⚠️ Aviso al actualizar BD:", error.message);
    }
};

export default pool;
