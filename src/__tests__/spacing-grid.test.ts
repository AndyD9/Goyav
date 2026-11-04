// Spacing, sizes, offsets and radii in the app's CSS sit on a 4px grid.
// Allowed off-grid: 1px hairlines, 2px half-steps and 999px+ pill radii.
// Typography (font-size, line-height) follows its own scale.
import { describe, it, expect } from "vitest";

// Every stylesheet and component of the app, as raw text.
const SOURCES = import.meta.glob(["../**/*.vue", "../**/*.css", "!../__tests__/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const PROP =
  /^(margin|padding)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap)$|^(top|right|bottom|left|inset)$|^(min-|max-)?(width|height)$|^flex-basis$|^flex$|^border(-(top|bottom)-(left|right))?-radius$/;

function cssOf(file: string, text: string): string {
  if (file.endsWith(".css")) return text;
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
}

describe("4px spacing grid", () => {
  it("keeps CSS spacing and sizes on multiples of 4px", () => {
    const offGrid: string[] = [];
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
    for (const [file, text] of Object.entries(SOURCES)) {
      for (const m of cssOf(file, text).matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+);/g)) {
        if (!PROP.test(m[1])) continue;
        for (const v of m[2].matchAll(/(\d*\.?\d+)px/g)) {
          const n = parseFloat(v[1]);
          if (n <= 2 || n >= 999 || n % 4 === 0) continue;
          offGrid.push(`${file}: ${m[1]}: ${m[2].trim()}`);
        }
      }
    }
    expect(offGrid).toEqual([]);
  });
});
