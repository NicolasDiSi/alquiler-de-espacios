import type { ReactNode } from "react";

import { requireOperator } from "@/lib/session/session";

/** Checks the operator before `loading.tsx` streams (as `/salas`): a member gets 403, no session the picker. */
export default async function OperatorLayout({ children }: { children: ReactNode }) {
  await requireOperator();
  return children;
}
