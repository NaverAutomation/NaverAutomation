# OpenAI Service Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the robustness of `openai-service.js` by adding error handling, strict formatting, and precise parsing.

**Architecture:** Update `generateContent` to use explicit tags (`[TITLE]`, `[CONTENT]`) and regex for parsing, and wrap both service functions in `try-catch` blocks.

**Tech Stack:** Node.js, OpenAI SDK.

---

### Task 1: Cleanup and Error Handling for `generateImage`

**Files:**
- Modify: `src/server/services/openai-service.js`

- [ ] **Step 1: Remove unused CONFIG import and wrap `generateImage` in try-catch**

```javascript
import OpenAI from 'openai';
// Removed: import { CONFIG } from '../config.js';

// ... (generateContent stays same for now)

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
```

- [ ] **Step 2: Verify syntax**
Run: `node --check src/server/services/openai-service.js`
Expected: No output (success).

---

### Task 2: Update `generateContent` Prompt and Error Handling

**Files:**
- Modify: `src/server/services/openai-service.js`

- [ ] **Step 1: Update `generateContent` with try-catch and new system prompt**

```javascript
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
    
    // ... (parsing logic in next task)
  } catch (error) {
    console.error('Error generating content:', error);
    throw error;
  }
}
```

---

### Task 3: Implement Regex Parsing for `generateContent`

**Files:**
- Modify: `src/server/services/openai-service.js`

- [ ] **Step 1: Replace old parsing logic with robust regex**

```javascript
    const fullText = response.choices[0].message.content;
    
    // 제목과 본문을 [TITLE], [CONTENT] 태그로 추출하는 정규식
    const titleMatch = fullText.match(/\[TITLE\](.*?)\[\/TITLE\]/s);
    const contentMatch = fullText.match(/\[CONTENT\](.*?)\[\/CONTENT\]/s);

    const title = titleMatch ? titleMatch[1].trim() : '제목 없음';
    const content = contentMatch ? contentMatch[1].trim() : fullText;

    return { title, content };
```

- [ ] **Step 2: Final verification**
Run: `node --check src/server/services/openai-service.js`
Expected: No output (success).
