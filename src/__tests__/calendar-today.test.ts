import { describe, expect, it } from "vitest";
import { isCalendarToday } from "@/lib/calendar-days";

describe("isCalendarToday", () => {
  // 23:30 UTC on 4 Nov is already 5 Nov in Tokyo and still 4 Nov in New York.
  const now = new Date("2026-11-04T23:30:00Z");

  it("uses the display timezone, not the system one", () => {
    const nov4 = new Date(2026, 10, 4);
    const nov5 = new Date(2026, 10, 5);

    expect(isCalendarToday(nov4, "America/New_York", now)).toBe(true);
    expect(isCalendarToday(nov5, "America/New_York", now)).toBe(false);

    expect(isCalendarToday(nov4, "Asia/Tokyo", now)).toBe(false);
    expect(isCalendarToday(nov5, "Asia/Tokyo", now)).toBe(true);
  });

  it("ignores the time of day of the grid date", () => {
    const lateNov4 = new Date(2026, 10, 4, 23, 59);
    expect(isCalendarToday(lateNov4, "UTC", now)).toBe(true);
  });
});
