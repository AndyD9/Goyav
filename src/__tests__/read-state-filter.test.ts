import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@/lib/tauri", () => ({
  listAccounts: vi.fn().mockResolvedValue([]),
  getMessages: vi.fn().mockResolvedValue({ messages: [], total: 0, page: 0, per_page: 100 }),
  getThreadedMessages: vi.fn().mockResolvedValue({
    threads: [], total_threads: 0, total_messages: 0, page: 0, per_page: 100,
  }),
  listFolders: vi.fn().mockResolvedValue([]),
  getLastView: vi.fn().mockResolvedValue({ account_id: null, folder_path: null }),
  saveLastView: vi.fn().mockResolvedValue(undefined),
  triggerSync: vi.fn().mockResolvedValue(undefined),
  backfillThreads: vi.fn().mockResolvedValue(0),
  prefetchBodies: vi.fn().mockResolvedValue(0),
}));

import { useMessagesStore } from "@/stores/messages";
import { useAccountsStore } from "@/stores/accounts";
import { useFoldersStore } from "@/stores/folders";
import { useUiStore } from "@/stores/ui";
import MessageList from "@/components/mail/MessageList.vue";
import * as api from "@/lib/tauri";

function setup() {
  const accountsStore = useAccountsStore();
  accountsStore.accounts = [
    {
      id: "acc1", display_name: "Test", email: "test@test.com",
      provider: "generic", mail_protocol: "imap" as const, enabled: true,
      mail_sync_interval_seconds: null,
      calendar_sync_interval_seconds: null,
      contacts_sync_interval_seconds: null,
      username: "",
      has_calendar_binding: false,
      has_contacts_binding: false,
      meet_protocol: "",
    } as any,
  ];
  accountsStore.activeAccountId = "acc1";
  useFoldersStore().activeFolderPath = "INBOX";
  useUiStore().threadingEnabled = false;
  return useMessagesStore();
}

function lastFilterSent() {
  const calls = vi.mocked(api.getMessages).mock.calls;
  return calls[calls.length - 1]?.[6];
}

describe("read-state filter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("starts on all and sends no filter", () => {
    const store = setup();
    expect(store.readStateFilter).toBe("all");
    expect(store.hasActiveFilter).toBe(false);
  });

  it("switches exclusively between unread and important", async () => {
    const store = setup();
    store.setReadStateFilter("unread");
    await nextTick();
    expect(store.readStateFilter).toBe("unread");
    expect(lastFilterSent()).toMatchObject({ unread: true, starred: false });

    store.setReadStateFilter("starred");
    await nextTick();
    expect(store.readStateFilter).toBe("starred");
    expect(lastFilterSent()).toMatchObject({ unread: false, starred: true });

    store.setReadStateFilter("all");
    await nextTick();
    expect(store.readStateFilter).toBe("all");
    expect(store.hasActiveFilter).toBe(false);
  });

  it("does not refetch when the mode is unchanged", () => {
    const store = setup();
    store.setReadStateFilter("all");
    expect(api.getMessages).not.toHaveBeenCalled();
  });

  it("keeps the other quick filters", async () => {
    const store = setup();
    store.toggleQuickFilter("has_attachment");
    store.setReadStateFilter("unread");
    await nextTick();
    expect(lastFilterSent()).toMatchObject({ unread: true, has_attachment: true });
  });

  it("reports no single mode when the full bar combines unread and starred", () => {
    const store = setup();
    store.toggleQuickFilter("unread");
    store.toggleQuickFilter("starred");
    expect(store.readStateFilter).toBeNull();
  });
});

describe("read-state filter chips", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("are visible by default and drive the store", async () => {
    const store = setup();
    const wrapper = mount(MessageList);
    expect(wrapper.find('[data-testid="read-filter"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="read-filter-all"]').attributes("aria-pressed")).toBe("true");

    await wrapper.get('[data-testid="read-filter-unread"]').trigger("click");
    expect(store.readStateFilter).toBe("unread");
    expect(wrapper.get('[data-testid="read-filter-unread"]').classes()).toContain("active");
    expect(wrapper.get('[data-testid="message-list-empty"]').text()).toBe("No unread messages");

    await wrapper.get('[data-testid="read-filter-starred"]').trigger("click");
    expect(wrapper.get('[data-testid="message-list-empty"]').text()).toBe("No important messages");
    wrapper.unmount();
  });

  it("give way to the full quick filter bar", async () => {
    const store = setup();
    const wrapper = mount(MessageList);
    store.quickFilterVisible = true;
    await nextTick();
    expect(wrapper.find('[data-testid="read-filter"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="filter-unread"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
