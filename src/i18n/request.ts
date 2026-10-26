import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

export const locales = ["en-US", "es-MX"] as const;
export type Locale = (typeof locales)[number];
export const LOCALE_COOKIE = "locale";

const isLocale = (v: string | undefined): v is Locale => locales.includes(v as Locale);

/** Cookie wins; first visit falls back to the browser's language. No locale in the URL: the app sits behind a login. */
async function resolveLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return (await headers()).get("accept-language")?.toLowerCase().startsWith("es") ? "es-MX" : "en-US";
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    timeZone: "America/Monterrey",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
