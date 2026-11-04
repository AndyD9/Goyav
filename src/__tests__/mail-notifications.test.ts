import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { MessageSummary } from "@/lib/types";

const notify = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-notification", () => notify);

const events = vi.hoisted(() => ({ handler: null as null | ((e: { payload: { account_id: string } }) => void) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_name: string, handler: (e: { payload: { account_id: string } }) => void) => {
    events.handler = handler;
    return () => {};
  }),
}));

vi.mock("@/lib/tauri", () => ({
  listAccounts: vi.fn(),
  getLastView: vi.fn().mockResolvedValue({ account_id: null, folder_path: null }),
  listFolders: vi.fn(),
  getMessages: vi.fn(),
}));

import * as api from "@/lib/tauri";
import { buildMailNotification, createMailNotifier } from "@/lib/mail-notifications";
import { useAccountsStore } from "@/stores/accounts";
import { useUiStore } from "@/stores/ui";
import { setLocale } from "@/i18n";

const NOW = Date.parse("2026-11-04T12:00:00Z");

function msg(id: string, overrides: Partial<MessageSummary> = {}): MessageSummary {
  return {
    id,
    subject: `Subject ${id}`,
    from_name: `Sender ${id}`,
    from_email: `${id}@mail.test`,
    date: "2026-11-04T11:50:00Z",
    flags: [],
    has_attachments: false,
    is_encrypted: false,
    is_signed: false,
    snippet: `Text of ${id}`,
    message_id: null,
    in_reply_to: null,
    ...overrides,
  };
}

const account = (id: string, name: string) => ({
  id,
  display_name: name,
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

let inbox: MessageSummary[] = [];

describe("buildMailNotification", () => {
  afterEach(() => setLocale("en"));

  it("previews a single message", () => {
    const n = buildMailNotification([msg("a", { snippet: "  Hello\n there  " })], "Work", {
      preview: true,
      showAccount: false,
    });
    expect(n).toEqual({ title: "Sender a", body: "Subject a\nHello there" });
  });

  it("summarises several messages with their senders", () => {
    const list = ["a", "b", "c", "d", "e"].map((id) => msg(id));
    const n = buildMailNotification(list, "Work", { preview: true, showAccount: true });
    expect(n.title).toBe("5 new messages in Work");
    expect(n.body).toBe("From Sender a, Sender b, Sender c and 2 more\nSubject a");
  });

  it("hides sender and content when previews are off, in French too", () => {
    setLocale("fr");
    const n = buildMailNotification([msg("a")], "Travail", { preview: false, showAccount: false });
    expect(n.title).toBe("Goyav");
    expect(n.body).not.toContain("Sender a");
    expect(n.body).toContain("Travail");
    expect(n.body).not.toBe("1 new message in Travail");
  });
});

describe("createMailNotifier", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    notify.isPermissionGranted.mockResolvedValue(true);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    vi.mocked(api.listFolders).mockResolvedValue([
      { name: "Inbox", path: "INBOX", folder_type: "inbox", children: [] } as never,
    ]);
    inbox = [msg("old")];
    vi.mocked(api.getMessages).mockImplementation(async () => ({
      messages: inbox,
      total: inbox.length,
      page: 0,
      per_page: 20,
    }));
    const accounts = useAccountsStore();
    accounts.accounts = [account("acc1", "Work")];
  });

  afterEach(() => vi.restoreAllMocks());

  async function started() {
    const notifier = createMailNotifier(() => NOW);
    await notifier.start();
    return notifier;
  }

  it("ignores what is already unread at startup and announces new mail", async () => {
    const notifier = await started();
    expect(notify.sendNotification).not.toHaveBeenCalled();
    expect(api.getMessages).toHaveBeenCalledWith("acc1", "INBOX", 0, 20, "date", false, { unread: true });

    inbox = [msg("new"), msg("old")];
    await notifier.onSynced("acc1");
    expect(notify.sendNotification).toHaveBeenCalledTimes(1);
    expect(notify.sendNotification).toHaveBeenCalledWith({ title: "Sender new", body: "Subject new\nText of new" });

    // Announced once only.
    await notifier.onSynced("acc1");
    expect(notify.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("reacts to sync-complete events", async () => {
    await started();
    inbox = [msg("new"), msg("old")];
    events.handler!({ payload: { account_id: "acc1" } });
    await vi.waitFor(() => expect(notify.sendNotification).toHaveBeenCalled());
  });

  it("skips old mail, read mail, a focused window and disabled notifications", async () => {
    const notifier = await started();
    inbox = [msg("stale", { date: "2026-11-01T08:00:00Z" }), msg("read", { flags: ["seen"] }), msg("old")];
    await notifier.onSynced("acc1");
    expect(notify.sendNotification).not.toHaveBeenCalled();

    vi.mocked(document.hasFocus).mockReturnValue(true);
    inbox = [msg("focused"), ...inbox];
    await notifier.onSynced("acc1");
    expect(notify.sendNotification).not.toHaveBeenCalled();

    vi.mocked(document.hasFocus).mockReturnValue(false);
    useUiStore().setMailNotifications(false);
    inbox = [msg("muted"), ...inbox];
    await notifier.onSynced("acc1");
    expect(notify.sendNotification).not.toHaveBeenCalled();
  });

  it("treats the first look at a new account as a baseline", async () => {
    const notifier = await started();
    useAccountsStore().accounts.push(account("acc2", "Home"));
    inbox = [msg("backlog")];
    await notifier.onSynced("acc2");
    expect(notify.sendNotification).not.toHaveBeenCalled();
  });

  it("asks for permission and stays silent without it", async () => {
    notify.isPermissionGranted.mockResolvedValue(false);
    notify.requestPermission.mockResolvedValue("denied");
    const notifier = await started();
    expect(notify.requestPermission).toHaveBeenCalled();
    inbox = [msg("new"), msg("old")];
    await notifier.onSynced("acc1");
    expect(notify.sendNotification).not.toHaveBeenCalled();
  });
});
