import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

for (const t of ['permissions', 'users', 'company_info', 'components']) {
  const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
  console.log(`${t.padEnd(14)} ${rows[0].n} rows`);
}
console.log('---');
const [perms] = await conn.query('SELECT name, description FROM permissions ORDER BY name');
console.log('Roles:', perms.map(r => r.name).join(', '));
const [users] = await conn.query('SELECT username, full_name FROM users');
console.log('Users:', users.map(u => `${u.username} (${u.full_name})`).join(', '));
const [sample] = await conn.query('SELECT component_id, name, grade FROM components LIMIT 5');
console.log('Sample components:');
for (const c of sample) console.log(`  ${c.component_id}  ${c.name.padEnd(28)}  ${c.grade}`);

await conn.end();
