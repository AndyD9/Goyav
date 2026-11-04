import { describe, it, expect, afterEach } from "vitest";
import { t, tn, setLocale, locale } from "@/i18n";
import { fr } from "@/i18n/fr";

describe("i18n", () => {
  afterEach(() => setLocale("en"));

  it("returns the English source by default", () => {
    setLocale("en");
    expect(t("Cancel")).toBe("Cancel");
  });

  it("translates to French and persists the choice", () => {
    setLocale("fr");
    expect(locale.value).toBe("fr");
    expect(t("Cancel")).toBe("Annuler");
    expect(localStorage.getItem("goyav-locale")).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
  });

  it("falls back to English for missing keys and fills placeholders", () => {
    setLocale("fr");
    expect(t("Not translated {name}", { name: "x" })).toBe("Not translated x");
  });

  it("picks singular or plural", () => {
    expect(tn(1, "{count} result", "{count} results")).toBe("1 result");
    expect(tn(3, "{count} result", "{count} results")).toBe("3 results");
  });

  it("keeps placeholders intact in every French entry", () => {
    for (const [source, translated] of Object.entries(fr)) {
      const wanted = (source.match(/\{\w+\}/g) ?? []).sort();
      const got = (translated.match(/\{\w+\}/g) ?? []).sort();
      expect(got, source).toEqual(wanted);
    }
  });
});
