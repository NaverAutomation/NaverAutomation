import { supabase } from './supabase.js';

export async function apiFetch(url, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    if (token && data.error === '유효하지 않은 토큰입니다.') {
      // 비밀번호 변경 등으로 기존 세션이 만료/무효화된 경우 로그아웃 처리 후 재로드
      await supabase.auth.signOut().catch(() => {});
      window.location.reload();
    }
    throw new Error(data.error || '인증 오류');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '서버 오류');
  return data;
}
