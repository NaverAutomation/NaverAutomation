import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../utils/api';
import { Card, SectionTitle, Input, Btn, Textarea } from '../common';

const ManualComposeCard = React.memo(({ accounts, fetchAll }) => {
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [manualPosting, setManualPosting] = useState(false);
  const [manualScheduling, setManualScheduling] = useState(false);
  const [manualSelectedAccountId, setManualSelectedAccountId] = useState('');
  const [manualScheduledAt, setManualScheduledAt] = useState('');
  const [manualUseRoundRobin, setManualUseRoundRobin] = useState(true);
  const [manualHeadless, setManualHeadless] = useState(true);

  useEffect(() => {
    if (accounts.length > 0 && !manualSelectedAccountId) {
      setManualSelectedAccountId(accounts[0].id.toString());
    }
  }, [accounts, manualSelectedAccountId]);

  const handleManualPost = async () => {
    if (!manualTitle.trim() || !manualContent.trim()) return alert('제목과 본문을 입력하세요.');
    if (!manualUseRoundRobin && !manualSelectedAccountId) return alert('계정을 선택하세요.');

    setManualPosting(true);
    try {
      const accId = manualUseRoundRobin ? null : manualSelectedAccountId;
      const payload = {
        title: manualTitle,
        content: manualContent,
        image_url: manualImageUrl.trim() || null,
        headless: manualHeadless,
      };

      if (accId) {
        const data = await apiFetch('/api/post', {
          method: 'POST',
          body: JSON.stringify({
            ...payload,
            account_id: accId,
          }),
        });
        alert(data.message || '발행 완료!');
      } else {
        await apiFetch('/api/posts/schedule', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        alert('라운드로빈 큐에 추가되었습니다. 스케줄러를 시작하면 자동 발행됩니다.');
      }

      await fetchAll();
    } catch (err) {
      alert('수기 발행 실패: ' + err.message);
    }
    setManualPosting(false);
  };

  const handleManualSchedule = async () => {
    if (!manualTitle.trim() || !manualContent.trim()) return alert('제목과 본문을 입력하세요.');
    if (!manualScheduledAt) return alert('예약 시간을 설정하세요.');

    setManualScheduling(true);
    try {
      const accId = manualUseRoundRobin ? null : manualSelectedAccountId;
      const data = await apiFetch('/api/posts/schedule', {
        method: 'POST',
        body: JSON.stringify({
          account_id: accId || null,
          title: manualTitle,
          content: manualContent,
          image_url: manualImageUrl.trim() || null,
          headless: manualHeadless,
          scheduled_at: new Date(manualScheduledAt).toISOString(),
        }),
      });
      alert(data.message || '예약 완료!');
      await fetchAll();
    } catch (err) {
      alert('수기 예약 실패: ' + err.message);
    }
    setManualScheduling(false);
  };

  return (
    <Card>
      <SectionTitle>📝 수기 작성 발행</SectionTitle>
      <div className="bg-base-100 p-6 rounded-2xl border border-base-300 shadow-inner">
        <Input
          label="포스트 제목"
          className="font-bold text-lg"
          type="text"
          value={manualTitle}
          onChange={e => setManualTitle(e.target.value)}
        />
        <Textarea
          label="포스트 본문"
          className="h-[300px] font-medium leading-8 text-base bg-base-100 border-base-300"
          value={manualContent}
          onChange={e => setManualContent(e.target.value)}
        />
        <Input
          label="커버 이미지 URL (선택)"
          type="text"
          value={manualImageUrl}
          onChange={e => setManualImageUrl(e.target.value)}
        />
      </div>

      <div className="mt-8 p-6 bg-base-300/40 border border-base-300 rounded-2xl flex flex-col lg:flex-row gap-6 lg:items-end">
        <div className="flex-1">
          <label className="label-text font-bold block mb-3 text-base-content/80">🚀 어디에 발행할까요?</label>
          <div className="form-control bg-base-100 p-3 rounded-lg border border-base-300 mb-3 shadow-inner">
            <label className="label cursor-pointer justify-start gap-4 py-0">
              <input type="checkbox" className="toggle toggle-primary" checked={manualUseRoundRobin} onChange={e => setManualUseRoundRobin(e.target.checked)} />
              <span className="label-text font-bold">자동 라운드로빈 배정 (권장)</span>
            </label>
          </div>
          {!manualUseRoundRobin && (
            <select
              value={manualSelectedAccountId}
              onChange={e => setManualSelectedAccountId(e.target.value)}
              className="select select-bordered w-full bg-base-100 font-semibold"
            >
              {accounts.map(a => <option key={a.id} value={a.id}>👉 {a.naver_id} 계정 ({a.status})</option>)}
            </select>
          )}
        </div>

        <div className="flex-1">
          <label className="label-text font-bold block mb-3 text-base-content/80">📅 발행 예약시간 설정</label>
          <input
            type="datetime-local"
            value={manualScheduledAt}
            onChange={e => setManualScheduledAt(e.target.value)}
            className="input input-bordered w-full bg-base-100 font-medium"
          />
        </div>

        <div className="flex-1">
          <label className="label-text font-bold block mb-3 text-base-content/80">🖥️ 브라우저 실행 방식</label>
          <div className="form-control bg-base-100 p-3 rounded-lg border border-base-300 shadow-inner">
            <label className="label cursor-pointer justify-start gap-4 py-0">
              <input type="checkbox" className="toggle toggle-primary" checked={manualHeadless} onChange={e => setManualHeadless(e.target.checked)} />
              <span className="label-text font-bold">백그라운드(headless)로 실행</span>
            </label>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <Btn variant="warning" className="flex-1 lg:w-40" onClick={handleManualSchedule} disabled={manualScheduling || !manualScheduledAt || accounts.length === 0}>
            {manualScheduling ? <span className="loading loading-spinner"></span> : '📅 수기 예약'}
          </Btn>
          <Btn variant="success" className="flex-1 lg:w-40" onClick={handleManualPost} disabled={manualPosting || accounts.length === 0}>
            {manualPosting ? <span className="loading loading-spinner"></span> : '📝 수기 즉시송출'}
          </Btn>
        </div>
      </div>
    </Card>
  );
});

const GenerateTab = React.memo(({ accounts, fetchAll }) => {
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

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id.toString());
    }
  }, [accounts, selectedAccountId]);

  const handleGenerate = async () => {
    if (!keyword.trim()) return alert('키워드를 입력하세요.');
    setLoading(true);
    try {
      const data = await apiFetch('/api/generate', {
        method: 'POST',
        body: JSON.stringify({ keyword, engine }),
      });
      setGenerated(data);
    } catch (err) {
      alert('생성 실패: ' + err.message);
    }
    setLoading(false);
  };

  const handlePost = async () => {
    if (!generated) return;
    if (!useRoundRobin && !selectedAccountId) return alert('계정을 선택하세요.');
    setPosting(true);
    try {
      const accId = useRoundRobin ? null : selectedAccountId;
      if (accId) {
        // 즉시 발행
        const data = await apiFetch('/api/post', {
          method: 'POST',
          body: JSON.stringify({
            account_id: accId,
            title: generated.title,
            content: generated.content,
            image_url: generated.imageUrl,
            headless,
          }),
        });
        alert(data.message || '발행 완료!');
      } else {
        // 라운드로빈 큐에 추가
        await apiFetch('/api/posts/schedule', {
          method: 'POST',
          body: JSON.stringify({
            title: generated.title,
            content: generated.content,
            image_url: generated.imageUrl,
            headless,
          }),
        });
        alert('라운드로빈 큐에 추가되었습니다. 스케줄러를 시작하면 자동 발행됩니다.');
      }
      await fetchAll();
    } catch (err) {
      alert('발행 실패: ' + err.message);
    }
    setPosting(false);
  };

  const handleSchedule = async () => {
    if (!generated || !scheduledAt) return alert('예약 시간을 설정하세요.');
    setScheduling(true);
    try {
      const accId = useRoundRobin ? null : selectedAccountId;
      const data = await apiFetch('/api/posts/schedule', {
        method: 'POST',
        body: JSON.stringify({
          account_id: accId || null,
          title: generated.title,
          content: generated.content,
          image_url: generated.imageUrl,
          headless,
          scheduled_at: new Date(scheduledAt).toISOString(),
        }),
      });
      alert(data.message);
      await fetchAll();
    } catch (err) {
      alert('예약 실패: ' + err.message);
    }
    setScheduling(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <SectionTitle>✍️ AI 블로그 원고 생성기</SectionTitle>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full relative">
             <label className="label-text font-bold block mb-2 px-1 text-base-content/80">어떤 주제로 포스팅할까요?</label>
             <div className="relative">
               <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">💡</span>
               <input 
                 className="input input-lg input-bordered w-full pl-12 bg-base-100 placeholder-base-content/30 focus:border-primary shadow-inner" 
                 placeholder="예: 2024 성수동 핫플 카페 5곳 정리"
                 value={keyword}
                 onChange={e => setKeyword(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleGenerate()}
               />
             </div>
          </div>
          <div className="w-full md:w-56">
            <label className="label-text font-bold block mb-2 px-1 text-base-content/80">AI 지능 (엔진)</label>
            <select
              value={engine}
              onChange={e => setEngine(e.target.value)}
              className="select select-lg select-bordered w-full bg-base-100 font-semibold"
            >
              <option value="gemini">✨ 클라우드 AI API</option>
              <option value="ollama">🦙 Ollama (로컬무료)</option>
            </select>
          </div>
          <Btn variant="primary" className="btn-lg w-full md:w-auto" onClick={handleGenerate} disabled={loading}>
            {loading ? <span className="loading loading-dots"></span> : '🚀 초안 뽑기'}
          </Btn>
        </div>
      </Card>

      <ManualComposeCard accounts={accounts} fetchAll={fetchAll} />

      {generated && (
        <Card className="animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-start mb-4">
            <SectionTitle className="mb-0">📄 자동 생성된 초안 (자유롭게 수정 가능합니다)</SectionTitle>
            {generated.modelUsed && (
              <div className="badge badge-outline badge-sm py-3 px-3 gap-2 text-base-content/60 border-base-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                {engine === 'gemini' ? 'AI 엔진 (클라우드)' : '로컬 엔진 (Ollama)'} 사용됨
              </div>
            )}
          </div>
          <div className="bg-base-100 p-6 rounded-2xl border border-base-300 shadow-inner">
            <Input
              label="포스트 제목"
              className="font-bold text-lg"
              type="text"
              value={generated.title}
              onChange={e => setGenerated(prev => ({ ...prev, title: e.target.value }))}
            />
            <Textarea
              label="포스트 본문"
              className="h-[400px] font-medium leading-8 text-base bg-base-100 border-base-300"
              value={generated.content}
              onChange={e => setGenerated(prev => ({ ...prev, content: e.target.value }))}
            />
          </div>

          <div className="mt-8 p-6 bg-base-300/40 border border-base-300 rounded-2xl flex flex-col lg:flex-row gap-6 lg:items-end">
            <div className="flex-1">
              <label className="label-text font-bold block mb-3 text-base-content/80">🚀 어디에 발행할까요?</label>
              <div className="form-control bg-base-100 p-3 rounded-lg border border-base-300 mb-3 shadow-inner">
                <label className="label cursor-pointer justify-start gap-4 py-0">
                  <input type="checkbox" className="toggle toggle-primary" checked={useRoundRobin} onChange={e => setUseRoundRobin(e.target.checked)} />
                  <span className="label-text font-bold">자동 라운드로빈 배정 (권장)</span>
                </label>
              </div>
              {!useRoundRobin && (
                <select
                  value={selectedAccountId}
                  onChange={e => setSelectedAccountId(e.target.value)}
                  className="select select-bordered w-full bg-base-100 font-semibold"
                >
                  {accounts.map(a => <option key={a.id} value={a.id}>👉 {a.naver_id} 계정 ({a.status})</option>)}
                </select>
              )}
            </div>

            <div className="flex-1">
              <label className="label-text font-bold block mb-3 text-base-content/80">📅 발행 예약시간 설정</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="input input-bordered w-full bg-base-100 font-medium"
              />
            </div>

            <div className="flex-1">
              <label className="label-text font-bold block mb-3 text-base-content/80">🖥️ 브라우저 실행 방식</label>
              <div className="form-control bg-base-100 p-3 rounded-lg border border-base-300 shadow-inner">
                <label className="label cursor-pointer justify-start gap-4 py-0">
                  <input type="checkbox" className="toggle toggle-primary" checked={headless} onChange={e => setHeadless(e.target.checked)} />
                  <span className="label-text font-bold">백그라운드(headless)로 실행</span>
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <Btn variant="warning" className="flex-1 lg:w-40" onClick={handleSchedule} disabled={scheduling || !scheduledAt || accounts.length === 0}>
                {scheduling ? <span className="loading loading-spinner"></span> : '📅 타이머 예약'}
              </Btn>
              <Btn variant="success" className="flex-1 lg:w-40" onClick={handlePost} disabled={posting || accounts.length === 0}>
                {posting ? <span className="loading loading-spinner"></span> : '🚀 즉시 송출'}
              </Btn>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
});

export default GenerateTab;
