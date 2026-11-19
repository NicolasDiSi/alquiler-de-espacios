import { useEffect, useState } from "react";

/**
 * True from the component's first commit on. For a widget that updates its owner while it renders for the first time
 * (FullCalendar's controller does): rendering it only once the owner has mounted keeps those updates legal.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
