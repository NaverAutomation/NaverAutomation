import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, parseUtcDate } from '../../utils/api';
import { Btn, Card, Modal, SectionTitle, StatusBadge } from '../common';

const DashboardTab = React.memo(
  ({ accounts, posts, scheduledPosts, taskStatus, realtimeLogs, fetchAll }) => {
    const [selectedPost, setSelectedPost] = useState(null);
    const [retrying, setRetrying] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    // ── 실시간 countdown 업데이트 타이머 ──
    useEffect(() => {
      const timer = setInterval(() => {
        setCurrentTime(new Date());
      }, 30000); // 30초마다 갱신
      return () => clearInterval(timer);
    }, []);

    const handleDeleteAll = async () => {
      if (
        !window.confirm(
          '경고: 완료 및 실패한 모든 발행 기록을 일괄 삭제하시겠습니까? (예약 대기열은 유지됩니다)',
        )
      )
        return;
      try {
        await apiFetch('/api/posts', { method: 'DELETE' });
        setSelectedIds([]);
        await fetchAll();
      } catch (err) {
        alert(`오류: ${err.message}`);
      }
    };

    const handleDeleteSelected = async () => {
      if (selectedIds.length === 0) return alert('선택된 항목이 없습니다.');
      if (!confirm(`선택한 ${selectedIds.length}개의 발행 기록을 삭제하시겠습니까?`)) return;
      try {
        await apiFetch('/api/posts/batch-delete', {
          method: 'POST',
          body: JSON.stringify({ ids: selectedIds }),
        });
        setSelectedIds([]);
        await fetchAll();
      } catch (err) {
        alert(`오류: ${err.message}`);
      }
    };

    const handleSelectAllToggle = () => {
      if (selectedIds.length === posts.length) {
        setSelectedIds([]);
      } else {
        setSelectedIds(posts.map((p) => p.id));
      }
    };

    const handleSelectToggle = (id) => {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const handleRetry = async (postId) => {
      if (!confirm('이 포스트를 재발행하시겠습니까?')) return;
      setRetrying(true);
      try {
        const res = await apiFetch(`/api/posts/${postId}/retry`, { method: 'POST' });
        alert(res.message);
        await fetchAll();
        setSelectedPost(null);
      } catch (err) {
        alert(`오류: ${err.message}`);
      }
      setRetrying(false);
    };

    const handleDeletePost = async (postId) => {
      if (!confirm('이 발행 기록을 삭제하시겠습니까? (블로그 포스팅 자체는 삭제되지 않습니다.)'))
        return;
      try {
        await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' });
        await fetchAll();
      } catch (err) {
        alert(`오류: ${err.message}`);
      }
    };

    const activeAccounts = accounts.filter((a) => a.status === 'active').length;
    const published = posts.filter((p) => p.status === 'published').length;
    const failed = posts.filter((p) => p.status === 'failed').length;

    const stats = [
      {
        label: '등록 계정',
        value: accounts.length,
        sub: `활성 ${activeAccounts}개`,
        color: 'text-info',
      },
      { label: '발행 완료', value: published, sub: '총 발행글', color: 'text-success' },
      { label: '발행 실패', value: failed, sub: '재시도 필요', color: 'text-error' },
      { label: '예약/대기', value: scheduledPosts.length, sub: '발행 예정', color: 'text-warning' },
    ];

    // ── 다음 발행 대기 중인 예약글 ──
    const nextPost = useMemo(() => {
      if (!scheduledPosts || scheduledPosts.length === 0) return null;
      const sorted = [...scheduledPosts]
        .filter((p) => p.status === 'scheduled' || p.status === 'pending')
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
      return sorted[0] || null;
    }, [scheduledPosts]);

    // ── 다음 발행까지의 카운트다운 텍스트 계산 ──
    const countdownText = useMemo(() => {
      if (!nextPost?.scheduled_at) return '';
      const diffMs = new Date(nextPost.scheduled_at).getTime() - currentTime.getTime();
      if (diffMs <= 0) return '곧 발행 예정...';
      const diffMins = Math.ceil(diffMs / 60000);
      if (diffMins > 60) {
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours}시간 ${mins}분 후 발행`;
      }
      return `${diffMins}분 후 발행`;
    }, [nextPost, currentTime]);

    return (
      <div className="flex flex-col gap-6">
        {/* 통계 카드 */}
        <div className="stats stats-vertical sm:stats-horizontal shadow-xl bg-base-200 border border-base-300 w-full overflow-hidden">
          {stats.map((s) => (
            <div
              className="stat place-items-center sm:place-items-start lg:place-items-center"
              key={s.label}
            >
              <div className={`stat-value text-4xl lg:text-5xl tracking-tight mb-2 ${s.color}`}>
                {s.value}
              </div>
              <div className="stat-title font-bold text-base-content/80 sm:text-lg">{s.label}</div>
              <div className="stat-desc mt-1 font-medium text-base-content/50">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          {/* 스케줄러 상태 */}
          <Card className="h-full flex flex-col justify-between">
            <SectionTitle>⚡ 24/7 자동화 엔진 상태</SectionTitle>
            <div className="flex-1 flex flex-col justify-center gap-4 py-2">
              <div className="flex items-center gap-3">
                <span
                  className={`w-4 h-4 rounded-full ${taskStatus.isRunning ? 'bg-success shadow-[0_0_12px_#22c55e] animate-pulse' : 'bg-error'}`}
                />
                <span
                  className={`text-lg font-extrabold ${taskStatus.isRunning ? 'text-success' : 'text-error'}`}
                >
                  {taskStatus.isRunning ? '무한 루프 작동 중' : '정지됨'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-sm font-medium text-base-content/70 flex flex-col bg-base-300/50 p-4 rounded-xl border border-base-300">
                  <span>활성 워커 (브라우저):</span>
                  <strong className="text-primary text-2xl">
                    {taskStatus.activeWorkers || 0} / {taskStatus.maxWorkers || 3}
                  </strong>
                </div>
                <div className="text-sm font-medium text-base-content/70 flex flex-col bg-base-300/50 p-4 rounded-xl border border-base-300">
                  <span>대기 중인 예약글:</span>
                  <strong className="text-warning text-2xl">{scheduledPosts.length}개</strong>
                </div>
              </div>

              {nextPost && (
                <div className="mt-2 text-xs font-semibold text-base-content/80 flex flex-col bg-warning/10 p-3.5 rounded-xl border border-warning/20 animate-in fade-in duration-200">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-warning-content font-black">
                      📅 다음 발행 예정 포스트
                    </span>
                    <span className="badge badge-warning badge-sm font-bold animate-pulse">
                      {countdownText}
                    </span>
                  </div>
                  <div className="text-sm font-bold truncate text-base-content/95">
                    {nextPost.title}
                  </div>
                  <div className="text-[10px] text-base-content/40 mt-1">
                    설정 시간: {parseUtcDate(nextPost.scheduled_at)?.toLocaleString('ko-KR') || '-'}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* 최근 로그 */}
          <Card className="h-full overflow-hidden flex flex-col">
            <SectionTitle>📋 최근 로그 요약</SectionTitle>
            <div className="flex-1 max-h-48 overflow-y-auto pr-2 space-y-2 -mx-2 px-2 scrollbar-thin">
              {realtimeLogs
                .slice(-10)
                .reverse()
                .map((log, i) => (
                  <div
                    key={i}
                    className={`text-xs font-mono p-2 rounded bg-base-100/50 border border-base-300 ${log.level === 'error' ? 'text-error' : log.level === 'success' ? 'text-success' : 'text-base-content/70'}`}
                  >
                    <span className="mr-3 text-base-content/40">
                      {parseUtcDate(log.created_at)?.toLocaleTimeString() || '-'}
                    </span>
                    {log.message}
                  </div>
                ))}
              {realtimeLogs.length === 0 && (
                <p className="text-base-content/40 text-sm italic p-4 text-center">
                  아직 기록된 로그가 없습니다.
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* 최근 발행 */}
        {posts.length > 0 && (
          <Card>
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-base-300">
              <SectionTitle className="!mb-0">📰 최근 발행 현황</SectionTitle>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={selectedIds.length === 0}
                  className="btn btn-xs btn-warning font-semibold cursor-pointer shadow-sm"
                >
                  🗑 선택 삭제 ({selectedIds.length})
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  className="btn btn-xs btn-error font-semibold cursor-pointer shadow-sm"
                >
                  💥 전체 비우기
                </button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-base-300">
              <table className="table table-zebra w-full text-sm">
                <thead className="bg-base-300 text-base-content uppercase tracking-wider font-bold">
                  <tr>
                    <th className="py-4 pl-4 w-12 text-center">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-primary checkbox-sm cursor-pointer"
                        checked={posts.length > 0 && selectedIds.length === posts.length}
                        onChange={handleSelectAllToggle}
                      />
                    </th>
                    <th className="py-4">계정</th>
                    <th className="py-4">제목</th>
                    <th className="py-4">상태</th>
                    <th className="py-4">일시</th>
                    <th className="py-4 text-center">동작</th>
                  </tr>
                </thead>
                <tbody className="bg-base-200">
                  {posts.map((p) => (
                    <tr key={p.id} className="hover">
                      <td className="py-4 pl-4 text-center">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-primary checkbox-sm cursor-pointer"
                          checked={selectedIds.includes(p.id)}
                          onChange={() => handleSelectToggle(p.id)}
                        />
                      </td>
                      <td className="font-semibold text-base-content/70">
                        {p.naver_id || p.account_id}
                      </td>
                      <td className="max-w-[12rem] sm:max-w-xs truncate" title={p.title}>
                        {p.title}
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="text-base-content/50 font-medium text-xs">
                        {p.created_at
                          ? parseUtcDate(p.created_at)?.toLocaleString('ko-KR') || '-'
                          : '-'}
                      </td>
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
                          <button
                            onClick={() => handleDeletePost(p.id)}
                            className="btn btn-xs btn-error btn-outline shadow-sm font-semibold"
                            title="기록 삭제"
                          >
                            🗑
                          </button>
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
                    <label className="label-text font-bold text-base-content/60 block mb-2">
                      포스트 제목
                    </label>
                    <div className="text-xl font-bold bg-base-100 p-4 rounded-xl border border-base-300 shadow-inner">
                      {selectedPost.title}
                    </div>
                  </div>

                  {selectedPost.image_url && (
                    <div>
                      <label className="label-text font-bold text-base-content/60 block mb-2">
                        생성된 커버 이미지
                      </label>
                      <figure className="bg-base-100 rounded-xl border border-base-300 p-2 shadow-inner">
                        <img
                          src={selectedPost.image_url}
                          alt="Post content"
                          className="w-full max-h-[400px] object-contain rounded-lg"
                        />
                      </figure>
                    </div>
                  )}

                  <div>
                    <label className="label-text font-bold text-base-content/60 block mb-2">
                      본문 내용
                    </label>
                    <div className="whitespace-pre-wrap bg-base-100 p-6 rounded-xl text-sm leading-8 max-h-[40vh] overflow-y-auto border border-base-300 shadow-inner font-medium">
                      {selectedPost.content}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-base-300">
                    {selectedPost.status === 'failed' && (
                      <Btn
                        variant="primary"
                        onClick={() => handleRetry(selectedPost.id)}
                        disabled={retrying}
                      >
                        🔄 다시 발행하기
                      </Btn>
                    )}
                    <Btn
                      variant="error"
                      onClick={() => {
                        handleDeletePost(selectedPost.id);
                        setSelectedPost(null);
                      }}
                    >
                      🗑 삭제하기
                    </Btn>
                    <Btn variant="secondary" onClick={() => setSelectedPost(null)}>
                      닫기
                    </Btn>
                  </div>
                </div>
              )}
            </Modal>
          </Card>
        )}
      </div>
    );
  },
);

DashboardTab.displayName = 'DashboardTab';

export default DashboardTab;
