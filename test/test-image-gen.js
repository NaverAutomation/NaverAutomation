import fs from 'node:fs';
import path from 'node:path';
import db from '../src/server/db/database.js';
import { generateImageWithGemini } from '../src/server/services/ai-service.js';
import { decrypt } from '../src/server/utils/crypto.js';

async function run() {
  console.log('Fetching Gemini API Key from DB...');
  const apiKey = await new Promise((resolve) => {
    db.get(
      "SELECT value FROM settings WHERE key = 'gemini_api_key' ORDER BY user_id DESC LIMIT 1",
      [],
      (err, row) => {
        if (err || !row || !row.value) return resolve(null);
        try {
          resolve(decrypt(row.value));
        } catch (e) {
          console.error('Decryption failed:', e.message);
          resolve(null);
        }
      },
    );
  });

  if (!apiKey) {
    console.error('Gemini API key not found in DB settings.');
    process.exit(1);
  }

  console.log('Gemini API key retrieved. Testing image generation...');
  const keyword = '아늑하고 트렌디한 성수동 카페 인테리어';

  const base64Image = await generateImageWithGemini(apiKey, keyword, '테스트 타이틀', '테스트 본문');

  if (base64Image) {
    const outputPath = path.resolve('./test/ai_test_gen.png');
    fs.writeFileSync(outputPath, Buffer.from(base64Image, 'base64'));
    console.log('IMAGE_GENERATION_SUCCESS:', outputPath);
  } else {
    console.error('Image generation returned null.');
    process.exit(1);
  }

  db.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});