import pg from 'pg';

const { Pool } = pg;

// Read-only connection pool
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'talktime_user',
    password: process.env.DB_PASSWORD || 'talktime_secure_pass_2024',
    database: process.env.DB_DATABASE || 'talktimedb',
    port: parseInt(process.env.DB_PORT || '5432'),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

export const testConnection = async () => {
    try {
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        console.log('[Analytics Service] Database connected (read-only mode)');
        return true;
    } catch (error) {
        console.error('[Analytics Service] Database connection error:', error.message);
        return false;
    }
};

export default pool;
