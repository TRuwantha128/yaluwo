import { db } from '../db/knex.js'

// Every admin and staff action is recorded and can't be edited (workflow section 23)
export async function audit({ actorId = null, action, targetType = null, targetId = null, amount = null, ip = null, details = null }, trx = db) {
  await trx('audit_log').insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId == null ? null : String(targetId),
    amount,
    ip,
    details: details ? JSON.stringify(details) : null,
  })
}

export const auditFrom = (req) => ({ actorId: req.user?.id ?? null, ip: req.ip })
