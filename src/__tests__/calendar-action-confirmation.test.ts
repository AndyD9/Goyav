// These prompts gate destructive calendar changes (replacing a meeting's
// identity, wiping recurrence exceptions). Each test checks that a "no"
// stops the action and that only what the user agreed to is confirmed.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ message: vi.fn() }));

import { message } from "@tauri-apps/plugin-dialog";
import {
  chooseRescheduleScope,
  confirmCalendarAction,
} from "@/lib/calendar-action-confirmation";
import type { CalendarActionPlan } from "@/lib/types";

const dialog = vi.mocked(message);

function plan(requires: Partial<CalendarActionPlan["requires"]> = {}): CalendarActionPlan {
  return {
    operation_id: "op-1",
    requires: {
      replacement_meeting_identity: false,
      reset_exceptions: false,
      ...requires,
    },
    preview: {} as CalendarActionPlan["preview"],
  };
}

/** Queue the label of the button the user clicks for each dialog. */
function answers(...labels: string[]) {
  for (const label of labels) dialog.mockResolvedValueOnce(label);
}

beforeEach(() => {
  dialog.mockReset();
});

describe("confirmCalendarAction", () => {
  it("asks nothing when the plan needs no confirmation", async () => {
    await expect(confirmCalendarAction(plan())).resolves.toEqual({
      replacement_meeting_identity: false,
      reset_exceptions: false,
    });
    expect(dialog).not.toHaveBeenCalled();
  });

  it("confirms a replacement meeting identity only after the user agrees", async () => {
    answers("Move Series");
    await expect(
      confirmCalendarAction(plan({ replacement_meeting_identity: true })),
    ).resolves.toEqual({ replacement_meeting_identity: true, reset_exceptions: false });
    expect(dialog.mock.calls[0][0]).toContain("replacement meeting identity");
    expect(dialog.mock.calls[0][1]).toMatchObject({ kind: "warning" });
  });

  it("aborts when the replacement identity is refused", async () => {
    answers("Cancel");
    await expect(
      confirmCalendarAction(plan({ replacement_meeting_identity: true, reset_exceptions: true })),
    ).resolves.toBeNull();
    // The second prompt is never shown.
    expect(dialog).toHaveBeenCalledTimes(1);
  });

  it("asks before moving a series even without a replacement identity", async () => {
    answers("Move Series");
    await expect(
      confirmCalendarAction(plan(), { confirmSeriesMove: true }),
    ).resolves.toEqual({ replacement_meeting_identity: false, reset_exceptions: false });
    expect(dialog.mock.calls[0][0]).toBe(
      "Move the entire recurring series to the destination calendar?",
    );
  });

  it("requires a separate yes to reset exceptions", async () => {
    answers("Move Series", "Cancel");
    await expect(
      confirmCalendarAction(plan({ replacement_meeting_identity: true, reset_exceptions: true })),
    ).resolves.toBeNull();

    answers("Move Series", "Reset Exceptions");
    await expect(
      confirmCalendarAction(plan({ replacement_meeting_identity: true, reset_exceptions: true })),
    ).resolves.toEqual({ replacement_meeting_identity: true, reset_exceptions: true });
  });

  it("accepts the platform's default Ok label", async () => {
    answers("Ok");
    await expect(
      confirmCalendarAction(plan({ reset_exceptions: true })),
    ).resolves.toEqual({ replacement_meeting_identity: false, reset_exceptions: true });
  });
});

describe("chooseRescheduleScope", () => {
  it("offers only the whole series when a single occurrence is not allowed", async () => {
    answers("Entire Series");
    await expect(chooseRescheduleScope(false)).resolves.toBe("entire-series");
    answers("Cancel");
    await expect(chooseRescheduleScope(false)).resolves.toBeNull();
  });

  it("maps the three answers, including platform default labels", async () => {
    answers("This Occurrence", "Entire Series", "Yes", "No", "Cancel");
    await expect(chooseRescheduleScope(true)).resolves.toBe("this-occurrence");
    await expect(chooseRescheduleScope(true)).resolves.toBe("entire-series");
    await expect(chooseRescheduleScope(true)).resolves.toBe("this-occurrence");
    await expect(chooseRescheduleScope(true)).resolves.toBe("entire-series");
    await expect(chooseRescheduleScope(true)).resolves.toBeNull();
  });
});
