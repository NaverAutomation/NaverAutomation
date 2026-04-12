import db from './src/server/db/database.js';
import { decrypt, encrypt } from './src/server/utils/crypto.js';

async function test() {
  const originalKey = 'sk-real-secret-key-1234';
  const encryptedKey = encrypt(originalKey);
  
  // 1. Setup DB
  await new Promise((resolve) => {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['openai_api_key', encryptedKey], resolve);
  });

  // 2. Simulate POST /generate logic
  let apiKey = 'sk-****1234'; // Masked key from body
  let openaiApiKey = apiKey;

  if (!openaiApiKey || openaiApiKey.includes('****')) {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT value FROM settings WHERE key = ?', ['openai_api_key'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (row) openaiApiKey = row.value;
  }

  const decryptedApiKey = decrypt(openaiApiKey);
  console.log('Decrypted key:', decryptedApiKey);
  console.log('Match original:', decryptedApiKey === originalKey);
  
  process.exit(0);
}

test();
