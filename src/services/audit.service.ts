import { Knex } from "knex";
import { db } from "../db/connection";
import { RideAuditLogRow, Role } from "../types";

export const auditService = {
  async log(
    rideId: string,
    actor: { userId: string; role: Role },
    action: string,
    changes: Record<string, unknown> = {},
    trx?: Knex.Transaction
  ): Promise<void> {
    const query = trx ? trx<RideAuditLogRow>("ride_audit_log") : db<RideAuditLogRow>("ride_audit_log");
    await query.insert({
      ride_id: rideId,
      actor_id: actor.userId,
      actor_role: actor.role,
      action,
      changes,
    });
  },

  async getTrail(rideId: string): Promise<RideAuditLogRow[]> {
    return db<RideAuditLogRow>("ride_audit_log")
      .where({ ride_id: rideId })
      .orderBy("created_at", "asc");
  },
};
