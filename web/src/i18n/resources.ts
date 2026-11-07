import ko from "./locales/ko.json";
import en from "./locales/en.json";
export const resources = {
  ko: { translation: ko },
  en: { translation: en },
} as const;
export type SupportedLanguage = keyof typeof resources;
