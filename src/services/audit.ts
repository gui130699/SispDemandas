import type { UserProfile } from "../types/models";

/**
 * Audit records are intentionally server-only. Keeping this compatibility
 * function avoids failed follow-up writes in legacy callers while preventing
 * a browser from forging actor, role or timestamp fields.
 */
export async function audit(
  _user: UserProfile,
  _action: string,
  _entityType: string,
  _entityId: string,
  _companyId?: string | null,
  _before?: unknown,
  _after?: unknown,
) {
  return undefined;
}
