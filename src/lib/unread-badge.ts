// Unread count shown on the app icon (macOS Dock, Linux launchers).
import type { Folder } from "@/lib/types";
import { findInbox } from "@/lib/mail-notifications";

/** Unread messages across the inboxes of `accountIds`. */
export function inboxUnreadTotal(
  foldersByAccount: Record<string, Folder[]>,
  accountIds: string[],
): number {
  let total = 0;
  for (const accountId of accountIds) {
    const inbox = findInbox(foldersByAccount[accountId] ?? []);
    total += Math.max(0, inbox?.unread_count ?? 0);
  }
  return total;
}

/** The badge value for Tauri: `undefined` removes the badge. */
export function badgeCount(total: number, enabled: boolean): number | undefined {
  return enabled && total > 0 ? total : undefined;
}
