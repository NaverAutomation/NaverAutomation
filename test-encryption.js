import db from './src/server/db/database.js';
import { encrypt } from './src/server/utils/crypto.js';

const key = 'openai_api_key';
const value = 'sk-new-test-key-12345678';

const encryptedValue = encrypt(value);
db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, encryptedValue], (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log('Stored value:', row.value);
    console.log('Is encrypted (contains :):', row.value.includes(':'));
    process.exit(0);
  });
});
