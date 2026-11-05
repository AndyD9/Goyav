import { ref } from "vue";

/** "loading" shows a spinner; pair it with durationMs 0 and dismissToast. */
export type ToastType = "info" | "success" | "error" | "loading";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

const toasts = ref<Toast[]>([]);
let nextId = 0;

export function showToast(
  message: string,
  type: ToastType = "info",
  durationMs = 3000,
) {
  const id = nextId++;
  toasts.value.push({ id, message, type });
  if (durationMs > 0) {
    setTimeout(() => dismissToast(id), durationMs);
  }
  return id;
}

export function dismissToast(id: number) {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}

export function useToasts() {
  return toasts;
}
