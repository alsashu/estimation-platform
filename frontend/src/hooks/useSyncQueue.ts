import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConnectionStore, useSyncQueueStore, useToastStore } from '../store';
import api from '../services/api';

export function useSyncQueue() {
  const isOnline = useConnectionStore((s) => s.isOnline);
  const { addToast } = useToastStore();
  const qc = useQueryClient();
  const syncing = useRef(false);
  const prevOnline = useRef(isOnline);

  const processQueue = useCallback(async () => {
    if (syncing.current) return;

    const snapshot = [...useSyncQueueStore.getState().queue];
    if (snapshot.length === 0) return;

    syncing.current = true;

    let successCount = 0;
    let failCount = 0;

    for (const item of snapshot) {
      try {
        await api.request({ method: item.method, url: item.url, data: item.data });
        useSyncQueueStore.getState().dequeue(item.id);
        successCount++;
      } catch {
        failCount++;
      }
    }

    // Refresh all cached queries so the UI reflects synced data
    await qc.invalidateQueries();

    if (successCount > 0) {
      addToast({
        type: 'success',
        title: successCount === 1 ? '1 change synced' : `${successCount} changes synced`,
        message: 'Your offline changes have been saved to the server.',
      });
    }
    if (failCount > 0) {
      addToast({
        type: 'error',
        title: 'Sync incomplete',
        message: `${failCount} change${failCount > 1 ? 's' : ''} could not be synced. Please retry.`,
      });
    }

    syncing.current = false;
  }, [addToast, qc]);

  // Sync any persisted queue on initial mount (e.g. after page reload while online)
  useEffect(() => {
    if (isOnline && useSyncQueueStore.getState().queue.length > 0) {
      void processQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when transitioning from offline → online
  useEffect(() => {
    const wasOffline = !prevOnline.current;
    prevOnline.current = isOnline;

    if (isOnline && wasOffline) {
      void processQueue();
    }
  }, [isOnline, processQueue]);
}
