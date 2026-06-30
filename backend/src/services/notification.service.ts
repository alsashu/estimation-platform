import { query } from '../config/database';

export type NotifType = 'info' | 'success' | 'warning' | 'error';
export type NotifCategory = 'general' | 'approval' | 'system' | 'security';

export interface CreateNotifOptions {
  type?: NotifType;
  title: string;
  message: string;
  userId?: string;
  category?: NotifCategory;
  actionUrl?: string;
  priority?: 'normal' | 'high' | 'urgent';
}

export async function createNotification(opts: CreateNotifOptions): Promise<void> {
  try {
    await query(
      `INSERT INTO notifications (type, title, message, user_id, category, action_url, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        opts.type ?? 'info',
        opts.title,
        opts.message,
        opts.userId ?? null,
        opts.category ?? 'general',
        opts.actionUrl ?? null,
        opts.priority ?? 'normal',
      ]
    );
  } catch {
    // Notification failures must not block main operations
  }
}

export async function createApprovalNotification(opts: {
  forUserId: string;
  title: string;
  message: string;
  actionUrl?: string;
}): Promise<void> {
  return createNotification({
    type: 'warning',
    category: 'approval',
    priority: 'high',
    ...opts,
    userId: opts.forUserId,
  });
}

export async function broadcastToAdmins(adminUserIds: string[], opts: Omit<CreateNotifOptions, 'userId'>): Promise<void> {
  for (const userId of adminUserIds) {
    await createNotification({ ...opts, userId });
  }
}
