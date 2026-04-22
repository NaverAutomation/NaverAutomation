import React, { useState } from 'react';
import { apiFetch } from '../../utils/api';

const CampaignsTab = React.memo(({ campaigns, fetchAll }) => {
  const [newCampaign, setNewCampaign] = useState({ title: '', content: '', image_url: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddCampaign = async (e) => {
    e.preventDefault();
    if (!newCampaign.title || !newCampaign.content) return;
    
    setIsSubmitting(true);
    try {
      await apiFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify(newCampaign),
      });
      setNewCampaign({ title: '', content: '', image_url: '' });
      fetchAll();
    } catch (err) {
      alert('캠페인 추가 실패: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusToggle = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await apiFetch(`/api/campaigns/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      fetchAll();
    } catch (err) {
      alert('상태 변경 실패: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('정말 삭제하시겠습니까? 관련 무한 루프 작업이 중단됩니다.')) return;
    try {
      await apiFetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      fetchAll();
    } catch (err) {
      alert('삭제 실패: ' + err.message);
    }
  };

  return (
    <div className="space-y-8">
      {/* ── 등록 폼 */}
      <section className="card bg-base-200 shadow-xl border border-base-300">
        <div className="card-body">
          <h2 className="card-title text-2xl font-bold flex items-center gap-2 mb-4 text-primary">
            🎯 24시간 자동화 캠페인 등록
          </h2>
          <p className="text-sm text-base-content/70 mb-6 bg-base-300 p-4 rounded-lg font-medium border-l-4 border-primary">
            이곳에 입력한 <strong>원본 제목과 본문</strong>은 AI가 매번 새로운 내용으로 재작성하여 발행합니다.<br/>
            사진은 원본 그대로 사용되며, 활성화된 모든 계정으로 순차적으로 발행됩니다. (계정당 1일 3회 제한)
          </p>
          
          <form onSubmit={handleAddCampaign} className="space-y-6">
            <div className="form-control">
              <label className="label font-bold text-base-content/80">원본 제목 (AI 재작성 기준)</label>
              <input
                type="text"
                className="input input-bordered input-lg w-full focus:ring-2 focus:ring-primary focus:border-primary transition-all shadow-inner"
                placeholder="예: 최신 트릭컬 리바이브 티어표 및 공략 가이드"
                value={newCampaign.title}
                onChange={(e) => setNewCampaign(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>

            <div className="form-control">
              <label className="label font-bold text-base-content/80">원본 본문 (AI 재작성 기준)</label>
              <textarea
                className="textarea textarea-bordered h-48 text-base leading-relaxed focus:ring-2 focus:ring-primary focus:border-primary transition-all shadow-inner"
                placeholder="AI가 이 내용을 기반으로 매번 새로운 글을 생성합니다..."
                value={newCampaign.content}
                onChange={(e) => setNewCampaign(prev => ({ ...prev, content: e.target.value }))}
              />
            </div>

            <div className="form-control">
              <label className="label font-bold text-base-content/80">원본 이미지 URL (필수 아님)</label>
              <input
                type="text"
                className="input input-bordered w-full focus:ring-2 focus:ring-primary focus:border-primary transition-all shadow-inner"
                placeholder="https://..."
                value={newCampaign.image_url}
                onChange={(e) => setNewCampaign(prev => ({ ...prev, image_url: e.target.value }))}
              />
            </div>

            <button 
              type="submit" 
              className={`btn btn-primary btn-lg w-full font-black text-lg gap-2 shadow-lg transition-all hover:scale-[1.01] ${isSubmitting ? 'loading' : ''}`}
              disabled={isSubmitting}
            >
              🚀 캠페인 등록 및 자동화 대기열 추가
            </button>
          </form>
        </div>
      </section>

      {/* ── 캠페인 목록 */}
      <section>
        <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
          📋 활성화된 캠페인 목록
          <span className="badge badge-lg badge-ghost border-base-300 font-bold">{campaigns.length}</span>
        </h2>
        
        <div className="grid gap-6">
          {campaigns.length === 0 ? (
            <div className="card bg-base-200 border-2 border-dashed border-base-300 py-12 text-center text-base-content/50">
              등록된 캠페인이 없습니다.
            </div>
          ) : (
            campaigns.map((camp) => (
              <div key={camp.id} className="card lg:card-side bg-base-200 shadow-md border border-base-300 overflow-hidden hover:shadow-lg transition-all">
                {camp.image_url ? (
                  <figure className="lg:w-1/4 bg-black">
                    <img src={camp.image_url} alt="Original" className="w-full h-full object-cover opacity-80" />
                  </figure>
                ) : (
                  <div className="lg:w-1/4 bg-base-300 flex items-center justify-center text-4xl">🖼️</div>
                )}
                <div className="card-body lg:w-3/4 p-6">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`badge font-bold px-3 py-3 ${camp.status === 'active' ? 'badge-success shadow-[0_0_8px_#22c55e]' : 'badge-ghost'}`}>
                          {camp.status === 'active' ? '작동 중' : '정지됨'}
                        </span>
                        <span className="text-xs text-base-content/50 font-semibold">{new Date(camp.created_at).toLocaleString()}</span>
                      </div>
                      <h3 className="text-xl font-black mb-3">{camp.title}</h3>
                      <p className="text-sm line-clamp-2 text-base-content/70 font-medium">{camp.content}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => handleStatusToggle(camp.id, camp.status)}
                        className={`btn btn-sm sm:btn-md font-bold ${camp.status === 'active' ? 'btn-ghost' : 'btn-success'}`}
                      >
                        {camp.status === 'active' ? '⏸ 정지' : '▶ 시작'}
                      </button>
                      <button 
                        onClick={() => handleDelete(camp.id)}
                        className="btn btn-error btn-sm sm:btn-md btn-outline hover:btn-error"
                      >
                        🗑 삭제
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
});

export default CampaignsTab;