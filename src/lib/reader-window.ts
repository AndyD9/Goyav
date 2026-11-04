import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { t } from "@/i18n";

let readerCounter = 0;

export function openReaderWindow(accountId: string, messageId: string, subject?: string) {
  readerCounter++;
  const label = `reader-${readerCounter}`;

  const query = new URLSearchParams();
  query.set("accountId", accountId);
  query.set("messageId", messageId);

  const url = `/reader?${query.toString()}`;
  const titleSuffix = subject || t("(no subject)");

  const win = new WebviewWindow(label, {
    url,
    title: `${titleSuffix} - Goyav`,
    width: 900,
    height: 700,
    center: true,
    resizable: true,
    focus: true,
  });

  win.once("tauri://error", (e) => {
    console.error("Failed to create reader window:", e);
  });
}
