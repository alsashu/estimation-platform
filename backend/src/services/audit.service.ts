import { query } from '../config/database';
import { JwtPayload } from '../auth/jwt';
import { Request } from 'express';

export interface AuditEntry {
  entity: string;
  entityId?: string;
  action: string;
  previousValue?: unknown;
  newValue?: unknown;
  user?: JwtPayload;
  req?: Request;
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (entity, entity_id, action, previous_value, new_value, user_id, username, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        entry.entity,
        entry.entityId ?? null,
        entry.action,
        entry.previousValue ? JSON.stringify(entry.previousValue) : null,
        entry.newValue ? JSON.stringify(entry.newValue) : null,
        entry.user?.userId ?? null,
        entry.user?.username ?? null,
        entry.req?.ip ?? null,
        entry.req?.headers['user-agent'] ?? null,
      ]
    );
  } catch {
    // Audit failures must not block main operations
  }
}
