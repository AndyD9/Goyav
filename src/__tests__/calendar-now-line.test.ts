import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("@/lib/tauri", () => ({}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { useCalendarStore } from "@/stores/calendar";
import { useUiStore } from "@/stores/ui";
import WeekView from "@/components/calendar/WeekView.vue";

const HOUR_HEIGHT = 52;
let wrapper: VueWrapper | null = null;

function mountAt(iso: string, opts: { singleDay?: boolean; date?: string } = {}) {
  vi.setSystemTime(new Date(iso));
  setActivePinia(createPinia());
  const ui = useUiStore();
  ui.displayTimezone = "Europe/Paris";
  ui.timeFormat = "24";
  const calendar = useCalendarStore();
  if (opts.date) calendar.currentDate = opts.date;
  wrapper = mount(WeekView, { props: { singleDay: opts.singleDay } });
  return wrapper;
}

describe("WeekView current-time line", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
  });

  it("draws a line at the current time with the time label", () => {
    // 13:37 UTC is 14:37 in Paris.
    const view = mountAt("2026-11-12T13:37:20Z", { date: "2026-11-12" });
    const line = view.get('[data-testid="cal-now-line"]');
    const top = parseFloat((line.element as HTMLElement).style.top);
    expect(top).toBeCloseTo(14 * HOUR_HEIGHT + (37 / 60) * HOUR_HEIGHT, 3);
    expect(view.get('[data-testid="cal-now-time"]').text()).toBe("14:37");
    expect(view.find('[data-testid="cal-day-col-2026-11-12"] .now-marker').exists()).toBe(true);
  });

  it("moves with the clock on each minute boundary", async () => {
    const view = mountAt("2026-11-12T13:37:20Z", { date: "2026-11-12" });
    vi.advanceTimersByTime(41_000);
    await nextTick();
    expect(view.get('[data-testid="cal-now-time"]').text()).toBe("14:38");
  });

  it("is hidden when the shown week does not contain today", () => {
    const view = mountAt("2026-11-12T13:37:20Z", { date: "2026-12-03" });
    expect(view.find('[data-testid="cal-now-line"]').exists()).toBe(false);
    expect(view.find(".now-marker").exists()).toBe(false);
  });

  it("hides the hour label under the time badge", () => {
    const view = mountAt("2026-11-12T13:05:00Z", { date: "2026-11-12" });
    const labels = view.findAll(".hour-label");
    expect(labels[14].classes()).toContain("covered");
    expect(labels[15].classes()).not.toContain("covered");
  });
});
