import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../utils/api';
import { Btn, Card, Input, SectionTitle } from '../common';

const SettingsTab = React.memo(
  ({ appVersion, latestVersion, onManualUpdateCheck, isCheckingUpdate }) => {
    const [loading, setLoading] = useState(false);
    const [localSettings, setLocalSettings] = useState({});
    const [repImages, setRepImages] = useState([]);
    const fileInputRef = React.useRef(null);

    const devClicksRef = React.useRef(0);
    const [showDevOptions, setShowDevOptions] = useState(() => {
      return localStorage.getItem('devModeEnabled') === 'true';
    });

    const handleNoticeClick = () => {
      if (showDevOptions) return;
      devClicksRef.current += 1;
      if (devClicksRef.current >= 5) {
        setShowDevOptions(true);
        localStorage.setItem('devModeEnabled', 'true');
        alert('🔓 개발자 설정 모드가 활성화되었습니다. 설정 저장 시 반영됩니다.');
      }
    };

    useEffect(() => {
      let isMounted = true;
      const loadSettings = async () => {
        try {
          const data = await apiFetch('/api/settings');
          if (isMounted) {
            setLocalSettings(data);
            try {
              const parsed = data.representative_images
                ? JSON.parse(data.representative_images)
                : [];
              setRepImages(Array.isArray(parsed) ? parsed : []);
            } catch {
              setRepImages([]);
            }
          }
        } catch (err) {
          console.error('설정 로드 실패:', err);
        }
      };
      loadSettings();
      return () => {
        isMounted = false;
      };
    }, []);

    const handleSave = async () => {
      setLoading(true);
      try {
        const payload = {
          ...localSettings,
          representative_images: JSON.stringify(repImages),
        };
        await apiFetch('/api/settings', { method: 'POST', body: JSON.stringify(payload) });
        alert('✅ 설정이 저장되었습니다.');
      } catch (err) {
        alert(`오류: ${err.message}`);
      }
      setLoading(false);
    };

    const handleUploadRepImage = async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) {
          alert(`이미지 크기는 5MB 이하여야 합니다: ${file.name}`);
          continue;
        }

        const reader = new FileReader();
        await new Promise((resolve) => {
          reader.onload = async () => {
            try {
              const res = await apiFetch('/api/upload', {
                method: 'POST',
                body: JSON.stringify({
                  fileName: file.name,
                  base64Data: reader.result,
                }),
              });
              if (res.success && res.url) {
                setRepImages((prev) => [...prev, res.url]);
              } else {
                alert(`업로드 실패: ${res.error || '알 수 없는 오류'}`);
              }
            } catch (err) {
              alert(`업로드 오류: ${err.message}`);
            } finally {
              resolve();
            }
          };
          reader.readAsDataURL(file);
        });
      }
    };

    return (
      <Card className="max-w-2xl mx-auto">
        <SectionTitle>⬆️ 앱 업데이트</SectionTitle>
        <div className="rounded-xl border border-base-300 bg-base-200/60 p-4 mb-8 space-y-3">
          <p className="text-sm sm:text-base font-semibold text-base-content/80">
            최신 버전: <span className="font-mono">v{latestVersion}</span>
          </p>
          <p className="text-sm sm:text-base font-semibold text-base-content/80">
            현재 앱 버전: <span className="font-mono">v{appVersion}</span>
          </p>
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
            <div className="label-text font-bold px-1 text-base-content/70">AI 모델 설정</div>
            <select
              className="select select-bordered w-full bg-base-100"
              value={localSettings.gemini_model || 'auto'}
              onChange={(e) =>
                setLocalSettings((prev) => ({ ...prev, gemini_model: e.target.value }))
              }
            >
              <option value="auto">✨ 최적화 모드 (권장)</option>
            </select>
            <p className="text-[11px] px-1 text-base-content/50">
              * 시스템이 포스팅에 가장 적합한 속도와 품질을 자동으로 선택합니다.
            </p>
          </div>

          <Input
            label="Pexels API Key (무료 이미지 자동 수집)"
            type="password"
            placeholder="Pexels API Key 입력..."
            value={localSettings.pexels_api_key || ''}
            onChange={(e) =>
              setLocalSettings((prev) => ({ ...prev, pexels_api_key: e.target.value }))
            }
          />

          <div className="alert bg-base-300/50 border border-base-300 rounded-xl mt-2 text-xs sm:text-sm text-base-content/80 shadow-inner">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              className="stroke-info shrink-0 w-6 h-6"
              role="img"
              aria-label="info"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <div>
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: Easter egg trigger */}
              <p className="font-bold mb-1 cursor-pointer select-none" onClick={handleNoticeClick}>
                안내 사항
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>AI API 키는 서버에서 안전하게 관리되므로 별도로 입력할 필요가 없습니다.</li>
                <li>
                  모든 블로그 원고 생성 및 자동 재작성(Rewrite)은 서버 AI 엔진을 통해 수행됩니다.
                </li>
                {import.meta.env.DEV ? (
                  <li>개인용 로컬 AI를 사용하려면 하단의 Ollama 설정을 이용하세요.</li>
                ) : null}
              </ul>
            </div>
          </div>

          {showDevOptions && (
            <div className="mt-4 p-4 border border-warning/30 bg-warning/5 rounded-xl space-y-2">
              <div className="text-xs font-bold text-warning/80">🛠️ 개발자 설정 모드</div>
              <div className="form-control">
                <label className="label cursor-pointer justify-start gap-3 py-1">
                  <input
                    type="checkbox"
                    className="toggle toggle-warning toggle-sm"
                    checked={localSettings.disable_headless === 'true'}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        disable_headless: e.target.checked ? 'true' : 'false',
                      }))
                    }
                  />
                  <span className="label-text font-semibold text-xs text-base-content/80">
                    헤드리스 모드 비활성화 (포스팅 진행 시 브라우저 화면 표시)
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        <SectionTitle className="mt-8">📸 대표 이미지 풀(Pool) 관리</SectionTitle>
        <div className="bg-base-200/60 p-5 rounded-xl border border-base-300 space-y-4 mb-8">
          <p className="text-xs text-base-content/60 leading-normal">
            여기에 직접 제작하신 대표 이미지들을 등록해 두시면, 개별 포스팅 시 대표 이미지가
            지정되지 않았을 때 순환 방식으로 자동 매칭해 줍니다. (같은 이미지가 연속으로 사용되지
            않도록 제어)
          </p>

          <div className="flex flex-wrap gap-2.5 p-3 bg-base-100 border border-base-300 rounded-xl min-h-[96px]">
            {repImages.map((url) => (
              <div
                key={url}
                className="relative w-20 h-20 rounded-lg overflow-hidden border border-base-300 group shadow-sm"
              >
                <img src={url} alt="rep-pool-item" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setRepImages((prev) => prev.filter((img) => img !== url))}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity"
                >
                  삭제
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 rounded-lg border-2 border-dashed border-base-300 hover:border-primary flex flex-col items-center justify-center text-base-content/40 hover:text-primary transition-colors bg-base-200/30 cursor-pointer"
            >
              <span className="text-xl font-bold">+</span>
              <span className="text-[10px] font-black">이미지 추가</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleUploadRepImage}
            />
          </div>

          <div className="form-control">
            <div className="label py-1">
              <span className="label-text font-bold text-xs text-base-content/80">
                대표 이미지 순환 방식 설정
              </span>
            </div>
            <div className="flex gap-6 items-center pt-1">
              <label className="label cursor-pointer gap-2 py-0">
                <input
                  type="radio"
                  name="image-rotation"
                  className="radio radio-primary radio-sm"
                  checked={
                    (localSettings.representative_image_rotation || 'sequential') === 'sequential'
                  }
                  onChange={() =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      representative_image_rotation: 'sequential',
                    }))
                  }
                />
                <span className="label-text font-semibold text-xs">
                  순차적으로 적용 (1, 2, 3...)
                </span>
              </label>
              <label className="label cursor-pointer gap-2 py-0">
                <input
                  type="radio"
                  name="image-rotation"
                  className="radio radio-primary radio-sm"
                  checked={localSettings.representative_image_rotation === 'random'}
                  onChange={() =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      representative_image_rotation: 'random',
                    }))
                  }
                />
                <span className="label-text font-semibold text-xs">
                  랜덤으로 적용 (연속 중복 배제)
                </span>
              </label>
            </div>
          </div>
        </div>

        {import.meta.env.DEV ? (
          <>
            <SectionTitle className="mt-10">🦙 Ollama 연동 (로컬 AI)</SectionTitle>
            <div className="flex flex-col gap-2">
              <Input
                label="Ollama API 엔드포인트"
                type="text"
                placeholder="http://localhost:11434"
                value={localSettings.ollama_endpoint || ''}
                onChange={(e) =>
                  setLocalSettings((prev) => ({ ...prev, ollama_endpoint: e.target.value }))
                }
              />
              <Input
                label="Ollama 모델명"
                type="text"
                placeholder="llama3"
                value={localSettings.ollama_model || ''}
                onChange={(e) =>
                  setLocalSettings((prev) => ({ ...prev, ollama_model: e.target.value }))
                }
              />
            </div>
          </>
        ) : null}

        <div className="mt-8 pt-6 border-t border-t-base-300 flex justify-end">
          <Btn
            variant="primary"
            onClick={handleSave}
            disabled={loading}
            className="w-full sm:w-auto px-8"
          >
            {loading ? (
              <span className="loading loading-spinner text-neutral-content"></span>
            ) : (
              <>💾 설정 일괄 저장</>
            )}
          </Btn>
        </div>
      </Card>
    );
  },
);

SettingsTab.displayName = 'SettingsTab';

export default SettingsTab;
