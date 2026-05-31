import React, { useState } from 'react';
import { apiFetch, parseUtcDate } from '../../utils/api';
import { Card, SectionTitle, StatusBadge } from '../common';

const QueueTab = React.memo(({ scheduledPosts = [], posts = [], fetchAll, onReusePost }) => {
  // ── 예약 수정 상태 ──
  const [editingPostId, setEditingPostId] = useState(null);
  const [editingTimeValue, setEditingTimeValue] = useState('');
  const [expandedPostIds, setExpandedPostIds] = useState({});

  // ── UTC 시간을 로컬 datetime-local 포맷(YYYY-MM-DDTHH:MM)으로 변환 ──
  const toLocalDateTimeString = (utcString) => {
    if (!utcString) return '';
    const date = new Date(utcString);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
            {scheduledPosts.map((post) => (
              <div
                key={post.id}
                className="p-3.5 bg-base-100 border border-base-300 rounded-xl shadow-sm flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between gap-3">
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
                          <button
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
                {expandedPostIds[post.id] && post.content && (
                  <div className="text-xs text-base-content/75 bg-base-200/50 p-2.5 rounded-lg max-h-40 overflow-y-auto leading-relaxed font-medium whitespace-pre-wrap border border-base-300/40 animate-in slide-in-from-top-1 duration-150">
                    {post.content}
                  </div>
                )}
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
  );
});

QueueTab.displayName = 'QueueTab';

export default QueueTab;
