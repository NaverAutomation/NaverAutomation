import OpenAI from 'openai';

/**
 * AI를 사용하여 블로그 제목과 본문을 생성합니다.
 * @param {string} apiKey OpenAI API 키
 * @param {string} keyword 블로그 주제 키워드
 * @returns {Promise<{title: string, content: string}>}
 */
export async function generateContent(apiKey, keyword) {
  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: '당신은 블로그 포스팅 전문가입니다. 반드시 결과를 [TITLE]제목내용[/TITLE] [CONTENT]본문내용[/CONTENT] 형식으로 작성하세요.' },
        { role: 'user', content: `${keyword} 주제로 블로그 포스팅 원고를 작성해줘. 제목과 본문을 구분해줘.` },
      ],
    });

    const fullText = response.choices[0].message.content;
    
    // 제목과 본문을 [TITLE], [CONTENT] 태그로 추출하는 정규식
    const titleMatch = fullText.match(/\[TITLE\](.*?)\[\/TITLE\]/s);
    const contentMatch = fullText.match(/\[CONTENT\](.*?)\[\/CONTENT\]/s);

    const title = titleMatch ? titleMatch[1].trim() : '제목 없음';
    const content = contentMatch ? contentMatch[1].trim() : fullText;

    return { title, content };
  } catch (error) {
    console.error('Error generating content:', error);
    throw error;
  }
}

/**
 * AI를 사용하여 이미지를 생성합니다.
 * @param {string} apiKey OpenAI API 키
 * @param {string} prompt 이미지 생성 프롬프트
 * @returns {Promise<string>} 생성된 이미지 URL
 */
export async function generateImage(apiKey, prompt) {
  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });

    return response.data[0].url;
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}
