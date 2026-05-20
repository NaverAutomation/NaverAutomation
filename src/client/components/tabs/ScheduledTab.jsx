import React from 'react';
import { apiFetch } from '../../utils/api';
import { Card, SectionTitle, StatusBadge } from '../common';

const ScheduledTab = React.memo(({ scheduledPosts, posts = [], accounts, fetchAll, onReusePost }) => {
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

  const handleReSchedule = async (post) => {
    if (!confirm('이 글을 조금씩 수정해 자동으로 다시 발행하시겠습니까? 대기열에 즉시 추가됩니다.')) return;
    try {
      await apiFetch('/api/posts/schedule', {
        method: 'POST',
        body: JSON.stringify({
          title: post.title,
          content: post.content,
          image_url: post.image_url,
          headless: post.headless === 1
        })
      });
      alert('성공적으로 예약 대기열에 다시 등록되었습니다!');
      await fetchAll();
    } catch (err) {
      alert('재예약 실패: ' + err.message);
    }
  };

  return (
    <div className="space-y-8">
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

      {/* ── 최근 발행 완료 및 실패 이력 (히스토리) ── */}
      <Card>
        <SectionTitle className="flex justify-between items-center mb-6">
          <span>📜 최근 발행 완료/실패 이력 <span className="text-base-content/40 text-sm font-medium">(최근 50개)</span></span>
        </SectionTitle>

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 bg-base-100/30 rounded-2xl border border-dashed border-base-300 text-base-content/40">
            아직 발행된 포스팅 기록이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="table w-full">
              <thead>
                <tr className="border-b border-base-300 text-base-content/60 font-black">
                  <th>상태</th>
                  <th>네이버 계정</th>
                  <th>글 제목</th>
                  <th>발행일</th>
                  <th className="text-center">액션 및 재사용</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id} className="border-b border-base-300/40 hover:bg-base-300/10 transition-colors font-medium">
                    <td>
                      <span className={`badge font-bold px-3 py-2.5 ${post.status === 'published' ? 'badge-success shadow-[0_0_8px_#22c55e]' : 'badge-error'}`}>
                        {post.status === 'published' ? '성공' : '실패'}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-sm">
                        {post.naver_id ? `@${post.naver_id}` : '알 수 없음'}
                      </span>
                    </td>
                    <td className="max-w-xs truncate font-bold text-base-content">
                      {post.title}
                    </td>
                    <td className="text-xs text-base-content/50 font-semibold">
                      {new Date(post.created_at || Date.now()).toLocaleString('ko-KR')}
                    </td>
                    <td>
                      <div className="flex justify-center items-center gap-2">
                        <button
                          onClick={() => onReusePost(post)}
                          className="btn btn-primary btn-sm font-bold gap-1 shadow-sm"
                          title="이 글의 내용을 글 생성 탭으로 가져와 수정합니다"
                        >
                          🔄 이 글로 새 원고
                        </button>
                        <button
                          onClick={() => handleReSchedule(post)}
                          className="btn btn-neutral btn-sm font-bold shadow-sm"
                          title="이 글을 그대로 예약 대기열에 다시 등록합니다"
                        >
                          📅 대기열 재예약
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
});

export default ScheduledTab;
