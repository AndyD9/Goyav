import { nextTick, onBeforeUnmount, watch, type Ref } from "vue";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

/**
 * Modal dialog keyboard behaviour: focus moves into the dialog when it
 * opens (to `initialFocus` if given), Tab and Shift+Tab stay inside it,
 * Escape asks to close, and focus returns to where it was on close.
 *
 * Bind the returned `onKeydown` to the dialog's root element.
 */
export function useDialogFocus(
  open: Ref<boolean>,
  dialog: Ref<HTMLElement | null>,
  onEscape: () => void,
  initialFocus?: Ref<HTMLElement | null>,
) {
  let returnFocus: HTMLElement | null = null;

  watch(
    open,
    async (isOpen) => {
      if (isOpen) {
        returnFocus = document.activeElement as HTMLElement | null;
        await nextTick();
        const container = dialog.value;
        if (!container) return;
        const target = initialFocus?.value ?? focusableIn(container)[0] ?? container;
        target.focus();
      } else {
        restoreFocus();
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(restoreFocus);

  function restoreFocus() {
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    returnFocus = null;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== "Tab" || !dialog.value) return;
    const items = focusableIn(dialog.value);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.value.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.value.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  return { onKeydown };
}

let nextDialogId = 0;

/** A unique id to tie a dialog to its title with aria-labelledby. */
export function dialogTitleId(): string {
  nextDialogId += 1;
  return `dialog-title-${nextDialogId}`;
}
