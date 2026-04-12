import db from './src/server/db/database.js';

db.all('SELECT * FROM settings', [], (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const settings = rows.reduce((acc, row) => {
    let value = row.value;
    if (row.key === 'openai_api_key' && value) {
      if (value.length > 8) {
        value = `sk-****${value.slice(-4)}`;
      } else {
        value = 'sk-****';
      }
    }
    return { ...acc, [row.key]: value };
  }, {});
  console.log('Masked settings:', settings);
  process.exit(0);
});
