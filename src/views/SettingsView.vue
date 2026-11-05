<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useAccountsStore } from "@/stores/accounts";
import { useCalendarStore } from "@/stores/calendar";
import { usePlatformStore } from "@/stores/platform";
import { useUiStore, type MessageListLayout, type Theme } from "@/stores/ui";
import { acctColor } from "@/lib/account-colors";
import * as api from "@/lib/tauri";
import { errorMessage } from "@/lib/errors";
import MobileAppBar from "@/components/mobile/MobileAppBar.vue";
import AccountTypePicker from "@/components/settings/AccountTypePicker.vue";
import AccountFormModal from "@/components/settings/AccountFormModal.vue";
import ArchivedGraphSummary from "@/components/calendar/ArchivedGraphSummary.vue";
import logoUrl from "@/assets/goyav-logo.png";
import ChangelogList from "@/components/changelog/ChangelogList.vue";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import { t, locale, setLocale, LOCALES } from "@/i18n";
import {
  accountSecondaryLabel,
  accountTypeLabel,
  type AccountType,
} from "@/lib/account-types";

const route = useRoute();
const router = useRouter();
const accountsStore = useAccountsStore();
const calendarStore = useCalendarStore();
const platformStore = usePlatformStore();
const uiStore = useUiStore();
const { isMobile } = storeToRefs(platformStore);
const viewMounted = ref(false);
onMounted(() => { viewMounted.value = true; });
watch(() => accountsStore.accounts.map((account) => account.id), (ids) => {
  if (ids.length === 0) {
    calendarStore.archivedGraphCalendars = [];
    return;
  }
  void calendarStore.fetchCalendars().catch((error) =>
    console.error("Settings: archived calendar read failed:", error));
}, { immediate: true });

// Mobile toggles — persist to localStorage so they survive reloads.
const blockRemoteImages = ref(localStorage.getItem("chithi-block-remote-images") !== "false");
function setBlockRemoteImages(v: boolean) {
  blockRemoteImages.value = v;
  localStorage.setItem("chithi-block-remote-images", String(v));
}


const themeLabel = computed(() =>
  uiStore.theme === "dark" ? t("Dark") : t("Light"),
);

const localeLabel = computed(
  () => LOCALES.find((option) => option.value === locale.value)?.label ?? "",
);

function cycleLocale() {
  const index = LOCALES.findIndex((option) => option.value === locale.value);
  setLocale(LOCALES[(index + 1) % LOCALES.length].value);
}

// Desktop: section navigation on the left, one section shown at a time.
type SettingsSection = "accounts" | "appearance" | "calendars" | "whatsnew" | "about";
const SECTION_IDS: readonly SettingsSection[] = ["accounts", "appearance", "calendars", "whatsnew", "about"];
const activeSection = ref<SettingsSection>("accounts");
const sections = computed<ReadonlyArray<{ id: SettingsSection; label: string }>>(() => [
  { id: "accounts", label: t("Accounts") },
  { id: "appearance", label: t("Appearance") },
  { id: "calendars", label: t("Archived calendars") },
  { id: "whatsnew", label: t("What's new") },
  { id: "about", label: t("About") },
]);

// On desktop the account form fills the settings panel as a page.
const accountFormOpen = ref(false);

function selectSection(section: SettingsSection) {
  if (accountFormOpen.value) formModal.value?.cancel();
  activeSection.value = section;
}

// Help → What's new links here with ?section=whatsnew.
watch(
  () => route.query.section,
  (section) => {
    if (typeof section === "string" && (SECTION_IDS as readonly string[]).includes(section)) {
      selectSection(section as SettingsSection);
    }
  },
  { immediate: true },
);

const activeSectionLabel = computed(
  () => sections.value.find((section) => section.id === activeSection.value)?.label ?? "",
);

const themeOptions = computed<ReadonlyArray<{ value: Theme; label: string }>>(() => [
  { value: "system", label: t("System") },
  { value: "light", label: t("Light") },
  { value: "dark", label: t("Dark") },
]);
const listLayoutOptions = computed<ReadonlyArray<{ value: MessageListLayout; label: string }>>(() => [
  { value: "cards", label: t("Cards") },
  { value: "table", label: t("Compact table") },
]);

const version = __APP_VERSION__;

// The add/edit form lives in AccountFormModal (#166); the view only
// drives it through the exposed openNew / openEdit handles.
const formModal = ref<InstanceType<typeof AccountFormModal> | null>(null);

// First step of "Add Account": pick a type. Replaces the cramped
// in-modal tab row with a dialog that lists every supported
// account type as cards, and on pick opens the account form
// pre-set to that type. Edit-existing skips this step. (#148 cleanup)
const showPicker = ref(false);
const showDeleteConfirm = ref(false);
const deletingAccountId = ref<string | null>(null);
const abandonZoomAcknowledged = ref(false);
const deletingZoomAccount = ref(false);
const deletingVisioAccount = ref(false);
const deleteProviderLoading = ref(false);
const deleteProviderLookupFailed = ref(false);
const deleteInProgress = ref(false);
const deleteError = ref<string | null>(null);

function getInitials(name: string): string {
  const words = name.split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function openNewForm() {
  showPicker.value = true;
}

/// Step 2 of the Add-account flow: type is chosen, hand off to the
/// form modal. Closes the picker.
function pickAccountType(type: AccountType) {
  showPicker.value = false;
  formModal.value?.openNew(type);
}

function cancelPicker() {
  showPicker.value = false;
}

function openEditForm(id: string) {
  formModal.value?.openEdit(id);
}

async function confirmDelete(id: string) {
  abandonZoomAcknowledged.value = false;
  deletingAccountId.value = id;
  deletingZoomAccount.value = accountsStore.accounts.find(
    (account) => account.id === id,
  )?.meet_protocol === "zoom";
  deletingVisioAccount.value = accountsStore.accounts.find(
    (account) => account.id === id,
  )?.meet_protocol === "visio";
  deleteProviderLoading.value = true;
  deleteProviderLookupFailed.value = false;
  showDeleteConfirm.value = true;

  try {
    const config = await api.getAccountConfig(id);
    if (showDeleteConfirm.value && deletingAccountId.value === id) {
      deletingZoomAccount.value = config.meet_protocol === "zoom";
      deletingVisioAccount.value = config.meet_protocol === "visio";
    }
  } catch {
    // The account summary remains the fallback if config loading fails.
    if (showDeleteConfirm.value && deletingAccountId.value === id) {
      deleteProviderLookupFailed.value =
        !deletingZoomAccount.value && !deletingVisioAccount.value;
    }
  } finally {
    if (showDeleteConfirm.value && deletingAccountId.value === id) {
      deleteProviderLoading.value = false;
    }
  }
}

function closeDeleteConfirm() {
  // Deletion runs in the backend and cannot be cancelled; keep the dialog
  // open until it settles so the user sees it is still in progress.
  if (deleteInProgress.value) return;
  deleteError.value = null;
  showDeleteConfirm.value = false;
  deletingAccountId.value = null;
  abandonZoomAcknowledged.value = false;
  deletingZoomAccount.value = false;
  deletingVisioAccount.value = false;
  deleteProviderLoading.value = false;
  deleteProviderLookupFailed.value = false;
}

async function doDelete() {
  if (deleteProviderLoading.value || deleteInProgress.value) return;
  const id = deletingAccountId.value;
  if (id) {
    deleteInProgress.value = true;
    deleteError.value = null;
    try {
      if (deletingZoomAccount.value && abandonZoomAcknowledged.value) {
        await accountsStore.abandonZoomAccount(
          id,
          "ABANDON REMOTE ZOOM MEETINGS",
        );
      } else {
        await accountsStore.deleteAccount(id);
      }
    } catch (error) {
      deleteError.value = errorMessage(error);
      return;
    } finally {
      deleteInProgress.value = false;
    }
  }
  closeDeleteConfirm();
}

// Onboarding hands off via ?addAccount=<provider>. Wait for native platform
// detection before honoring desktop-only providers; `kind` intentionally
// defaults to desktop while detection is in flight.
watch([
  viewMounted,
  () => platformStore.platformReady,
  () => route.query.addAccount,
], ([mounted, ready, want]) => {
  if (!mounted || !ready) return;
  if (typeof want !== "string") return;
  const mapped: Record<string, AccountType> = {
    jmap: "jmap",
    microsoft365: "o365",
    o365: "o365",
    gmail: "gmail",
    imap: "imap",
    caldav: "caldav",
    carddav: "carddav",
    talk: "talk",
    matrix: "matrix",
    zoom: "zoom",
    visio: "visio",
  };
  const type = mapped[want];
  if (!type) return;
  if (type === "visio" && platformStore.kind !== "desktop") return;
  // Deep-link path skips the picker and lands directly on the
  // form for the requested type — onboarding has already chosen.
  pickAccountType(type);
}, { immediate: true });
</script>

<template>
  <!-- Mobile: section-card layout with uppercase muted labels -->
  <div v-if="isMobile" class="settings-view mobile">
    <MobileAppBar large :title="t('Settings')" />

    <div class="mobile-scroll">
      <!-- Accounts -->
      <div class="section">
        <div class="section-label">{{ t("Accounts") }}</div>
        <div class="section-card">
          <div
            v-for="account in accountsStore.accounts"
            :key="account.id"
            class="mobile-account-item"
            :style="{ ['--acct-color']: acctColor(account.id).fill }"
          >
            <button
              type="button"
              class="mobile-account-row"
              :aria-label="t('Edit {name}', { name: account.display_name })"
              data-testid="mobile-account-edit"
              @click="openEditForm(account.id)"
            >
              <span class="mobile-account-avatar" :style="{ background: acctColor(account.id).fill }">
                {{ getInitials(account.display_name) }}
              </span>
              <span class="mobile-account-info">
                <span class="mobile-account-name">{{ account.display_name }}</span>
                <span class="mobile-account-email">{{ accountSecondaryLabel(account) }}</span>
                <span class="mobile-account-type" :style="{ color: acctColor(account.id).fill }">
                  {{ accountTypeLabel(account) }}
                </span>
              </span>
              <svg class="mobile-row-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button
              type="button"
              class="mobile-account-delete"
              :aria-label="t('Delete {name}', { name: account.display_name })"
              data-testid="mobile-account-delete"
              @click="confirmDelete(account.id)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>{{ t("Delete") }}</span>
            </button>
          </div>
          <button class="mobile-add-account" @click="openNewForm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            <span>{{ t("Add account") }}</span>
          </button>
        </div>
      </div>

      <!-- General -->
      <div class="section">
        <div class="section-label">{{ t("General") }}</div>
        <div class="section-card">
          <button class="mobile-setting-row" @click="uiStore.setTheme(uiStore.theme === 'dark' ? 'light' : 'dark')">
            <span class="mobile-setting-label">{{ t("Appearance") }}</span>
            <span class="mobile-setting-value">{{ themeLabel }}</span>
            <svg class="mobile-row-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <div class="mobile-setting-row static">
            <span class="mobile-setting-label">{{ t("Time format") }}</span>
            <span class="mobile-setting-value">
              {{ uiStore.timeFormat === "auto" ? t("Auto") : uiStore.timeFormat === "12" ? t("12-hour") : t("24-hour") }}
            </span>
          </div>
          <button class="mobile-setting-row" data-testid="mobile-locale" @click="cycleLocale">
            <span class="mobile-setting-label">{{ t("Language") }}</span>
            <span class="mobile-setting-value">{{ localeLabel }}</span>
            <svg class="mobile-row-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <div class="mobile-setting-row static">
            <span class="mobile-setting-label">{{ t("Default account") }}</span>
            <span class="mobile-setting-value">
              {{ accountsStore.activeAccount()?.email ?? "—" }}
            </span>
          </div>
        </div>
      </div>

      <!-- Archived calendars -->
      <div class="section">
        <div class="section-label">{{ t("Archived Graph calendars") }}</div>
        <div class="section-card archive-settings">
          <p v-if="calendarStore.archivedGraphCalendarsError" role="alert">
            {{ calendarStore.archivedGraphCalendarsError }}
            <button @click="calendarStore.retryNavigation()">{{ t("Retry") }}</button>
          </p>
          <p v-else-if="!calendarStore.archivedGraphCalendars.length">{{ t("No archived Graph calendars.") }}</p>
          <template v-if="calendarStore.archivedGraphCalendars.length">
            <p>{{ t("Cached events and action history are retained read-only.") }}</p>
            <ArchivedGraphSummary :calendars="calendarStore.archivedGraphCalendars" />
          </template>
        </div>
      </div>

      <!-- Privacy & storage -->
      <div class="section">
        <div class="section-label">{{ t("Privacy & storage") }}</div>
        <div class="section-card">
          <label class="mobile-setting-row toggle">
            <span class="mobile-setting-label">{{ t("Block remote images") }}</span>
            <input
              type="checkbox"
              class="toggle-input"
              :checked="blockRemoteImages"
              @change="setBlockRemoteImages(($event.target as HTMLInputElement).checked)"
            />
            <span class="toggle-pill" :class="{ on: blockRemoteImages }">
              <span class="toggle-thumb"></span>
            </span>
          </label>
          <div class="mobile-setting-row static">
            <span class="mobile-setting-label">{{ t("Cache size") }}</span>
            <span class="mobile-setting-value">—</span>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="section">
        <div class="section-label">{{ t("About") }}</div>
        <div class="section-card">
          <div class="mobile-setting-row static">
            <span class="mobile-setting-label">{{ t("Version") }}</span>
            <span class="mobile-setting-value">{{ version }}</span>
          </div>
        </div>
      </div>
    </div>

  </div>

  <!-- Desktop: section navigation panel + content panel -->
  <div v-else class="settings-view settings-desktop">
    <nav class="settings-nav app-panel" aria-label="Settings sections">
      <div class="app-sidebar-header">{{ t("Settings") }}</div>
      <div class="settings-nav-list">
        <button
          v-for="section in sections"
          :key="section.id"
          class="settings-nav-item"
          :class="{ active: activeSection === section.id }"
          :aria-current="activeSection === section.id ? 'page' : undefined"
          :data-testid="`settings-nav-${section.id}`"
          @click="selectSection(section.id)"
        >
          <svg v-if="section.id === 'accounts'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
          </svg>
          <svg v-else-if="section.id === 'appearance'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
          </svg>
          <svg v-else-if="section.id === 'calendars'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <svg v-else-if="section.id === 'whatsnew'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8h.01" />
          </svg>
          <span>{{ section.label }}</span>
          <span
            v-if="section.id === 'accounts' && accountsStore.accounts.length"
            class="settings-nav-count"
          >{{ accountsStore.accounts.length }}</span>
        </button>
      </div>
    </nav>

    <div class="settings-main app-panel">
      <AccountFormModal
        v-if="!isMobile"
        ref="formModal"
        variant="page"
        @open-change="accountFormOpen = $event"
      />
      <template v-if="!accountFormOpen">
      <header class="settings-toolbar">
        <h1 class="settings-title">{{ activeSectionLabel }}</h1>
        <button
          v-if="activeSection === 'accounts' && accountsStore.accounts.length"
          class="btn-add"
          @click="openNewForm"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {{ t("Add account") }}
        </button>
      </header>

      <div class="settings-body">
        <!-- Accounts -->
        <section v-if="activeSection === 'accounts'" class="settings-section">
          <div v-if="!accountsStore.accounts.length" class="accounts-empty" data-testid="accounts-empty">
            <img :src="logoUrl" alt="" class="accounts-empty-logo" />
            <h2 class="accounts-empty-title">{{ t("Connect your first account") }}</h2>
            <p class="accounts-empty-text">
              {{ t("Goyav keeps your mail, calendars and contacts on this device. Add an IMAP, JMAP, Gmail or Microsoft 365 account to get started.") }}
            </p>
            <button class="btn-add btn-add-lg" @click="openNewForm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {{ t("Add account") }}
            </button>
          </div>

          <div v-else class="account-list">
            <div
              v-for="account in accountsStore.accounts"
              :key="account.id"
              class="account-card clickable"
              role="button"
              tabindex="0"
              :aria-label="t('Open settings for {name}', { name: account.display_name })"
              @click="openEditForm(account.id)"
              @keydown.enter.self.prevent="openEditForm(account.id)"
            >
              <span
                class="account-avatar"
                :style="{ background: acctColor(account.id).soft, color: acctColor(account.id).fill }"
              >{{ getInitials(account.display_name) }}</span>
              <div class="account-card-info">
                <span class="account-card-name">{{ account.display_name }}</span>
                <span class="account-card-email">{{ accountSecondaryLabel(account) }}</span>
              </div>
              <span
                class="account-card-type"
                :style="{ color: acctColor(account.id).fill, background: acctColor(account.id).soft }"
              >{{ accountTypeLabel(account) }}</span>
              <div class="account-card-actions" @click.stop>
                <button class="icon-btn-sm" title="Edit" :aria-label="t('Edit {name}', { name: account.display_name })" @click="openEditForm(account.id)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
                <button class="icon-btn-sm danger" :title="t('Delete')" :aria-label="t('Delete {name}', { name: account.display_name })" @click="confirmDelete(account.id)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Appearance -->
        <section v-else-if="activeSection === 'appearance'" class="settings-section">
          <div class="settings-group">
            <div class="settings-row">
              <div class="settings-row-text">
                <span class="settings-row-label">{{ t("Theme") }}</span>
                <span class="settings-row-hint">{{ t("System follows your macOS appearance.") }}</span>
              </div>
              <div class="segmented" role="radiogroup" :aria-label="t('Theme')">
                <button
                  v-for="opt in themeOptions"
                  :key="opt.value"
                  class="segmented-btn"
                  :class="{ active: uiStore.theme === opt.value }"
                  role="radio"
                  :aria-checked="uiStore.theme === opt.value"
                  :data-testid="`settings-theme-${opt.value}`"
                  @click="uiStore.setTheme(opt.value)"
                >{{ opt.label }}</button>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row-text">
                <span class="settings-row-label">{{ t("Message list") }}</span>
                <span class="settings-row-hint">{{ t("Cards show the sender and a preview; the table fits more rows.") }}</span>
              </div>
              <div class="segmented" role="radiogroup" :aria-label="t('Message list')">
                <button
                  v-for="opt in listLayoutOptions"
                  :key="opt.value"
                  class="segmented-btn"
                  :class="{ active: uiStore.messageListLayout === opt.value }"
                  role="radio"
                  :aria-checked="uiStore.messageListLayout === opt.value"
                  :data-testid="`settings-list-${opt.value}`"
                  @click="uiStore.setMessageListLayout(opt.value)"
                >{{ opt.label }}</button>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row-text">
                <span class="settings-row-label">{{ t("Language") }}</span>
                <span class="settings-row-hint">{{ t("Language of menus, buttons and messages in Goyav.") }}</span>
              </div>
              <div class="segmented" role="radiogroup" :aria-label="t('Language')">
                <button
                  v-for="opt in LOCALES"
                  :key="opt.value"
                  class="segmented-btn"
                  :class="{ active: locale === opt.value }"
                  role="radio"
                  :aria-checked="locale === opt.value"
                  :lang="opt.value"
                  :data-testid="`settings-locale-${opt.value}`"
                  @click="setLocale(opt.value)"
                >{{ opt.label }}</button>
              </div>
            </div>
          </div>
          <button class="settings-link" @click="router.push('/preferences')">
            {{ t("Date, time and window options are in Preferences") }}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </section>

        <!-- Archived Graph calendars -->
        <section v-else-if="activeSection === 'calendars'" class="settings-section">
          <div class="settings-group archive-settings desktop-archive-settings">
            <p v-if="calendarStore.archivedGraphCalendarsError" role="alert">
              {{ calendarStore.archivedGraphCalendarsError }}
              <button @click="calendarStore.retryNavigation()">{{ t("Retry") }}</button>
            </p>
            <p v-else-if="!calendarStore.archivedGraphCalendars.length">
              {{ t("No archived Graph calendars. Calendars removed from a Microsoft 365 account keep their cached events here, read-only.") }}
            </p>
            <template v-if="calendarStore.archivedGraphCalendars.length">
              <p>{{ t("Cached events and action history are retained read-only.") }}</p>
              <ArchivedGraphSummary :calendars="calendarStore.archivedGraphCalendars" />
            </template>
          </div>
        </section>

        <!-- What's new -->
        <section v-else-if="activeSection === 'whatsnew'" class="settings-section">
          <ChangelogList :current="version" />
        </section>

        <!-- About -->
        <section v-else class="settings-section">
          <div class="about-card">
            <img :src="logoUrl" alt="" class="about-card-logo" />
            <div>
              <div class="about-card-name">Goyav</div>
              <div class="about-card-meta">{{ t("Version {version} · A personal mail and calendar client", { version }) }}</div>
              <div class="about-card-meta">{{ t("Built on Chithi. Everything is stored on this device.") }}</div>
            </div>
          </div>
        </section>
      </div>
      </template>
    </div>
  </div>

  <!-- Step 1 of Add Account: pick a type. (#148 cleanup) -->
  <AccountTypePicker
    :open="showPicker"
    :allow-visio="platformStore.platformReady && platformStore.kind === 'desktop'"
    @pick="pickAccountType"
    @cancel="cancelPicker"
  />

  <!-- Add/Edit Account dialog on mobile; desktop renders it as a page above. -->
  <AccountFormModal v-if="isMobile" ref="formModal" />


    <!-- Delete Confirmation Modal -->
    <ConfirmDialog
      :open="showDeleteConfirm"
      :title="t('Delete Account')"
      :message="t('Are you sure you want to delete this account? This action cannot be undone.')"
      :confirm-label="deleteProviderLoading ? t('Checking…') : deletingZoomAccount && abandonZoomAcknowledged ? t('Delete locally') : t('Delete')"
      :busy="deleteInProgress"
      :confirm-disabled="deleteProviderLoading"
      :error="deleteError ? t('Could not delete the account: {error}', { error: deleteError }) : null"
      test-id="delete-account"
      @confirm="doDelete"
      @cancel="closeDeleteConfirm"
    >
      <div
        v-if="deletingZoomAccount"
        class="zoom-abandon-warning"
        data-testid="zoom-abandon-warning"
      >
        <strong>{{ t("Remote Zoom meetings may remain.") }}</strong>
        <p>
          {{ t("If normal deletion cannot clean up Zoom, you can remove only the local account. Meetings already created in Zoom may remain active and must be removed from Zoom separately.") }}
        </p>
        <label class="zoom-abandon-acknowledgement">
          <input
            v-model="abandonZoomAcknowledged"
            type="checkbox"
            :disabled="deleteInProgress"
            data-testid="zoom-abandon-checkbox"
          />
          {{ t("I understand that remote Zoom meetings may remain") }}
        </label>
      </div>
      <div
        v-if="deleteProviderLookupFailed"
        class="zoom-abandon-warning"
        data-testid="delete-provider-lookup-warning"
      >
        <strong>{{ t("Remote resource status could not be checked.") }}</strong>
        <p>
          {{ t("The account configuration could not be loaded. Deleting the local account may leave remote meetings or rooms behind.") }}
        </p>
      </div>
      <div
        v-if="deletingVisioAccount"
        class="zoom-abandon-warning"
        data-testid="visio-delete-warning"
      >
        <strong>{{ t("Remote Visio rooms will remain.") }}</strong>
        <p>
          {{ t("Deleting this local account does not delete rooms already created in La Suite Visio. Goyav will forget its associations with those rooms, so remove them from Visio separately if they should no longer be available.") }}
        </p>
      </div>
    </ConfirmDialog>
</template>

<style scoped>
.settings-desktop {
  display: flex;
  gap: var(--panel-gap);
  height: 100%;
  padding-bottom: var(--panel-gap);
}

.settings-nav {
  width: 220px;
  flex-shrink: 0;
  background: var(--color-bg-secondary);
}

.settings-nav-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 36px;
  padding: 0 12px;
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--color-text-secondary);
  text-align: left;
  transition: background 0.12s;
}

.settings-nav-item svg {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.settings-nav-item:hover {
  background: var(--color-bg-hover);
}

.settings-nav-item.active {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.settings-nav-item.active svg {
  color: var(--color-accent);
}

.settings-nav-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-text-muted);
}

.settings-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* Same 48px strip as the mail and calendar toolbars. */
.settings-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 24px;
  border-bottom: 0.8px solid var(--color-border);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.settings-title {
  font-size: 15px;
  font-weight: 600;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
}

.settings-section {
  max-width: 720px;
}

.btn-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--color-accent);
  color: white;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.12s;
}

.btn-add:hover {
  background: var(--color-accent-hover);
}

.btn-add-lg {
  padding: 12px 24px;
  border-radius: 24px;
  font-size: 14px;
}

/* Zero accounts */
.accounts-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  margin: 48px auto 0;
  max-width: 420px;
}

.accounts-empty-logo {
  width: 88px;
  height: 88px;
  margin-bottom: 8px;
}

.accounts-empty-title {
  font-size: 20px;
  font-weight: 600;
}

.accounts-empty-text {
  font-size: 13px;
  line-height: 1.55;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

/* Accounts */
.account-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  overflow: hidden;
}

.account-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 16px;
  border-bottom: 1px solid var(--color-divider);
  transition: background 0.1s;
}

.account-card:last-child {
  border-bottom: none;
}

.account-card.clickable {
  cursor: pointer;
}

.account-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.account-card:hover {
  background: var(--color-bg-hover);
}

.account-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.account-card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-card-name {
  font-size: 14px;
  font-weight: 600;
}

.account-card-email {
  font-size: 12px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-card-type {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 500;
}

.account-card-actions {
  display: flex;
  gap: 4px;
}

.icon-btn-sm {
  width: 32px;
  height: 32px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transition: all 0.12s;
}

.icon-btn-sm:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text);
}

.icon-btn-sm.danger:hover {
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  color: var(--color-danger-text);
}

/* Appearance */
.settings-group {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  overflow: hidden;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 16px;
  border-bottom: 1px solid var(--color-divider);
}

.settings-row:last-child {
  border-bottom: none;
}

.settings-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-row-label {
  font-size: 13px;
  font-weight: 500;
}

.settings-row-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}

.segmented {
  display: flex;
  flex-shrink: 0;
  padding: 2px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.segmented-btn {
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.segmented-btn:hover {
  color: var(--color-text);
}

.segmented-btn.active {
  background: var(--color-bg);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
}

.settings-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-accent);
}

.settings-link:hover {
  text-decoration: underline;
}

/* Archived calendars */
.archive-settings {
  padding: 16px 16px;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.archive-settings button {
  color: var(--color-accent);
  text-decoration: underline;
}

/* About */
.about-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.about-card-logo {
  width: 56px;
  height: 56px;
}

.about-card-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.about-card-meta {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.zoom-abandon-warning {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid var(--color-danger);
  border-radius: 8px;
  background: rgba(194, 65, 12, 0.08);
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.45;
}

.zoom-abandon-warning p {
  margin: 8px 0 12px;
  color: var(--color-text-secondary);
}

.zoom-abandon-acknowledgement {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-weight: 500;
}

.zoom-abandon-acknowledgement input {
  margin-top: 2px;
}

/* ============================================================
   Mobile layout
   ============================================================ */
.settings-view.mobile {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 0;
  background: var(--color-bg-secondary);
  overflow: hidden;
}

.mobile-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 16px 40px;
}

.section {
  margin-top: 20px;
}

.section:first-child {
  margin-top: 4px;
}

.section-label {
  padding: 0 4px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.section-card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.mobile-account-item {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--color-border);
  border-left: 4px solid var(--acct-color, var(--color-accent));
}

.mobile-account-item:last-of-type {
  border-bottom: 0;
}

.mobile-account-row {
  flex: 1;
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 68px;
  padding: 12px 16px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.mobile-account-delete {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 72px;
  border: 0;
  border-left: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-danger);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.mobile-account-delete svg {
  width: 16px;
  height: 16px;
  stroke-width: 1.7;
}

.mobile-account-delete:focus-visible,
.mobile-account-row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.mobile-account-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.mobile-account-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mobile-account-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-account-email {
  font-size: 12px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-account-type {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.mobile-row-chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  stroke-width: 1.8;
  color: var(--color-text-muted);
}

.mobile-add-account {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 44px;
  background: var(--color-accent-light);
  border: 1px dashed var(--color-accent);
  color: var(--color-accent);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.mobile-add-account svg {
  width: 16px;
  height: 16px;
  stroke-width: 1.8;
}

.mobile-setting-row {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0 16px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--color-border-soft, var(--color-border));
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  color: var(--color-text);
}

.mobile-setting-row:last-child {
  border-bottom: 0;
}

.mobile-setting-row.static {
  cursor: default;
}

.mobile-setting-row.toggle {
  position: relative;
  cursor: pointer;
}


.mobile-setting-label {
  flex: 1;
  min-width: 0;
}

.mobile-setting-value {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.toggle-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toggle-pill {
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: 999px;
  background: var(--color-border);
  transition: background 0.18s;
  flex-shrink: 0;
}

.toggle-pill.on {
  background: var(--color-accent);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.18s cubic-bezier(.2,.8,.2,1);
}

.toggle-pill.on .toggle-thumb {
  transform: translateX(18px);
}
</style>
