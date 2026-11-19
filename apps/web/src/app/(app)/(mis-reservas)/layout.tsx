import type { ReactNode } from "react";

import { requireMember } from "@/lib/session/session";

/**
 * Checks the member before `loading.tsx` starts streaming. Inside that boundary the response would already have gone
 * out as 200, so the operator's 403 (spec 0003, AC-12) and the signed out redirect must be decided here.
 */
export default async function MyBookingsLayout({ children }: { children: ReactNode }) {
  await requireMember();
  return children;
}
