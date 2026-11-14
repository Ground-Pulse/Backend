/**
 * Row-level access checks (BR-010): owners only see their own properties,
 * inspectors only their assigned inspections, providers only their jobs.
 * Enforced at the query layer — the UI hiding things is never the guard.
 */
import { Role } from '@prisma/client';
import { UserWithoutPassword } from './decorators/current-user.decorator';

export type AuthUser = UserWithoutPassword & { serviceProvider?: { id: string } | null };

export const isAdmin = (u: AuthUser) => u.role === Role.ADMIN;

export function mostRecentFirst<T extends { createdAt: string }>(rows: T[]) {
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
