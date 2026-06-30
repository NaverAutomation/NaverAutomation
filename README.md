# Naver Blog Auto (v0.3.341)

AI 기반 네이버 블로그 자동화 솔루션입니다. Supabase 인증을 통한 보안 강화, Gemini/Ollama를 활용한 콘텐츠 생성, Playwright 기반 포스팅 자동화를 지원합니다.

---

## 🚀 주요 기능

- **다양한 AI 엔진 지원**: Google Gemini (2.5-flash-lite 최적화) 및 Ollama(로컬 LLM)를 통한 원고 및 이미지 자동 생성. (OpenAI 연동 제거)
- **24시간 대기열 자동 연장**: 예약 대기열 소진 임박 시(1개 이하 또는 12시간 미만 잔여) 7시간 간격으로 다음 날 분량(3개)을 자동 연장하여 순환 발행합니다. (전체 취소 시 무한 루프 방지 로직 포함)
- **네이버 로그인 보안 및 우회**:
  - 비밀번호 오류, 캡차 요구, 보호조치 잠금 등 실패 원인 세분화 및 5회 실패 시 계정 일시정지(`paused`) 처리.
  - 최신 Chromium 대응을 위해 `keyboard.type()` 로그인 방식 적용, 기존 값 클리어 및 랜덤 지연(30~80ms) 도입.
  - 로그인 실패 시 3분 대기 후 재시도 로직 적용.
- **다중 계정 관리**: 여러 네이버 계정을 등록하고 1일 포스팅 제한 한도(15회) 및 라운드 로빈 방식으로 분산 포스팅을 수행합니다.
- **자동 키워드 일괄 예약**: 일괄 예약 대기열 그룹화 및 발행 현황(Vㅁㅁㅁ) 시각화, Pexels API 기반 이미지 검색 다양성 개선 및 태그 미리 입력을 지원합니다.
- **이미지 분할 및 AI 보강**: 일괄 예약 시 대표/본문 사진을 순차 분할 배분하며, 이미지 미배정 시 Gemini AI가 컨텍스트에 맞는 이미지를 자동 생성합니다.
- **시스템 최적화**: SQLite 순차 마이그레이션 적용(DB 락 방지), 이미지 크기 900px 최적화, Supabase 마스터 API 키 조회 폴백 및 인메모리 캐싱 최적화, Socket.io 기반 실시간 UI 동기화를 지원합니다.
- **보안 및 유저 격리**: 사용자 민감 정보는 암호화하여 로컬 SQLite DB(`naver-auto.db`)에 안전하게 보호합니다.
- **API 검증 및 테스트**: Zod 기반 API 요청 검증 및 Vitest를 활용한 백엔드 단위 테스트 스위트를 구축하였습니다.

---

## 📋 사전 준비 사항

- **Node.js**: v22.0.0 이상 권장.
- **Supabase 프로젝트**: 사용자 인증 및 글로벌 설정을 위한 Supabase URL 및 API Key.
- **AI API Key**: Gemini API 키 또는 로컬 Ollama 엔드포인트.

---

## 🛠 설치 및 실행 방법

### 의존성 설치 및 브라우저 세팅

1. **저장소 클론 및 이동**:
   ```bash
   git clone https://github.com/NaverAutomation/NaverAutomation.git
   cd NaverAutomation
   ```

2. **의존성 패키지 설치**:
   ```bash
   npm install
   ```

### 애플리케이션 실행

- **개발 서버 실행**: `npm run dev`
- **Electron 데스크톱 앱 실행 (개발용)**: `npm run electron:dev`
- **서버 백엔드 단독 실행**: `npm run start`
- **Vitest 단위 테스트 실행**: `npm run test`
- **Biome 코드 스타일 및 린트 검사**: `npm run check`
- **Electron 데스크톱 앱 빌드**: `npm run electron:build`

---

## ⚙️ 설정 및 사용법

1. **로그인**: 앱 실행 후 본인의 계정으로 로그인합니다.
2. **설정 (`⚙️ 설정`)**: Gemini API 키 또는 Ollama 설정을 입력합니다.
3. **계정 등록 (`👤 계정 관리`)**: 포스팅에 사용할 네이버 계정을 등록합니다.
4. **글 생성 & 관리 (`✍️ 글 생성 & 관리`)**: AI 초안 생성, 자동 키워드 예약(일괄 생성/배분), 수기 작성을 지원합니다.
5. **예약 대기열 (`📅 예약 대기열`)**: 대기열 상태 확인, 즉시 발행 및 예약을 관리합니다.
6. **실시간 로그 (`📊 로그`)**: 스케줄러 및 발행 진행 단계를 실시간 모니터링합니다.

---

## 📂 프로젝트 구조

### 백엔드 (src/server)
- `services/naver-service.js`: Playwright 기반 네이버 로그인 및 자동 포스팅 제어
- `services/scheduler.js`: 포스팅 예약 스케줄러 및 대기열 자동 연장 관리
- `services/ai-service.js`: Gemini/Ollama 연동 원고 및 이미지 생성
- `services/pexels-service.js`: Pexels 이미지 검색 지원
- `db/database.js`: SQLite DB 연동 및 순차 마이그레이션 적용
- `routes/api.js`: Express HTTP API 라우터 및 Socket.io 업데이트 관리

### 프론트엔드 (src/client)
- `components/tabs/DashboardTab.jsx`: 시스템 현황 및 지표 대시보드
- `components/tabs/GenerateTab.jsx`: AI 글 생성 및 편집 에디터
- `components/tabs/QueueTab.jsx`: 실시간 예약 대기열 및 발행 현황 제어
- `components/tabs/AccountsTab.jsx`: 다중 네이버 계정 정보 관리
- `components/tabs/SettingsTab.jsx`: 시스템 설정 및 API 키 등록

### 단위 테스트 (test)
- `auto-extend.test.js`: 자동 꼬리물기 연장 스케줄러 검증
- `login-retry.test.js`: 로그인 실패 재시도 및 계정 일시정지 검증
- `schedule-keywords.test.js`: 키워드 일괄 등록 및 스케줄링 검증
- `api.test.js`: API 스키마 검증 및 응답 테스트
- `pexels-service.test.js`: 이미지 검색 기능 테스트
