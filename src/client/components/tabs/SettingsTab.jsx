import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../utils/api';
import { Card, SectionTitle, Input, Btn } from '../common';

const STATUS_LABELS = {
  idle: '대기 중',
  'checking-for-update': '업데이트 확인 중',
  'update-available': '새 버전 발견',
  'download-progress': '다운로드 중',
  'update-downloaded': '설치 준비 완료',
  'update-not-available': '최신 버전',
  error: '오류',
  'dev-mode': '개발 모드',
};

const SettingsTab = React.memo(({
  settings,
  setSettings,
  fetchAll,
  appVersion,
  updaterState,
  onManualUpdateCheck,
  isCheckingUpdate,
}) => {
  const [loading, setLoading] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => { setLocalSettings(settings); }, [settings]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await apiFetch('/api/settings', { method: 'POST', body: JSON.stringify(localSettings) });
      await fetchAll();
      alert('✅ 설정이 저장되었습니다.');
    } catch (err) {
      alert('오류: ' + err.message);
    }
    setLoading(false);
  };

  const statusLabel = STATUS_LABELS[updaterState?.status] || updaterState?.status || '알 수 없음';
  const statusTime = updaterState?.timestamp
    ? new Date(updaterState.timestamp).toLocaleString('ko-KR')
    : '기록 없음';

  return (
    <Card className="max-w-2xl mx-auto">
      <SectionTitle>⬆️ 앱 업데이트</SectionTitle>
      <div className="rounded-xl border border-base-300 bg-base-200/60 p-4 mb-8 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-sm sm:text-base font-semibold text-base-content/80">
            현재 앱 버전: <span className="font-mono">v{appVersion}</span>
          </p>
          <span className="badge badge-outline">{statusLabel}</span>
        </div>
        <p className="text-sm text-base-content/70 break-all">
          최근 상태: {updaterState?.message || '업데이트 이벤트를 기다리는 중입니다.'}
        </p>
        <p className="text-xs text-base-content/50">최근 확인 시각: {statusTime}</p>
        <div className="pt-1">
          <Btn
            variant="secondary"
            onClick={onManualUpdateCheck}
            disabled={isCheckingUpdate}
            className="w-full sm:w-auto"
          >
            {isCheckingUpdate ? (
              <span className="loading loading-spinner text-neutral-content"></span>
            ) : (
              <>업데이트 수동 확인</>
            )}
          </Btn>
        </div>
      </div>

      <SectionTitle>⚙️ 서비스 엔진 설정</SectionTitle>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1 mb-2">
          <label className="label-text font-bold px-1 text-base-content/70">AI 모델 설정</label>
          <select
            className="select select-bordered w-full bg-base-100"
            value={localSettings.gemini_model || 'auto'}
            onChange={e => setLocalSettings({ ...localSettings, gemini_model: e.target.value })}
          >
            <option value="auto">✨ 최적화 모드 (권장)</option>
          </select>
          <p className="text-[11px] px-1 text-base-content/50">* 시스템이 포스팅에 가장 적합한 속도와 품질을 자동으로 선택합니다.</p>
        </div>
        
        <div className="alert bg-base-300/50 border border-base-300 rounded-xl mt-2 text-xs sm:text-sm text-base-content/80 shadow-inner">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-info shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <div>
            <p className="font-bold mb-1">안내 사항</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>AI API 키는 서버에서 안전하게 관리되므로 별도로 입력할 필요가 없습니다.</li>
              <li>모든 블로그 원고 생성 및 자동 재작성(Rewrite)은 서버 AI 엔진을 통해 수행됩니다.</li>
              <li>개인용 로컬 AI를 사용하려면 하단의 Ollama 설정을 이용하세요.</li>
            </ul>
          </div>
        </div>
      </div>

      <SectionTitle className="mt-10">🦙 Ollama 연동 (로컬 AI)</SectionTitle>
      <div className="flex flex-col gap-2">
        <Input
          label="Ollama API 엔드포인트"
          type="text"
          placeholder="http://localhost:11434"
          value={localSettings.ollama_endpoint || ''}
          onChange={e => setLocalSettings({ ...localSettings, ollama_endpoint: e.target.value })}
        />
        <Input
          label="Ollama 모델명"
          type="text"
          placeholder="llama3"
          value={localSettings.ollama_model || ''}
          onChange={e => setLocalSettings({ ...localSettings, ollama_model: e.target.value })}
        />
      </div>

      <div className="mt-8 pt-6 border-t border-base-300 flex justify-end">
        <Btn variant="primary" onClick={handleSave} disabled={loading} className="w-full sm:w-auto px-8">
          {loading ? <span className="loading loading-spinner text-neutral-content"></span> : <>💾 설정 일괄 저장</>}
        </Btn>
      </div>
    </Card>
  );
});

export default SettingsTab;
