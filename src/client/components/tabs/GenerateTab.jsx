import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../utils/api';
import { Btn, Card, Input, SectionTitle, Textarea } from '../common';

const EMPTY_ARRAY = [];

// ── 랜덤 오프셋 적용 헬퍼 (Hoisted outside component) ──
const applyRandomOffset = (isoString, offsetMin) => {
  const offsetMs = (Math.random() * 2 - 1) * offsetMin * 60 * 1000;
  return new Date(new Date(isoString).getTime() + offsetMs).toISOString();
};

const GenerateTab = React.memo(
  ({ accounts, scheduledPosts = EMPTY_ARRAY, fetchAll, reusedPost, clearReusedPost }) => {
    // ── UI 및 전환 상태 ──
    const [activeSubTab, setActiveSubTab] = useState('ai'); // 'ai', 'keyword', or 'manual'

    // ── AI 초안 생성기 상태 ──
    const [keyword, setKeyword] = useState('');
    const [generated, setGenerated] = useState(null);
    const [loading, setLoading] = useState(false);
    const [posting, setPosting] = useState(false);
    const [scheduling, setScheduling] = useState(false);
    const [scheduledAt, setScheduledAt] = useState('');
    const [headless, setHeadless] = useState(true);
    const [aiMode, setAiMode] = useState('generate'); // 'generate' | 'edit'
    const [editContent, setEditContent] = useState('');
    const [editInstruction, setEditInstruction] = useState(
      '블로그 글을 더 자연스럽고 SEO에 최적화된 형태로 다듬어주세요.',
    );
    const [editing, setEditing] = useState(false);
    const [randomOffset, setRandomOffset] = useState(30); // ±분
    const [useRandomOffset, setUseRandomOffset] = useState(false);

    // AI 엔진 기본값 (고정)
    const engine = 'gemini';

    // ── 수기 작성 발행 상태 ──
    const [manualTitle, setManualTitle] = useState('');
    const [manualContent, setManualContent] = useState('');
    const [manualImageUrl, setManualImageUrl] = useState('');
    const [manualPosting, setManualPosting] = useState(false);
    const [manualScheduling, setManualScheduling] = useState(false);
    const [manualScheduledAt, setManualScheduledAt] = useState('');
    const [manualHeadless, setManualHeadless] = useState(true);
    const [manualRandomOffset, setManualRandomOffset] = useState(30);
    const [manualUseRandomOffset, setManualUseRandomOffset] = useState(false);

    // ── 자동 키워드 예약 상태 ──
    const [keywordList, setKeywordList] = useState('');
    const [keywordStartTime, setKeywordStartTime] = useState('');
    const [keywordIntervalHours, setKeywordIntervalHours] = useState(3);
    const [keywordIntervalMinutes, setKeywordIntervalMinutes] = useState(0);
    const [keywordHeadless, setKeywordHeadless] = useState(true);
    const [keywordScheduling, setKeywordScheduling] = useState(false);
    const [keywordRepresentativeImages, setKeywordRepresentativeImages] = useState([]);
    const [keywordContentImages, setKeywordContentImages] = useState([]);

    // ── 이미지 파일 input refs ──
    const manualImageInputRef = useRef(null);
    const generatedImageInputRef = useRef(null);
    const repImageInputRef = useRef(null);
    const contentImageInputRef = useRef(null);

    // ── 현재 대기열의 활성 키워드 목록 필터링 ──
    const activeKeywords = useMemo(() => {
      return scheduledPosts
        .filter(
          (post) =>
            post.post_type === 'keyword' &&
            ['pending', 'scheduled', 'processing'].includes(post.status),
        )
        .map((post) => post.keyword)
        .filter(Boolean);
    }, [scheduledPosts]);

    // ── 외부 이력 재사용 이벤트 감지 ──
    useEffect(() => {
      if (reusedPost) {
        setManualTitle(reusedPost.title || '');
        setManualContent(reusedPost.content || '');
        setManualImageUrl(reusedPost.image_url || '');
        setActiveSubTab('manual');

        setTimeout(() => {
          const composeContainer = document.getElementById('compose-hub-card');
          if (composeContainer) {
            composeContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
        clearReusedPost();
      }
    }, [reusedPost, clearReusedPost]);

    // ── 이미지 업로드 핸들러 ──
    const handleImageUpload = async (e, setUrlCallback) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        alert('이미지 크기는 5MB 이하여야 합니다.');
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await apiFetch('/api/upload', {
            method: 'POST',
            body: JSON.stringify({
              fileName: file.name,
              base64Data: reader.result,
            }),
          });
          if (res.success && res.url) {
            setUrlCallback(res.url);
          } else {
            alert(`이미지 업로드 실패: ${res.error || '알 수 없는 오류'}`);
          }
        } catch (err) {
          alert(`업로드 오류: ${err.message}`);
        }
      };
      reader.onerror = () => {
        alert('파일 읽기 오류가 발생했습니다.');
      };
      reader.readAsDataURL(file);
    };

    // ── AI 초안 생성 기능 ──
    const handleGenerate = async () => {
      const trimmed = keyword.trim();
      if (!trimmed) return alert('주제 또는 수정할 본문을 입력하세요.');

      const isLongText = trimmed.length > 80 || trimmed.includes('\n');

      setLoading(true);
      try {
        if (isLongText) {
          const data = await apiFetch('/api/generate/edit', {
            method: 'POST',
            body: JSON.stringify({
              content: trimmed,
              instruction: '블로그 글을 더 자연스럽고 SEO에 최적화된 형태로 다듬어주세요.',
            }),
          });
          setGenerated({
            title: '',
            content: data.editedContent,
            imageUrl: '',
          });
        } else {
          const data = await apiFetch('/api/generate', {
            method: 'POST',
            body: JSON.stringify({ keyword: trimmed, engine }),
          });
          setGenerated(data);
        }

        setTimeout(() => {
          const draftContainer = document.getElementById('generated-draft-card');
          if (draftContainer) {
            draftContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      } catch (err) {
        alert(`실패: ${err.message}`);
      }
      setLoading(false);
    };

    // ── AI 초안 즉시 송출 ──
    const handlePost = async () => {
      if (!generated) return;
      setPosting(true);
      try {
        const payload = {
          title: generated.title,
          content: generated.content,
          image_url: generated.imageUrl || null,
          headless,
          account_id: null, // 라운드로빈 강제 적용
        };

        const data = await apiFetch('/api/post', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        alert(data.message || '발행 완료!');
        setGenerated(null);
        setKeyword('');
        await fetchAll();
      } catch (err) {
        alert(`발행 실패: ${err.message}`);
      }
      setPosting(false);
    };

    // ── AI 초안 타이머 예약 ──
    const handleSchedule = async () => {
      if (!generated || !scheduledAt) return alert('예약 시간을 설정하세요.');
      setScheduling(true);
      try {
        const rawTime = new Date(scheduledAt).toISOString();
        const finalTime = useRandomOffset ? applyRandomOffset(rawTime, randomOffset) : rawTime;
        const data = await apiFetch('/api/posts/schedule', {
          method: 'POST',
          body: JSON.stringify({
            account_id: null, // 라운드로빈 강제 적용
            title: generated.title,
            content: generated.content,
            image_url: generated.imageUrl,
            headless,
            scheduled_at: finalTime,
          }),
        });
        alert(
          data.message ||
            `예약 완료! 실제 발행 시간: ${new Date(finalTime).toLocaleString('ko-KR')}`,
        );
        setGenerated(null);
        setKeyword('');
        setScheduledAt('');
        await fetchAll();
      } catch (err) {
        alert(`예약 실패: ${err.message}`);
      }
      setScheduling(false);
    };

    // ── AI 기존 글 수정 ──
    const handleEdit = async () => {
      if (!editContent.trim()) return alert('수정할 글을 입력하세요.');
      setEditing(true);
      try {
        const data = await apiFetch('/api/generate/edit', {
          method: 'POST',
          body: JSON.stringify({ content: editContent, instruction: editInstruction }),
        });
        setGenerated({
          title: '',
          content: data.editedContent,
          imageUrl: '',
        });
        setTimeout(() => {
          const draftContainer = document.getElementById('generated-draft-card');
          if (draftContainer) draftContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      } catch (err) {
        alert(`수정 실패: ${err.message}`);
      }
      setEditing(false);
    };

    // ── 수기 즉시 송출 ──
    const handleManualPost = async () => {
      if (!manualTitle.trim() || !manualContent.trim()) return alert('제목과 본문을 입력하세요.');

      setManualPosting(true);
      try {
        const payload = {
          title: manualTitle,
          content: manualContent,
          image_url: manualImageUrl.trim() || null,
          headless: manualHeadless,
          account_id: null, // 라운드로빈 강제 적용
        };

        const data = await apiFetch('/api/post', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        alert(data.message || '발행 완료!');
        setManualTitle('');
        setManualContent('');
        setManualImageUrl('');
        await fetchAll();
      } catch (err) {
        alert(`수기 발행 실패: ${err.message}`);
      }
      setManualPosting(false);
    };

    // ── 수기 예약 등록 ──
    const handleManualSchedule = async () => {
      if (!manualTitle.trim() || !manualContent.trim()) return alert('제목과 본문을 입력하세요.');
      if (!manualScheduledAt) return alert('예약 시간을 설정하세요.');

      setManualScheduling(true);
      try {
        const rawTime = new Date(manualScheduledAt).toISOString();
        const finalTime = manualUseRandomOffset
          ? applyRandomOffset(rawTime, manualRandomOffset)
          : rawTime;
        const data = await apiFetch('/api/posts/schedule', {
          method: 'POST',
          body: JSON.stringify({
            account_id: null, // 라운드로빈 강제 적용
            title: manualTitle,
            content: manualContent,
            image_url: manualImageUrl.trim() || null,
            headless: manualHeadless,
            scheduled_at: finalTime,
          }),
        });
        alert(
          data.message ||
            `예약 완료! 실제 발행 시간: ${new Date(finalTime).toLocaleString('ko-KR')}`,
        );
        setManualTitle('');
        setManualContent('');
        setManualImageUrl('');
        setManualScheduledAt('');
        await fetchAll();
      } catch (err) {
        alert(`수기 예약 실패: ${err.message}`);
      }
      setManualScheduling(false);
    };

    // ── 자동 키워드 다중 이미지 업로드 핸들러 ──
    const handleMultipleImageUpload = async (e, setListCallback) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) {
          alert(`이미지 크기는 5MB 이하여야 합니다: ${file.name}`);
          continue;
        }

        const reader = new FileReader();
        await new Promise((resolve) => {
          reader.onload = async () => {
            try {
              const res = await apiFetch('/api/upload', {
                method: 'POST',
                body: JSON.stringify({
                  fileName: file.name,
                  base64Data: reader.result,
                }),
              });
              if (res.success && res.url) {
                setListCallback((prev) => [...prev, res.url]);
              } else {
                alert(`이미지 업로드 실패 (${file.name}): ${res.error || '알 수 없는 오류'}`);
              }
            } catch (err) {
              alert(`업로드 오류 (${file.name}): ${err.message}`);
            } finally {
              resolve();
            }
          };
          reader.onerror = () => {
            alert(`파일 읽기 오류가 발생했습니다: ${file.name}`);
            resolve();
          };
          reader.readAsDataURL(file);
        });
      }
    };

    // ── 자동 키워드 일괄 예약 등록 ──
    const handleKeywordSchedule = async (e) => {
      e.preventDefault();
      const lines = keywordList
        .split('\n')
        .map((k) => k.trim())
        .filter(Boolean);
      if (lines.length === 0) return alert('키워드를 최소 1개 이상 입력하세요.');
      if (!keywordStartTime) return alert('예약 시작 시간을 설정하세요.');

      setKeywordScheduling(true);
      try {
        const res = await apiFetch('/api/posts/schedule-keywords', {
          method: 'POST',
          body: JSON.stringify({
            keywords: lines,
            start_time: new Date(keywordStartTime).toISOString(),
            interval_hours: Number(keywordIntervalHours),
            interval_minutes: Number(keywordIntervalMinutes),
            account_id: null,
            use_round_robin: true,
            headless: keywordHeadless,
            engine: 'gemini',
            image_url: JSON.stringify({
              representative: keywordRepresentativeImages,
              content: keywordContentImages,
            }),
          }),
        });

        if (res.success) {
          alert('자동 키워드 예약이 모두 성공적으로 대기열에 추가되었습니다!');
          setKeywordStartTime('');
          setKeywordRepresentativeImages([]);
          setKeywordContentImages([]);
          await fetchAll();
        } else {
          alert(`예약 실패: ${res.error || '알 수 없는 오류'}`);
        }
      } catch (err) {
        alert(`예약 오류: ${err.message}`);
      }
      setKeywordScheduling(false);
    };

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ── 글 작성 및 생성 허브 ── */}
        <Card id="compose-hub-card">
          <div className="flex bg-base-300 p-1.5 rounded-xl mb-6">
            <button
              onClick={() => setActiveSubTab('ai')}
              className={`flex-1 py-3 text-center rounded-lg font-black text-sm transition-all duration-200 cursor-pointer ${
                activeSubTab === 'ai'
                  ? 'bg-primary text-primary-content shadow-md scale-[1.01]'
                  : 'text-base-content/60 hover:text-base-content font-bold'
              }`}
            >
              ✨ AI 초안 생성
            </button>
            <button
              onClick={() => setActiveSubTab('keyword')}
              className={`flex-1 py-3 text-center rounded-lg font-black text-sm transition-all duration-200 cursor-pointer ${
                activeSubTab === 'keyword'
                  ? 'bg-primary text-primary-content shadow-md scale-[1.01]'
                  : 'text-base-content/60 hover:text-base-content font-bold'
              }`}
            >
              📅 자동 키워드 예약
            </button>
            <button
              onClick={() => setActiveSubTab('manual')}
              className={`flex-1 py-3 text-center rounded-lg font-black text-sm transition-all duration-200 cursor-pointer ${
                activeSubTab === 'manual'
                  ? 'bg-primary text-primary-content shadow-md scale-[1.01]'
                  : 'text-base-content/60 hover:text-base-content font-bold'
              }`}
            >
              ✍️ 수기 직접 작성
            </button>
          </div>

          {activeSubTab === 'ai' && (
            /* ── AI 원고 생성기 폼 ── */
            <div className="space-y-6">
              {/* 모드 토글: 새 글 생성 vs 기존 글 수정 */}
              <div className="flex bg-base-200 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setAiMode('generate')}
                  className={`flex-1 py-2 text-center rounded-md text-sm font-bold transition-all cursor-pointer ${
                    aiMode === 'generate'
                      ? 'bg-base-100 text-base-content shadow-sm'
                      : 'text-base-content/50 hover:text-base-content'
                  }`}
                >
                  🚀 새 글 생성
                </button>
                <button
                  type="button"
                  onClick={() => setAiMode('edit')}
                  className={`flex-1 py-2 text-center rounded-md text-sm font-bold transition-all cursor-pointer ${
                    aiMode === 'edit'
                      ? 'bg-base-100 text-base-content shadow-sm'
                      : 'text-base-content/50 hover:text-base-content'
                  }`}
                >
                  ✏️ 기존 글 수정
                </button>
              </div>

              {aiMode === 'generate' ? (
                /* 새 글 생성 */
                <>
                  <div className="relative">
                    <label className="label-text font-bold block mb-2 px-1 text-base-content/80">
                      어떤 주제로 포스팅할까요?
                    </label>
                    <div className="relative">
                      <textarea
                        className="textarea input-lg input-bordered w-full h-[200px] p-4 pl-4 bg-base-100 placeholder-base-content/30 focus:border-primary shadow-inner text-base font-medium"
                        placeholder="예: 성수동 핫플 카페 5곳 정리 (또는 작성해둔 글을 그대로 붙여넣으세요)"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && !e.nativeEvent.isComposing && handleGenerate()
                        }
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Btn
                      variant="primary"
                      className="h-[3rem] px-8"
                      onClick={handleGenerate}
                      disabled={loading}
                    >
                      {loading ? <span className="loading loading-dots"></span> : '🚀 초안 생성'}
                    </Btn>
                  </div>
                </>
              ) : (
                /* 기존 글 수정 */
                <div className="space-y-4">
                  <div>
                    <label className="label-text font-bold block mb-2 px-1 text-base-content/80">
                      ✏️ 수정할 기존 글을 붙여넣으세요
                    </label>
                    <textarea
                      className="textarea textarea-bordered w-full h-[200px] bg-base-100 font-medium leading-7 placeholder-base-content/30 focus:border-primary shadow-inner"
                      placeholder="블로그에 올렸거나 작성해둔 글을 여기에 붙여넣으면 AI가 자연스럽게 다듬어 드립니다..."
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label-text font-bold block mb-2 px-1 text-base-content/80">
                      📝 수정 지시사항 (선택)
                    </label>
                    <input
                      className="input input-bordered w-full bg-base-100 placeholder-base-content/30 focus:border-primary"
                      value={editInstruction}
                      onChange={(e) => setEditInstruction(e.target.value)}
                    />
                  </div>
                  <Btn variant="primary" className="w-full" onClick={handleEdit} disabled={editing}>
                    {editing ? <span className="loading loading-dots"></span> : '✨ AI로 글 다듬기'}
                  </Btn>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'keyword' && (
            /* ── 자동 키워드 예약 폼 ── */
            <form onSubmit={handleKeywordSchedule} className="space-y-6">
              <div>
                <SectionTitle className="text-primary font-black mb-1">
                  📅 자동 키워드 일괄 예약 등록
                </SectionTitle>
                <p className="text-xs text-base-content/60 leading-normal">
                  여러 개의 키워드를 한 줄에 하나씩 입력하면, AI가 각 키워드별 원고를 자동으로 미리
                  생성한 뒤 설정한 시간 간격대로 예약 대기열에 등록합니다.
                </p>
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text font-bold text-xs text-base-content/80">
                    키워드 목록 (한 줄에 하나씩 입력)
                  </span>
                </label>
                <textarea
                  rows={6}
                  className="textarea textarea-bordered bg-base-100 font-semibold leading-normal w-full"
                  placeholder="예:&#10;아이폰17 출시일 루머 정리&#10;갤럭시 S26 울트라 상세 스펙&#10;2026년 전기차 보조금 혜택"
                  value={keywordList}
                  onChange={(e) => setKeywordList(e.target.value)}
                />
                {/* 예약된 키워드 배지 목록 표시 */}
                {activeKeywords.length > 0 && (
                  <div className="mt-3">
                    <span className="text-xs font-bold text-base-content/60 block mb-1">
                      ⏳ 현재 예약 대기중인 키워드 목록 ({activeKeywords.length}개):
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-base-200/50 rounded-lg border border-base-300">
                      {activeKeywords.map((kw, i) => (
                        <span key={i} className="badge badge-sm badge-neutral font-semibold">
                          #{kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text font-bold text-xs text-base-content/80">
                      첫 번째 글 예약 시작 시간
                    </span>
                  </label>
                  <input
                    type="datetime-local"
                    className="input input-bordered bg-base-100 font-semibold text-xs h-[3rem]"
                    value={keywordStartTime}
                    onChange={(e) => setKeywordStartTime(e.target.value)}
                  />
                </div>

                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text font-bold text-xs text-base-content/80">
                      발행 시간 간격
                    </span>
                  </label>
                  <div className="flex items-center gap-2 h-[3rem]">
                    <input
                      type="number"
                      min="0"
                      max="99"
                      className="input input-bordered w-20 text-center font-bold bg-base-100 h-full"
                      value={keywordIntervalHours}
                      onChange={(e) => setKeywordIntervalHours(Number(e.target.value))}
                    />
                    <span className="text-xs font-bold text-base-content/60">시간</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      className="input input-bordered w-20 text-center font-bold bg-base-100 h-full"
                      value={keywordIntervalMinutes}
                      onChange={(e) => setKeywordIntervalMinutes(Number(e.target.value))}
                    />
                    <span className="text-xs font-bold text-base-content/60">분 마다</span>
                  </div>
                </div>
              </div>

              <div className="divider my-2">사진 첨부 설정</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 대표 사진 */}
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text font-bold text-xs text-base-content/80">
                      📸 대표 사진 (상단에 원본 그대로 삽입 - 여러 장 가능)
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2 p-3 bg-base-200/30 border border-base-300 rounded-xl min-h-[96px]">
                    {keywordRepresentativeImages.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative w-16 h-16 rounded-lg overflow-hidden border border-base-300 group shadow-sm"
                      >
                        <img src={url} alt={`rep-${idx}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() =>
                            setKeywordRepresentativeImages((prev) =>
                              prev.filter((_, i) => i !== idx),
                            )
                          }
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => repImageInputRef.current?.click()}
                      className="w-16 h-16 rounded-lg border-2 border-dashed border-base-300 hover:border-primary flex flex-col items-center justify-center text-base-content/40 hover:text-primary transition-colors bg-base-100"
                    >
                      <span className="text-lg font-bold">+</span>
                      <span className="text-[9px] font-black">추가</span>
                    </button>
                  </div>
                  <input
                    ref={repImageInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleMultipleImageUpload(e, setKeywordRepresentativeImages)}
                  />
                </div>

                {/* 본문 사진 */}
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text font-bold text-xs text-base-content/80">
                      🎨 본문 사진 (하단에 삽입되며 AI 필터 변조 적용 - 여러 장 가능)
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2 p-3 bg-base-200/30 border border-base-300 rounded-xl min-h-[96px]">
                    {keywordContentImages.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative w-16 h-16 rounded-lg overflow-hidden border border-base-300 group shadow-sm"
                      >
                        <img
                          src={url}
                          alt={`content-${idx}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setKeywordContentImages((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => contentImageInputRef.current?.click()}
                      className="w-16 h-16 rounded-lg border-2 border-dashed border-base-300 hover:border-primary flex flex-col items-center justify-center text-base-content/40 hover:text-primary transition-colors bg-base-100"
                    >
                      <span className="text-lg font-bold">+</span>
                      <span className="text-[9px] font-black">추가</span>
                    </button>
                  </div>
                  <input
                    ref={contentImageInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleMultipleImageUpload(e, setKeywordContentImages)}
                  />
                </div>
              </div>

              {import.meta.env.DEV && (
                <div className="form-control bg-base-200/50 p-3 rounded-xl border border-base-300 max-w-xs">
                  <label className="label cursor-pointer justify-start gap-4 py-0">
                    <input
                      type="checkbox"
                      className="toggle toggle-primary toggle-sm"
                      checked={keywordHeadless}
                      onChange={(e) => setKeywordHeadless(e.target.checked)}
                    />
                    <span className="label-text font-bold text-xs">
                      백그라운드(headless)로 자동 실행
                    </span>
                  </label>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  className="btn btn-primary w-full font-extrabold text-sm h-[3.2rem]"
                  disabled={keywordScheduling}
                >
                  {keywordScheduling ? (
                    <div className="flex items-center gap-2 justify-center">
                      <span className="loading loading-spinner loading-sm"></span>
                      <span>AI 원고 생성 및 예약 등록 중...</span>
                    </div>
                  ) : (
                    '📅 일괄 예약 생성 및 대기열 등록'
                  )}
                </button>
              </div>
            </form>
          )}

          {activeSubTab === 'manual' && (
            /* ── 수기 직접 작성 폼 ── */
            <div className="space-y-4">
              <Input
                label="포스트 제목"
                className="font-bold text-lg"
                type="text"
                placeholder="수기 발행할 글 제목을 작성하세요..."
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
              />
              <Textarea
                label="포스트 본문"
                className="h-[300px] font-medium leading-8 text-base bg-base-100 border-base-300"
                placeholder="블로그에 들어갈 내용을 정성껏 채워보세요..."
                value={manualContent}
                onChange={(e) => setManualContent(e.target.value)}
              />

              <div className="form-control">
                <label className="label-text font-bold block mb-2 px-1 text-base-content/80">
                  📸 블로그 본문 맨 위에 넣을 사진 (직접 업로드 또는 URL)
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    className="input input-bordered flex-1 bg-base-100 placeholder-base-content/30 focus:border-primary shadow-inner"
                    placeholder="https://... 또는 직접 파일 업로드"
                    value={manualImageUrl}
                    onChange={(e) => setManualImageUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-neutral shrink-0"
                    onClick={() => manualImageInputRef.current?.click()}
                  >
                    ➕ 사진 선택
                  </button>
                  <input
                    ref={manualImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e, setManualImageUrl)}
                  />
                </div>
                {manualImageUrl && (
                  <div className="mt-4 relative group w-full max-w-sm rounded-xl overflow-hidden border border-base-300 shadow-md">
                    <img
                      src={manualImageUrl}
                      alt="Preview"
                      className="w-full h-auto object-cover max-h-48"
                    />
                    <button
                      type="button"
                      onClick={() => setManualImageUrl('')}
                      className="absolute top-2 right-2 btn btn-circle btn-xs btn-error shadow hover:scale-105"
                      title="이미지 제거"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-6 p-5 bg-base-300/40 border border-base-300 rounded-2xl flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="label-text font-bold block mb-2 text-base-content/80">
                      📅 예약 발행시간 설정
                    </label>
                    <input
                      type="datetime-local"
                      value={manualScheduledAt}
                      onChange={(e) => setManualScheduledAt(e.target.value)}
                      className="input input-bordered w-full bg-base-100 font-medium"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        id="manual-random-offset"
                        className="checkbox checkbox-primary checkbox-sm"
                        checked={manualUseRandomOffset}
                        onChange={(e) => setManualUseRandomOffset(e.target.checked)}
                      />
                      <label
                        htmlFor="manual-random-offset"
                        className="label-text text-xs font-semibold cursor-pointer"
                      >
                        ±
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={manualRandomOffset}
                        onChange={(e) => setManualRandomOffset(Number(e.target.value))}
                        disabled={!manualUseRandomOffset}
                        className="input input-bordered input-xs w-16 bg-base-100 font-medium"
                      />
                      <span className="text-xs text-base-content/50 font-semibold">분 랜덤</span>
                    </div>
                  </div>
                  {import.meta.env.DEV && (
                    <div>
                      <label className="label-text font-bold block mb-2 text-base-content/80">
                        🖥️ 브라우저 실행 방식
                      </label>
                      <div className="form-control bg-base-100 p-2.5 rounded-lg border border-base-300 shadow-inner h-[3rem] flex justify-center">
                        <label className="label cursor-pointer justify-start gap-4 py-0">
                          <input
                            type="checkbox"
                            className="toggle toggle-primary toggle-sm"
                            checked={manualHeadless}
                            onChange={(e) => setManualHeadless(e.target.checked)}
                          />
                          <span className="label-text font-bold">
                            백그라운드(headless)로 자동 실행
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col w-full mt-2">
                  {accounts.length === 0 && (
                    <div className="text-error text-xs font-bold mb-2 text-center bg-error/10 py-1.5 px-2 rounded-md">
                      ⚠️ 계정 관리 탭에서 네이버 계정을 먼저 등록해주세요.
                    </div>
                  )}
                  <div className="flex gap-3 w-full">
                    <Btn
                      variant="warning"
                      className="flex-1"
                      onClick={handleManualSchedule}
                      disabled={manualScheduling || !manualScheduledAt || accounts.length === 0}
                    >
                      {manualScheduling ? (
                        <span className="loading loading-spinner"></span>
                      ) : (
                        '📅 타이머 예약'
                      )}
                    </Btn>
                    <Btn
                      variant="success"
                      className="flex-1"
                      onClick={handleManualPost}
                      disabled={manualPosting || accounts.length === 0}
                    >
                      {manualPosting ? (
                        <span className="loading loading-spinner"></span>
                      ) : (
                        '📝 즉시 수기송출'
                      )}
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* ── AI 초안 생성 완료 시 편집 에디터 카드 ── */}
        {generated && (
          <Card
            id="generated-draft-card"
            className="animate-in slide-in-from-bottom-4 duration-500"
          >
            <div className="flex justify-between items-start mb-4">
              <SectionTitle className="mb-0">📄 AI 생성 초안 편집</SectionTitle>
              {generated.modelUsed && (
                <div className="badge badge-outline badge-sm py-3 px-3 gap-2 text-base-content/60 border-base-300 font-medium">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                  Gemini API 초안 완료
                </div>
              )}
            </div>
            <div className="bg-base-100 p-6 rounded-2xl border border-base-300 shadow-inner space-y-4">
              <Input
                label="초안 제목"
                className="font-bold text-lg"
                type="text"
                value={generated.title}
                onChange={(e) => setGenerated((prev) => ({ ...prev, title: e.target.value }))}
              />
              <Textarea
                label="초안 본문"
                className="h-[400px] font-medium leading-8 text-base bg-base-100 border-base-300"
                value={generated.content}
                onChange={(e) => setGenerated((prev) => ({ ...prev, content: e.target.value }))}
              />

              <div className="form-control">
                <label className="label-text font-bold block mb-2 px-1 text-base-content/80">
                  📸 블로그 대표 사진 (직접 업로드 또는 URL)
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    className="input input-bordered flex-1 bg-base-100 placeholder-base-content/30 focus:border-primary shadow-inner"
                    placeholder="https://... 또는 직접 파일 업로드"
                    value={generated.imageUrl || ''}
                    onChange={(e) =>
                      setGenerated((prev) => ({ ...prev, imageUrl: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-neutral shrink-0"
                    onClick={() => generatedImageInputRef.current?.click()}
                  >
                    ➕ 사진 선택
                  </button>
                  <input
                    ref={generatedImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      handleImageUpload(e, (url) =>
                        setGenerated((prev) => ({ ...prev, imageUrl: url })),
                      )
                    }
                  />
                </div>
                {generated.imageUrl && (
                  <div className="mt-4 relative group w-full max-w-sm rounded-xl overflow-hidden border border-base-300 shadow-md">
                    <img
                      src={generated.imageUrl}
                      alt="Preview"
                      className="w-full h-auto object-cover max-h-48"
                    />
                    <button
                      type="button"
                      onClick={() => setGenerated((prev) => ({ ...prev, imageUrl: '' }))}
                      className="absolute top-2 right-2 btn btn-circle btn-xs btn-error shadow hover:scale-105"
                      title="이미지 제거"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 p-5 bg-base-300/40 border border-base-300 rounded-2xl flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="label-text font-bold block mb-2 text-base-content/80">
                    📅 예약 발행시간 설정
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="input input-bordered w-full bg-base-100 font-medium"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="ai-random-offset"
                      className="checkbox checkbox-primary checkbox-sm"
                      checked={useRandomOffset}
                      onChange={(e) => setUseRandomOffset(e.target.checked)}
                    />
                    <label
                      htmlFor="ai-random-offset"
                      className="label-text text-xs font-semibold cursor-pointer"
                    >
                      ±
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={randomOffset}
                      onChange={(e) => setRandomOffset(Number(e.target.value))}
                      disabled={!useRandomOffset}
                      className="input input-bordered input-xs w-16 bg-base-100 font-medium"
                    />
                    <span className="text-xs text-base-content/50 font-semibold">분 랜덤</span>
                  </div>
                </div>
                {import.meta.env.DEV && (
                  <div>
                    <label className="label-text font-bold block mb-2 text-base-content/80">
                      🖥️ 브라우저 실행 방식
                    </label>
                    <div className="form-control bg-base-100 p-2.5 rounded-lg border border-base-300 shadow-inner h-[3rem] flex justify-center">
                      <label className="label cursor-pointer justify-start gap-4 py-0">
                        <input
                          type="checkbox"
                          className="toggle toggle-primary toggle-sm"
                          checked={headless}
                          onChange={(e) => setHeadless(e.target.checked)}
                        />
                        <span className="label-text font-bold">
                          백그라운드(headless)로 자동 실행
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col w-full mt-2">
                {accounts.length === 0 && (
                  <div className="text-error text-xs font-bold mb-2 text-center bg-error/10 py-1.5 px-2 rounded-md">
                    ⚠️ 계정 관리 탭에서 네이버 계정을 먼저 등록해주세요.
                  </div>
                )}
                <div className="flex gap-3 w-full">
                  <Btn
                    variant="warning"
                    className="flex-1"
                    onClick={handleSchedule}
                    disabled={scheduling || !scheduledAt || accounts.length === 0}
                  >
                    {scheduling ? (
                      <span className="loading loading-spinner"></span>
                    ) : (
                      '📅 타이머 예약'
                    )}
                  </Btn>
                  <Btn
                    variant="success"
                    className="flex-1"
                    onClick={handlePost}
                    disabled={posting || accounts.length === 0}
                  >
                    {posting ? (
                      <span className="loading loading-spinner"></span>
                    ) : (
                      '🚀 즉시 초안송출'
                    )}
                  </Btn>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    );
  },
);

GenerateTab.displayName = 'GenerateTab';

export default GenerateTab;
