import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@/lib/tauri", () => ({
  // Component calls.
  listFolders: vi.fn(),
  createFolder: vi.fn().mockResolvedValue(undefined),
  deleteFolder: vi.fn().mockResolvedValue(undefined),
  syncFolder: vi.fn().mockResolvedValue(0),
  triggerSync: vi.fn().mockResolvedValue(undefined),
  markAccountRead: vi.fn().mockResolvedValue(0),
  markFolderRead: vi.fn().mockResolvedValue(0),
  getMessages: vi.fn(),
  setMessageFlags: vi.fn().mockResolvedValue(undefined),
  moveMessages: vi.fn().mockResolvedValue(undefined),
  moveMessagesCrossAccount: vi.fn().mockResolvedValue(undefined),
  // Store side effects triggered by selection changes.
  getLastView: vi.fn().mockResolvedValue({ account_id: null, folder_path: null }),
  saveLastView: vi.fn().mockResolvedValue(undefined),
  getThreadedMessages: vi.fn().mockResolvedValue({
    threads: [],
    total_threads: 0,
    total_messages: 0,
    page: 0,
    per_page: 100,
  }),
}));

import FolderTree from "@/components/mail/FolderTree.vue";
import * as api from "@/lib/tauri";
import { useToasts } from "@/lib/toast";
import { useAccountsStore } from "@/stores/accounts";
import { useFoldersStore } from "@/stores/folders";
import { useMessagesStore } from "@/stores/messages";
import { OUTBOX_FOLDER, type Account, type Folder } from "@/lib/types";

const STORAGE_KEY = "chithi-collapsed-folders";

function folder(
  name: string,
  path: string,
  folderType: string | null,
  unread: number,
  children: Folder[] = [],
): Folder {
  return {
    name,
    path,
    folder_type: folderType,
    unread_count: unread,
    total_count: unread + 10,
    children,
  };
}

function account(id: string, displayName: string, email: string, mailProtocol: Account["mail_protocol"]): Account {
  return {
    id,
    display_name: displayName,
    email,
    username: email,
    provider: "generic",
    mail_protocol: mailProtocol,
    enabled: true,
    mail_sync_interval_seconds: null,
    calendar_sync_interval_seconds: null,
    contacts_sync_interval_seconds: null,
    has_calendar_binding: mailProtocol === "",
    has_contacts_binding: false,
    meet_protocol: "",
  };
}

function fullAcc1Tree(): Folder[] {
  return [
    folder("INBOX", "INBOX", "inbox", 3),
    folder("Sent", "Sent", "sent", 0),
    folder("Projects", "Projects", null, 2, [
      folder("Q3", "Projects/Q3", null, 0, [
        folder("Design", "Projects/Q3/Design", null, 1),
      ]),
    ]),
    folder("Junk", "Junk", "junk", 5),
    folder("Trash", "Trash", "trash", 0),
  ];
}

let acc1Folders: Folder[] = [];
const acc2Folders: Folder[] = [folder("INBOX", "INBOX", "inbox", 1)];

let wrapper: VueWrapper | null = null;

function mountTree(): VueWrapper {
  wrapper = mount(FolderTree, { attachTo: document.body });
  return wrapper;
}

function setupStores() {
  const accounts = useAccountsStore();
  accounts.accounts = [
    account("acc1", "Work", "me@work.test", "imap"),
    account("acc2", "Home", "me@home.test", "jmap"),
    account("acc3", "Calendar only", "cal@cal.test", ""),
  ];
  accounts.activeAccountId = "acc1";
  useFoldersStore().activeFolderPath = "INBOX";
}

function row(w: VueWrapper, accountId: string, path: string) {
  return w.find(`[data-testid="folder-${accountId}-${path}"]`);
}

function toggle(w: VueWrapper, accountId: string, path: string) {
  return w.find(`[data-testid="folder-toggle-${accountId}-${path}"]`);
}

function bodyEl<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`No element matches ${selector}`);
  return el;
}

function buttonByText(text: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === text,
  );
  if (!match) throw new Error(`No button with text "${text}"`);
  return match;
}

async function openFolderMenu(w: VueWrapper, accountId: string, path: string) {
  await row(w, accountId, path).trigger("contextmenu", { clientX: 40, clientY: 60 });
  await flushPromises();
}

async function clickInBody(el: HTMLElement) {
  el.click();
  await flushPromises();
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  localStorage.clear();
  useToasts().value = [];
  acc1Folders = fullAcc1Tree();
  vi.mocked(api.listFolders).mockImplementation(async (accountId: string) => {
    if (accountId === "acc1") return acc1Folders;
    if (accountId === "acc2") return acc2Folders;
    return [];
  });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  setupStores();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
  consoleError.mockRestore();
});

describe("FolderTree", () => {
  it("renders each mail account's folder hierarchy in server order, with icons, indentation and a trailing Outbox", async () => {
    const w = mountTree();
    await flushPromises();

    expect(w.text()).toContain("Mailboxes");
    // Calendar-only accounts have no mail binding and get no section.
    expect(w.find('[data-testid="account-acc1"]').text()).toContain("Work");
    expect(w.find('[data-testid="account-acc1"]').text()).toContain("me@work.test");
    expect(w.find('[data-testid="account-acc2"]').exists()).toBe(true);
    expect(w.find('[data-testid="account-acc3"]').exists()).toBe(false);
    expect(w.text()).not.toContain("Calendar only");

    const acc1Section = w.findAll(".account-section")[0];
    const names = acc1Section.findAll(".folder-name").map((name) => name.text());
    expect(names).toEqual(["INBOX", "Sent", "Projects", "Q3", "Design", "Junk", "Trash", "Outbox"]);

    // Nested folders are indented 16px per level.
    expect(row(w, "acc1", "Projects").attributes("style")).toContain("padding-left: 12px");
    expect(row(w, "acc1", "Projects/Q3").attributes("style")).toContain("padding-left: 28px");
    expect(row(w, "acc1", "Projects/Q3/Design").attributes("style")).toContain("padding-left: 44px");

    // Special folders get their own icon; junk maps to the spam icon.
    expect(row(w, "acc1", "INBOX").find(".folder-svg--inbox").exists()).toBe(true);
    expect(row(w, "acc1", "Sent").find(".folder-svg--sent").exists()).toBe(true);
    expect(row(w, "acc1", "Junk").find(".folder-svg--spam").exists()).toBe(true);
    expect(row(w, "acc1", "Trash").find(".folder-svg--trash").exists()).toBe(true);
    expect(row(w, "acc1", "Projects").find(".folder-svg--folder").exists()).toBe(true);
    expect(w.find('[data-testid="folder-acc1-outbox"]').find(".folder-svg--outbox").exists()).toBe(true);

    // Only folders with children get an expand/collapse toggle. It is a
    // real button next to the folder button, never nested inside it.
    const projectsToggle = toggle(w, "acc1", "Projects");
    expect(projectsToggle.element.tagName).toBe("BUTTON");
    expect(projectsToggle.attributes("aria-expanded")).toBe("true");
    expect(projectsToggle.attributes("aria-label")).toBe("Collapse Projects");
    expect(row(w, "acc1", "Projects").find("button").exists()).toBe(false);
    expect(toggle(w, "acc1", "INBOX").exists()).toBe(false);

    // The second account is rendered from its own folder list.
    expect(row(w, "acc2", "INBOX").exists()).toBe(true);
    expect(api.listFolders).toHaveBeenCalledWith("acc1");
    expect(api.listFolders).toHaveBeenCalledWith("acc2");
    // An account without mail has no folders to fetch.
    expect(api.listFolders).not.toHaveBeenCalledWith("acc3");
  });

  it("shows an unread badge only for folders with unread messages", async () => {
    const w = mountTree();
    await flushPromises();

    expect(row(w, "acc1", "INBOX").find(".unread-badge").text()).toBe("3");
    expect(row(w, "acc1", "Junk").find(".unread-badge").text()).toBe("5");
    expect(row(w, "acc1", "Projects/Q3/Design").find(".unread-badge").text()).toBe("1");
    expect(row(w, "acc2", "INBOX").find(".unread-badge").text()).toBe("1");
    expect(row(w, "acc1", "Sent").find(".unread-badge").exists()).toBe(false);
    expect(row(w, "acc1", "Projects/Q3").find(".unread-badge").exists()).toBe(false);
    expect(w.find('[data-testid="folder-acc1-outbox"]').find(".unread-badge").exists()).toBe(false);
  });

  it("clicking a folder selects it, switching account when needed and refetching same-named folders", async () => {
    const w = mountTree();
    await flushPromises();
    const accounts = useAccountsStore();
    const folders = useFoldersStore();
    const messages = useMessagesStore();
    const fetchSpy = vi.spyOn(messages, "fetchMessages").mockResolvedValue(undefined);

    expect(row(w, "acc1", "INBOX").classes()).toContain("active");

    await row(w, "acc1", "Sent").trigger("click");
    await flushPromises();
    expect(folders.activeFolderPath).toBe("Sent");
    expect(accounts.activeAccountId).toBe("acc1");
    expect(row(w, "acc1", "Sent").classes()).toContain("active");
    expect(row(w, "acc1", "INBOX").classes()).not.toContain("active");
    // The messages store's own watcher handles a folder change; no explicit refetch.
    expect(fetchSpy).not.toHaveBeenCalled();

    await row(w, "acc1", "INBOX").trigger("click");
    await flushPromises();
    // Same folder path, different account: only an explicit refetch updates the list.
    await row(w, "acc2", "INBOX").trigger("click");
    await flushPromises();
    expect(accounts.activeAccountId).toBe("acc2");
    expect(folders.activeFolderPath).toBe("INBOX");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(row(w, "acc2", "INBOX").classes()).toContain("active");
    expect(row(w, "acc1", "INBOX").classes()).not.toContain("active");

    await w.find('[data-testid="folder-acc1-outbox"]').trigger("click");
    await flushPromises();
    expect(accounts.activeAccountId).toBe("acc1");
    expect(folders.activeFolderPath).toBe(OUTBOX_FOLDER);
    expect(w.find('[data-testid="folder-acc1-outbox"]').classes()).toContain("active");
  });

  it("collapsing a folder hides its children, persists across remounts and ignores corrupt storage", async () => {
    let w = mountTree();
    await flushPromises();
    const folders = useFoldersStore();

    await toggle(w, "acc1", "Projects").trigger("click");
    await flushPromises();

    expect(row(w, "acc1", "Projects/Q3").exists()).toBe(false);
    expect(row(w, "acc1", "Projects/Q3/Design").exists()).toBe(false);
    expect(toggle(w, "acc1", "Projects").attributes("aria-expanded")).toBe("false");
    expect(toggle(w, "acc1", "Projects").attributes("aria-label")).toBe("Expand Projects");
    // The toggle must not also select the folder.
    expect(folders.activeFolderPath).toBe("INBOX");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({ acc1: ["Projects"] });

    // A fresh mount restores the collapsed state.
    w.unmount();
    w = mountTree();
    await flushPromises();
    expect(row(w, "acc1", "Projects").exists()).toBe(true);
    expect(row(w, "acc1", "Projects/Q3").exists()).toBe(false);

    // A native button: Enter and Space activate it like a click.
    await toggle(w, "acc1", "Projects").trigger("click");
    await flushPromises();
    expect(row(w, "acc1", "Projects/Q3/Design").exists()).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({ acc1: [] });

    // Malformed stored state falls back to everything expanded.
    w.unmount();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ acc1: "Projects" }));
    w = mountTree();
    await flushPromises();
    expect(row(w, "acc1", "Projects/Q3").exists()).toBe(true);
  });

  it("clicking an account header collapses and re-expands its folder list", async () => {
    const w = mountTree();
    await flushPromises();

    await w.find('[data-testid="account-acc1"]').trigger("click");
    expect(row(w, "acc1", "INBOX").exists()).toBe(false);
    expect(w.find('[data-testid="folder-acc1-outbox"]').exists()).toBe(false);
    // Other accounts are unaffected.
    expect(row(w, "acc2", "INBOX").exists()).toBe(true);

    await w.find('[data-testid="account-acc1"]').trigger("click");
    expect(row(w, "acc1", "INBOX").exists()).toBe(true);
  });

  it("creates a subfolder from the folder context menu and refreshes the tree", async () => {
    const w = mountTree();
    await flushPromises();

    await openFolderMenu(w, "acc1", "Projects");
    expect(bodyEl('[data-testid="folder-context-menu"]').textContent).toContain('Sync "Projects"');

    await clickInBody(bodyEl('[data-testid="ctx-new-folder"]'));
    expect(document.querySelector('[data-testid="folder-context-menu"]')).toBeNull();
    expect(bodyEl(".new-folder-modal h3").textContent).toBe("New Folder");

    // An empty name is rejected before reaching the backend.
    await clickInBody(buttonByText("Create Folder"));
    expect(bodyEl(".nf-error").textContent).toBe("Folder name is required");
    expect(api.createFolder).not.toHaveBeenCalled();

    const input = bodyEl<HTMLInputElement>(".nf-input");
    input.value = "  Q4  ";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    vi.mocked(api.listFolders).mockClear();

    await clickInBody(buttonByText("Create Folder"));

    expect(api.createFolder).toHaveBeenCalledWith("acc1", "Projects/Q4");
    expect(api.triggerSync).toHaveBeenCalledWith("acc1");
    expect(api.listFolders).toHaveBeenCalledWith("acc1");
    expect(document.querySelector(".new-folder-modal")).toBeNull();
  });

  it("creates a top-level folder from the account menu and keeps the dialog open with the error when creation fails", async () => {
    const w = mountTree();
    await flushPromises();

    await w.find('[data-testid="account-acc2"]').trigger("contextmenu", { clientX: 5, clientY: 5 });
    await flushPromises();
    await clickInBody(bodyEl('[data-testid="ctx-account-new-folder"]'));

    vi.mocked(api.createFolder).mockRejectedValueOnce("Mailbox already exists");
    const input = bodyEl<HTMLInputElement>(".nf-input");
    input.value = "Receipts";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    await clickInBody(buttonByText("Create Folder"));

    expect(api.createFolder).toHaveBeenCalledWith("acc2", "Receipts");
    expect(api.triggerSync).not.toHaveBeenCalled();
    expect(bodyEl(".new-folder-modal")).toBeTruthy();
    expect(bodyEl(".nf-error").textContent).toBe("Mailbox already exists");
    // Saving state is reset so the user can retry.
    const createButton = buttonByText("Create Folder");
    expect(createButton.disabled).toBe(false);

    await clickInBody(createButton);
    expect(api.createFolder).toHaveBeenCalledTimes(2);
    expect(api.triggerSync).toHaveBeenCalledWith("acc2");
    expect(document.querySelector(".new-folder-modal")).toBeNull();
  });

  it("deletes a folder after confirmation and falls back to the Inbox when it was selected", async () => {
    const w = mountTree();
    await flushPromises();
    const folders = useFoldersStore();

    await row(w, "acc1", "Projects/Q3").trigger("click");
    await flushPromises();
    expect(folders.activeFolderPath).toBe("Projects/Q3");

    await openFolderMenu(w, "acc1", "Projects/Q3");
    await clickInBody(bodyEl('[data-testid="ctx-delete-folder"]'));
    expect(bodyEl(".modal-overlay").textContent).toContain('Are you sure you want to delete "Q3"?');
    expect(api.deleteFolder).not.toHaveBeenCalled();

    // The server no longer lists the folder after deletion.
    acc1Folders = fullAcc1Tree().map((candidate) =>
      candidate.path === "Projects" ? { ...candidate, children: [] } : candidate,
    );
    await clickInBody(buttonByText("Delete"));

    expect(api.deleteFolder).toHaveBeenCalledWith("acc1", "Projects/Q3");
    expect(document.querySelector(".modal-overlay")).toBeNull();
    expect(row(w, "acc1", "Projects/Q3").exists()).toBe(false);
    expect(folders.activeFolderPath).toBe("INBOX");
    expect(useToasts().value.map((toast) => toast.message)).toEqual(['Deleted "Q3"']);
  });

  it("reports a failed folder deletion with an error toast and leaves the tree and selection intact", async () => {
    const w = mountTree();
    await flushPromises();
    const folders = useFoldersStore();
    vi.mocked(api.deleteFolder).mockRejectedValueOnce(new Error("NO Mailbox has children"));

    await openFolderMenu(w, "acc1", "Projects");
    await clickInBody(bodyEl('[data-testid="ctx-delete-folder"]'));
    await clickInBody(buttonByText("Delete"));

    expect(api.deleteFolder).toHaveBeenCalledWith("acc1", "Projects");
    const toasts = useToasts().value;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("error");
    expect(toasts[0].message).toBe('Failed to delete "Projects": NO Mailbox has children');
    expect(row(w, "acc1", "Projects").exists()).toBe(true);
    expect(folders.activeFolderPath).toBe("INBOX");
    expect(document.querySelector(".modal-overlay")).toBeNull();
  });

  it("marks a folder read and syncs it from the context menu, surviving backend failures", async () => {
    const w = mountTree();
    await flushPromises();

    await openFolderMenu(w, "acc1", "Junk");
    vi.mocked(api.listFolders).mockClear();
    await clickInBody(bodyEl('[data-testid="ctx-mark-read"]'));
    // The backend marks the whole folder (no page limit), then the badges
    // are refreshed.
    expect(api.markFolderRead).toHaveBeenCalledWith("acc1", "Junk");
    expect(api.listFolders).toHaveBeenCalledWith("acc1");

    // Sync shows a spinner in place of the unread badge until it settles.
    let finishSync: (count: number) => void = () => {};
    vi.mocked(api.syncFolder).mockImplementationOnce(
      () => new Promise<number>((resolve) => { finishSync = resolve; }),
    );
    await openFolderMenu(w, "acc1", "Junk");
    await clickInBody(bodyEl('[data-testid="ctx-sync-folder"]'));
    expect(api.syncFolder).toHaveBeenCalledWith("acc1", "Junk");
    expect(row(w, "acc1", "Junk").find(".sync-spinner").exists()).toBe(true);
    expect(row(w, "acc1", "Junk").find(".unread-badge").exists()).toBe(false);
    finishSync(4);
    await flushPromises();
    expect(row(w, "acc1", "Junk").find(".sync-spinner").exists()).toBe(false);
    expect(row(w, "acc1", "Junk").find(".unread-badge").text()).toBe("5");

    // Rejections are logged, not thrown, and the UI recovers.
    vi.mocked(api.syncFolder).mockRejectedValueOnce(new Error("offline"));
    await openFolderMenu(w, "acc1", "Junk");
    await clickInBody(bodyEl('[data-testid="ctx-sync-folder"]'));
    expect(row(w, "acc1", "Junk").find(".sync-spinner").exists()).toBe(false);
    expect(consoleError).toHaveBeenCalledWith("Folder sync failed:", expect.any(Error));

    vi.mocked(api.markFolderRead).mockRejectedValueOnce(new Error("db locked"));
    await openFolderMenu(w, "acc1", "Junk");
    await clickInBody(bodyEl('[data-testid="ctx-mark-read"]'));
    expect(consoleError).toHaveBeenCalledWith("Mark folder read failed:", expect.any(Error));
    expect(api.markFolderRead).toHaveBeenCalledTimes(2);
    expect(row(w, "acc1", "Junk").exists()).toBe(true);
  });
});

describe("FolderTree regressions", () => {
  async function typeFolderName(name: string) {
    const input = bodyEl<HTMLInputElement>(".nf-input");
    input.value = name;
    input.dispatchEvent(new Event("input"));
    await flushPromises();
  }

  it("shows the sync spinner only on the folder of the account being synced", async () => {
    const w = mountTree();
    await flushPromises();
    let finishSync: (count: number) => void = () => {};
    vi.mocked(api.syncFolder).mockImplementationOnce(
      () => new Promise<number>((resolve) => { finishSync = resolve; }),
    );

    await openFolderMenu(w, "acc1", "INBOX");
    await clickInBody(bodyEl('[data-testid="ctx-sync-folder"]'));

    expect(row(w, "acc1", "INBOX").find(".sync-spinner").exists()).toBe(true);
    // Same path, other account: not syncing.
    expect(row(w, "acc2", "INBOX").find(".sync-spinner").exists()).toBe(false);
    expect(row(w, "acc2", "INBOX").find(".unread-badge").text()).toBe("1");
    finishSync(0);
    await flushPromises();
  });

  it("falls back to the Inbox when the deleted folder contained the open one", async () => {
    const w = mountTree();
    await flushPromises();
    const folders = useFoldersStore();
    await row(w, "acc1", "Projects/Q3/Design").trigger("click");
    await flushPromises();
    expect(folders.activeFolderPath).toBe("Projects/Q3/Design");

    await openFolderMenu(w, "acc1", "Projects");
    await clickInBody(bodyEl('[data-testid="ctx-delete-folder"]'));
    acc1Folders = fullAcc1Tree().filter((candidate) => candidate.path !== "Projects");
    await clickInBody(buttonByText("Delete"));

    expect(api.deleteFolder).toHaveBeenCalledWith("acc1", "Projects");
    expect(folders.activeFolderPath).toBe("INBOX");
  });

  it("keeps the selection when an unrelated folder is deleted", async () => {
    const w = mountTree();
    await flushPromises();
    const folders = useFoldersStore();
    await row(w, "acc1", "Projects/Q3").trigger("click");
    await flushPromises();

    await openFolderMenu(w, "acc1", "Junk");
    await clickInBody(bodyEl('[data-testid="ctx-delete-folder"]'));
    acc1Folders = fullAcc1Tree().filter((candidate) => candidate.path !== "Junk");
    await clickInBody(buttonByText("Delete"));

    expect(folders.activeFolderPath).toBe("Projects/Q3");
  });

  it("reports a failed sync after a successful creation and still refreshes the tree", async () => {
    const w = mountTree();
    await flushPromises();
    vi.mocked(api.triggerSync).mockRejectedValueOnce(new Error("offline"));

    await openFolderMenu(w, "acc1", "Projects");
    await clickInBody(bodyEl('[data-testid="ctx-new-folder"]'));
    await typeFolderName("Q4");
    vi.mocked(api.listFolders).mockClear();
    await clickInBody(buttonByText("Create Folder"));

    expect(api.createFolder).toHaveBeenCalledWith("acc1", "Projects/Q4");
    // The folder exists on the server: the dialog closes even though the
    // sync failed, and the failure is visible instead of hidden in it.
    expect(document.querySelector(".new-folder-modal")).toBeNull();
    expect(api.listFolders).toHaveBeenCalledWith("acc1");
    const errors = useToasts().value.filter((toast) => toast.type === "error");
    expect(errors.map((toast) => toast.message)).toEqual([
      'Folder "Q4" was created but could not be synced yet: offline',
    ]);
  });

  it("refuses a folder name containing a slash", async () => {
    const w = mountTree();
    await flushPromises();
    await openFolderMenu(w, "acc1", "Projects");
    await clickInBody(bodyEl('[data-testid="ctx-new-folder"]'));
    await typeFolderName("a/b");
    await clickInBody(buttonByText("Create Folder"));

    expect(bodyEl(".nf-error").textContent).toBe('Folder name cannot contain "/"');
    expect(api.createFolder).not.toHaveBeenCalled();
  });

  it("keeps a parent path that contains a pipe whole", async () => {
    acc1Folders = [...fullAcc1Tree(), folder("A|B", "A|B", null, 0)];
    const w = mountTree();
    await flushPromises();

    await openFolderMenu(w, "acc1", "A|B");
    await clickInBody(bodyEl('[data-testid="ctx-new-folder"]'));
    await typeFolderName("Child");
    await clickInBody(buttonByText("Create Folder"));

    expect(api.createFolder).toHaveBeenCalledWith("acc1", "A|B/Child");
  });
});
