import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";

const { listenMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("@/lib/tauri", () => ({
  listAccounts: vi.fn().mockResolvedValue([]),
  getLastView: vi.fn().mockResolvedValue({ account_id: null, folder_path: null }),
  saveLastView: vi.fn().mockResolvedValue(undefined),
  listFolders: vi.fn().mockResolvedValue([]),
  triggerSync: vi.fn().mockResolvedValue(undefined),
  prefetchBodies: vi.fn().mockResolvedValue(0),
  startIdle: vi.fn().mockResolvedValue(undefined),
  stopIdle: vi.fn().mockResolvedValue(undefined),
  getMessages: vi.fn().mockResolvedValue({ messages: [], total: 0, page: 0, per_page: 100 }),
  getThreadedMessages: vi.fn().mockResolvedValue({
    threads: [],
    total_threads: 0,
    total_messages: 0,
    page: 0,
    per_page: 100,
  }),
  getThreadMessages: vi.fn().mockResolvedValue([]),
  getMessageBody: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/compose-window", () => ({
  openComposeWindow: vi.fn(),
}));

vi.mock("@/lib/reader-window", () => ({
  openReaderWindow: vi.fn(),
}));

import MailView from "@/views/MailView.vue";
import FolderTree from "@/components/mail/FolderTree.vue";
import MessageList from "@/components/mail/MessageList.vue";
import MessageReader from "@/components/mail/MessageReader.vue";
import OutboxList from "@/components/mail/OutboxList.vue";
import Toolbar from "@/components/mail/Toolbar.vue";
import { useAccountsStore } from "@/stores/accounts";
import { useFoldersStore } from "@/stores/folders";
import { useMessagesStore } from "@/stores/messages";
import { usePlatformStore } from "@/stores/platform";
import { useUiStore } from "@/stores/ui";
import { openComposeWindow } from "@/lib/compose-window";
import { openReaderWindow } from "@/lib/reader-window";
import { locale } from "@/i18n";
import * as api from "@/lib/tauri";
import { OUTBOX_FOLDER, type Account, type Folder, type MessageSummary } from "@/lib/types";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc1",
    display_name: "Work",
    email: "ada@example.org",
    username: "ada@example.org",
    provider: "generic",
    mail_protocol: "imap",
    enabled: true,
    mail_sync_interval_seconds: null,
    calendar_sync_interval_seconds: null,
    contacts_sync_interval_seconds: null,
    has_calendar_binding: false,
    has_contacts_binding: false,
    meet_protocol: "",
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    name: "Folder",
    path: "Folder",
    folder_type: null,
    unread_count: 0,
    total_count: 0,
    children: [],
    ...overrides,
  };
}

function makeSummary(id: string, subject: string): MessageSummary {
  return {
    id,
    subject,
    from_name: "Sender",
    from_email: "sender@example.org",
    date: "2026-11-01T10:00:00Z",
    flags: ["seen"],
    has_attachments: false,
    is_encrypted: false,
    is_signed: false,
    snippet: null,
    message_id: null,
    in_reply_to: null,
  };
}

const folders: Folder[] = [
  makeFolder({ name: "Inbox", path: "INBOX", folder_type: "inbox" }),
  makeFolder({ name: "Archive", path: "Archive", folder_type: "archive" }),
  makeFolder({ name: "Drafts", path: "Drafts", folder_type: "drafts" }),
];

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div/>" } },
      { path: "/mail/thread/:id", component: { template: "<div/>" } },
    ],
  });
}

type ListenHandler = (event: { payload: unknown }) => unknown;
let listeners: Record<string, ListenHandler> = {};
let wrapper: VueWrapper | null = null;

async function mountView() {
  const router = makeRouter();
  await router.push("/");
  await router.isReady();
  wrapper = mount(MailView, {
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs: {
        FolderTree: true,
        MessageList: true,
        MessageReader: true,
        OutboxList: true,
        Toolbar: true,
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

function emitOpenMessage(w: VueWrapper, messageId: string) {
  w.findComponent(MessageList).vm.$emit("open-message", messageId);
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  localStorage.clear();
  locale.value = "en";
  listeners = {};
  listenMock.mockImplementation(async (event: string, handler: ListenHandler) => {
    listeners[event] = handler;
    return () => {};
  });
  vi.mocked(api.listAccounts).mockResolvedValue([makeAccount()]);
  vi.mocked(api.getLastView).mockResolvedValue({ account_id: null, folder_path: null });
  vi.mocked(api.listFolders).mockResolvedValue(folders);
  vi.mocked(api.prefetchBodies).mockResolvedValue(0);
  usePlatformStore().width = 1280;
  usePlatformStore().kind = "desktop";
  usePlatformStore().platformReady = true;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("MailView startup", () => {
  it("restores the last-viewed account and folder, then starts IDLE and the sync listeners", async () => {
    vi.mocked(api.listAccounts).mockResolvedValue([
      makeAccount({ id: "acc1" }),
      makeAccount({ id: "acc2", email: "bob@example.org" }),
    ]);
    vi.mocked(api.getLastView).mockResolvedValue({
      account_id: "acc2",
      folder_path: "Archive",
    });

    await mountView();

    expect(api.listAccounts).toHaveBeenCalledTimes(1);
    expect(useAccountsStore().activeAccountId).toBe("acc2");
    expect(api.listFolders).toHaveBeenCalledWith("acc2");
    expect(useFoldersStore().activeFolderPath).toBe("Archive");
    // The messages store's own watcher loads the restored folder once.
    expect(api.getThreadedMessages).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.getThreadedMessages).mock.calls[0].slice(0, 2)).toEqual([
      "acc2",
      "Archive",
    ]);
    expect(api.startIdle).toHaveBeenCalledTimes(1);
    expect(Object.keys(listeners)).toEqual(
      expect.arrayContaining([
        "sync-complete",
        "sync-progress",
        "idle-new-mail",
        "idle-disconnected",
        "idle-reconnected",
      ]),
    );
  });

  it("skips loading folders when there is no account, but still renders the desktop panes", async () => {
    vi.mocked(api.listAccounts).mockResolvedValue([]);

    const { wrapper } = await mountView();

    expect(useAccountsStore().activeAccountId).toBeNull();
    expect(api.listFolders).not.toHaveBeenCalled();
    expect(api.getThreadedMessages).not.toHaveBeenCalled();
    expect(wrapper.find(".mail-view.mobile").exists()).toBe(false);
    expect(wrapper.findComponent(FolderTree).exists()).toBe(true);
    expect(wrapper.findComponent(Toolbar).exists()).toBe(true);
    expect(wrapper.findComponent(MessageList).exists()).toBe(true);
  });
});

describe("MailView folder and account switching", () => {
  it("switching folder or account updates the mobile title and saves the last view", async () => {
    vi.mocked(api.listAccounts).mockResolvedValue([
      makeAccount({ id: "acc1" }),
      makeAccount({ id: "acc2", email: "bob@example.org" }),
    ]);
    usePlatformStore().width = 600;

    const { wrapper } = await mountView();
    expect(wrapper.find("h1").text()).toBe("Inbox");
    expect(wrapper.find(".subtitle").text()).toBe("ada@example.org");

    useFoldersStore().setActiveFolder("Archive");
    await flushPromises();
    expect(wrapper.find("h1").text()).toBe("Archive");
    await vi.waitFor(
      () => expect(api.saveLastView).toHaveBeenLastCalledWith("acc1", "Archive"),
      { timeout: 2000 },
    );

    vi.mocked(api.listFolders).mockResolvedValue([
      makeFolder({ name: "Boîte", path: "INBOX", folder_type: "inbox" }),
    ]);
    useAccountsStore().setActiveAccount("acc2");
    await flushPromises();

    expect(api.listFolders).toHaveBeenLastCalledWith("acc2");
    expect(wrapper.find(".subtitle").text()).toBe("bob@example.org");
    // "Archive" does not exist for acc2, so the folder falls back to its inbox.
    expect(useFoldersStore().activeFolderPath).toBe("INBOX");
    expect(wrapper.find("h1").text()).toBe("Boîte");
    await vi.waitFor(
      () => expect(api.saveLastView).toHaveBeenLastCalledWith("acc2", "INBOX"),
      { timeout: 2000 },
    );
  });

  it("shows the Outbox pane instead of the message list for the synthetic Outbox folder", async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="outbox-pane"]').exists()).toBe(false);

    useFoldersStore().setActiveFolder(OUTBOX_FOLDER);
    await flushPromises();

    expect(wrapper.findComponent(OutboxList).exists()).toBe(true);
    expect(wrapper.find('[data-testid="outbox-pane"]').exists()).toBe(true);
    expect(wrapper.findComponent(MessageList).exists()).toBe(false);
    // With no split panels, the single toolbar heads the whole pane.
    expect(wrapper.findAllComponents(Toolbar)).toHaveLength(1);
  });
});

describe("MailView mobile layout", () => {
  it("renders the app bar, opens the folder drawer, and hides compose until it can send", async () => {
    usePlatformStore().width = 600;

    const { wrapper } = await mountView();

    expect(wrapper.find(".mail-view.mobile").exists()).toBe(true);
    expect(wrapper.findComponent(FolderTree).exists()).toBe(false);
    expect(wrapper.findComponent(MessageList).props("mode")).toBe("mobile");

    const ui = useUiStore();
    await wrapper.get('button[aria-label="Open folders"]').trigger("click");
    expect(ui.drawerOpen).toBe(true);

    // The mobile compose sheet is a placeholder that cannot send
    // (lib/mobile-features.ts), so no button may open it.
    expect(wrapper.find('button[aria-label="Compose new message"]').exists()).toBe(false);
    expect(ui.composeOpen).toBe(false);
    expect(openComposeWindow).not.toHaveBeenCalled();
  });

  it("opens a thread route for a normal message and resumes a draft in the composer", async () => {
    usePlatformStore().width = 600;

    const { wrapper, router } = await mountView();

    emitOpenMessage(wrapper, "<id/with spaces>");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe(
      `/mail/thread/${encodeURIComponent("<id/with spaces>")}`,
    );

    await router.push("/");
    useFoldersStore().setActiveFolder("Drafts");
    await flushPromises();
    emitOpenMessage(wrapper, "draft-1");
    await flushPromises();

    expect(openComposeWindow).toHaveBeenCalledWith({ accountId: "acc1", draftId: "draft-1" });
    expect(router.currentRoute.value.path).toBe("/");
  });
});

describe("MailView desktop message opening", () => {
  it("resumes drafts in a compose window and opens a reader window in 'none' mode", async () => {
    const ui = useUiStore();
    ui.setMessageViewMode("none");

    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="none-mode-list"]').exists()).toBe(true);

    useMessagesStore().messages = [makeSummary("m1", "Quarterly report")];
    emitOpenMessage(wrapper, "m1");
    expect(openReaderWindow).toHaveBeenCalledWith("acc1", "m1", "Quarterly report");

    useFoldersStore().setActiveFolder("Drafts");
    await flushPromises();
    emitOpenMessage(wrapper, "draft-9");

    expect(openComposeWindow).toHaveBeenCalledWith({ accountId: "acc1", draftId: "draft-9" });
    expect(openReaderWindow).toHaveBeenCalledTimes(1);
  });

  it("re-shows a hidden reader pane in 'right' mode when a message is opened", async () => {
    const ui = useUiStore();
    ui.setMessageViewMode("right");
    ui.hideReader();

    const { wrapper } = await mountView();
    expect(wrapper.findComponent(MessageReader).exists()).toBe(false);
    expect(wrapper.find(".message-list-pane").classes()).toContain("expanded");

    emitOpenMessage(wrapper, "m1");
    await flushPromises();

    expect(ui.readerVisible).toBe(true);
    expect(wrapper.findComponent(MessageReader).exists()).toBe(true);
    expect(wrapper.find(".message-list-pane").classes()).not.toContain("expanded");
    expect(openReaderWindow).not.toHaveBeenCalled();

    wrapper.findComponent(MessageReader).vm.$emit("close");
    await flushPromises();
    expect(ui.readerVisible).toBe(false);
    expect(wrapper.findComponent(MessageReader).exists()).toBe(false);
  });

  it("opens messages as tabs in 'tab' mode and returns to the list when the last tab closes", async () => {
    const ui = useUiStore();
    ui.setMessageViewMode("tab");

    const { wrapper } = await mountView();
    const messages = useMessagesStore();
    messages.messages = [makeSummary("m1", "Hello there"), makeSummary("m2", "")];

    emitOpenMessage(wrapper, "m1");
    await flushPromises();
    expect(api.getMessageBody).toHaveBeenCalledWith("acc1", "m1");

    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((tab) => tab.text())).toEqual(["Messages", "Hello there"]);
    expect(tabs[1].attributes("aria-selected")).toBe("true");
    expect(wrapper.findComponent(MessageReader).exists()).toBe(true);
    expect(wrapper.findComponent(MessageList).exists()).toBe(false);

    // Opening the same message again focuses the existing tab.
    await wrapper.get('[data-testid="tab-messages-btn"]').trigger("click");
    emitOpenMessage(wrapper, "m1");
    await flushPromises();
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(2);

    // Back on the list, a message without a subject gets the placeholder.
    await wrapper.get('[data-testid="tab-messages-btn"]').trigger("click");
    emitOpenMessage(wrapper, "m2");
    await flushPromises();
    expect(wrapper.get('[data-testid="tab-activate-m2"]').text()).toBe("(no subject)");

    await wrapper.get('button[aria-label="Close tab: (no subject)"]').trigger("click");
    expect(wrapper.get('[data-testid="tab-activate-m1"]').attributes("aria-selected")).toBe("true");

    wrapper.findComponent(MessageReader).vm.$emit("close");
    await flushPromises();
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="tab-messages-btn"]').attributes("aria-selected")).toBe("true");
    expect(wrapper.findComponent(MessageList).exists()).toBe(true);
  });
});

describe("MailView background sync", () => {
  it("syncs enabled mail accounts every two minutes and stops IDLE on unmount", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    vi.mocked(api.listAccounts).mockResolvedValue([
      makeAccount({ id: "acc1" }),
      makeAccount({ id: "acc2" }),
      makeAccount({ id: "off", enabled: false }),
      makeAccount({ id: "cal", mail_protocol: "" }),
    ]);

    const { wrapper } = await mountView();
    vi.mocked(api.triggerSync).mockClear();

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);

    expect(api.triggerSync).toHaveBeenCalledTimes(2);
    // Only the active account gets the active folder as a priority hint.
    expect(api.triggerSync).toHaveBeenCalledWith("acc1", "INBOX");
    expect(api.triggerSync).toHaveBeenCalledWith("acc2", undefined);

    wrapper.unmount();
    expect(api.stopIdle).toHaveBeenCalledTimes(1);
    vi.mocked(api.triggerSync).mockClear();
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(api.triggerSync).not.toHaveBeenCalled();
  });

  it("refreshes folders and messages when a sync completes for the active account", async () => {
    await mountView();
    vi.mocked(api.listFolders).mockClear();
    vi.mocked(api.getThreadedMessages).mockClear();
    vi.mocked(api.prefetchBodies).mockResolvedValueOnce(5).mockResolvedValue(0);

    await listeners["sync-complete"]({ payload: { account_id: "acc1", total_synced: 3 } });
    await flushPromises();

    expect(api.listFolders).toHaveBeenCalledWith("acc1");
    expect(api.getThreadedMessages).toHaveBeenCalledTimes(1);
    // The body prefetch loops until the backend reports nothing left.
    expect(api.prefetchBodies).toHaveBeenCalledTimes(2);

    vi.mocked(api.getThreadedMessages).mockClear();
    await listeners["sync-complete"]({ payload: { account_id: "other", total_synced: 1 } });
    await flushPromises();
    expect(api.getThreadedMessages).not.toHaveBeenCalled();
  });
});

const MAIL_VIEW_EVENTS = [
  "idle-disconnected",
  "idle-new-mail",
  "idle-reconnected",
  "sync-complete",
  "sync-progress",
];

describe("MailView lifecycle regressions", () => {
  it("removes every event listener on unmount, so a remount does not double them", async () => {
    const unlisten: Record<string, ReturnType<typeof vi.fn>> = {};
    listenMock.mockImplementation(async (event: string, handler: ListenHandler) => {
      listeners[event] = handler;
      unlisten[event] = vi.fn();
      return unlisten[event];
    });

    const { wrapper } = await mountView();
    // Stores register their own listeners too; only MailView's are its job.
    for (const event of MAIL_VIEW_EVENTS) expect(unlisten[event]).toBeDefined();
    wrapper.unmount();
    for (const event of MAIL_VIEW_EVENTS) expect(unlisten[event]).toHaveBeenCalledTimes(1);
  });

  it("starts nothing when unmounted before startup finishes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let releaseAccounts!: () => void;
    vi.mocked(api.listAccounts).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseAccounts = () => resolve([makeAccount()]);
        }),
    );
    const router = makeRouter();
    await router.push("/");
    await router.isReady();
    const early = mount(MailView, {
      global: {
        plugins: [router],
        stubs: { FolderTree: true, MessageList: true, MessageReader: true, OutboxList: true, Toolbar: true },
      },
    });
    early.unmount();
    releaseAccounts();
    await flushPromises();

    const registered = listenMock.mock.calls.map(([event]) => event);
    expect(registered.filter((event) => MAIL_VIEW_EVENTS.includes(event))).toEqual([]);
    expect(api.startIdle).not.toHaveBeenCalled();
    vi.mocked(api.triggerSync).mockClear();
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(api.triggerSync).not.toHaveBeenCalled();
  });

  it("sends the open folder as a hint only for IDLE mail on its own account", async () => {
    await mountView();
    vi.mocked(api.triggerSync).mockClear();

    await listeners["idle-new-mail"]({ payload: "acc1" });
    await listeners["idle-new-mail"]({ payload: "other" });

    expect(api.triggerSync).toHaveBeenNthCalledWith(1, "acc1", "INBOX");
    expect(api.triggerSync).toHaveBeenNthCalledWith(2, "other", undefined);
  });

  it("returns to the list when the folder changes while a message tab is open", async () => {
    useUiStore().setMessageViewMode("tab");
    const { wrapper } = await mountView();
    useMessagesStore().messages = [makeSummary("m1", "Hello there")];
    emitOpenMessage(wrapper, "m1");
    await flushPromises();
    expect(wrapper.findComponent(MessageReader).exists()).toBe(true);

    useFoldersStore().setActiveFolder("Archive");
    await flushPromises();

    expect(wrapper.findComponent(MessageList).exists()).toBe(true);
    expect(wrapper.get('[data-testid="tab-messages-btn"]').attributes("aria-selected")).toBe("true");
    // The tab itself stays open.
    expect(wrapper.find('[data-testid="tab-activate-m1"]').exists()).toBe(true);
  });
});
