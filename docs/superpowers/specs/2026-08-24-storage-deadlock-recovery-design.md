# Storage Deadlock Recovery Design

## Goal

Ensure unreachable construction work cannot starve reachable capacity recovery, and make saves resilient to stale access-request orders produced by request trimming.

## Runtime behavior

Construction assignment will evaluate orders in existing priority order (`access`, then `capacity`, then optional expansion), but it will select the first order that has both reservable material and a reachable construction stand for the current dwarf. An unreachable high-priority order must not prevent a reachable lower-priority depot from being assigned.

Stale access construction orders are recoverable when:

- their `accessRequestId` no longer exists;
- their planned building no longer exists; or
- the planned building has no reachable builder and no active builder is working on it.

Recovery removes the planned building and order, returns reserved/delivered materials through the existing conservation-safe return path, and leaves unrelated orders intact. Completed buildings are never removed by this recovery.

When open access requests are trimmed, any construction orders tied to discarded requests are recovered atomically instead of being left orphaned.

## Save import behavior

Schema-4 import will apply the same orphan-access-order recovery before final validation. If recovery succeeds, the save loads and the store status becomes `IMPORTED WITH RECOVERY`; otherwise the existing validation error remains. Orphan orders with material that cannot be returned remain rejected rather than silently losing resources.

## Implementation boundaries

- Add route-aware order selection in `src/game/engine.ts`.
- Generalize the existing stale-order recovery in `src/game/logistics.ts` for access orders while preserving outpost recovery behavior.
- Make access-request trimming call that recovery path.
- Add a serialization repair step and import status in `src/game/serialization.ts` and `src/game/state.ts`.
- Keep UI layout unchanged; the existing HUD save-status text displays the recovery status.

## Testing

Add regressions for:

1. an unreachable access order not starving a reachable depot order;
2. stale access orders being removed with material conservation;
3. trimming an access request recovering its linked order;
4. importing an orphan access order by repairing it and reporting recovery; and
5. rejecting an orphan order when its reserved material cannot be safely returned.

## Non-goals

- No changes to construction priority ranks.
- No automatic deletion of completed buildings.
- No resource dumping or resource destruction.
- No broad save-schema migration beyond repairing orphan access orders.
