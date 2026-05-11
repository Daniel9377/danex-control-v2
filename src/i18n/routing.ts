import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en", "th", "pt"],
  defaultLocale: "fr",
});
