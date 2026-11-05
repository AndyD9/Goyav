<script setup lang="ts">
import { ref, toRef } from "vue";
import { t } from "@/i18n";
import { dialogTitleId, useDialogFocus } from "@/lib/dialog-focus";

defineOptions({ inheritAttrs: false });
const props = defineProps<{ open: boolean; title: string; modalClass?: string }>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLElement | null>(null);
const titleId = dialogTitleId();
const { onKeydown } = useDialogFocus(toRef(props, "open"), dialog, () => emit("close"));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="emit('close')">
      <div
        ref="dialog"
        class="modal"
        :class="modalClass"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        v-bind="$attrs"
        @keydown="onKeydown"
      >
        <div class="modal-header">
          <h3 :id="titleId">{{ title }}</h3>
          <button
            type="button"
            class="modal-close"
            :aria-label="t('Close')"
            @click="emit('close')"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  width: 480px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
}

.modal-close {
  font-size: 20px;
  color: var(--color-text-muted);
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
}

.modal:focus {
  outline: none;
}

.modal-close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border);
}

@media (max-width: 720px) {
  .modal-overlay {
    align-items: flex-end;
    background: rgba(20, 14, 6, 0.4);
  }

  .modal {
    width: 100%;
    max-width: 100%;
    height: calc(100vh - 48px);
    max-height: calc(100vh - 48px);
    border-radius: var(--radius-sheet, 16px) var(--radius-sheet, 16px) 0 0;
    box-shadow: var(--shadow-sheet, 0 -12px 30px rgba(30, 20, 10, 0.18));
    position: relative;
  }

  .modal::before {
    content: "";
    display: block;
    width: 40px;
    height: 4px;
    border-radius: 100px;
    background: var(--color-border);
    margin: 8px auto 4px;
  }

  .modal-header {
    justify-content: center;
    padding: 4px 16px 12px;
  }

  .modal-header h3 {
    font-size: 15px;
    flex: 1;
    text-align: center;
  }

  .modal-close {
    position: absolute;
    top: 16px;
    right: 12px;
  }
}
</style>
