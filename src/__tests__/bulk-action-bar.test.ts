import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";

vi.mock("@/lib/tauri", () => ({
  listAccounts: vi.fn().mockResolvedValue([]),
  getMessages: vi.fn().mockResolvedValue({ messages: [], total: 0, page: 0, per_page: 100 }),
  getMessageBody: vi.fn().mockResolvedValue({
    id: "msg1", subject: "Test", from: { name: "T", email: "t@t.com" },
    to: [], cc: [], date: "2026-04-03T00:00:00Z", flags: ["seen"],
    body_html: null, body_text: "Hello", attachments: [],
    is_encrypted: false, is_signed: false, list_id: null,
  }),
  setMessageFlags: vi.fn().mockResolvedValue(undefined),
  deleteMessages: vi.fn().mockResolvedValue(undefined),
  moveMessages: vi.fn().mockResolvedValue(undefined),
  listFolders: vi.fn().mockResolvedValue([]),
  getLastView: vi.fn().mockResolvedValue({ account_id: null, folder_path: null }),
  saveLastView: vi.fn().mockResolvedValue(undefined),
  getThreadedMessages: vi.fn().mockResolvedValue({
    threads: [], total_threads: 0, total_messages: 0, page: 0, per_page: 100,
  }),
  getThreadMessages: vi.fn().mockResolvedValue([]),
  triggerSync: vi.fn().mockResolvedValue(undefined),
  backfillThreads: vi.fn().mockResolvedValue(0),
  prefetchBodies: vi.fn().mockResolvedValue(0),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import MessageList from "@/components/mail/MessageList.vue";
import { useMessagesStore } from "@/stores/messages";
import { useAccountsStore } from "@/stores/accounts";
import { useFoldersStore } from "@/stores/folders";
import { useUiStore } from "@/stores/ui";
import * as api from "@/lib/tauri";

function makeSummary(id: string, flags: string[] = ["seen"]): any {
  return {
    id, subject: `Subject ${id}`, from_name: "Sender", from_email: "sender@example.com",
    date: "2026-04-03T00:00:00Z", flags, has_attachments: false,
    is_encrypted: false, is_signed: false, snippet: null,
  };
}

function folder(name: string, folder_type: string | null): any {
  return { name, path: name, folder_type, unread_count: 0, total_count: 0, children: [] };
}

function setupStores() {
  const accountsStore = useAccountsStore();
  accountsStore.accounts = [
    {
      id: "acc1", display_name: "Test", email: "t@t.com",
      provider: "generic", mail_protocol: "imap" as const, enabled: true,
      mail_sync_interval_seconds: null,
      calendar_sync_interval_seconds: null,
      contacts_sync_interval_seconds: null,
      username: "",
      has_calendar_binding: false,
      has_contacts_binding: false,
      meet_protocol: "",
    },
  ];
  accountsStore.activeAccountId = "acc1";
  const folders = useFoldersStore();
  folders.folders = [
    folder("INBOX", "inbox"),
    folder("Archive", "archive"),
    folder("Junk", "junk"),
    folder("Projets", null),
  ];
  folders.activeFolderPath = "INBOX";
  useUiStore().threadingEnabled = false;
  useUiStore().messageListLayout = "table";
  const store = useMessagesStore();
  store.messages = [makeSummary("msg1", []), makeSummary("msg2", []), makeSummary("msg3")];
  store.total = 3;
  return store;
}

describe("Bulk action bar", () => {
  let router: any;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(api.setMessageFlags).mockClear();
    vi.mocked(api.moveMessages).mockClear();
    vi.mocked(api.deleteMessages).mockClear();
    router = createRouter({
      history: createWebHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
  });

  function mountList() {
    return mount(MessageList, { global: { plugins: [router] }, attachTo: document.body });
  }

  it("stays hidden for the single message open in the reader", async () => {
    const store = setupStores();
    const wrapper = mountList();
    await wrapper.findAll(".message-items > div")[0].trigger("click");
    expect(store.selectedIds).toEqual(["msg1"]);
    expect(wrapper.find("[data-testid='bulk-action-bar']").exists()).toBe(false);
    wrapper.unmount();
  });

  it("appears when several messages are checked and shows the count", async () => {
    const store = setupStores();
    const wrapper = mountList();
    store.selectedIds = ["msg1", "msg2"];
    await wrapper.vm.$nextTick();
    expect(wrapper.find("[data-testid='bulk-count']").text()).toContain("2");
    wrapper.unmount();
  });

  it("marks the selection read in one call", async () => {
    const store = setupStores();
    const wrapper = mountList();
    store.selectedIds = ["msg1", "msg2", "msg3"];
    await wrapper.vm.$nextTick();
    await wrapper.find("[data-testid='bulk-mark-read']").trigger("click");
    expect(api.setMessageFlags).toHaveBeenCalledTimes(1);
    expect(api.setMessageFlags).toHaveBeenCalledWith("acc1", ["msg1", "msg2", "msg3"], ["seen"], true);
    // Nothing left unread, so the action disappears.
    expect(wrapper.find("[data-testid='bulk-mark-read']").exists()).toBe(false);
    wrapper.unmount();
  });

  it("archives the selection", async () => {
    const store = setupStores();
    const wrapper = mountList();
    store.selectedIds = ["msg1", "msg3"];
    await wrapper.vm.$nextTick();
    await wrapper.find("[data-testid='bulk-archive']").trigger("click");
    expect(api.moveMessages).toHaveBeenCalledWith("acc1", ["msg1", "msg3"], "Archive");
    expect(store.messages.map((m) => m.id)).toEqual(["msg2"]);
    wrapper.unmount();
  });

  it("moves the selection to a folder picked in the menu", async () => {
    const store = setupStores();
    const wrapper = mountList();
    store.selectedIds = ["msg2", "msg3"];
    await wrapper.vm.$nextTick();
    await wrapper.find("[data-testid='bulk-move']").trigger("click");
    const target = document.querySelector<HTMLElement>("[data-testid='bulk-move-Projets']");
    expect(target).not.toBeNull();
    // The open folder is not offered as a target.
    expect(document.querySelector("[data-testid='bulk-move-INBOX']")).toBeNull();
    target!.click();
    await wrapper.vm.$nextTick();
    expect(api.moveMessages).toHaveBeenCalledWith("acc1", ["msg2", "msg3"], "Projets");
    wrapper.unmount();
  });

  it("deletes the selection", async () => {
    const store = setupStores();
    const wrapper = mountList();
    store.selectedIds = ["msg1", "msg2"];
    await wrapper.vm.$nextTick();
    await wrapper.find("[data-testid='bulk-delete']").trigger("click");
    expect(api.deleteMessages).toHaveBeenCalledWith("acc1", ["msg1", "msg2"]);
    wrapper.unmount();
  });

  it("clears the selection with the close button and with Escape", async () => {
    const store = setupStores();
    const wrapper = mountList();
    store.selectedIds = ["msg1", "msg2"];
    await wrapper.vm.$nextTick();
    await wrapper.find("[data-testid='bulk-clear']").trigger("click");
    expect(store.selectedIds).toEqual([]);

    store.selectedIds = ["msg1", "msg2"];
    await wrapper.vm.$nextTick();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(store.selectedIds).toEqual([]);
    wrapper.unmount();
  });

  it("Cmd/Ctrl+A selects every visible message once the list was clicked", async () => {
    const store = setupStores();
    const wrapper = mountList();
    // Without a click in the list, Cmd+A is left to the page.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true }));
    expect(store.selectedIds).toEqual([]);

    const row = wrapper.findAll(".message-items > div")[0];
    await row.trigger("mousedown");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true }));
    expect(store.selectedIds).toEqual(["msg1", "msg2", "msg3"]);
    wrapper.unmount();
  });
});
