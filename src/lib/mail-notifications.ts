// Desktop notifications for new mail, with a preview of the message.
//
// After each sync, the newest unread inbox messages of the synced account
// are compared with the ones already known; only messages that were not
// there before (and are recent) are announced. Messages present when the
// app starts, or when an account is first seen, are taken as already known
// so a backlog never floods the notification centre.
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { listen } from "@tauri-apps/api/event";
import * as api from "@/lib/tauri";
import type { Folder, MessageSummary } from "@/lib/types";
import { useAccountsStore } from "@/stores/accounts";
import { useUiStore } from "@/stores/ui";
import { t, tn } from "@/i18n";

const FETCH_LIMIT = 20;
const KNOWN_CAP = 500;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SNIPPET_LENGTH = 140;
const SENDER_LIST = 3;

export interface MailNotification {
  title: string;
  body: string;
}

function senderOf(message: MessageSummary): string {
  return message.from_name?.trim() || message.from_email || t("(unknown sender)");
}

function clip(text: string, length: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1).trimEnd()}…` : flat;
}

/** The title and body announcing `messages` (newest first). */
export function buildMailNotification(
  messages: MessageSummary[],
  accountName: string,
  options: { preview: boolean; showAccount: boolean },
): MailNotification {
  const count = messages.length;
  if (!options.preview) {
    return {
      title: "Goyav",
      body: tn(count, "{count} new message in {account}", "{count} new messages in {account}", {
        account: accountName,
      }),
    };
  }

  if (count === 1) {
    const [message] = messages;
    const subject = message.subject?.trim() || t("(no subject)");
    const snippet = message.snippet ? clip(message.snippet, SNIPPET_LENGTH) : "";
    const lines = [subject, snippet].filter(Boolean);
    if (options.showAccount) lines.push(accountName);
    return { title: senderOf(message), body: lines.join("\n") };
  }

  const senders = [...new Set(messages.map(senderOf))];
  const shown = senders.slice(0, SENDER_LIST).join(", ");
  const rest = senders.length - SENDER_LIST;
  const from =
    rest > 0
      ? t("From {senders} and {count} more", { senders: shown, count: rest })
      : t("From {senders}", { senders: shown });
  const title = options.showAccount
    ? tn(count, "{count} new message in {account}", "{count} new messages in {account}", {
        account: accountName,
      })
    : tn(count, "{count} new message", "{count} new messages");
  const latest = messages[0].subject?.trim();
  return { title, body: latest ? `${from}\n${clip(latest, SNIPPET_LENGTH)}` : from };
}

export function findInbox(folders: Folder[]): Folder | undefined {
  for (const folder of folders) {
    if (folder.folder_type === "inbox") return folder;
    const nested = findInbox(folder.children);
    if (nested) return nested;
  }
  return undefined;
}

export function createMailNotifier(now: () => number = Date.now) {
  const accountsStore = useAccountsStore();
  const uiStore = useUiStore();
  const known = new Map<string, Set<string>>();
  const inboxPaths = new Map<string, string>();
  // One check at a time per account, so overlapping syncs never announce
  // the same message twice.
  const queues = new Map<string, Promise<void>>();
  let permitted = false;
  let stopped = false;

  async function inboxPath(accountId: string): Promise<string | null> {
    const cached = inboxPaths.get(accountId);
    if (cached) return cached;
    const inbox = findInbox(await api.listFolders(accountId));
    if (!inbox) return null;
    inboxPaths.set(accountId, inbox.path);
    return inbox.path;
  }

  async function unreadInbox(accountId: string): Promise<MessageSummary[]> {
    const path = await inboxPath(accountId);
    if (!path) return [];
    const page = await api.getMessages(accountId, path, 0, FETCH_LIMIT, "date", false, {
      unread: true,
    });
    return page.messages.filter((message) => !message.flags.includes("seen"));
  }

  function remember(accountId: string, ids: Iterable<string>): Set<string> {
    const set = known.get(accountId) ?? new Set<string>();
    for (const id of ids) set.add(id);
    // Sets iterate in insertion order: drop the oldest ids past the cap.
    while (set.size > KNOWN_CAP) set.delete(set.values().next().value as string);
    known.set(accountId, set);
    return set;
  }

  async function check(accountId: string) {
    const unread = await unreadInbox(accountId);
    const firstLook = !known.has(accountId);
    const seen = known.get(accountId) ?? new Set<string>();
    const fresh = firstLook ? [] : unread.filter((message) => !seen.has(message.id));
    remember(accountId, unread.map((message) => message.id));

    const cutoff = now() - MAX_AGE_MS;
    const recent = fresh.filter((message) => {
      const time = Date.parse(message.date);
      return Number.isNaN(time) || time >= cutoff;
    });
    if (stopped || recent.length === 0) return;
    if (!permitted || !uiStore.mailNotifications) return;
    // The user is already looking at Goyav.
    if (typeof document !== "undefined" && document.hasFocus()) return;

    const account = accountsStore.accounts.find((candidate) => candidate.id === accountId);
    const accountName = account?.display_name || account?.email || t("Account");
    sendNotification(
      buildMailNotification(recent, accountName, {
        preview: uiStore.notificationPreview,
        showAccount: accountsStore.mailAccounts.length > 1,
      }),
    );
  }

  /** Queue a check for `accountId`; resolves once it has run. */
  function onSynced(accountId: string): Promise<void> {
    const previous = queues.get(accountId) ?? Promise.resolve();
    const next = previous
      .then(() => check(accountId))
      .catch((error) => console.error("New-mail notification check failed:", error));
    queues.set(accountId, next);
    return next;
  }

  async function start(): Promise<() => void> {
    try {
      permitted = await isPermissionGranted();
      if (!permitted) permitted = (await requestPermission()) === "granted";
    } catch (error) {
      console.warn("Notification permission unavailable:", error);
    }
    if (accountsStore.accounts.length === 0) {
      await accountsStore.fetchAccounts().catch(() => undefined);
    }
    // What is already unread at startup is not news.
    await Promise.allSettled(
      accountsStore.mailAccounts.map((account) => onSynced(account.id)),
    );
    const unlisten = await listen<{ account_id: string }>("sync-complete", (event) => {
      void onSynced(event.payload.account_id);
    });
    return () => {
      stopped = true;
      unlisten();
    };
  }

  return { start, onSynced };
}
