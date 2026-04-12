import React, { useState } from 'react';
import { apiFetch } from '../../utils/api';
import { Card, SectionTitle, Input, Btn, StatusBadge } from '../common';

const AccountsTab = React.memo(({ accounts, fetchAll }) => {
  const [form, setForm] = useState({ naver_id: '', naver_pw: '' });
  const [loading, setLoading] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.naver_id || !form.naver_pw) return;
    setLoading(true);
    try {
      await apiFetch('/api/accounts', { method: 'POST', body: JSON.stringify(form) });
      setForm({ naver_id: '', naver_pw: '' });
      await fetchAll();
    } catch (err) {
      alert('오류: ' + err.message);
    }
    setLoading(false);
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`"${name}" 계정을 삭제하시겠습니까?`)) return;
    try {
      await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
      await fetchAll();
    } catch (err) {
      alert('오류: ' + err.message);
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await apiFetch(`/api/accounts/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchAll();
    } catch (err) {
      alert('오류: ' + err.message);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 items-start">
      <Card className="sticky top-6">
        <SectionTitle>➕ 네이버 계정 추가</SectionTitle>
        <form onSubmit={handleAdd} className="flex flex-col gap-2">
          <Input
            label="아이디"
            type="text"
            placeholder="naver_id"
            value={form.naver_id}
            onChange={e => setForm(prev => ({ ...prev, naver_id: e.target.value }))}
            required
          />
          <Input
            label="비밀번호"
            type="password"
            placeholder="비밀번호"
            value={form.naver_pw}
            onChange={e => setForm(prev => ({ ...prev, naver_pw: e.target.value }))}
            required
          />
          <Btn variant="success" type="submit" disabled={loading} block className="mt-2">
            {loading ? <span className="loading loading-spinner text-base-content"></span> : <>✅ 계정 안전하게 추가</>}
          </Btn>
        </form>
        <div className="alert bg-base-300 text-xs sm:text-sm mt-6 p-4 rounded-xl border border-base-200">
          <div>
            <span className="font-bold block mb-1">💡 계정 운영 가이드</span>
            <ul className="list-disc pl-4 space-y-1 text-base-content/70">
              <li>비밀번호는 최고 수준으로 암호화되어 저장됩니다.</li>
              <li>여러 계정을 추가하면 원고 <span className="font-bold underline">라운드로빈(교대배정)</span>으로 자동 순환 발행됩니다.</li>
            </ul>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-center mb-5 border-b border-base-300 pb-3">
          <h2 className="text-lg font-bold">👤 등록된 계정 <span className="text-primary">({accounts.length}개)</span></h2>
        </div>
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-base-100 rounded-xl border border-base-300 border-dashed text-base-content/40">
            <span className="text-4xl mb-4">👻</span>
            <p className="font-medium">등록된 계정이 없습니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {accounts.map((acc, idx) => (
              <div key={acc.id} className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border shadow-sm transition-all hover:bg-base-300/30 ${acc.status === 'active' ? 'border-primary/50 bg-primary/5' : 'border-base-300 bg-base-100'}`}>
                <div className="flex items-center gap-4">
                  <div className="badge badge-lg font-black bg-base-300 text-base-content/60 shadow-inner">
                    #{idx + 1}
                  </div>
                  <div>
                    <div className="font-bold text-lg text-base-content">{acc.naver_id}</div>
                    <div className="text-xs font-semibold text-base-content/50 mt-0.5">라운드로빈 편성: {idx + 1}번째 배정</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <StatusBadge status={acc.status} />
                  <div className="flex-1"></div>
                  <button
                    onClick={() => handleToggleStatus(acc.id, acc.status)}
                    className={`btn btn-sm ${acc.status === 'active' ? 'btn-warning' : 'btn-success'} shadow-sm`}
                  >
                    {acc.status === 'active' ? '⏸ 일시정지' : '▶ 활성화'}
                  </button>
                  <button
                    onClick={() => handleDelete(acc.id, acc.naver_id)}
                    className="btn btn-sm btn-error btn-outline"
                  >
                    🗑 삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
});

export default AccountsTab;
