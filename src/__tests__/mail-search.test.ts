import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@/lib/tauri", () => ({
  listAccounts: vi.fn().mockResolvedValue([]),
  listFolders: vi.fn().mockResolvedValue([]),
  triggerSync: vi.fn().mockResolvedValue(undefined),
  getLastView: vi.fn().mockResolvedValue({ account_id: null, folder_path: null }),
  saveLastView: vi.fn().mockResolvedValue(undefined),
  getMessages: vi
    .fn()
    .mockResolvedValue({ messages: [], total: 0, page: 0, per_page: 100 }),
  getThreadedMessages: vi.fn().mockResolvedValue({
    threads: [],
    total_threads: 0,
    total_messages: 0,
    page: 0,
    per_page: 100,
  }),
  getMessageBody: vi.fn().mockResolvedValue(null),
  setMessageFlags: vi.fn().mockResolvedValue(undefined),
  searchMessagesLocal: vi.fn(),
  searchMessagesServer: vi.fn(),
}));

import * as api from "@/lib/tauri";
import { useAccountsStore } from "@/stores/accounts";
import { useFoldersStore } from "@/stores/folders";
import { useMessagesStore } from "@/stores/messages";
import SearchResults from "@/components/mail/SearchResults.vue";
import type { LocalSearchHit } from "@/lib/types";

const mockedSearch = vi.mocked(api.searchMessagesLocal);
const mockedGetMessages = vi.mocked(api.getMessages);

function hit(overrides: Partial<LocalSearchHit> = {}): LocalSearchHit {
  return {
    id: "m1",
    account_id: "acc1",
    folder_path: "Archive",
    subject: "March invoice",
    from_name: "Billing",
    from_email: "billing@shop.test",
    date: "2026-03-02T10:00:00Z",
    flags: [],
    has_attachments: false,
    is_encrypted: false,
    is_signed: false,
    snippet: "Your invoice is ready",
    message_id: null,
    in_reply_to: null,
    ...overrides,
  };
}

function setup() {
  const accounts = useAccountsStore();
  const base = {
    provider: "generic" as const,
    mail_protocol: "imap" as const,
    enabled: true,
    mail_sync_interval_seconds: null,
    calendar_sync_interval_seconds: null,
    contacts_sync_interval_seconds: null,
    username: "",
    has_calendar_binding: false,
    has_contacts_binding: false,
    meet_protocol: "" as const,
  };
  accounts.accounts = [
    { ...base, id: "acc1", display_name: "Work", email: "me@work.test" },
    { ...base, id: "acc2", display_name: "Home", email: "me@home.test" },
  ];
  accounts.activeAccountId = "acc1";
  useFoldersStore().activeFolderPath = "INBOX";
  return useMessagesStore();
}

describe("toolbar mail search", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    mockedSearch.mockReset();
    mockedGetMessages.mockClear();
  });

  it("searches every folder of the active account by default", async () => {
    const store = setup();
    mockedSearch.mockResolvedValue({ hits: [hit()], total: 1 });
    store.searchText = "invoice";
    await store.runSearch();

    expect(mockedSearch).toHaveBeenCalledWith(["acc1"], { text: "invoice" }, 300);
    expect(store.globalSearchActive).toBe(true);
    expect(store.searchResults).toHaveLength(1);
    expect(store.searchTotal).toBe(1);
  });

  it("searches all accounts and remembers the scope", async () => {
    const store = setup();
    mockedSearch.mockResolvedValue({ hits: [], total: 0 });
    store.searchText = "invoice";
    store.setSearchScope("all");
    await flushPromises();

    expect(mockedSearch).toHaveBeenLastCalledWith(null, { text: "invoice" }, 300);
    expect(localStorage.getItem("goyav-search-scope")).toBe("all");
  });

  it("filters the open folder in folder scope and undoes it on clear", async () => {
    const store = setup();
    store.setSearchScope("folder");
    store.searchText = "lunch";
    await store.runSearch();

    expect(mockedSearch).not.toHaveBeenCalled();
    expect(store.globalSearchActive).toBe(false);
    expect(store.quickFilterText).toBe("lunch");

    store.clearSearch();
    expect(store.quickFilterText).toBe("");
  });

  it("ignores a response superseded by a newer search", async () => {
    const store = setup();
    let resolveFirst!: (v: { hits: LocalSearchHit[]; total: number }) => void;
    mockedSearch
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ hits: [hit({ id: "new" })], total: 1 });
    store.searchText = "a";
    const first = store.runSearch();
    store.searchText = "ab";
    await store.runSearch();
    resolveFirst({ hits: [hit({ id: "old" })], total: 1 });
    await first;

    expect(store.searchResults.map((h) => h.id)).toEqual(["new"]);
  });

  it("lists results with their folder and opens one in its folder", async () => {
    const store = setup();
    mockedSearch.mockResolvedValue({ hits: [hit()], total: 1 });
    store.searchText = "invoice";
    await store.runSearch();

    const wrapper = mount(SearchResults);
    expect(wrapper.find('[data-testid="search-summary"]').text()).toBe("1 result");
    const row = wrapper.find('[data-testid="search-hit"]');
    expect(row.text()).toContain("Archive");
    expect(row.find("mark").text()).toBe("invoice");

    await row.trigger("click");
    await flushPromises();
    expect(useFoldersStore().activeFolderPath).toBe("Archive");
    expect(store.activeMessageId).toBe("m1");
    expect(wrapper.emitted("openMessage")?.[0]).toEqual(["m1"]);
  });

  it("shows an empty state when nothing matches", async () => {
    const store = setup();
    mockedSearch.mockResolvedValue({ hits: [], total: 0 });
    store.searchText = "zzz";
    await store.runSearch();
    const wrapper = mount(SearchResults);
    expect(wrapper.find('[data-testid="search-empty"]').text()).toContain("zzz");
  });
});
