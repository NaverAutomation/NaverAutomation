import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * OpenAI GPT-4o를 이용한 텍스트 생성
 */
async function generateWithOpenAI(apiKey, keyword) {
  const openai = new OpenAI({ apiKey });
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: '당신은 블로그 포스팅 전문가입니다. 반드시 아래 형식을 지켜주세요.\n[TITLE]제목[/TITLE]\n[CONTENT]본문[/CONTENT]' 
        },
        { role: 'user', content: `${keyword} 주제로 블로그 포스팅 원고를 작성해줘.` },
      ],
      max_tokens: 2000,
    });

    const fullText = response.choices[0].message.content;
    const parsed = parseAIResponse(fullText);
    return { ...parsed, modelUsed: 'gpt-4o' };
  } catch (error) {
    console.error('OpenAI Content Generation Error:', error);
    throw new Error(`Failed to generate with OpenAI: ${error.message}`);
  }
}

/**
 * Google Gemini 모델 자동 선택 로직
 */
function selectBestGeminiModel(content) {
  // 사용자의 계정에서 확인된 가장 쿼터가 넉넉한 모델을 사용합니다.
  if (content.length > 2000) {
    return 'gemini-2.5-flash';
  }
  return 'gemini-2.5-flash-lite';
}

/**
 * Google Gemini를 이용한 텍스트 생성 (자동 모델 선택 및 Fallback 포함)
 */
async function generateWithGemini(apiKey, keyword, modelPreference = 'auto') {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // 모델 결정
  let modelName = modelPreference;
  if (!modelName || modelName === 'auto') {
    modelName = selectBestGeminiModel(keyword);
  }
  
  // 사용 중인 가용 모델 리스트 기반 보정 (이미지 리스트 기반)
  const availableModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-3.1-pro', 'gemini-2-flash', 'gemini-2-flash-lite'];
  if (!availableModels.includes(modelName)) {
    modelName = 'gemini-2.5-flash-lite'; // 리스트에 없는 모델은 가장 안전한 무료 모델로 전환
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
    // 429 에러(Quota/Spending Cap Exceeded) 발생 시 무조건 가용 리스트 중 가장 안전한 Flash-Lite로 자동 Fallback
    if (!modelName.includes('lite') && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('spending'))) {
      console.warn(`[Gemini] ${modelName} error (limit/cap). Falling back to gemini-2.5-flash-lite...`);
      return await generateWithGemini(apiKey, keyword, 'gemini-2.5-flash-lite');
    }
    
    console.error('Gemini Content Generation Error:', error);
    throw new Error(`Failed to generate with Gemini: ${error.message}`);
  }
}

/**
 * OpenAI DALL-E 3를 이용한 이미지 생성
 */
export async function generateImage(apiKey, prompt) {
  const openai = new OpenAI({ apiKey });
  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });
    return response.data[0].url;
  } catch (error) {
    console.error('DALL-E Generation Error:', error);
    throw new Error(`Failed to generate image: ${error.message}`);
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
    const { apiKey, model } = apiKeyOrConfig; // apiKeyOrConfig가 객체로 오는 경우 대응
    const actualKey = typeof apiKeyOrConfig === 'string' ? apiKeyOrConfig : apiKey;
    const actualModel = typeof apiKeyOrConfig === 'string' ? 'auto' : model;
    return await generateWithGemini(actualKey, keyword, actualModel);
  } else if (engine === 'ollama') {
    const { endpoint, model } = apiKeyOrConfig;
    return await generateWithOllama(endpoint, model, keyword);
  } else {
    return await generateWithOpenAI(apiKeyOrConfig, keyword);
  }
}
