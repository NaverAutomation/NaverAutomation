import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../utils/api';
import { Card, SectionTitle, Input, Btn } from '../common';

const SettingsTab = React.memo(({ settings, setSettings, fetchAll }) => {
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

  return (
    <Card className="max-w-2xl mx-auto">
      <SectionTitle>⚙️ API 키 설정</SectionTitle>
      <div className="flex flex-col gap-2">
        <Input
          label="Google Gemini API Key"
          type="password"
          placeholder="AIza..."
          value={localSettings.gemini_api_key || ''}
          onChange={e => setLocalSettings({ ...localSettings, gemini_api_key: e.target.value })}
        />

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
              <li>API 키는 AES-256-GCM 암호화로 안전하게 저장됩니다.</li>
              <li>모든 블로그 원고 생성 및 자동 재작성(Rewrite)은 AI 엔진을 통해 수행됩니다.</li>
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
