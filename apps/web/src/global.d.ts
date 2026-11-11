import type messages from "../messages/es.json";
import type { formats, LOCALE } from "./i18n/config";

declare module "next-intl" {
  interface AppConfig {
    Locale: typeof LOCALE;
    Messages: typeof messages;
    Formats: typeof formats;
  }
}
