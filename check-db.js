import db from './src/server/db/database.js';

db.all("SELECT name FROM sqlite_master WHERE type='table';", (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('Tables:', rows.map(r => r.name).join(', '));
  db.close();
});
