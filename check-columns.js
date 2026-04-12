import db from './src/server/db/database.js';

const tables = ['accounts', 'posts', 'settings'];

tables.forEach(table => {
  db.all(`PRAGMA table_info(${table});`, (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(`Table: ${table}`);
    rows.forEach(row => {
      console.log(`  - ${row.name}: ${row.type} (NOT NULL: ${row.notnull === 1})`);
    });
  });
});

setTimeout(() => db.close(), 1000);
