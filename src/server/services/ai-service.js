import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Google Gemini 모델 자동 선택 로직
 */
function selectBestGeminiModel(content) {
  return 'gemini-2.5-flash-lite';
}

/**
 * Google Gemini를 이용한 텍스트 생성 (자동 모델 선택 및 Fallback 포함)
 */
async function generateWithGemini(apiKey, keyword, modelPreference = 'auto') {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // 모델 결정 (유저 요청에 따라 2.5 Flash Lite 우선)
  let modelName = modelPreference === 'auto' ? 'gemini-2.5-flash-lite' : modelPreference;
  
  const availableModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
  if (!availableModels.includes(modelName)) {
    modelName = 'gemini-2.5-flash-lite';
  }

  console.log(`[Gemini] Starting generation with model: ${modelName}`);

  try {
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `당신은 블로그 포스팅 전문가입니다. 반드시 아래 형식을 지켜주세요.
[TITLE]제목[/TITLE]
[CONTENT]본문[/CONTENT]

주제: ${keyword}
원고를 작성해줘.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const fullText = response.text();
    const parsed = parseAIResponse(fullText);
    return { ...parsed, modelUsed: modelName };
  } catch (error) {
    // 429 에러 발생 시 리트라이 로직
    if (error.message.includes('429') || error.message.includes('quota')) {
      console.warn(`[Gemini] ${modelName} limit reached. Waiting for fallback...`);
    }
    throw error;
  }
}

/**
 * Google Gemini를 이용한 기존 원고 재작성 (Rewrite)
 */
export async function generateRewriteWithGemini(apiKey, originalTitle, originalContent, modelPreference = 'auto') {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // 유저 명시적 요청: gemini-2.5-flash-lite 사용
  let modelName = modelPreference === 'auto' ? 'gemini-2.5-flash-lite' : modelPreference;

  console.log(`[Gemini/Rewrite] Rewriting content with model: ${modelName}`);

  try {
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `당신은 블로그 포스팅 전문가입니다. 아래 제공된 [원본 제목]과 [원본 본문]의 핵심 내용을 유지하되, 
네이버의 유사 문서 판독을 피할 수 있도록 완전히 새로운 문장 구조와 표현으로 다시 작성해주세요.
반드시 아래 형식을 지켜주세요.
[TITLE]새로운 제목[/TITLE]
[CONTENT]새로운 본문[/CONTENT]

[원본 제목]: ${originalTitle}
[원본 본문]: ${originalContent}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const fullText = response.text();
    const parsed = parseAIResponse(fullText);
    return { ...parsed, modelUsed: modelName };
  } catch (error) {
    console.error('Gemini Rewrite Error:', error);
    throw error;
  }
}

/**
 * Ollama를 이용한 텍스트 생성
 */
async function generateWithOllama(endpoint, model, keyword) {
  try {
    // 사용자가 입력한 엔드포인트가 없으면 로컬 기본값(11434) 사용
    let baseUrl = (endpoint || 'http://localhost:11434').trim();
    if (baseUrl.endsWith('/api/generate')) {
      baseUrl = baseUrl.replace(/\/api\/generate$/, '');
    } else if (baseUrl.endsWith('/api/generate/')) {
      baseUrl = baseUrl.replace(/\/api\/generate\/$/, '');
    }
    
    // 최종 URL 조립
    const url = baseUrl.endsWith('/') ? `${baseUrl}api/generate` : `${baseUrl}/api/generate`;
    console.log(`[Ollama] Requesting URL: ${url} (Model: ${model || 'gemma4'})`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'gemma4',
        prompt: `당신은 블로그 포스팅 전문가입니다. 반드시 아래 형식을 지켜주세요.\n[TITLE]제목[/TITLE]\n[CONTENT]본문[/CONTENT]\n\n${keyword} 주제로 블로그 포스팅 원고를 작성해줘.`,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    const fullText = data.response; // /api/generate는 'response' 필드 사용
    const parsed = parseAIResponse(fullText);
    return { ...parsed, modelUsed: model || 'gemma4' };
  } catch (error) {
    console.error('Ollama Content Generation Error:', error);
    throw new Error(`Failed to generate with Ollama: ${error.message}`);
  }
}

/**
 * AI 응답 파싱 (제목/본문 추출)
 */
function parseAIResponse(fullText) {
  const titleMatch = fullText.match(/\[TITLE\](.*?)(?:\[\/TITLE\]|$)/s);
  const contentMatch = fullText.match(/\[CONTENT\](.*?)(?:\[\/CONTENT\]|$)/s);

  const title = titleMatch ? titleMatch[1].trim() : '제목 없음';
  const content = contentMatch ? contentMatch[1].trim() : fullText.trim();

  return { title, content };
}

/**
 * 통합 콘텐츠 생성 함수
 */
export async function generateContent(engine, apiKeyOrConfig, keyword) {
  if (engine === 'gemini') {
    const { apiKey, model } = apiKeyOrConfig;
    const actualKey = typeof apiKeyOrConfig === 'string' ? apiKeyOrConfig : apiKey;
    const actualModel = typeof apiKeyOrConfig === 'string' ? 'auto' : model;
    return await generateWithGemini(actualKey, keyword, actualModel);
  } else if (engine === 'ollama') {
    const { endpoint, model } = apiKeyOrConfig;
    return await generateWithOllama(endpoint, model, keyword);
  } else {
    throw new Error('OpenAI 서비스가 비활성화되었습니다. Gemini 또는 Ollama를 사용해주세요.');
  }
}
