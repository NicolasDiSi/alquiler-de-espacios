import type { ReactNode } from "react";

import { requireMember } from "@/lib/session/session";

/** Checks the member before `loading.tsx` streams (as Mis reservas): the operator gets 403, no session the picker. */
export default async function RoomsLayout({ children }: { children: ReactNode }) {
  await requireMember();
  return children;
}
