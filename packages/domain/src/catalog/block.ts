/**
 * What the operator sees of a block (spec 0005): derived at read time, never stored, like `bookingPhase`. A released
 * block is `released` whatever its dates; otherwise it is `finished` once its end has passed, else `active` (it blocks
 * now or will). Labels: Activo, Finalizado, Liberado.
 */
export const BLOCK_PHASES = ["active", "finished", "released"] as const;
export type BlockPhase = (typeof BLOCK_PHASES)[number];

export function blockPhase(block: { readonly endsAt: Date; readonly releasedAt: Date | null }, now: Date): BlockPhase {
  if (block.releasedAt) return "released";
  return block.endsAt.getTime() <= now.getTime() ? "finished" : "active";
}
