import { getDb } from '../db.js';

/**
 * Resolves the "Act as" member a write claims to come from.
 *
 * There is no authentication here by design: the page's roster is an honour
 * system among a named review team, and adding real accounts was explicitly out
 * of scope. What this does enforce is that a write is *attributable* - it names
 * a member who exists on the roster and who has a name typed against them, the
 * same rule the page applies before it will record a click.
 *
 * The name and slot are read from the roster rather than trusted from the
 * request, so a stale browser cannot stamp a change with a name nobody holds.
 * They are then denormalised onto the record: the roster may be renamed later,
 * and the log has to keep saying who made the change at the time.
 */
export async function resolveActor(memberKey) {
  if (!memberKey || typeof memberKey !== 'string') {
    return { error: 'memberKey is required: a change has to be attributable to a person.' };
  }

  const db = await getDb();
  const member = await db.collection('team').findOne({ memberKey });

  if (!member) return { error: `No roster member "${memberKey}".` };
  if (!member.active) return { error: `${member.slot} has been removed from the roster.` };
  if (!member.name || !member.name.trim()) {
    return { error: `Type a name for ${member.slot} first - an update has to be attributable to a person, not a slot.` };
  }

  return {
    actor: {
      byMemberKey: member.memberKey,
      byName: member.name.trim(),
      bySlot: member.slot,
    },
  };
}
