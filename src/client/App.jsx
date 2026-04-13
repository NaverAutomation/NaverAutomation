import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './utils/api';
import { useSocket } from './hooks/useSocket';

// Tabs
import DashboardTab from './components/tabs/DashboardTab';
import SettingsTab from './components/tabs/SettingsTab';
import AccountsTab from './components/tabs/AccountsTab';
import GenerateTab from './components/tabs/GenerateTab';
import EditTab from './components/tabs/EditTab';
import ScheduledTab from './components/tabs/ScheduledTab';
import LogsTab from './components/tabs/LogsTab';

// Auth
import Login from './components/Login.jsx';
import { supabase } from './utils/supabase.js';

const TABS = [
  { id: 'dashboard', label: '🏠 대시보드' },
  { id: 'settings',  label: '⚙️ 설정' },
  { id: 'accounts',  label: '👤 계정 관리' },
  { id: 'generate',  label: '✍️ 글 생성' },
  { id: 'edit',      label: '📝 글 수정' },
  { id: 'scheduled', label: '📅 예약 목록' },
  { id: 'logs',      label: '📊 로그' },
];

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [taskStatus, setTaskStatus] = useState({ isRunning: false, queueLength: 0 });
  const [realtimeLogs, setRealtimeLogs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [settings, setSettings] = useState({ openai_api_key: '', gemini_api_key: '' });

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
      const [acc, ps, sched, sets, taskSt] = await Promise.all([
        apiFetch('/api/accounts'),
        apiFetch('/api/posts'),
        apiFetch('/api/posts/scheduled'),
        apiFetch('/api/settings'),
        apiFetch('/api/task/status'),
      ]);
      setAccounts(acc);
      setPosts(ps);
      setScheduledPosts(sched);
      setSettings(prev => ({ ...prev, ...sets }));
      setTaskStatus(taskSt);
    } catch (err) {
      console.error('데이터 로드 오류:', err);
    }
  }, [isAuthenticated]);

  // ── Socket 연동
  const onLog = useCallback((log) => {
    setRealtimeLogs(prev => [...prev.slice(-199), log]);
  }, []);

  const onTaskStatus = useCallback((status) => {
    setTaskStatus(status);
  }, []);

  useSocket(onLog, onTaskStatus);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── 핸들러
  const handleTaskToggle = async () => {
    try {
      const endpoint = taskStatus.isRunning ? '/api/task/stop' : '/api/task/start';
      const data = await apiFetch(endpoint, { method: 'POST' });
      setTaskStatus(data.status);
    } catch (err) {
      alert('오류: ' + err.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
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
            <h1 className="text-xl sm:text-2xl font-black text-primary drop-shadow-sm">Naver Blog Auto</h1>
            <p className="text-xs sm:text-sm text-base-content/60 font-semibold">AI 기반 네이버 블로그 자동화</p>
          </div>
        </div>
        <div className="flex-none gap-3 sm:gap-6">
          <div className="hidden sm:flex items-center gap-2 badge badge-outline badge-lg px-4 py-4 bg-base-200 border-base-100 shadow-inner">
            <span className={`w-3 h-3 rounded-full ${taskStatus.isRunning ? 'bg-success shadow-[0_0_8px_#22c55e] animate-pulse' : 'bg-error'}`} />
            <span className="font-bold text-sm tracking-wide">{taskStatus.isRunning ? '스케줄러 실행 중' : '스케줄러 정지'}</span>
          </div>
          <button
            onClick={handleTaskToggle}
            className={`btn shadow-sm hover:scale-[1.02] transition-transform ${taskStatus.isRunning ? 'btn-error' : 'btn-success'}`}
          >
            {taskStatus.isRunning ? '⏹ 작업 정지' : '▶ 작업 시작'}
          </button>
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
            {TABS.map(tab => (
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
                {tab.id === 'scheduled' && scheduledPosts.length > 0 ? (
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
          {activeTab === 'dashboard' ? (
            <DashboardTab 
              accounts={accounts} 
              posts={posts} 
              scheduledPosts={scheduledPosts} 
              taskStatus={taskStatus} 
              realtimeLogs={realtimeLogs} 
              fetchAll={fetchAll} 
            />
          ) : null}
          {activeTab === 'settings' ? (
            <SettingsTab 
              settings={settings} 
              setSettings={setSettings} 
              fetchAll={fetchAll} 
            />
          ) : null}
          {activeTab === 'accounts' ? (
            <AccountsTab 
              accounts={accounts} 
              fetchAll={fetchAll} 
            />
          ) : null}
          {activeTab === 'generate' ? (
            <GenerateTab 
              accounts={accounts} 
              fetchAll={fetchAll} 
            />
          ) : null}
          {activeTab === 'edit' ? (
            <EditTab />
          ) : null}
          {activeTab === 'scheduled' ? (
            <ScheduledTab 
              scheduledPosts={scheduledPosts} 
              accounts={accounts} 
              fetchAll={fetchAll} 
            />
          ) : null}
          {activeTab === 'logs' ? (
            <LogsTab 
              realtimeLogs={realtimeLogs} 
              setRealtimeLogs={setRealtimeLogs} 
            />
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default App;
