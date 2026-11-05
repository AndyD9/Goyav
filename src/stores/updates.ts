// Self-update state. The backend (src-tauri/src/updater.rs) checks GitHub
// releases at startup and every few hours and announces a found update
// with `update-available`; this store shows it (in-app notice + one system
// notification per version) and drives the install, whose download
// progress arrives as `update-progress` events.
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/errors";
import { beginLoading, withProgressToast, type LoadingHandle } from "@/lib/loading";
import { showToast } from "@/lib/toast";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes: string | null;
  /** Unix seconds. */
  publishedAt: number | null;
}

type UpdateCheck = { status: "upToDate"; version: string } | ({ status: "available" } & UpdateInfo);

interface UpdateProgress {
  downloaded: number;
  total: number | null;
  installing: boolean;
}

export type UpdatePhase = "idle" | "checking" | "downloading" | "installing";

const NOTIFIED_KEY = "goyav-update-notified";

export const useUpdatesStore = defineStore("updates", () => {
  const available = ref<UpdateInfo | null>(null);
  const phase = ref<UpdatePhase>("idle");
  const progress = ref<UpdateProgress | null>(null);
  /** Version the user put off with "Later" during this session. */
  const dismissedVersion = ref<string | null>(null);
  /** Result of the last manual check, shown in About. */
  const lastCheck = ref<"upToDate" | "available" | "error" | null>(null);

  const noticeVisible = computed(
    () =>
      available.value !== null &&
      dismissedVersion.value !== available.value.version &&
      phase.value !== "downloading" &&
      phase.value !== "installing",
  );

  let started = false;
  const unlisteners: UnlistenFn[] = [];
  let overlay: LoadingHandle | null = null;

  async function init() {
    if (started) return;
    started = true;
    try {
      unlisteners.push(
        await listen<UpdateInfo>("update-available", (event) => announce(event.payload)),
        await listen<UpdateProgress>("update-progress", (event) => onProgress(event.payload)),
      );
      // A startup check may have finished before we listened.
      const pending = await invoke<UpdateInfo | null>("get_pending_update");
      if (pending) announce(pending);
    } catch (error) {
      console.warn("Update notifications unavailable:", error);
    }
  }

  function announce(info: UpdateInfo) {
    const isNew = available.value?.version !== info.version;
    available.value = info;
    if (isNew) void notifySystem(info);
  }

  /** One system notification per version, only while Goyav is in the background. */
  async function notifySystem(info: UpdateInfo) {
    try {
      if (localStorage.getItem(NOTIFIED_KEY) === info.version) return;
      localStorage.setItem(NOTIFIED_KEY, info.version);
    } catch {
      // Without storage, notify every launch; harmless.
    }
    if (typeof document !== "undefined" && document.hasFocus()) return;
    try {
      let permitted = await isPermissionGranted();
      if (!permitted) permitted = (await requestPermission()) === "granted";
      if (!permitted) return;
      sendNotification({
        title: t("Goyav update available"),
        body: t("Version {version} is ready to install.", { version: info.version }),
      });
    } catch (error) {
      console.warn("Could not show the update notification:", error);
    }
  }

  /** Help > Check for Updates, and the button in About. */
  async function check(options: { quiet?: boolean } = {}) {
    if (phase.value !== "idle") return;
    phase.value = "checking";
    try {
      const request = () => invoke<UpdateCheck>("check_for_updates");
      const result = options.quiet
        ? await request()
        : await withProgressToast(t("Checking for updates…"), request);
      if (result.status === "upToDate") {
        available.value = null;
        lastCheck.value = "upToDate";
        if (!options.quiet) {
          showToast(t("Goyav {version} is up to date.", { version: result.version }), "success");
        }
      } else {
        const { status: _status, ...info } = result;
        lastCheck.value = "available";
        dismissedVersion.value = null;
        announce(info);
      }
    } catch (error) {
      lastCheck.value = "error";
      showToast(t("Could not check for updates: {error}", { error: errorMessage(error) }), "error", 6000);
    } finally {
      phase.value = "idle";
    }
  }

  async function install() {
    if (!available.value || phase.value === "downloading" || phase.value === "installing") return;
    const version = available.value.version;
    phase.value = "downloading";
    progress.value = { downloaded: 0, total: null, installing: false };
    overlay = beginLoading(t("Downloading Goyav {version}…", { version }), {
      detail: t("Goyav will restart once the update is installed."),
      delayMs: 0,
    });
    try {
      await invoke("install_update");
      // The app restarts; keep the overlay until it does.
    } catch (error) {
      overlay?.done();
      overlay = null;
      phase.value = "idle";
      progress.value = null;
      showToast(t("The update could not be installed: {error}", { error: errorMessage(error) }), "error", 8000);
    }
  }

  function onProgress(update: UpdateProgress) {
    progress.value = update;
    if (update.installing) {
      phase.value = "installing";
      overlay?.update({
        label: t("Installing the update…"),
        progress: null,
      });
      return;
    }
    if (update.total) {
      overlay?.update({ progress: update.downloaded / update.total });
    }
  }

  function dismiss() {
    if (available.value) dismissedVersion.value = available.value.version;
  }

  /** Bring the notice back after "Later". */
  function reopen() {
    dismissedVersion.value = null;
  }

  function dispose() {
    for (const unlisten of unlisteners.splice(0)) unlisten();
    started = false;
  }

  return {
    available,
    phase,
    progress,
    lastCheck,
    noticeVisible,
    init,
    check,
    install,
    dismiss,
    reopen,
    dispose,
  };
});
