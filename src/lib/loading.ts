// Feedback for slow work, in two strengths:
//
// - withLoading(): a full-window overlay that blocks the UI. For work the
//   user has to wait on before doing anything else (opening an account's
//   settings, installing an update).
// - withProgressToast(): a non-blocking toast with a spinner. For background
//   actions the user can carry on past (mark a folder read, save a file).
//
// Both wait a short delay before showing anything, so fast calls don't
// flash a spinner.
import { computed, ref } from "vue";
import { dismissToast, showToast } from "./toast";

const SHOW_DELAY_MS = 250;

export interface LoadingTask {
  id: number;
  label: string;
  detail?: string;
  /** 0..1 when the work can report it, otherwise indeterminate. */
  progress?: number | null;
  visible: boolean;
}

const tasks = ref<LoadingTask[]>([]);
let nextId = 0;

export interface LoadingHandle {
  id: number;
  update(patch: Partial<Pick<LoadingTask, "label" | "detail" | "progress">>): void;
  done(): void;
}

/** Start an overlay task; call `done()` when the work finishes. */
export function beginLoading(
  label: string,
  options: { detail?: string; delayMs?: number } = {},
): LoadingHandle {
  const id = nextId++;
  const delayMs = options.delayMs ?? SHOW_DELAY_MS;
  tasks.value = [...tasks.value, { id, label, detail: options.detail, visible: delayMs <= 0 }];
  const timer =
    delayMs > 0
      ? setTimeout(() => patch(id, { visible: true }), delayMs)
      : null;
  return {
    id,
    update: (changes) => patch(id, changes),
    done() {
      if (timer) clearTimeout(timer);
      tasks.value = tasks.value.filter((task) => task.id !== id);
    },
  };
}

function patch(id: number, changes: Partial<LoadingTask>) {
  tasks.value = tasks.value.map((task) => (task.id === id ? { ...task, ...changes } : task));
}

/** Run `work` behind the blocking overlay. */
export async function withLoading<T>(
  label: string,
  work: () => Promise<T>,
  options: { detail?: string; delayMs?: number } = {},
): Promise<T> {
  const handle = beginLoading(label, options);
  try {
    return await work();
  } finally {
    handle.done();
  }
}

/** The task the overlay shows: the most recent visible one. */
export function useLoadingOverlay() {
  return computed(() => {
    const visible = tasks.value.filter((task) => task.visible);
    return visible.length > 0 ? visible[visible.length - 1] : null;
  });
}

/** Run `work` with a spinner toast that stays until it finishes. */
export async function withProgressToast<T>(
  message: string,
  work: () => Promise<T>,
  options: { delayMs?: number } = {},
): Promise<T> {
  let toastId: number | null = null;
  const timer = setTimeout(() => {
    toastId = showToast(message, "loading", 0);
  }, options.delayMs ?? SHOW_DELAY_MS);
  try {
    return await work();
  } finally {
    clearTimeout(timer);
    if (toastId !== null) dismissToast(toastId);
  }
}

/** Test hook: forget every task. */
export function resetLoadingForTests() {
  tasks.value = [];
}
