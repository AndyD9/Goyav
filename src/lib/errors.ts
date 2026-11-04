/// Human-readable text for a caught value. Tauri command errors arrive as
/// plain strings, JS failures as `Error` instances.
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}
