// Minimal i18n: English source strings are the keys, and each other
// language maps them to a translation. A missing entry falls back to the
// English text, so untranslated corners stay readable.
//
// `t()` reads the reactive `locale`, so templates that call it re-render
// when the language changes.
import { ref } from "vue";
import { fr } from "./fr";

export type Locale = "en" | "fr";

export const LOCALES: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
];

const STORAGE_KEY = "goyav-locale";

const dictionaries: Record<Locale, Readonly<Record<string, string>>> = {
  en: {},
  fr,
};

function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "fr";
}

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage can be unavailable; fall through to the system language.
  }
  const system = typeof navigator !== "undefined" ? navigator.language : "";
  return system?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export const locale = ref<Locale>(detectLocale());

function applyDocumentLang(value: Locale) {
  if (typeof document !== "undefined") document.documentElement.lang = value;
}
applyDocumentLang(locale.value);

export function setLocale(value: Locale) {
  locale.value = value;
  applyDocumentLang(value);
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // The choice still applies for this session.
  }
}

export type TranslateParams = Record<string, string | number>;

/** Translate an English source string, filling `{name}` placeholders. */
export function t(source: string, params?: TranslateParams): string {
  const template = dictionaries[locale.value][source] ?? source;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Pick the singular or plural source string for `count`, then translate. */
export function tn(
  count: number,
  one: string,
  other: string,
  params?: TranslateParams,
): string {
  return t(count === 1 ? one : other, { count, ...params });
}

/** The BCP 47 tag for date/number formatting in the chosen language. */
export function dateLocale(): string {
  return locale.value === "fr" ? "fr-FR" : "en-US";
}
