// src/components/ActionLog.tsx

import React, { useRef, useEffect } from 'react';

interface ActionLogProps {
  messages: string[];
}

const ActionLog: React.FC<ActionLogProps> = ({ messages }) => {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="action-log" ref={logContainerRef}>
      {messages.map((msg, index) => (
        <div key={index}>{msg}</div>
      ))}
    </div>
  );
};

export default ActionLog;