# Design: OpenAI Service Robustness Improvements

Improve the robustness and reliability of the `openai-service.js` by adding error handling, strict formatting requirements, and precise parsing.

## 1. Error Handling
Wrap both `generateContent` and `generateImage` in `try-catch` blocks to prevent unhandled exceptions from crashing the application and provide descriptive logging.

## 2. Formatting & Parsing
Update the `generateContent` system prompt to require explicit `[TITLE]` and `[CONTENT]` tags. Use regex to extract data from these tags, ensuring that the title and content are correctly separated even if GPT adds additional conversational text.

## 3. Cleanup
Remove the unused `CONFIG` import to keep the code clean.

## Architecture & Data Flow
- `generateContent`: System Prompt -> GPT-4o -> [TITLE]/[CONTENT] Tagged String -> Regex Extraction -> Object `{title, content}`.
- `generateImage`: Prompt -> DALL-E-3 -> URL String.

## Error Handling Strategy
- Catch API errors and log them to console.
- Rethrow or return a structured error response depending on the caller's needs (for now, we'll rethrow after logging).

## Testing Strategy
- Manual verification that the prompt produces the correct tags.
- Verify that the regex correctly handles multi-line content within tags.
