import { getCachedGlobalSetting, getGlobalSetting, supabase } from '../utils/supabase.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  const token = authHeader.slice(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }

  req.user = user;
  req.token = token;

  // ── Gemini API 키 백그라운드 자동 캐시 충전 (Auto-hydration) ──
  if (!getCachedGlobalSetting('master_gemini_api_key')) {
    getGlobalSetting('master_gemini_api_key', token).catch((e) => {
      console.warn('[Auth/Cache] Background Gemini key prefetch failed:', e.message);
    });
  }

  next();
}
