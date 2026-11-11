import { getRequestConfig } from "next-intl/server";

import messages from "../../messages/es.json";
import { formats, LOCALE, TIME_ZONE } from "./config";

// Reads no cookies or headers, so every page stays static. The same locale, formats and time zone reach the client
// through NextIntlClientProvider, so server and client format identically.
export default getRequestConfig(async () => ({
  locale: LOCALE,
  messages,
  formats,
  timeZone: TIME_ZONE,
}));
