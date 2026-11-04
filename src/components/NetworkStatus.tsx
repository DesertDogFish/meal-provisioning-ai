import { useEffect, useState } from 'react';

import { networkMonitor } from '../sync/NetworkMonitor';

export default function NetworkStatus() {
  const [online, setOnline] = useState(networkMonitor.isOnline());

  useEffect(() => {
    const unsub = networkMonitor.subscribe(setOnline);
    return unsub;
  }, []);

  if (online) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--danger)',
        color: 'var(--snow)',
        textAlign: 'center',
        padding: '8px',
        fontSize: '14px',
        zIndex: 9999,
      }}
    >
      Вы офлайн — изменения сохраняются локально
    </div>
  );
}