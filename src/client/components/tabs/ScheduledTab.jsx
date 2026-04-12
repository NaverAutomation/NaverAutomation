import React from 'react';
import { apiFetch } from '../../utils/api';
import { Card, SectionTitle, StatusBadge } from '../common';

const ScheduledTab = React.memo(({ scheduledPosts, accounts, fetchAll }) => {
  const handleCancel = async (id) => {
    if (!confirm('이 예약을 취소/스케줄러에서 제거하시겠습니까?')) return;
    try {
      await apiFetch(`/api/posts/scheduled/${id}`, { method: 'DELETE' });
      await fetchAll();
    } catch (err) {
      alert('오류: ' + err.message);
    }
  };

  const handlePublishNow = async (id) => {
    if (!confirm('이 예약 포스트를 지금 즉시 발행하시겠습니까?')) return;
    try {
      const res = await apiFetch(`/api/posts/${id}/publish-now`, { method: 'POST' });
      alert(res.message);
      await fetchAll();
    } catch (err) {
      alert('오류: ' + err.message);
    }
  };

  return (
    <Card>
      <SectionTitle className="flex justify-between items-center">
        <span>📅 발행 대기열 현황 <span className="text-primary tracking-tight">({scheduledPosts.length}개)</span></span>
      </SectionTitle>
      
      {scheduledPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 bg-base-100/50 rounded-2xl border border-dashed border-base-300">
          <div className="text-6xl mb-6 opacity-80">📭</div>
          <h3 className="text-xl font-bold mb-2">예약 대기열이 비어있습니다.</h3>
          <p className="text-sm font-medium text-base-content/50">글 생성 탭에서 예약 발행을 설정하면 이곳에 나타납니다.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {scheduledPosts.map(post => (
            <div key={post.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-2xl border border-base-300 bg-base-100 shadow-sm hover:shadow-md transition-shadow gap-4">
              <div className="flex-1 min-w-0 w-full">
                <div className="flex items-center gap-3 mb-2">
                  <StatusBadge status={post.status} />
                  <span className="badge badge-outline badge-md font-bold text-base-content/60 bg-base-200">
                    {post.naver_id ? `@${post.naver_id}` : '🔄 자동 라운드로빈'}
                  </span>
                </div>
                <div className="font-extrabold text-lg text-base-content truncate pr-4">
                  {post.title}
                </div>
                <div className="text-sm font-semibold mt-2 text-base-content/40 flex items-center gap-2">
                  {post.scheduled_at ? (
                    <>
                      <span className="text-warning">📅 지정시간 발행</span>
                      <span>-</span>
                      <span>{new Date(post.scheduled_at).toLocaleString('ko-KR')}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-info">⏳ 큐 대기중</span>
                      <span>-</span>
                      <span>스케줄러 활성화 시 자동 발행</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex w-full sm:w-auto gap-2 sm:gap-3 shrink-0 pt-3 sm:pt-0 border-t sm:border-0 border-base-200 mt-2 sm:mt-0">
                <button
                  onClick={() => handlePublishNow(post.id)}
                  className="btn btn-success btn-outline flex-1 sm:flex-none shadow-sm"
                >
                  🚀 즉시 강제발행
                </button>
                <button
                  onClick={() => handleCancel(post.id)}
                  className="btn btn-error btn-outline flex-1 sm:flex-none shadow-sm"
                >
                  ✕ 삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
});

export default ScheduledTab;
