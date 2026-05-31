import React, { useEffect, useRef, useState } from 'react';
import { apiFetch, parseUtcDate } from '../../utils/api';
import { Btn, Card, Input, SectionTitle, StatusBadge, Textarea } from '../common';

const GenerateTab = React.memo(
  ({
    accounts,
    campaigns = [],
    scheduledPosts = [],
    posts = [],
    fetchAll,
    reusedPost,
    clearReusedPost,
  }) => {
    // ── UI 및 전환 상태 ──
    const [activeSubTab, setActiveSubTab] = useState('ai'); // 'ai' 또는 'manual'
    const [campaignsExpanded, setCampaignsExpanded] = useState(false); // 작업대상 포스트 등록 아코디언 상태

    // ── AI 초안 생성기 상태 ──
    const [keyword, setKeyword] = useState('');
    const [engine, setEngine] = useState('gemini');
    const [generated, setGenerated] = useState(null);
    const [loading, setLoading] = useState(false);
    const [posting, setPosting] = useState(false);
    const [scheduling, setScheduling] = useState(false);
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [scheduledAt, setScheduledAt] = useState('');
    const [useRoundRobin, setUseRoundRobin] = useState(true);
    const [headless, setHeadless] = useState(true);
    const [aiMode, setAiMode] = useState('generate'); // 'generate' | 'edit'
    const [editContent, setEditContent] = useState('');
    const [editInstruction, setEditInstruction] = useState(
      '블로그 글을 더 자연스럽고 SEO에 최적화된 형태로 다듬어주세요.',
    );
    const [editing, setEditing] = useState(false);
    const [randomOffset, setRandomOffset] = useState(30); // ±분
    const [useRandomOffset, setUseRandomOffset] = useState(false);

    // ── 수기 작성 발행 상태 ──
    const [manualTitle, setManualTitle] = useState('');
    const [manualContent, setManualContent] = useState('');
    const [manualImageUrl, setManualImageUrl] = useState('');
    const [manualPosting, setManualPosting] = useState(false);
    const [manualScheduling, setManualScheduling] = useState(false);
    const [manualSelectedAccountId, setManualSelectedAccountId] = useState('');
    const [manualScheduledAt, setManualScheduledAt] = useState('');
    const [manualUseRoundRobin, setManualUseRoundRobin] = useState(true);
    const [manualHeadless, setManualHeadless] = useState(true);
    const [manualRandomOffset, setManualRandomOffset] = useState(30);
    const [manualUseRandomOffset, setManualUseRandomOffset] = useState(false);

    // ── 이미지 파일 input refs ──
    const manualImageInputRef = useRef(null);
    const generatedImageInputRef = useRef(null);
    const campaignImageInputRef = useRef(null);

    // ── 작업대상 포스트(캠페인) 등록 상태 ──
    const [newCampaign, setNewCampaign] = useState({ title: '', content: '', image_url: '' });
    const [campaignSubmitting, setCampaignSubmitting] = useState(false);

    // ── 예약 수정 상태 ──
    const [editingPostId, setEditingPostId] = useState(null);
    const [editingTimeValue, setEditingTimeValue] = useState('');

    // ── 외부 이력 재사용 이벤트 감지 (대시보드 등에서 전달된 이벤트 포함) ──
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

    // 기본 계정 설정
    useEffect(() => {
      if (accounts.length > 0) {
        if (!selectedAccountId) setSelectedAccountId(accounts[0].id.toString());
        if (!manualSelectedAccountId) setManualSelectedAccountId(accounts[0].id.toString());
      }
    }, [accounts, selectedAccountId, manualSelectedAccountId]);

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

      // 입력한 텍스트가 80자를 넘거나 줄바꿈(\n)이 포함되어 있으면 기존 글 수정 모드로 판정
      const isLongText = trimmed.length > 80 || trimmed.includes('\n');

      setLoading(true);
      try {
        if (isLongText) {
          // 기존 글 수정 API 자동 전환
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
          // 일반 키워드로 새 글 생성 API
          const data = await apiFetch('/api/generate', {
            method: 'POST',
            body: JSON.stringify({ keyword: trimmed, engine }),
          });
          setGenerated(data);
        }

        // 생성 완료 시 스크롤
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
      if (!useRoundRobin && !selectedAccountId) return alert('계정을 선택하세요.');
      setPosting(true);
      try {
        const payload = {
          title: generated.title,
          content: generated.content,
          image_url: generated.imageUrl || null,
          headless,
          account_id: useRoundRobin ? null : selectedAccountId,
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

    // ── 랜덤 오프셋 적용 헬퍼 ──
    const applyRandomOffset = (isoString, offsetMin) => {
      const offsetMs = (Math.random() * 2 - 1) * offsetMin * 60 * 1000;
      return new Date(new Date(isoString).getTime() + offsetMs).toISOString();
    };

    // ── UTC 시간을 로컬 datetime-local 포맷(YYYY-MM-DDTHH:MM)으로 변환 ──
    const toLocalDateTimeString = (utcString) => {
      if (!utcString) return '';
      const date = new Date(utcString);
      if (Number.isNaN(date.getTime())) return '';
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    };

    // ── AI 초안 타이머 예약 ──
    const handleSchedule = async () => {
      if (!generated || !scheduledAt) return alert('예약 시간을 설정하세요.');
      setScheduling(true);
      try {
        const accId = useRoundRobin ? null : selectedAccountId;
        const rawTime = new Date(scheduledAt).toISOString();
        const finalTime = useRandomOffset ? applyRandomOffset(rawTime, randomOffset) : rawTime;
        const data = await apiFetch('/api/posts/schedule', {
          method: 'POST',
          body: JSON.stringify({
            account_id: accId || null,
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
      if (!manualUseRoundRobin && !manualSelectedAccountId) return alert('계정을 선택하세요.');

      setManualPosting(true);
      try {
        const payload = {
          title: manualTitle,
          content: manualContent,
          image_url: manualImageUrl.trim() || null,
          headless: manualHeadless,
          account_id: manualUseRoundRobin ? null : manualSelectedAccountId,
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
        const accId = manualUseRoundRobin ? null : manualSelectedAccountId;
        const rawTime = new Date(manualScheduledAt).toISOString();
        const finalTime = manualUseRandomOffset
          ? applyRandomOffset(rawTime, manualRandomOffset)
          : rawTime;
        const data = await apiFetch('/api/posts/schedule', {
          method: 'POST',
          body: JSON.stringify({
            account_id: accId || null,
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

    // ── 24/7 자동화 작업대상 포스트(캠페인) 추가 ──
    const handleAddCampaign = async (e) => {
      e.preventDefault();
      if (!newCampaign.title || !newCampaign.content) return;

      setCampaignSubmitting(true);
      try {
        await apiFetch('/api/campaigns', {
          method: 'POST',
          body: JSON.stringify(newCampaign),
        });
        setNewCampaign({ title: '', content: '', image_url: '' });
        setCampaignsExpanded(false);
        await fetchAll();
        alert('✅ 24시간 자동화 작업대상 포스트가 성공적으로 등록되었습니다!');
      } catch (err) {
        alert(`등록 실패: ${err.message}`);
      } finally {
        setCampaignSubmitting(false);
      }
    };

    // ── 작업대상 포스트(캠페인) 활성/정지 토글 ──
    const handleCampaignStatusToggle = async (id, currentStatus) => {
      const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
      try {
        await apiFetch(`/api/campaigns/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus }),
        });
        await fetchAll();
      } catch (err) {
        alert(`상태 변경 실패: ${err.message}`);
      }
    };

    // ── 작업대상 포스트(캠페인) 삭제 ──
    const handleCampaignDelete = async (id) => {
      if (
        !window.confirm(
          '정말 이 작업대상 포스트를 삭제하시겠습니까? 관련 무한 루프 작업이 중단됩니다.',
        )
      )
        return;
      try {
        await apiFetch(`/api/campaigns/${id}`, { method: 'DELETE' });
        await fetchAll();
      } catch (err) {
        alert(`삭제 실패: ${err.message}`);
      }
    };

    // ── 예약 발행 취소 ──
    const handleCancelSchedule = async (id) => {
      if (!confirm('이 예약을 취소하고 대기열에서 제거하시겠습니까?')) return;
      try {
        await apiFetch(`/api/posts/scheduled/${id}`, { method: 'DELETE' });
        await fetchAll();
      } catch (err) {
        alert(`오류: ${err.message}`);
      }
    };

    // ── 예약 글 즉시 강제발행 ──
    const handlePublishNow = async (id) => {
      if (!confirm('이 예약 포스트를 즉시 발행하시겠습니까?')) return;
      try {
        const res = await apiFetch(`/api/posts/${id}/publish-now`, { method: 'POST' });
        alert(res.message);
        await fetchAll();
      } catch (err) {
        alert(`오류: ${err.message}`);
      }
    };

    // ── 예약 발행 시간 수정 적용 ──
    const handleUpdateScheduleTime = async (id) => {
      if (!editingTimeValue) return alert('예약 시간을 입력하세요.');
      try {
        const utcTime = new Date(editingTimeValue).toISOString();
        const res = await apiFetch(`/api/posts/scheduled/${id}/time`, {
          method: 'PATCH',
          body: JSON.stringify({ scheduled_at: utcTime }),
        });
        alert(res.message || '예약 시간이 성공적으로 변경되었습니다!');
        setEditingPostId(null);
        setEditingTimeValue('');
        await fetchAll();
      } catch (err) {
        alert(`수정 실패: ${err.message}`);
      }
    };

    // ── 이력 재사용 버튼 클릭 핸들러 ──
    const handleReuseHistoryPost = (post) => {
      setManualTitle(post.title || '');
      setManualContent(post.content || '');
      setManualImageUrl(post.image_url || '');
      setActiveSubTab('manual');

      setTimeout(() => {
        const composeContainer = document.getElementById('compose-hub-card');
        if (composeContainer) {
          composeContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    };

    // ── 이력 대기열 재예약 ──
    const handleReScheduleHistoryPost = async (post) => {
      if (!confirm('이 글을 예약 대기열에 그대로 다시 등록하시겠습니까?')) return;
      try {
        await apiFetch('/api/posts/schedule', {
          method: 'POST',
          body: JSON.stringify({
            title: post.title,
            content: post.content,
            image_url: post.image_url,
            headless: post.headless === 1,
          }),
        });
        alert('성공적으로 예약 대기열에 다시 등록되었습니다!');
        await fetchAll();
      } catch (err) {
        alert(`재예약 실패: ${err.message}`);
      }
    };

    // ── 최근 발행 이력 개별 삭제 ──
    const handleDeleteHistoryPost = async (id) => {
      if (
        !window.confirm(
          '이 발행 기록을 삭제하시겠습니까? (블로그 포스팅 자체는 삭제되지 않습니다.)',
        )
      )
        return;
      try {
        await apiFetch(`/api/posts/${id}`, { method: 'DELETE' });
        await fetchAll();
      } catch (err) {
        alert(`삭제 실패: ${err.message}`);
      }
    };

    return (
      <div className="flex flex-col gap-6">
        {/* ── 1. 상단 실시간 통합 현황판 (Stat Cards) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card bg-base-200 border border-base-300 p-4 shadow-md flex flex-row items-center gap-4 hover:shadow-lg transition-shadow">
            <div className="text-3xl p-3 bg-primary/10 text-primary rounded-xl">🎯</div>
            <div>
              <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
                활성 작업대상 포스트
              </div>
              <div className="text-2xl font-black text-base-content">
                {campaigns.filter((c) => c.status === 'active').length}{' '}
                <span className="text-base font-bold text-base-content/50">
                  / {campaigns.length}개
                </span>
              </div>
            </div>
          </div>
          <div className="card bg-base-200 border border-base-300 p-4 shadow-md flex flex-row items-center gap-4 hover:shadow-lg transition-shadow">
            <div className="text-3xl p-3 bg-warning/10 text-warning rounded-xl">📅</div>
            <div>
              <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
                예약 대기열
              </div>
              <div className="text-2xl font-black text-base-content">{scheduledPosts.length}개</div>
            </div>
          </div>
          <div className="card bg-base-200 border border-base-300 p-4 shadow-md flex flex-row items-center gap-4 hover:shadow-lg transition-shadow">
            <div className="text-3xl p-3 bg-success/10 text-success rounded-xl">📜</div>
            <div>
              <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
                최근 발행 성공률
              </div>
              <div className="text-2xl font-black text-base-content">
                {posts.length > 0
                  ? `${Math.round((posts.filter((p) => p.status === 'published').length / posts.length) * 100)}%`
                  : '0%'}
                <span className="text-xs font-medium text-base-content/40 ml-1.5">
                  ({posts.length}건)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. 메인 2단 레이아웃 ── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          {/* ── 좌측 영역 (7/12 cols): 글 작성 및 생성 허브 ── */}
          <div className="xl:col-span-7 space-y-6">
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
                  ✨ AI 블로그 원고 생성기
                </button>
                <button
                  onClick={() => setActiveSubTab('manual')}
                  className={`flex-1 py-3 text-center rounded-lg font-black text-sm transition-all duration-200 cursor-pointer ${
                    activeSubTab === 'manual'
                      ? 'bg-primary text-primary-content shadow-md scale-[1.01]'
                      : 'text-base-content/60 hover:text-base-content font-bold'
                  }`}
                >
                  ✍️ 수기 직접 작성 및 즉시발행
                </button>
              </div>

              {activeSubTab === 'ai' ? (
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
                            className="textarea input-lg input-bordered w-full h-[200px] p-4 pl-12 bg-base-100 placeholder-base-content/30 focus:border-primary shadow-inner"
                            placeholder="예: 성수동 핫플 카페 5곳 정리 (또는 작성해둔 글을 그대로 붙여넣으세요)"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            onKeyDown={(e) =>
                              e.key === 'Enter' && !e.nativeEvent.isComposing && handleGenerate()
                            }
                          />
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 items-end">
                        <div className="flex-1 w-full">
                          <label className="label-text font-bold block mb-2 px-1 text-base-content/80">
                            AI 지능 (엔진)
                          </label>
                          <select
                            value={engine}
                            onChange={(e) => setEngine(e.target.value)}
                            className="select select-bordered w-full bg-base-100 font-semibold h-[3rem]"
                          >
                            <option value="gemini">✨ 클라우드 AI API (Gemini)</option>
                            {import.meta.env.DEV && (
                              <option value="ollama">🦙 Ollama (로컬무료)</option>
                            )}
                          </select>
                        </div>
                        <Btn
                          variant="primary"
                          className="h-[3rem] w-full sm:w-auto px-8"
                          onClick={handleGenerate}
                          disabled={loading}
                        >
                          {loading ? (
                            <span className="loading loading-dots"></span>
                          ) : (
                            '🚀 초안 생성'
                          )}
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
                      <Btn
                        variant="primary"
                        className="w-full"
                        onClick={handleEdit}
                        disabled={editing}
                      >
                        {editing ? (
                          <span className="loading loading-dots"></span>
                        ) : (
                          '✨ AI로 글 다듬기'
                        )}
                      </Btn>
                    </div>
                  )}
                </div>
              ) : (
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
                    <div>
                      <label className="label-text font-bold block mb-2 text-base-content/80">
                        🚀 네이버 계정 선택
                      </label>
                      <div className="form-control bg-base-100 p-2.5 rounded-lg border border-base-300 mb-2 shadow-inner">
                        <label className="label cursor-pointer justify-start gap-4 py-0">
                          <input
                            type="checkbox"
                            className="toggle toggle-primary toggle-sm"
                            checked={manualUseRoundRobin}
                            onChange={(e) => setManualUseRoundRobin(e.target.checked)}
                          />
                          <span className="label-text font-bold">
                            자동 라운드로빈 배정 (활성 계정 순차 순환)
                          </span>
                        </label>
                      </div>
                      {!manualUseRoundRobin && (
                        <select
                          value={manualSelectedAccountId}
                          onChange={(e) => setManualSelectedAccountId(e.target.value)}
                          className="select select-bordered w-full bg-base-100 font-semibold"
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              👉 {a.naver_id} 계정 ({a.status})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          <span className="text-xs text-base-content/50 font-semibold">
                            분 랜덤
                          </span>
                        </div>
                      </div>
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
                      {engine === 'gemini' ? 'Gemini API' : 'Ollama Engine'} 초안 완료
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
                  <div>
                    <label className="label-text font-bold block mb-2 text-base-content/80">
                      🚀 네이버 계정 선택
                    </label>
                    <div className="form-control bg-base-100 p-2.5 rounded-lg border border-base-300 mb-2 shadow-inner">
                      <label className="label cursor-pointer justify-start gap-4 py-0">
                        <input
                          type="checkbox"
                          className="toggle toggle-primary toggle-sm"
                          checked={useRoundRobin}
                          onChange={(e) => setUseRoundRobin(e.target.checked)}
                        />
                        <span className="label-text font-bold">
                          자동 라운드로빈 배정 (활성 계정 순차 순환)
                        </span>
                      </label>
                    </div>
                    {!useRoundRobin && (
                      <select
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                        className="select select-bordered w-full bg-base-100 font-semibold"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            👉 {a.naver_id} 계정 ({a.status})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {/* ── 우측 영역 (5/12 cols): 현황판 및 자동화 관리 패널 ── */}
          <div className="xl:col-span-5 space-y-6">
            {/* ── 24/7 자동화 작업대상 포스트(캠페인) 관리 ── */}
            <Card>
              <SectionTitle className="flex justify-between items-center mb-4 pb-2">
                <div className="flex items-center gap-2">
                  <span>🎯 24/7 자동화 대상포스트</span>
                  <span className="badge badge-primary font-bold">{campaigns.length}</span>
                </div>
                <button
                  onClick={() => setCampaignsExpanded(!campaignsExpanded)}
                  className="btn btn-xs btn-ghost text-xs cursor-pointer border border-base-300 hover:bg-base-300"
                >
                  {campaignsExpanded ? '➖ 닫기' : '➕ 등록하기'}
                </button>
              </SectionTitle>

              {/* 아코디언식 등록 폼 */}
              {campaignsExpanded && (
                <form
                  onSubmit={handleAddCampaign}
                  className="p-4 bg-base-300/30 border border-base-300 rounded-xl mb-6 space-y-4 animate-in slide-in-from-top-2 duration-200"
                >
                  <h3 className="font-extrabold text-sm text-primary">✨ 새 자동화 대상 등록</h3>

                  <div className="form-control">
                    <label className="label py-0.5">
                      <span className="label-text font-bold text-xs text-base-content/80">
                        원본 제목 (AI가 매번 다르게 작성)
                      </span>
                    </label>
                    <input
                      type="text"
                      className="input input-sm input-bordered w-full bg-base-100 font-semibold"
                      placeholder="예: 2026년 인공지능 기술 트렌드"
                      value={newCampaign.title}
                      onChange={(e) =>
                        setNewCampaign((prev) => ({ ...prev, title: e.target.value }))
                      }
                    />
                  </div>

                  <div className="form-control">
                    <label className="label py-0.5">
                      <span className="label-text font-bold text-xs text-base-content/80">
                        원본 본문 (AI가 다듬을 핵심 뼈대)
                      </span>
                    </label>
                    <textarea
                      className="textarea textarea-sm textarea-bordered w-full h-24 bg-base-100 leading-normal"
                      placeholder="핵심 내용을 넣어두면 AI가 매번 새로운 글을 무작위로 자동 완성합니다..."
                      value={newCampaign.content}
                      onChange={(e) =>
                        setNewCampaign((prev) => ({ ...prev, content: e.target.value }))
                      }
                    />
                  </div>

                  <div className="form-control">
                    <label className="label py-0.5">
                      <span className="label-text font-bold text-xs text-base-content/80">
                        원본 대표 이미지
                      </span>
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        className="input input-sm input-bordered flex-1 bg-base-100 text-xs font-medium"
                        placeholder="https://... 또는 직접 파일 선택"
                        value={newCampaign.image_url || ''}
                        onChange={(e) =>
                          setNewCampaign((prev) => ({ ...prev, image_url: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-neutral btn-sm shrink-0"
                        onClick={() => campaignImageInputRef.current?.click()}
                      >
                        📸 업로드
                      </button>
                      <input
                        ref={campaignImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          handleImageUpload(e, (url) =>
                            setNewCampaign((prev) => ({ ...prev, image_url: url })),
                          )
                        }
                      />
                    </div>
                  </div>

                  <Btn
                    variant="primary"
                    type="submit"
                    className="w-full btn-sm font-extrabold py-0.5"
                    disabled={campaignSubmitting}
                  >
                    {campaignSubmitting ? (
                      <span className="loading loading-spinner loading-xs"></span>
                    ) : (
                      '🚀 등록 및 자동화 시작'
                    )}
                  </Btn>
                </form>
              )}

              {/* 목록 */}
              {campaigns.length === 0 ? (
                <div className="text-center py-8 text-xs text-base-content/50 border border-dashed border-base-300 rounded-xl bg-base-100/10">
                  등록된 작업대상 포스트가 없습니다.
                </div>
              ) : (
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {campaigns.map((camp) => (
                    <div
                      key={camp.id}
                      className="p-3.5 bg-base-100 border border-base-300 rounded-xl shadow-sm hover:shadow transition-all flex flex-col gap-2.5"
                    >
                      <div className="flex justify-between items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <StatusBadge status={camp.status} />
                            <span className="text-[10px] text-base-content/40 font-semibold">
                              {parseUtcDate(camp.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <h4 className="font-extrabold text-sm text-base-content truncate pr-2">
                            {camp.title}
                          </h4>
                        </div>
                        <div className="flex gap-1 shrink-0 ml-1.5">
                          <button
                            onClick={() => handleCampaignStatusToggle(camp.id, camp.status)}
                            className={`btn btn-xs cursor-pointer ${camp.status === 'active' ? 'btn-ghost border-base-300' : 'btn-success btn-outline'}`}
                            title={camp.status === 'active' ? '일시 정지' : '작동 시작'}
                          >
                            {camp.status === 'active' ? '⏸' : '▶'}
                          </button>
                          <button
                            onClick={() => handleCampaignDelete(camp.id)}
                            className="btn btn-xs btn-error btn-outline cursor-pointer"
                            title="삭제"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-base-content/60 line-clamp-2 leading-relaxed font-medium bg-base-200/50 p-2 rounded-lg">
                        {camp.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* ── 발행 대기열 현황 ── */}
            <Card>
              <SectionTitle className="mb-4 pb-2">
                <div className="flex items-center gap-2">
                  <span>📅 발행 대기열 현황</span>
                  <span className="badge badge-warning font-bold text-xs">
                    {scheduledPosts.length}
                  </span>
                </div>
              </SectionTitle>

              {scheduledPosts.length === 0 ? (
                <div className="text-center py-8 text-xs text-base-content/50 border border-dashed border-base-300 rounded-xl bg-base-100/10">
                  대기 중인 예약 포스트가 없습니다.
                </div>
              ) : (
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {scheduledPosts.map((post) => (
                    <div
                      key={post.id}
                      className="p-3.5 bg-base-100 border border-base-300 rounded-xl shadow-sm flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge status={post.status} />
                          <span className="badge badge-neutral badge-xs font-mono font-bold opacity-60">
                            {post.naver_id ? `@${post.naver_id}` : '🔄 자동'}
                          </span>
                        </div>
                        <h4 className="font-extrabold text-sm text-base-content truncate pr-1">
                          {post.title}
                        </h4>
                        <div className="text-[11px] text-base-content/40 mt-1.5 font-semibold">
                          {editingPostId === post.id ? (
                            <div className="flex items-center gap-2 mt-1">
                              <input
                                type="datetime-local"
                                value={editingTimeValue}
                                onChange={(e) => setEditingTimeValue(e.target.value)}
                                className="input input-bordered input-xs bg-base-100 font-medium w-44"
                              />
                              <button
                                onClick={() => handleUpdateScheduleTime(post.id)}
                                className="btn btn-xs btn-primary font-bold cursor-pointer"
                              >
                                저장
                              </button>
                              <button
                                onClick={() => {
                                  setEditingPostId(null);
                                  setEditingTimeValue('');
                                }}
                                className="btn btn-xs btn-ghost border-base-300 font-bold cursor-pointer"
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {post.scheduled_at ? (
                                <span className="text-warning">
                                  📅 {parseUtcDate(post.scheduled_at).toLocaleString('ko-KR')}
                                </span>
                              ) : (
                                <span className="text-info">⏳ 스케줄러 기동 시 발행</span>
                              )}
                              <button
                                onClick={() => {
                                  setEditingPostId(post.id);
                                  setEditingTimeValue(
                                    toLocalDateTimeString(post.scheduled_at) ||
                                      toLocalDateTimeString(new Date()),
                                  );
                                }}
                                className="btn btn-xs btn-ghost btn-circle text-[10px] w-5 h-5 min-h-0 cursor-pointer border border-base-300 hover:bg-base-300"
                                title="예약 시간 수정"
                              >
                                ✏️
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          onClick={() => handlePublishNow(post.id)}
                          className="btn btn-xs btn-success btn-outline font-bold cursor-pointer"
                          title="즉시 강제발행"
                        >
                          🚀 발행
                        </button>
                        <button
                          onClick={() => handleCancelSchedule(post.id)}
                          className="btn btn-xs btn-error btn-outline font-bold cursor-pointer"
                          title="취소"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* ── 최근 발행 이력 ── */}
            <Card>
              <SectionTitle className="mb-4 pb-2">
                <div className="flex items-center gap-2">
                  <span>📜 최근 발행 이력</span>
                  <span className="text-xs text-base-content/40 font-medium">(최근 15개)</span>
                </div>
              </SectionTitle>

              {posts.length === 0 ? (
                <div className="text-center py-8 text-xs text-base-content/50 border border-dashed border-base-300 rounded-xl bg-base-100/10">
                  발행 기록이 없습니다.
                </div>
              ) : (
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {posts.slice(0, 15).map((post) => (
                    <div
                      key={post.id}
                      className="p-3.5 bg-base-100 border border-base-300 rounded-xl shadow-sm flex flex-col gap-2.5"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`badge badge-sm font-bold ${post.status === 'published' ? 'badge-success shadow-[0_0_6px_rgba(34,197,94,0.4)]' : 'badge-error'}`}
                            >
                              {post.status === 'published' ? '성공' : '실패'}
                            </span>
                            <span className="text-xs font-mono font-bold opacity-60">
                              @{post.naver_id || 'unknown'}
                            </span>
                          </div>
                          <h4
                            className="font-extrabold text-sm text-base-content truncate pr-1"
                            title={post.title}
                          >
                            {post.title}
                          </h4>
                        </div>
                        <div className="flex gap-1 shrink-0 ml-1">
                          <button
                            onClick={() => handleReuseHistoryPost(post)}
                            className="btn btn-xs btn-primary font-bold cursor-pointer"
                            title="이 글의 내용을 편집기에 불러옵니다"
                          >
                            🔄 사용
                          </button>
                          <button
                            onClick={() => handleReScheduleHistoryPost(post)}
                            className="btn btn-xs btn-neutral font-bold cursor-pointer"
                            title="대기열에 그대로 재예약"
                          >
                            📅 예약
                          </button>
                          <button
                            onClick={() => handleDeleteHistoryPost(post.id)}
                            className="btn btn-xs btn-error btn-outline font-bold cursor-pointer"
                            title="발행 기록 삭제"
                          >
                            🗑 삭제
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] text-base-content/40 font-semibold">
                        <span>{parseUtcDate(post.created_at).toLocaleString('ko-KR')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    );
  },
);

export default GenerateTab;
