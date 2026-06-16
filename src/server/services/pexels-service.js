/**
 * Pexels API 서비스
 */

/**
 * 픽셀스 이미지 검색 함수
 * @param {string} apiKey Pexels API Key
 * @param {string} query 검색어 (키워드)
 * @param {number} perPage 검색할 이미지 수 (기본 4장)
 * @returns {Promise<string[]>} 이미지 URL 배열
 */
export async function searchPexelsImages(apiKey, query, perPage = 4) {
  if (!apiKey || apiKey === 'YOUR_KEY_HERE') {
    console.warn('[Pexels] API Key가 유효하지 않습니다.');
    return [];
  }

  if (!query) {
    return [];
  }

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}`;

  // 8초 타임아웃 설정을 위한 AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    console.log(`[Pexels] Searching images for query: "${query}" (perPage: ${perPage})`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: apiKey,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Pexels API HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data && Array.isArray(data.photos)) {
      // 블로그 게시글 본문에 적합한 'large' 크기 이미지 URL을 추출합니다.
      const urls = data.photos
        .map((photo) => photo.src?.large || photo.src?.medium || photo.src?.original)
        .filter(Boolean);
      console.log(`[Pexels] Found ${urls.length} images.`);
      return urls;
    }

    return [];
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error('[Pexels] API Request Timeout (8s reached).');
    } else {
      console.error('[Pexels] Search failed:', error.message);
    }
    // 호출 실패 시 크래시 방지를 위해 빈 배열 반환
    return [];
  }
}
