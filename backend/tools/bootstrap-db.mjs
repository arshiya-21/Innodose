// One-shot: creates the inodose_test database if it doesn't exist.
// Table creation + seeding happens when the backend starts.
import 'dotenv/config';
import mysql from 'mysql2/promise';

const host = process.env.MYSQL_HOST ?? 'localhost';
const port = Number(process.env.MYSQL_PORT ?? 3306);
const user = process.env.MYSQL_USER ?? 'root';
const password = process.env.MYSQL_PASSWORD ?? '';
const database = process.env.MYSQL_DATABASE ?? 'inodose_test';

const conn = await mysql.createConnection({ host, port, user, password });
await conn.query(
  `CREATE DATABASE IF NOT EXISTS \`${database}\`
   DEFAULT CHARACTER SET utf8mb4
   DEFAULT COLLATE utf8mb4_unicode_ci`,
);
console.log(`Database '${database}' ready on ${host}:${port}.`);
await conn.end();
