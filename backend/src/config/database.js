import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
const { Pool } = pg;

// Log database connection attempt
console.log('Attempting to connect to database with:', {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT
});

// Create a connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test the connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully at:', res.rows[0].now);
  }
});

export default pool;
