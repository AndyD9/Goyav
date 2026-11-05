// The frontend bindings (src/lib/tauri.ts and a few direct invoke calls)
// are written by hand, so nothing ties a command name to the Rust side.
// A typo or a renamed command only fails at runtime with "command not
// found". This test reads both sides and fails on any mismatch.
import { describe, expect, it } from "vitest";

// Every frontend source file, as raw text.
const SOURCES = import.meta.glob(["../**/*.ts", "../**/*.vue", "!../__tests__/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const RUST_LIB = Object.values(
  import.meta.glob("../../src-tauri/src/lib.rs", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
)[0];

/// Command names from `generate_handler![...]`, in order, duplicates kept.
function registeredCommandNames(): string[] {
  const block = RUST_LIB?.match(/generate_handler!\[([\s\S]*?)\]/);
  if (!block) throw new Error("generate_handler! not found in lib.rs");
  return block[1]
    .replace(/\/\/.*$/gm, "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    // `commands::accounts::add_account` is invoked as `add_account`.
    .map((path) => path.split("::").pop()!);
}

/// Command name -> files that invoke it.
function invokedCommands(): Map<string, Set<string>> {
  const invoked = new Map<string, Set<string>>();
  const call = /\binvoke\s*(?:<[^()]*>)?\s*\(\s*(["'`])([^"'`]+)\1/g;
  for (const [file, text] of Object.entries(SOURCES)) {
    for (const match of text.matchAll(call)) {
      const name = match[2];
      // Plugin commands ("plugin:dialog|open") are registered by Tauri.
      if (name.startsWith("plugin:")) continue;
      const files = invoked.get(name) ?? new Set<string>();
      files.add(file);
      invoked.set(name, files);
    }
  }
  return invoked;
}

describe("Tauri command bindings", () => {
  it("finds both sides", () => {
    expect(registeredCommandNames().length).toBeGreaterThan(100);
    expect(invokedCommands().size).toBeGreaterThan(100);
  });

  it("only invokes commands registered in generate_handler!", () => {
    const registered = new Set(registeredCommandNames());
    const missing = [...invokedCommands()]
      .filter(([name]) => !registered.has(name))
      .map(([name, files]) => `${name} (${[...files].join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("registers each command name once", () => {
    const names = registeredCommandNames();
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    expect(duplicates).toEqual([]);
  });
});
