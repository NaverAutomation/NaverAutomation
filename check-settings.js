import db from './src/server/db/database.js';

db.all("SELECT * FROM settings;", (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('Settings:', rows);
  db.close();
});
