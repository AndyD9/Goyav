import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import pkg from "../../package.json";
import {
  CHANGELOG,
  compareVersions,
  markVersionSeen,
  unseenReleases,
} from "@/lib/changelog";
import ChangelogList from "@/components/changelog/ChangelogList.vue";
import { setLocale } from "@/i18n";

describe("changelog", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => setLocale("en"));

  it("lists the current app version first, newest to oldest", () => {
    expect(CHANGELOG[0].version).toBe(pkg.version);
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    }
    for (const release of CHANGELOG) {
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const change of release.changes) {
        expect(change.en.trim()).not.toBe("");
        expect(change.fr.trim()).not.toBe("");
      }
    }
  });

  it("compares dotted versions numerically", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0);
  });

  it("shows nothing on a first run and records the version", () => {
    expect(unseenReleases("0.2.0")).toEqual([]);
    expect(localStorage.getItem("goyav-last-seen-version")).toBe("0.2.0");
    expect(unseenReleases("0.2.0")).toEqual([]);
  });

  it("returns the releases installed since the last seen version", () => {
    markVersionSeen("0.1.0");
    expect(unseenReleases("0.2.0").map((r) => r.version)).toEqual(["0.2.0"]);
    markVersionSeen("0.2.0");
    expect(unseenReleases("0.2.0")).toEqual([]);
  });

  it("renders changes in the chosen language", () => {
    setLocale("fr");
    const wrapper = mount(ChangelogList, { props: { current: "0.2.0" } });
    const release = wrapper.get('[data-testid="changelog-0.2.0"]');
    expect(release.text()).toContain("Installée");
    expect(release.text()).toContain("Plusieurs signatures par compte");
    expect(release.text()).toContain("Nouveau");
  });
});
