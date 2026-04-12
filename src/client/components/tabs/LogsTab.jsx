import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../utils/api';
import { Card } from '../common';

const LogsTab = React.memo(({ realtimeLogs, setRealtimeLogs }) => {
  const [dbLogs, setDbLogs] = useState([]);
  const logEndRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/logs').then(setDbLogs).catch(() => {});
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [realtimeLogs]);

  const handleClearLogs = async () => {
    if (!confirm('경고: 모든 로그 기록을 데이터베이스에서 영구 삭제하시겠습니까?')) return;
    try {
      await apiFetch('/api/logs', { method: 'DELETE' });
      setRealtimeLogs([]);
      setDbLogs([]);
    } catch (err) {
      alert('오류: ' + err.message);
    }
  };

  const allLogs = [...dbLogs, ...realtimeLogs].slice(-300);

  const levelStyles = {
    error:   'text-error border-error/50 bg-error/10',
    success: 'text-success border-success/50 bg-success/10',
    warn:    'text-warning border-warning/50 bg-warning/10',
    info:    'text-info border-info/50 bg-info/10',
  };

  return (
    <Card className="h-[calc(100vh-140px)] flex flex-col">
      <div className="flex justify-between items-center mb-4 border-b border-base-300 pb-4 shrink-0">
        <h2 className="text-xl font-bold flex items-center gap-3">
          📊 실시간 시스템 로그
          <span className="badge badge-neutral shadow-inner">{allLogs.length}건</span>
        </h2>
        <button className="btn btn-sm btn-error shadow-sm" onClick={handleClearLogs}>
          🗑 로그 DB 비우기
        </button>
      </div>
      
      <div className="flex-1 bg-slate-950 rounded-2xl p-4 sm:p-6 overflow-y-auto font-mono text-sm leading-relaxed border border-white/5 shadow-2xl scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
        {allLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 italic font-sans font-medium">
            스케줄러를 가동하면 중앙 백그라운드 서버가 여기에 로그를 기록합니다...
          </div>
        ) : (
          <div className="flex flex-col pb-4">
            {allLogs.map((log, i) => {
              const style = levelStyles[log.level] || levelStyles.info;
              const timeStr = new Date(log.created_at).toLocaleTimeString('en-GB', { hour12: false });
              
              return (
                <div key={i} className="group flex items-start gap-4 py-1 hover:bg-white/[0.03] px-2 rounded-lg transition-colors border-b border-white/[0.02] last:border-0">
                  <span className="shrink-0 text-slate-500 text-xs font-medium pt-0.5">
                    [{timeStr}]
                  </span>
                  <span className={`shrink-0 border px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-tighter w-16 text-center shadow-sm ${style}`}>
                    {log.level || 'info'}
                  </span>
                  <span className={`break-words flex-1 font-medium tracking-tight ${
                    log.level === 'error' ? 'text-red-400 font-bold' : 
                    log.level === 'success' ? 'text-emerald-400' : 
                    log.level === 'warn' ? 'text-amber-400' : 
                    'text-slate-300'
                  }`}>
                    {log.message}
                  </span>
                </div>
              );
            })}
            <div ref={logEndRef} className="h-4" />
          </div>
        )}
      </div>
    </Card>
  );
});

export default LogsTab;
