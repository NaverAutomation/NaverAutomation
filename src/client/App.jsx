import { useCallback, useEffect, useState } from 'react';
// Auth
import Login from './components/Login.jsx';
import AccountsTab from './components/tabs/AccountsTab';

// Tabs
import DashboardTab from './components/tabs/DashboardTab';
import GenerateTab from './components/tabs/GenerateTab';
import LogsTab from './components/tabs/LogsTab';
import SettingsTab from './components/tabs/SettingsTab';
import { apiFetch } from './utils/api';
import { supabase } from './utils/supabase.js';

const WEB_APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';

const resolveLatestVersion = (payload, fallbackVersion) => {
  if (!payload || typeof payload !== 'object') {
    return fallbackVersion;
  }

  if (payload.newVersion) {
    return payload.newVersion;
  }

  if (payload.downloadedVersion) {
    return payload.downloadedVersion;
  }

  if (payload.currentVersion) {
    return payload.currentVersion;
  }

  return fallbackVersion;
};

const TABS = [
  { id: 'dashboard', label: '🏠 대시보드' },
  { id: 'accounts', label: '👤 계정 관리' },
  { id: 'generate', label: '✍️ 글 생성 & 관리' },
  { id: 'logs', label: '📊 로그' },
  { id: 'settings', label: '⚙️ 설정' },
];

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reusedPost, setReusedPost] = useState(null);
  const [taskStatus, setTaskStatus] = useState({
    isRunning: false,
    activeWorkers: 0,
    maxWorkers: 3,
  });
  const [realtimeLogs, setRealtimeLogs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [posts, setPosts] = useState([]);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [settings, setSettings] = useState({ openai_api_key: '', gemini_api_key: '' });
  const [appVersion, setAppVersion] = useState('loading');
  const [latestVersion, setLatestVersion] = useState('loading');
  const [updaterState, setUpdaterState] = useState({
    status: 'idle',
    message: '업데이트 대기 중',
    timestamp: null,
  });
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [manualUpdateRequested, setManualUpdateRequested] = useState(false);

  // ── Auth 세션 관리
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── 데이터 페칭
  const fetchAll = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [acc, camp, ps, sched, sets, taskSt] = await Promise.all([
        apiFetch('/api/accounts'),
        apiFetch('/api/campaigns'),
        apiFetch('/api/posts'),
        apiFetch('/api/posts/scheduled'),
        apiFetch('/api/settings'),
        apiFetch('/api/task/status'),
      ]);
      setAccounts(acc);
      setCampaigns(camp);
      setPosts(ps);
      setScheduledPosts(sched);
      setSettings((prev) => ({ ...prev, ...sets }));
      setTaskStatus(taskSt);
    } catch (err) {
      console.error('데이터 로드 오류:', err);
    }
  }, [isAuthenticated]);

  // ── Socket 연동
  useEffect(() => {
    const socket = window.io?.();
    if (!socket) return;

    socket.on('log', (log) => {
      setRealtimeLogs((prev) => {
        const next = [...prev, log];
        return next.length > 200 ? next.slice(-200) : next;
      });
    });

    socket.on('task-status', (status) => {
      setTaskStatus(status);
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      setAppVersion(WEB_APP_VERSION);
      setLatestVersion(WEB_APP_VERSION);
      setUpdaterState({
        status: 'browser-mode',
        message: `브라우저 모드입니다. 현재 빌드 버전은 ${WEB_APP_VERSION} 입니다.`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    api
      .getAppVersion()
      .then((version) => {
        const resolvedVersion = version || 'unknown';
        setAppVersion(resolvedVersion);
        setLatestVersion(resolvedVersion);
      })
      .catch(() => {
        setAppVersion('unknown');
        setLatestVersion('unknown');
      });

    api
      .getLastUpdaterStatus()
      .then((status) => {
        if (status?.status) {
          setUpdaterState(status);
          setLatestVersion((prev) => resolveLatestVersion(status, prev || 'unknown'));
        }
      })
      .catch(() => {});

    const unsubscribe = api.onUpdaterStatus((payload) => {
      setUpdaterState(payload);
      setLatestVersion((prev) => resolveLatestVersion(payload, prev || appVersion || 'unknown'));
      if (
        payload?.status === 'update-not-available' ||
        payload?.status === 'error' ||
        payload?.status === 'dev-mode'
      ) {
        setIsCheckingUpdate(false);
      }
      if (payload?.status === 'update-available' || payload?.status === 'update-downloaded') {
        setIsCheckingUpdate(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [appVersion]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!manualUpdateRequested) {
      return;
    }

    if (updaterState.status === 'update-not-available') {
      alert('현재 최신 버전입니다.');
      setManualUpdateRequested(false);
      return;
    }

    if (
      updaterState.status === 'update-available' ||
      updaterState.status === 'error' ||
      updaterState.status === 'dev-mode' ||
      updaterState.status === 'browser-mode'
    ) {
      setManualUpdateRequested(false);
    }
  }, [manualUpdateRequested, updaterState.status]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleManualUpdateCheck = async () => {
    const api = window.electronAPI;
    const versionsMatch = latestVersion && appVersion && latestVersion === appVersion;

    if (!api) {
      if (versionsMatch) {
        alert('현재 최신 버전입니다.');
      } else {
        alert('업데이트 확인을 사용할 수 없습니다.');
      }
      return;
    }

    setManualUpdateRequested(true);
    setIsCheckingUpdate(true);
    const result = await api.checkForUpdates();
    if (!result?.ok) {
      setIsCheckingUpdate(false);
      setManualUpdateRequested(false);
    }
  };

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-base-100 flex flex-col font-sans text-base-content antialiased">
      {/* ── Header */}
      <header className="navbar bg-base-300 shadow-md px-4 sm:px-8 border-b border-base-200">
        <div className="flex-1 gap-3">
          <span className="text-3xl">🚀</span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-primary drop-shadow-sm">
                Naver Blog Auto
              </h1>
              <span className="badge badge-sm badge-neutral opacity-50 font-mono">
                v{appVersion}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-base-content/60 font-semibold">
              AI 기반 네이버 블로그 자동화
            </p>
          </div>
        </div>
        <div className="flex-none gap-3 sm:gap-6">
          <button
            onClick={handleLogout}
            className="btn btn-ghost btn-sm sm:btn-md"
            title="로그아웃"
          >
            🚪 로그아웃
          </button>
        </div>
      </header>

      {/* ── Tab Navigation */}
      <nav className="bg-base-200 border-b border-base-300 pt-2">
        <div className="max-w-7xl mx-auto overflow-x-auto overflow-y-hidden scrollbar-hide px-4">
          <div role="tablist" className="tabs tabs-bordered w-full flex-nowrap min-w-max pb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                onClick={() => setActiveTab(tab.id)}
                className={`tab tab-lg whitespace-nowrap transition-colors duration-200 ${
                  activeTab === tab.id
                    ? 'tab-active !border-primary text-primary font-bold'
                    : 'text-base-content/60 hover:text-base-content font-medium border-transparent'
                }`}
              >
                {tab.label}
                {tab.id === 'generate' && scheduledPosts.length > 0 ? (
                  <span className="badge badge-primary badge-sm ml-2 font-bold shadow-sm">
                    {scheduledPosts.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Content (Rule: rendering-conditional-render) */}
      <main className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 flex-1">
        <div className="animate-in fade-in duration-300">
          <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
            <DashboardTab
              accounts={accounts}
              posts={posts}
              scheduledPosts={scheduledPosts}
              taskStatus={taskStatus}
              realtimeLogs={realtimeLogs}
              fetchAll={fetchAll}
            />
          </div>
          <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            <SettingsTab
              settings={settings}
              fetchAll={fetchAll}
              appVersion={appVersion}
              latestVersion={latestVersion}
              onManualUpdateCheck={handleManualUpdateCheck}
              isCheckingUpdate={isCheckingUpdate}
            />
          </div>
          <div style={{ display: activeTab === 'accounts' ? 'block' : 'none' }}>
            <AccountsTab accounts={accounts} fetchAll={fetchAll} />
          </div>
          <div style={{ display: activeTab === 'generate' ? 'block' : 'none' }}>
            <GenerateTab
              accounts={accounts}
              campaigns={campaigns}
              scheduledPosts={scheduledPosts}
              posts={posts}
              fetchAll={fetchAll}
              reusedPost={reusedPost}
              clearReusedPost={() => setReusedPost(null)}
            />
          </div>
          <div style={{ display: activeTab === 'logs' ? 'block' : 'none' }}>
            <LogsTab realtimeLogs={realtimeLogs} setRealtimeLogs={setRealtimeLogs} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
