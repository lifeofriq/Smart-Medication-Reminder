// db.js
const { Pool } = require('pg');

// Ganti parameter sesuai konfigurasi PostgreSQL Railway
const pool = new Pool({
user: 'username_postgres',      // username database
host: 'host_postgres',          // host dari Railway
database: 'nama_database',      // nama database
password: 'password_postgres',  // password database
port: 5432,                     // default port PostgreSQL
});

pool.on('connect', () => {
console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
console.error('Unexpected error on idle client', err);
process.exit(-1);
});

module.exports = pool;
