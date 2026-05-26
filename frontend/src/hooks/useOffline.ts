import { useState, useEffect } from 'react';
import { useToastStore } from '../store';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { addToast } = useToastStore();

  useEffect(() => {
    const goOffline = () => {
      setIsOffline(true);
      addToast({ type: 'warning', title: 'You are offline', message: 'Cached data is being used. Changes will sync when reconnected.' });
    };
    const goOnline = () => {
      setIsOffline(false);
      addToast({ type: 'success', title: 'Back online', message: 'Connection restored.' });
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, [addToast]);

  return { isOffline };
}
