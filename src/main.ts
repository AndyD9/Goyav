import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import App from "./App.vue";
import {
  initializeActivityListenersWithRetry,
  useActivityStore,
} from "./stores/activity";
import { usePlatformStore } from "./stores/platform";
import { dismissToast, showToast } from "./lib/toast";
import { t } from "./i18n";
import { errorMessage } from "./lib/errors";
import "./assets/styles/main.css";

const STARTUP_ATTEMPTS = 2;
const STARTUP_RETRY_DELAY_MS = 50;
const STARTUP_ATTEMPT_TIMEOUT_MS = 750;
const BACKGROUND_RETRY_INITIAL_DELAY_MS = 1_000;
const BACKGROUND_RETRY_MAX_DELAY_MS = 30_000;

const app = createApp(App);

// Last line of defence for failures no handler caught (e.g. a rejected
// command in an async click handler): log them and tell the user, instead
// of the action silently doing nothing.
let lastReportedError: { message: string; at: number } | null = null;
function reportUnhandledError(error: unknown) {
  console.error("Unhandled error:", error);
  const message = errorMessage(error);
  const now = Date.now();
  // A failing background loop can reject repeatedly; show it once.
  if (lastReportedError?.message === message && now - lastReportedError.at < 5_000) {
    return;
  }
  lastReportedError = { message, at: now };
  showToast(t("Something went wrong: {error}", { error: message }), "error", 6_000);
}
app.config.errorHandler = (error) => reportUnhandledError(error);
window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  reportUnhandledError(event.reason);
});

const pinia = createPinia();
app.use(pinia);
app.use(router);

const activityStore = useActivityStore(pinia);
const initializeActivityListeners = (signal: AbortSignal) =>
  activityStore.initEventListeners(signal);
const activityInitializationError =
  await initializeActivityListenersWithRetry(
    initializeActivityListeners,
    STARTUP_ATTEMPTS,
    STARTUP_RETRY_DELAY_MS,
    STARTUP_ATTEMPT_TIMEOUT_MS,
  );

app.mount("#app");
usePlatformStore().init();

if (activityInitializationError !== null) {
  console.error(
    "Activity listeners unavailable during startup:",
    activityInitializationError,
  );
  const unavailableToastId = showToast(
    t("Background activity updates are unavailable. Retrying..."),
    "error",
    0,
  );

  const retryActivityListeners = async () => {
    let delayMs = BACKGROUND_RETRY_INITIAL_DELAY_MS;

    while (true) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
      const error = await initializeActivityListenersWithRetry(
        initializeActivityListeners,
        1,
        0,
        STARTUP_ATTEMPT_TIMEOUT_MS,
      );
      if (error === null) {
        dismissToast(unavailableToastId);
        showToast(t("Background activity updates restored"), "success");
        return;
      }

      console.error("Activity listener retry failed:", error);
      delayMs = Math.min(delayMs * 2, BACKGROUND_RETRY_MAX_DELAY_MS);
    }
  };

  void retryActivityListeners();
}
