import { useEffect, useRef } from 'react';

export const useSocket = (onLog, onTaskStatus) => {
  const socketRef = useRef(null);

  useEffect(() => {
    if (typeof window.io !== 'undefined') {
      const socket = window.io();
      socketRef.current = socket;

      socket.on('log', (log) => {
        if (onLog) onLog(log);
      });

      socket.on('task-status', (status) => {
        if (onTaskStatus) onTaskStatus(status);
      });

      return () => {
        socket.off('log');
        socket.off('task-status');
        socket.disconnect();
      };
    }
  }, [onLog, onTaskStatus]);

  const socket = socketRef.current;

  return { socket };
};
