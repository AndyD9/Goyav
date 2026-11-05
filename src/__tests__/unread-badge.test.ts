import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { Folder } from "@/lib/types";

const win = vi.hoisted(() => ({ setBadgeCount: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => win }));

const events = vi.hoisted(() => ({ handlers: new Map<string, () => void>() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, handler: () => void) => {
    events.handlers.set(name, handler);
    return () => {};
  }),
}));

vi.mock("@/lib/tauri", () => ({
  listAccounts: vi.fn(),
  getLastView: vi.fn().mockResolvedValue({ account_id: null, folder_path: null }),
  listFolders: vi.fn(),
  saveLastView: vi.fn().mockResolvedValue(undefined),
  triggerSync: vi.fn().mockResolvedValue(undefined),
}));

import * as api from "@/lib/tauri";
import { badgeCount, inboxUnreadTotal } from "@/lib/unread-badge";
import UnreadBadge from "@/components/common/UnreadBadge.vue";
import { useAccountsStore } from "@/stores/accounts";
import { useUiStore } from "@/stores/ui";

function folder(path: string, type: string | null, unread: number, children: Folder[] = []): Folder {
  return { name: path, path, folder_type: type, unread_count: unread, total_count: 50, children };
}

const account = (id: string) => ({
  id,
  display_name: id,
  email: `${id}@me.test`,
  username: "",
  provider: "generic" as const,
  mail_protocol: "imap" as const,
  enabled: true,
  mail_sync_interval_seconds: null,
  calendar_sync_interval_seconds: null,
  contacts_sync_interval_seconds: null,
  has_calendar_binding: false,
  has_contacts_binding: false,
  meet_protocol: "" as const,
});

describe("inboxUnreadTotal", () => {
  it("sums the inbox of each account, nested or not, and ignores other folders", () => {
    const total = inboxUnreadTotal(
      {
        a: [folder("INBOX", "inbox", 3), folder("Spam", "junk", 40)],
        b: [folder("Root", null, 0, [folder("Root/Inbox", "inbox", 2)])],
        c: [folder("INBOX", "inbox", 99)],
      },
      ["a", "b", "missing"],
    );
    expect(total).toBe(5);
  });

  it("removes the badge at zero or when disabled", () => {
    expect(badgeCount(0, true)).toBeUndefined();
    expect(badgeCount(4, false)).toBeUndefined();
    expect(badgeCount(4, true)).toBe(4);
  });
});

describe("UnreadBadge", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    win.setBadgeCount.mockClear();
    events.handlers.clear();
    vi.mocked(api.listAccounts).mockResolvedValue([account("a"), account("b")] as never);
  });

  it("shows the inbox unread total and follows folder changes and the preference", async () => {
    const counts: Record<string, number> = { a: 3, b: 1 };
    vi.mocked(api.listFolders).mockImplementation(async (id: string) => [
      folder("INBOX", "inbox", counts[id]),
    ]);
    const wrapper = mount(UnreadBadge);
    await flushPromises();
    expect(useAccountsStore().mailAccounts).toHaveLength(2);
    expect(win.setBadgeCount).toHaveBeenLastCalledWith(4);

    counts.a = 0;
    vi.useFakeTimers();
    events.handlers.get("folders-changed")?.();
    await vi.advanceTimersByTimeAsync(250);
    vi.useRealTimers();
    await flushPromises();
    expect(win.setBadgeCount).toHaveBeenLastCalledWith(1);

    useUiStore().setUnreadBadge(false);
    await flushPromises();
    expect(win.setBadgeCount).toHaveBeenLastCalledWith(undefined);

    useUiStore().setUnreadBadge(true);
    await flushPromises();
    expect(win.setBadgeCount).toHaveBeenLastCalledWith(1);

    wrapper.unmount();
    expect(win.setBadgeCount).toHaveBeenLastCalledWith(undefined);
  });
});
