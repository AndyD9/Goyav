import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";

const { invokeMock, listeners, sendNotificationMock, openUrlMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  sendNotificationMock: vi.fn(),
  openUrlMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  }),
}));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue("granted"),
  sendNotification: sendNotificationMock,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: openUrlMock }));

import { useUpdatesStore } from "@/stores/updates";
import { parseReleaseNotes } from "@/lib/release-notes";
import { resetLoadingForTests, useLoadingOverlay } from "@/lib/loading";
import { useToasts } from "@/lib/toast";
import UpdateNotice from "@/components/common/UpdateNotice.vue";
import AboutDialog from "@/components/common/AboutDialog.vue";

const UPDATE = {
  version: "0.3.60",
  currentVersion: "0.3.59",
  notes: "### New\n- Update notice\n\n### Fixed\n- About shows the real version\n\nBuilt from abc.",
  publishedAt: 1_793_000_000,
};

beforeEach(() => {
  setActivePinia(createPinia());
  invokeMock.mockReset();
  sendNotificationMock.mockReset();
  listeners.clear();
  localStorage.clear();
  resetLoadingForTests();
  useToasts().value = [];
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parseReleaseNotes", () => {
  it("groups items under known headings and ignores everything else", () => {
    expect(parseReleaseNotes(UPDATE.notes)).toEqual([
      { kind: "new", items: ["Update notice"] },
      { kind: "fixed", items: ["About shows the real version"] },
    ]);
    expect(parseReleaseNotes("Maintenance release.")).toEqual([]);
    expect(parseReleaseNotes(null)).toEqual([]);
  });

  it("orders sections new, improved, fixed", () => {
    const sections = parseReleaseNotes("### Fixed\n- b\n### Improved\n- c\n### New\n- a");
    expect(sections.map((section) => section.kind)).toEqual(["new", "improved", "fixed"]);
  });
});

describe("updates store", () => {
  it("picks up an update found before the frontend listened", async () => {
    invokeMock.mockImplementation(async (command: string) =>
      command === "get_pending_update" ? UPDATE : null,
    );
    const store = useUpdatesStore();
    await store.init();
    expect(store.available?.version).toBe("0.3.60");
    expect(store.noticeVisible).toBe(true);
  });

  it("announces update-available events once per version", async () => {
    invokeMock.mockResolvedValue(null);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const store = useUpdatesStore();
    await store.init();

    listeners.get("update-available")?.({ payload: UPDATE });
    listeners.get("update-available")?.({ payload: UPDATE });
    await vi.waitFor(() => expect(sendNotificationMock).toHaveBeenCalledTimes(1));
    expect(store.available?.version).toBe("0.3.60");
    expect(localStorage.getItem("goyav-update-notified")).toBe("0.3.60");
  });

  it("reports an up-to-date manual check with a toast", async () => {
    invokeMock.mockResolvedValue({ status: "upToDate", version: "0.3.59" });
    const store = useUpdatesStore();
    await store.check();
    expect(store.lastCheck).toBe("upToDate");
    expect(useToasts().value.map((toast) => toast.message)).toContain("Goyav 0.3.59 is up to date.");
  });

  it("brings the notice back when a manual check finds a dismissed update", async () => {
    invokeMock.mockResolvedValue({ status: "available", ...UPDATE });
    const store = useUpdatesStore();
    await store.check();
    store.dismiss();
    expect(store.noticeVisible).toBe(false);
    await store.check();
    expect(store.noticeVisible).toBe(true);
  });

  it("shows the install overlay with progress, and clears it on failure", async () => {
    let fail: (error: unknown) => void = () => {};
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_pending_update") return Promise.resolve(UPDATE);
      if (command === "install_update") return new Promise((_, reject) => (fail = reject));
      return Promise.resolve(null);
    });
    const store = useUpdatesStore();
    await store.init();
    const overlay = useLoadingOverlay();

    const installing = store.install();
    expect(store.phase).toBe("downloading");
    expect(overlay.value?.label).toBe("Downloading Goyav 0.3.60…");

    listeners.get("update-progress")?.({ payload: { downloaded: 50, total: 200, installing: false } });
    expect(overlay.value?.progress).toBe(0.25);
    listeners.get("update-progress")?.({ payload: { downloaded: 0, total: null, installing: true } });
    expect(store.phase).toBe("installing");
    expect(overlay.value?.label).toBe("Installing the update…");

    fail("signature mismatch");
    await installing;
    expect(store.phase).toBe("idle");
    expect(overlay.value).toBeNull();
    expect(useToasts().value.some((toast) => toast.type === "error")).toBe(true);
  });
});

describe("UpdateNotice", () => {
  it("lists the release notes and installs on click", async () => {
    invokeMock.mockImplementation(async (command: string) =>
      command === "get_pending_update" ? UPDATE : new Promise(() => {}),
    );
    const store = useUpdatesStore();
    await store.init();
    const wrapper = mount(UpdateNotice);
    await nextTick();

    expect(wrapper.find('[data-testid="update-notice-version"]').text()).toContain("Goyav 0.3.60");
    expect(wrapper.find('[data-testid="update-notice-notes"]').text()).toContain("About shows the real version");

    await wrapper.find('[data-testid="update-notice-install"]').trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("install_update");
  });

  it("hides on Later", async () => {
    invokeMock.mockImplementation(async (command: string) =>
      command === "get_pending_update" ? UPDATE : null,
    );
    await useUpdatesStore().init();
    const wrapper = mount(UpdateNotice);
    await wrapper.find('[data-testid="update-notice-later"]').trigger("click");
    expect(wrapper.find('[data-testid="update-notice"]').exists()).toBe(false);
  });
});

describe("AboutDialog", () => {
  it("shows the build version, the changes in this version and a check button", async () => {
    invokeMock.mockResolvedValue({ status: "upToDate", version: __APP_VERSION__ });
    mount(AboutDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();

    expect(document.querySelector('[data-testid="about-version"]')?.textContent).toBe(__APP_VERSION__);
    expect(document.querySelector('[data-testid="about-notes"]')).not.toBeNull();

    (document.querySelector('[data-testid="about-check-updates"]') as HTMLElement).click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="about-update-status"]')?.textContent).toBe("Up to date"),
    );
  });

  it("offers to install a known update", async () => {
    invokeMock.mockImplementation(async (command: string) =>
      command === "get_pending_update" ? UPDATE : new Promise(() => {}),
    );
    await useUpdatesStore().init();
    mount(AboutDialog, { props: { open: true }, attachTo: document.body });
    await nextTick();

    expect(document.querySelector('[data-testid="about-update-status"]')?.textContent).toBe(
      "Version 0.3.60 available",
    );
    expect(document.querySelector('[data-testid="about-install-update"]')).not.toBeNull();
  });
});
