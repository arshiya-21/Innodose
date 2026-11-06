// Reads schema of alert_tolerances, alert_users from innodose DB (read-only).
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: 'innodose',
});

for (const t of ['alert_tolerances', 'alert_users', 'alert_alerts', 'machine', 'machines']) {
  try {
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${t}\``);
    console.log(`\n=== ${t} ===`);
    for (const c of cols) console.log(`  ${c.Field.padEnd(30)} ${c.Type.padEnd(28)} null=${c.Null} key=${c.Key} default=${c.Default}`);
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    console.log(`  ${n} rows`);
    if (n > 0) {
      const [sample] = await conn.query(`SELECT * FROM \`${t}\` LIMIT 3`);
      console.log(`  sample: ${JSON.stringify(sample[0], null, 2).slice(0, 400)}`);
    }
  } catch (e) {
    console.log(`\n=== ${t} === (not found: ${e.message.slice(0, 80)})`);
  }
}

await conn.end();
