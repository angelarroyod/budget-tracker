import type messages from "../messages/en-US.json";
import type { Locale } from "./i18n/request";

// Typed translation keys: a typo in t("...") fails the build.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
