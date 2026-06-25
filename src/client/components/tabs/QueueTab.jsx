import React, { useState } from 'react';
import { apiFetch, parseUtcDate } from '../../utils/api';
import { Card, SectionTitle, StatusBadge } from '../common';

// ── UTC 시간을 로컬 datetime-local 포맷(YYYY-MM-DDTHH:MM)으로 변환 ──
const toLocalDateTimeString = (utcString) => {
  if (!utcString) return '';
  const date = parseUtcDate(utcString);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (num) => String(num).padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());

  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
};

const getThumbnail = (imageUrlStr) => {
  if (!imageUrlStr) return null;
  if (imageUrlStr.startsWith('http')) return imageUrlStr;
  try {
    const parsed = JSON.parse(imageUrlStr);
    if (parsed.representative && parsed.representative.length > 0) return parsed.representative[0];
    if (parsed.content && parsed.content.length > 0) return parsed.content[0];
  } catch (_e) {
    return imageUrlStr;
  }
  return null;
};

// ── 미려한 인라인 SVG 아이콘 컴포넌트 ──
const SuccessIcon = () => (
  <svg
    className="w-3.5 h-3.5 text-success shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={3}
  >
    <title>발행 완료</title>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const FailedIcon = () => (
  <svg
    className="w-3.5 h-3.5 text-error shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={3}
  >
    <title>발행 실패</title>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const PendingIcon = () => (
  <svg
    className="w-3.5 h-3.5 text-base-content/20 shrink-0 animate-pulse"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={3}
  >
    <title>예약 대기</title>
    <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
  </svg>
);

const renderProgressIcons = (
  publishedCount = 0,
  activeCount = 0,
  totalCount = 5,
  failedCount = 0,
) => {
  const icons = [];

  // 성공한 개수만큼 SuccessIcon 추가
  for (let i = 0; i < publishedCount; i++) {
    icons.push(<SuccessIcon key={`success-${i}`} />);
  }

  // 실패한 개수만큼 FailedIcon 추가
  for (let i = 0; i < failedCount; i++) {
    icons.push(<FailedIcon key={`failed-${i}`} />);
  }

  // 대기 중인 개수만큼 PendingIcon 추가
  for (let i = 0; i < activeCount; i++) {
    icons.push(<PendingIcon key={`pending-${i}`} />);
  }

  return (
    <div className="flex items-center gap-1 bg-base-200/60 px-2 py-0.5 rounded-md border border-base-300/40">
      <div className="flex items-center gap-0.5">{icons}</div>
      <span className="text-[10px] font-bold text-base-content/60 ml-1">
        ({publishedCount}/{totalCount}){' '}
        {activeCount === 0 && failedCount === 0 ? '완료' : '예약진행중'}
      </span>
    </div>
  );
};

const QueueTab = React.memo(({ scheduledPosts = [], posts = [], fetchAll, onReusePost }) => {
  // ── 예약 수정 상태 ──
  const [editingPostId, setEditingPostId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [editingKeyword, setEditingKeyword] = useState('');
  const [editingTags, setEditingTags] = useState('');
  const [editingTimeValue, setEditingTimeValue] = useState('');
  const [expandedPostIds, setExpandedPostIds] = useState({});
  const [updating, setUpdating] = useState(false);

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

  // ── 예약 글 상세 정보 수정 적용 ──
  const handleUpdatePost = async (id) => {
    if (!editingTimeValue) return alert('예약 시간을 입력하세요.');
    setUpdating(true);
    try {
      const utcTime = new Date(editingTimeValue).toISOString();
      const res = await apiFetch(`/api/posts/scheduled/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editingTitle,
          content: editingContent,
          keyword: editingKeyword,
          tags: editingTags,
          scheduled_at: utcTime,
        }),
      });
      alert(res.message || '예약 정보가 성공적으로 변경되었습니다!');
      setEditingPostId(null);
      await fetchAll();
    } catch (err) {
      alert(`수정 실패: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  // ── 이력 재사용 버튼 클릭 핸들러 ──
  const handleReuseHistoryPost = (post) => {
    onReusePost(post);
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
      !window.confirm('이 발행 기록을 삭제하시겠습니까? (블로그 포스팅 자체는 삭제되지 않습니다.)')
    )
      return;
    try {
      await apiFetch(`/api/posts/${id}`, { method: 'DELETE' });
      await fetchAll();
    } catch (err) {
      alert(`삭제 실패: ${err.message}`);
    }
  };

  const startEditing = (post) => {
    setEditingPostId(post.id);
    setEditingTitle(post.title || '');
    setEditingContent(post.content || '');
    setEditingKeyword(post.keyword || '');
    setEditingTags(post.tags || '');
    setEditingTimeValue(
      toLocalDateTimeString(post.scheduled_at) || toLocalDateTimeString(new Date()),
    );
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* ── 발행 대기열 현황 ── */}
      <Card>
        <SectionTitle className="mb-4 pb-2">
          <div className="flex items-center gap-2">
            <span>📅 발행 대기열 현황</span>
            <span className="badge badge-warning font-bold text-xs">{scheduledPosts.length}</span>
          </div>
        </SectionTitle>

        {scheduledPosts.length === 0 ? (
          <div className="text-center py-8 text-xs text-base-content/50 border border-dashed border-base-300 rounded-xl bg-base-100/10">
            대기 중인 예약 포스트가 없습니다.
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {scheduledPosts.map((post) => {
              if (post.is_group) {
                return (
                  <div
                    key={post.id}
                    className="p-3.5 bg-base-100 border border-base-300 rounded-xl shadow-sm flex flex-col gap-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          {renderProgressIcons(
                            post.published_count,
                            post.active_count,
                            post.total_count,
                            post.failed_count,
                          )}
                          <span className="badge badge-secondary badge-xs font-bold">
                            🔑 자동 키워드 일괄
                          </span>
                          {post.keyword ? (
                            <span className="badge badge-accent badge-xs font-bold text-accent-content">
                              #{post.keyword}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-3">
                          <h4 className="font-extrabold text-xs text-base-content truncate pr-1">
                            {post.title}
                          </h4>
                        </div>

                        <div className="text-[11px] text-base-content/40 mt-2 font-semibold flex items-center gap-2 flex-wrap">
                          {post.scheduled_at ? (
                            <span className="text-warning font-bold text-xs bg-warning/10 px-2 py-0.5 rounded-md">
                              📅 다음 발행:{' '}
                              {parseUtcDate(post.scheduled_at)?.toLocaleString('ko-KR') || '-'}
                            </span>
                          ) : (
                            <span className="text-info font-bold text-xs bg-info/10 px-2 py-0.5 rounded-md">
                              ⏳ 즉시 (스케줄러 기동 시)
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPostIds((prev) => ({
                                ...prev,
                                [post.id]: !prev[post.id],
                              }))
                            }
                            className="btn btn-xs btn-ghost border border-base-300 px-2 h-5 min-h-0 font-bold hover:bg-base-300 cursor-pointer"
                            title={expandedPostIds[post.id] ? '상세 닫기' : '상세보기'}
                          >
                            {expandedPostIds[post.id] ? '상세 닫기 🔼' : '상세보기 🔍'}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCancelSchedule(post.id)}
                          className="btn btn-xs btn-error btn-outline font-bold cursor-pointer"
                          title="그룹 전체 취소"
                        >
                          ✕ 전체취소
                        </button>
                      </div>
                    </div>

                    {/* 아코디언 영역: 그룹 내 개별 포스트 리스트 */}
                    {expandedPostIds[post.id] && post.group_posts ? (
                      <div className="mt-2.5 p-3 bg-base-200/50 rounded-lg border border-base-300/60 space-y-2.5 animate-in slide-in-from-top-1 duration-150">
                        <div className="text-[11px] font-black text-base-content/50 uppercase tracking-wider mb-1">
                          📋 그룹 내 예약 글 목록 ({post.group_posts.length}건)
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {post.group_posts.map((gPost) => (
                            <div
                              key={gPost.id}
                              className="p-2.5 bg-base-100 border border-base-300/40 rounded-lg flex items-center justify-between gap-3 shadow-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span
                                    className={`badge badge-[10px] font-bold h-4 px-1.5 min-h-0 ${
                                      gPost.status === 'published'
                                        ? 'badge-success text-white'
                                        : gPost.status === 'failed'
                                          ? 'badge-error text-white'
                                          : 'badge-warning'
                                    }`}
                                  >
                                    {gPost.status === 'published'
                                      ? '성공'
                                      : gPost.status === 'failed'
                                        ? '실패'
                                        : '대기'}
                                  </span>
                                  <span className="text-[10px] text-base-content/40 font-mono font-bold">
                                    {gPost.scheduled_at
                                      ? parseUtcDate(gPost.scheduled_at)?.toLocaleString('ko-KR')
                                      : '즉시'}
                                  </span>
                                </div>

                                {editingPostId === gPost.id ? (
                                  <div className="space-y-2.5 p-2 bg-base-200/70 rounded-md border border-base-300/80 mt-1">
                                    <input
                                      type="text"
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      className="input input-bordered input-xs w-full font-bold bg-base-100"
                                      placeholder="제목"
                                    />
                                    <input
                                      type="text"
                                      value={editingKeyword}
                                      onChange={(e) => setEditingKeyword(e.target.value)}
                                      className="input input-bordered input-xs w-full bg-base-100"
                                      placeholder="키워드"
                                    />
                                    <input
                                      type="text"
                                      value={editingTags}
                                      onChange={(e) => setEditingTags(e.target.value)}
                                      className="input input-bordered input-xs w-full bg-base-100"
                                      placeholder="태그 (쉼표로 구분)"
                                    />
                                    <textarea
                                      value={editingContent}
                                      onChange={(e) => setEditingContent(e.target.value)}
                                      className="textarea textarea-bordered textarea-xs w-full h-20 bg-base-100"
                                      placeholder="본문 내용"
                                    />
                                    <input
                                      type="datetime-local"
                                      value={editingTimeValue}
                                      onChange={(e) => setEditingTimeValue(e.target.value)}
                                      className="input input-bordered input-xs bg-base-100 w-full"
                                    />
                                    <div className="flex gap-1.5 justify-end">
                                      <button
                                        type="button"
                                        onClick={() => handleUpdatePost(gPost.id)}
                                        className="btn btn-2xs btn-primary font-bold cursor-pointer"
                                        disabled={updating}
                                      >
                                        {updating ? '..' : '저장'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingPostId(null)}
                                        className="btn btn-2xs btn-ghost border-base-300 font-bold cursor-pointer"
                                      >
                                        취소
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-extrabold text-xs text-base-content truncate">
                                      {gPost.title}
                                    </div>
                                    {gPost.tags ? (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {gPost.tags.split(',').map((t) => (
                                          <span
                                            key={`${gPost.id}-tag-${t.trim()}`}
                                            className="badge badge-primary badge-outline text-[9px] font-bold h-4 px-1 min-h-0"
                                          >
                                            {t.trim()}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </div>

                              {editingPostId !== gPost.id ? (
                                <div className="flex gap-1 shrink-0">
                                  {gPost.status !== 'published' && gPost.status !== 'failed' ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handlePublishNow(gPost.id)}
                                        className="btn btn-[10px] h-5 min-h-0 px-1.5 btn-success btn-outline font-black cursor-pointer"
                                        title="즉시 발행"
                                      >
                                        🚀
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => startEditing(gPost)}
                                        className="btn btn-[10px] h-5 min-h-0 px-1.5 btn-ghost border border-base-300 font-bold cursor-pointer"
                                        title="수정"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleCancelSchedule(gPost.id)}
                                        className="btn btn-[10px] h-5 min-h-0 px-1.5 btn-error btn-outline font-bold cursor-pointer"
                                        title="취소"
                                      >
                                        ✕
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              }

              // 기존 단일 예약 글 렌더링
              return (
                <div
                  key={post.id}
                  className="p-3.5 bg-base-100 border border-base-300 rounded-xl shadow-sm flex flex-col gap-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <StatusBadge status={post.status} />
                        <span className="badge badge-neutral badge-xs font-mono font-bold opacity-60">
                          {post.naver_id ? `@${post.naver_id}` : '🔄 자동'}
                        </span>
                        {post.post_type === 'keyword' ? (
                          <span className="badge badge-secondary badge-xs font-bold">
                            🔑 자동 키워드
                          </span>
                        ) : null}
                        {post.post_type === 'manual' || !post.post_type ? (
                          <span className="badge badge-ghost badge-xs font-bold border border-base-300 text-base-content/75">
                            ✍️ 수기/AI초안
                          </span>
                        ) : null}
                        {post.keyword ? (
                          <span className="badge badge-accent badge-xs font-bold text-accent-content">
                            #{post.keyword}
                          </span>
                        ) : null}
                        {post.tags
                          ? post.tags.split(',').map((t) => (
                              <span
                                key={`${post.id}-tag-${t.trim()}`}
                                className="badge badge-primary badge-outline badge-xs font-bold text-[10px]"
                              >
                                {t.trim()}
                              </span>
                            ))
                          : null}
                      </div>

                      {editingPostId === post.id ? (
                        <div className="space-y-3 p-3 bg-base-200/50 rounded-lg border border-base-300 animate-in fade-in duration-200">
                          <div>
                            <div className="label-text font-bold block mb-1 text-[11px] text-base-content/70">
                              제목
                            </div>
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              className="input input-bordered input-sm w-full bg-base-100 font-bold"
                            />
                          </div>
                          <div>
                            <div className="label-text font-bold block mb-1 text-[11px] text-base-content/70">
                              키워드
                            </div>
                            <input
                              type="text"
                              value={editingKeyword}
                              onChange={(e) => setEditingKeyword(e.target.value)}
                              className="input input-bordered input-sm w-full bg-base-100 font-semibold"
                              placeholder="예약 키워드"
                            />
                          </div>
                          <div>
                            <div className="label-text font-bold block mb-1 text-[11px] text-base-content/70">
                              태그 (콤마 구분)
                            </div>
                            <input
                              type="text"
                              value={editingTags}
                              onChange={(e) => setEditingTags(e.target.value)}
                              className="input input-bordered input-sm w-full bg-base-100 font-semibold"
                              placeholder="맛집,데이트"
                            />
                          </div>
                          <div>
                            <div className="label-text font-bold block mb-1 text-[11px] text-base-content/70">
                              본문 내용
                            </div>
                            <textarea
                              value={editingContent}
                              onChange={(e) => setEditingContent(e.target.value)}
                              className="textarea textarea-bordered textarea-sm w-full h-32 bg-base-100 font-medium leading-relaxed"
                            />
                          </div>
                          <div>
                            <div className="label-text font-bold block mb-1 text-[11px] text-base-content/70">
                              예약 시간
                            </div>
                            <input
                              type="datetime-local"
                              value={editingTimeValue}
                              onChange={(e) => setEditingTimeValue(e.target.value)}
                              className="input input-bordered input-sm bg-base-100 font-medium w-full text-xs"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => handleUpdatePost(post.id)}
                              className="btn btn-xs btn-primary font-black cursor-pointer"
                              disabled={updating}
                            >
                              {updating ? (
                                <span className="loading loading-spinner loading-xs"></span>
                              ) : (
                                '저장'
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPostId(null);
                              }}
                              className="btn btn-xs btn-ghost border-base-300 font-bold cursor-pointer"
                              disabled={updating}
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                            {getThumbnail(post.image_url) ? (
                              <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-base-300">
                                <img
                                  src={getThumbnail(post.image_url)}
                                  alt="thumbnail"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : null}
                            <h4 className="font-extrabold text-sm text-base-content truncate pr-1">
                              {post.title}
                            </h4>
                          </div>
                          <div className="text-[11px] text-base-content/40 mt-2 font-semibold flex items-center gap-2 flex-wrap">
                            {post.scheduled_at ? (
                              <span className="text-warning font-bold text-xs bg-warning/10 px-2 py-0.5 rounded-md">
                                📅 {parseUtcDate(post.scheduled_at)?.toLocaleString('ko-KR') || '-'}
                              </span>
                            ) : (
                              <span className="text-info font-bold text-xs bg-info/10 px-2 py-0.5 rounded-md">
                                ⏳ 즉시 (스케줄러 기동 시)
                              </span>
                            )}
                            {post.republish_interval_ms > 0 && post.scheduled_at ? (
                              <span
                                className="text-secondary font-bold text-[10px] bg-secondary/10 px-2 py-0.5 rounded-md"
                                title="발행 완료 후 동일 키워드로 새 원고가 자동 생성·예약됩니다"
                              >
                                🔁 다음 재발행:{' '}
                                {new Date(
                                  parseUtcDate(post.scheduled_at).getTime() +
                                    post.republish_interval_ms,
                                ).toLocaleString('ko-KR')}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => startEditing(post)}
                              className="btn btn-xs btn-ghost btn-circle text-[10px] w-5 h-5 min-h-0 cursor-pointer border border-base-300 hover:bg-base-300"
                              title="상세 수정"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPostIds((prev) => ({
                                  ...prev,
                                  [post.id]: !prev[post.id],
                                }))
                              }
                              className="btn btn-xs btn-ghost btn-circle text-[10px] w-5 h-5 min-h-0 cursor-pointer border border-base-300 hover:bg-base-300"
                              title={expandedPostIds[post.id] ? '본문 숨기기' : '본문 보기'}
                            >
                              {expandedPostIds[post.id] ? '🔼' : '🔍'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {editingPostId !== post.id ? (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePublishNow(post.id)}
                          className="btn btn-xs btn-success btn-outline font-bold cursor-pointer"
                          title="즉시 강제발행"
                        >
                          🚀 발행
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelSchedule(post.id)}
                          className="btn btn-xs btn-error btn-outline font-bold cursor-pointer"
                          title="취소"
                        >
                          ✕
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {editingPostId !== post.id && expandedPostIds[post.id] && post.content ? (
                    <div className="text-xs text-base-content/75 bg-base-200/50 p-2.5 rounded-lg max-h-40 overflow-y-auto leading-relaxed font-medium whitespace-pre-wrap border border-base-300/40 animate-in slide-in-from-top-1 duration-150">
                      {post.content}
                    </div>
                  ) : null}
                </div>
              );
            })}
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
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
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
                    <div className="flex items-center gap-3">
                      {getThumbnail(post.image_url) ? (
                        <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 border border-base-300">
                          <img
                            src={getThumbnail(post.image_url)}
                            alt="thumbnail"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : null}
                      <h4
                        className="font-extrabold text-sm text-base-content truncate pr-1"
                        title={post.title}
                      >
                        {post.title}
                      </h4>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-1">
                    <button
                      type="button"
                      onClick={() => handleReuseHistoryPost(post)}
                      className="btn btn-xs btn-primary font-bold cursor-pointer"
                      title="이 글의 내용을 편집기에 불러옵니다"
                    >
                      🔄 사용
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReScheduleHistoryPost(post)}
                      className="btn btn-xs btn-neutral font-bold cursor-pointer"
                      title="대기열에 그대로 재예약"
                    >
                      📅 예약
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteHistoryPost(post.id)}
                      className="btn btn-xs btn-error btn-outline font-bold cursor-pointer"
                      title="발행 기록 삭제"
                    >
                      🗑 삭제
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-base-content/40 font-semibold">
                  <span>{parseUtcDate(post.created_at)?.toLocaleString('ko-KR') || '-'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
});

QueueTab.displayName = 'QueueTab';

export default QueueTab;
