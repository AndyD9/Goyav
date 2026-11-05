<script setup lang="ts">
/// Video-conferencing tabs (#148). Provider sign-in controls replace the
/// rest of the form because these account types have no mail, calendar,
/// or contacts surface to configure here.
///
/// `form` is the modal's shared AccountConfig draft, passed by
/// reference — inputs here bind straight into it (deliberate nested
/// prop mutation; all cross-type mutation stays in the modal).
import { computed } from "vue";
import { t } from "@/i18n";
import type { AccountConfig } from "@/lib/types";

const props = withDefaults(defineProps<{
  form: AccountConfig;
  accountType: "talk" | "matrix" | "zoom" | "visio";
  editing: boolean;
  signingIn: boolean;
  authStatus?: string | null;
  authenticationSupported?: boolean;
}>(), {
  authStatus: null,
  authenticationSupported: true,
});
const emit = defineEmits<{ signIn: [] }>();

const provider = computed(() => {
  switch (props.accountType) {
    case "matrix":
      return {
        urlLabel: t("Homeserver URL"),
        placeholder: "https://matrix.example.org",
        urlHint: t("Base URL of your Matrix homeserver. SSO will open in your browser."),
        signIn: t("Sign in with Matrix"),
        name: "Matrix",
      };
    case "visio":
      return {
        urlLabel: t("Visio instance URL"),
        placeholder: "https://visio.example.org",
        urlHint: t("Site root of your La Suite Visio instance. Sign-in opens in a restricted Chithi window."),
        signIn: t("Sign in with Visio"),
        name: "Visio",
      };
    case "zoom":
      return {
        urlLabel: "",
        placeholder: "",
        urlHint: "",
        signIn: t("Sign in with Zoom"),
        name: "Zoom",
      };
    case "talk":
      return {
        urlLabel: t("Nextcloud URL"),
        placeholder: "https://cloud.example.org",
        urlHint: t("Base URL of your Nextcloud server. Login Flow v2 will open in your browser."),
        signIn: t("Sign in with Nextcloud"),
        name: "Nextcloud",
      };
  }
});

const canReauthenticate = computed(
  () => props.accountType === "zoom" || props.accountType === "visio",
);
const needsUrl = computed(() => props.accountType !== "zoom");
const signInDisabled = computed(
  () => props.signingIn || (needsUrl.value && !props.form.meet_url.trim()),
);
</script>

<template>
  <!-- URL input hidden on Zoom because Zoom is hosted —
       there's no per-user server to type. Talk and
       Matrix both need the user's instance URL. -->
  <div v-if="needsUrl" class="form-group">
    <label>{{ provider.urlLabel }}</label>
    <input
      v-model="form.meet_url"
      type="url"
      :placeholder="provider.placeholder"
      :disabled="signingIn || (editing && accountType === 'visio')"
      :data-testid="`${accountType}-url`"
    />
    <span class="field-hint">{{ provider.urlHint }}</span>
  </div>
  <!-- Talk and Matrix still create a new account through their login
       flows, so their edit forms keep the delete-and-add guidance.
       Zoom can update an existing account's OAuth credentials. -->
  <div v-if="authenticationSupported !== false && (!editing || canReauthenticate)" class="form-group">
    <button
      type="button"
      class="btn-oauth"
      :disabled="signInDisabled"
      :aria-busy="signingIn"
      :data-testid="`${accountType}-signin-btn`"
      @click="emit('signIn')"
    >
      <svg v-if="!signingIn" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      {{
        signingIn
          ? t('Waiting for browser…')
          : editing
            ? t('Sign in again with {name}', { name: provider.name })
            : provider.signIn
      }}
    </button>
    <span class="field-hint">
      {{ t('Opens your browser to authenticate.') }} {{
        accountType === 'zoom'
          ? t('Chithi receives an OAuth token tied to your Zoom account.')
          : accountType === 'visio'
            ? t('Chithi stores a short-lived room-creation token in your OS keyring. Sign in again after it expires. Visio rooms remain on the server when calendar events are deleted.')
          : t('Your real password never reaches Chithi — we keep a long-lived app token tied to this device.')
      }}
    </span>
    <span v-if="authStatus" class="field-hint" data-testid="meet-auth-status">
      {{ authStatus }}
    </span>
  </div>
  <div v-else-if="authenticationSupported === false" class="form-group">
    <span class="field-hint">
      {{ t('La Suite Visio sign-in is available in the desktop app. You can still rename or delete this account here.') }}
    </span>
  </div>
  <div v-else class="form-group">
    <span class="field-hint">
      {{ t('To re-authenticate, delete this account and add it again. The session token is stored once and stays valid until you sign out from the {server} server.', { server: accountType === 'matrix' ? 'Matrix' : 'Nextcloud' }) }}
    </span>
  </div>
</template>
