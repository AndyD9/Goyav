<script setup lang="ts">
// Confirmation for a destructive or irreversible action. While `busy`,
// the action is in flight and cannot be cancelled: both buttons are
// disabled and Escape / overlay clicks are ignored. A failure is shown in
// place via `error`, so the user can retry or cancel.
import { computed, ref, toRef } from "vue";
import { t } from "@/i18n";
import { dialogTitleId, useDialogFocus } from "@/lib/dialog-focus";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message?: string;
    confirmLabel?: string;
    busyLabel?: string;
    busy?: boolean;
    confirmDisabled?: boolean;
    error?: string | null;
    /** Prefix for data-testid on the confirm button and error. */
    testId?: string;
  }>(),
  {
    message: "",
    confirmLabel: undefined,
    busyLabel: undefined,
    busy: false,
    confirmDisabled: false,
    error: null,
    testId: "confirm-dialog",
  },
);
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const dialog = ref<HTMLElement | null>(null);
// Start on Cancel: Enter on a freshly opened destructive dialog must not
// confirm it.
const cancelButton = ref<HTMLElement | null>(null);
const titleId = dialogTitleId();
const messageId = `${titleId}-message`;

function cancel() {
  if (!props.busy) emit("cancel");
}

const { onKeydown } = useDialogFocus(toRef(props, "open"), dialog, cancel, cancelButton);

const label = computed(() =>
  props.busy ? (props.busyLabel ?? t("Deleting…")) : (props.confirmLabel ?? t("Delete")),
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="cancel">
      <div
        ref="dialog"
        class="modal modal-sm"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="message ? messageId : undefined"
        @keydown="onKeydown"
      >
        <div class="modal-body">
          <h3 :id="titleId" class="confirm-title">{{ title }}</h3>
          <p v-if="message" :id="messageId" class="confirm-text">{{ message }}</p>
          <slot />
          <p
            v-if="error"
            class="confirm-error"
            role="alert"
            :data-testid="`${testId}-error`"
          >
            {{ error }}
          </p>
        </div>
        <div class="modal-footer">
          <button
            ref="cancelButton"
            type="button"
            class="btn-secondary"
            :disabled="busy"
            @click="cancel"
          >
            {{ t("Cancel") }}
          </button>
          <button
            type="button"
            class="btn-danger"
            :data-testid="`${testId}-confirm`"
            :disabled="busy || confirmDisabled"
            :aria-busy="busy"
            @click="emit('confirm')"
          >
            <svg
              v-if="busy"
              class="btn-spinner"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
            </svg>
            {{ label }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  width: 400px;
  max-width: calc(100vw - 32px);
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.modal-body {
  padding: 20px;
}

.confirm-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.confirm-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.confirm-error {
  margin-top: 16px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--color-danger-text, var(--color-danger));
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border);
}

.btn-secondary,
.btn-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
}

.btn-secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text);
}

.btn-danger {
  background: var(--color-danger);
  color: white;
}

.btn-secondary:disabled,
.btn-danger:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn-secondary:focus-visible,
.btn-danger:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  animation: confirm-spin 0.8s linear infinite;
}

@keyframes confirm-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
