// db.js
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'username_postgres',
  host: 'host_postgres',
  database: 'nama_database',
  password: 'password_postgres',
  port: 5432,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;
