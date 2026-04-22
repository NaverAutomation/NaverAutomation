import React, { useState } from 'react';
import { apiFetch } from '../../utils/api';
import { Card, SectionTitle, StatusBadge, Modal, Btn } from '../common';

const DashboardTab = React.memo(({ accounts, posts, scheduledPosts, taskStatus, realtimeLogs, fetchAll }) => {
  const [selectedPost, setSelectedPost] = useState(null);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async (postId) => {
    if (!confirm('이 포스트를 재발행하시겠습니까?')) return;
    setRetrying(true);
    try {
      const res = await apiFetch(`/api/posts/${postId}/retry`, { method: 'POST' });
      alert(res.message);
      await fetchAll();
      setSelectedPost(null);
    } catch (err) {
      alert('오류: ' + err.message);
    }
    setRetrying(false);
  };

  const activeAccounts = accounts.filter(a => a.status === 'active').length;
  const published = posts.filter(p => p.status === 'published').length;
  const failed = posts.filter(p => p.status === 'failed').length;

  const stats = [
    { label: '등록 계정', value: accounts.length, sub: `활성 ${activeAccounts}개`, color: 'text-info' },
    { label: '발행 완료', value: published, sub: '총 발행글', color: 'text-success' },
    { label: '발행 실패', value: failed, sub: '재시도 필요', color: 'text-error' },
    { label: '예약/대기', value: scheduledPosts.length, sub: '발행 예정', color: 'text-warning' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* 통계 카드 */}
      <div className="stats stats-vertical sm:stats-horizontal shadow-xl bg-base-200 border border-base-300 w-full overflow-hidden">
        {stats.map(s => (
          <div className="stat place-items-center sm:place-items-start lg:place-items-center" key={s.label}>
            <div className={`stat-value text-4xl lg:text-5xl tracking-tight mb-2 ${s.color}`}>{s.value}</div>
            <div className="stat-title font-bold text-base-content/80 sm:text-lg">{s.label}</div>
            <div className="stat-desc mt-1 font-medium text-base-content/50">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        {/* 스케줄러 상태 */}
        <Card className="h-full flex flex-col">
          <SectionTitle>⚡ 24/7 자동화 엔진 상태</SectionTitle>
          <div className="flex-1 flex flex-col justify-center gap-4 py-4">
            <div className="flex items-center gap-3">
              <span className={`w-4 h-4 rounded-full ${taskStatus.isRunning ? 'bg-success shadow-[0_0_12px_#22c55e] animate-pulse' : 'bg-error'}`} />
              <span className={`text-lg font-extrabold ${taskStatus.isRunning ? 'text-success' : 'text-error'}`}>
                {taskStatus.isRunning ? '무한 루프 작동 중' : '정지됨'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-sm font-medium text-base-content/70 flex flex-col bg-base-300/50 p-4 rounded-xl border border-base-300">
                <span>활성 워커 (브라우저):</span>
                <strong className="text-primary text-2xl">{taskStatus.activeWorkers || 0} / {taskStatus.maxWorkers || 3}</strong>
              </div>
              <div className="text-sm font-medium text-base-content/70 flex flex-col bg-base-300/50 p-4 rounded-xl border border-base-300">
                <span>대기 중인 예약글:</span>
                <strong className="text-warning text-2xl">{scheduledPosts.length}개</strong>
              </div>
            </div>
          </div>
        </Card>

        {/* 최근 로그 */}
        <Card className="h-full overflow-hidden flex flex-col">
          <SectionTitle>📋 최근 로그 요약</SectionTitle>
          <div className="flex-1 max-h-48 overflow-y-auto pr-2 space-y-2 -mx-2 px-2 scrollbar-thin">
            {realtimeLogs.slice(-10).reverse().map((log, i) => (
              <div key={i} className={`text-xs font-mono p-2 rounded bg-base-100/50 border border-base-300 ${log.level === 'error' ? 'text-error' : log.level === 'success' ? 'text-success' : 'text-base-content/70'}`}>
                <span className="mr-3 text-base-content/40">{new Date(log.created_at).toLocaleTimeString()}</span>
                {log.message}
              </div>
            ))}
            {realtimeLogs.length === 0 && <p className="text-base-content/40 text-sm italic p-4 text-center">아직 기록된 로그가 없습니다.</p>}
          </div>
        </Card>
      </div>

      {/* 최근 발행 */}
      {posts.length > 0 && (
        <Card>
          <SectionTitle>📰 최근 발행 현황</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-base-300">
            <table className="table table-zebra w-full text-sm">
              <thead className="bg-base-300 text-base-content uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-4">계정</th>
                  <th className="py-4">제목</th>
                  <th className="py-4">상태</th>
                  <th className="py-4">일시</th>
                  <th className="py-4 text-center">동작</th>
                </tr>
              </thead>
              <tbody className="bg-base-200">
                {posts.slice(0, 5).map(p => (
                  <tr key={p.id} className="hover">
                    <td className="font-semibold text-base-content/70">{p.naver_id || p.account_id}</td>
                    <td className="max-w-[12rem] sm:max-w-xs truncate" title={p.title}>{p.title}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="text-base-content/50 font-medium text-xs">{p.created_at ? new Date(p.created_at).toLocaleString('ko-KR') : '-'}</td>
                    <td>
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => setSelectedPost(p)}
                          className="btn btn-xs btn-neutral shadow-sm font-semibold"
                        >
                          🔍 조회
                        </button>
                        {p.status === 'failed' && (
                          <button 
                            onClick={() => handleRetry(p.id)}
                            disabled={retrying}
                            className="btn btn-xs btn-outline btn-info shadow-sm font-semibold"
                          >
                            🔄 재시도
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Modal 
            title="🏷 포스팅 원문 조회" 
            show={!!selectedPost} 
            onClose={() => setSelectedPost(null)}
          >
            {selectedPost && (
              <div className="flex flex-col gap-6">
                <div>
                  <label className="label-text font-bold text-base-content/60 block mb-2">포스트 제목</label>
                  <div className="text-xl font-bold bg-base-100 p-4 rounded-xl border border-base-300 shadow-inner">{selectedPost.title}</div>
                </div>
                
                {selectedPost.image_url && (
                  <div>
                    <label className="label-text font-bold text-base-content/60 block mb-2">생성된 커버 이미지</label>
                    <figure className="bg-base-100 rounded-xl border border-base-300 p-2 shadow-inner">
                      <img src={selectedPost.image_url} alt="Post content" className="w-full max-h-[400px] object-contain rounded-lg" />
                    </figure>
                  </div>
                )}

                <div>
                  <label className="label-text font-bold text-base-content/60 block mb-2">본문 내용</label>
                  <div className="whitespace-pre-wrap bg-base-100 p-6 rounded-xl text-sm leading-8 max-h-[40vh] overflow-y-auto border border-base-300 shadow-inner font-medium">
                    {selectedPost.content}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-base-300">
                  {selectedPost.status === 'failed' && (
                    <Btn variant="primary" onClick={() => handleRetry(selectedPost.id)} disabled={retrying}>
                      🔄 다시 발행하기
                    </Btn>
                  )}
                  <Btn variant="secondary" onClick={() => setSelectedPost(null)}>닫기</Btn>
                </div>
              </div>
            )}
          </Modal>
        </Card>
      )}
    </div>
  );
});

export default DashboardTab;
