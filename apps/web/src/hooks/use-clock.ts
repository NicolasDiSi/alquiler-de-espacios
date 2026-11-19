import { useEffect, useState } from "react";

/**
 * The server's `now`, kept running in the browser: it starts at the instant the server rendered and advances with the
 * browser's clock every `everyMs`, so the screen's "now" (the current time line, the time already past) moves while
 * the page stays open without trusting the browser's own date or zone. The offset between both clocks is fixed once.
 */
export function useClock(serverNow: Date, everyMs = 60_000): Date {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const offset = serverNow.getTime() - Date.now();
    setNow(serverNow);
    const id = window.setInterval(() => setNow(new Date(Date.now() + offset)), everyMs);
    return () => window.clearInterval(id);
  }, [serverNow, everyMs]);
  return now;
}
