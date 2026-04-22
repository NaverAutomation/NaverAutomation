import React, { useState } from 'react';
import { apiFetch } from '../../utils/api';
import { Card, SectionTitle, Input, Btn, Textarea } from '../common';

const EditTab = React.memo(() => {
  const [original, setOriginal] = useState('');
  const [instruction, setInstruction] = useState('블로그 글을 더 자연스럽고 SEO에 최적화된 형태로 다듬어주세요. 소제목을 추가하고 가독성을 높여주세요.');
  const [engine, setEngine] = useState('openai');
  const [edited, setEdited] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEdit = async () => {
    if (!original.trim()) return alert('수정할 글을 입력하세요.');
    setLoading(true);
    try {
      const data = await apiFetch('/api/generate/edit', {
        method: 'POST',
        body: JSON.stringify({ content: original, instruction, engine }),
      });
      setEdited(data.editedContent);
    } catch (err) {
      alert('수정 실패: ' + err.message);
    }
    setLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(edited);
    alert('📋 클립보드에 복사되었습니다!');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start h-full">
      <Card className="h-full flex flex-col">
        <SectionTitle>📝 원본 텍스트</SectionTitle>
        <div className="flex-1 flex flex-col gap-4">
          <Textarea
            label="수정할 글 붙여넣기"
            className="h-[300px] md:h-[400px] flex-1 font-medium bg-base-100 shadow-inner"
            placeholder="여기에 기존 블로그 글이나 메모를 붙여넣으세요..."
            value={original}
            onChange={e => setOriginal(e.target.value)}
          />
          <Input
            label="원하는 교정 방향 (프롬프트)"
            type="text"
            className="font-medium bg-base-100 shadow-inner"
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
          />
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <select
              value={engine}
              onChange={e => setEngine(e.target.value)}
              className="select select-bordered bg-base-100 font-semibold shadow-sm w-full sm:w-auto"
            >
              <option value="openai">🤖 GPT-4o (권장)</option>
              <option value="gemini">✨ 클라우드 AI API</option>
              <option value="ollama">🦙 Ollama</option>
            </select>
            <Btn variant="primary" onClick={handleEdit} disabled={loading} className="flex-1">
              {loading ? <span className="loading loading-spinner"></span> : '✨ AI 매직 교정 실행'}
            </Btn>
          </div>
        </div>
      </Card>

      <Card className="h-full flex flex-col">
        <div className="flex items-center justify-between border-b border-base-300 pb-3 mb-5">
          <h2 className="text-lg font-bold text-base-content">✅ 교정된 최종 원고</h2>
          {edited && <button className="btn btn-sm btn-outline btn-neutral h-8" onClick={handleCopy}>📋 전체 복사</button>}
        </div>

        {edited ? (
          <div className="flex-1 flex flex-col animate-in fade-in">
            <Textarea
              className="h-full flex-1 font-medium leading-8 bg-base-100 shadow-inner min-h-[400px]"
              value={edited}
              onChange={e => setEdited(e.target.value)}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] bg-base-100 rounded-2xl border border-dashed border-base-300 opacity-60">
            <span className="text-6xl mb-4 grayscale">✨</span>
            <span className="text-sm font-semibold tracking-wide">왼쪽에 글을 입력하고 AI 교정을 실행해보세요</span>
          </div>
        )}
      </Card>
    </div>
  );
});

export default EditTab;
