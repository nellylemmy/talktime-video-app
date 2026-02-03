import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
    console.log('[Meeting Service] Database pool connected');
});

pool.on('error', (err) => {
    console.error('[Meeting Service] Unexpected database pool error:', err);
});

export const testConnection = async () => {
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('[Meeting Service] Database connected at:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('[Meeting Service] Database connection error:', error.message);
        return false;
    }
};

export default pool;
