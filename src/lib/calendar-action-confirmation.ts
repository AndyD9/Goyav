import { message as tauriMessage } from "@tauri-apps/plugin-dialog";
import { t } from "@/i18n";
import type {
  CalendarActionPlan,
  CalendarConfirmations,
} from "./types";

function matchesDialogAnswer(
  answer: string,
  label: string,
  fallback: string,
): boolean {
  return answer === label || answer === fallback;
}

async function confirmWarning(
  message: string,
  title: string,
  confirmLabel: string,
): Promise<boolean> {
  const answer = await tauriMessage(t(message), {
    title: t(title),
    kind: "warning",
    buttons: { ok: t(confirmLabel), cancel: t("Cancel") },
  });
  return matchesDialogAnswer(answer, t(confirmLabel), "Ok");
}

export async function confirmCalendarAction(
  plan: CalendarActionPlan,
  options: { confirmSeriesMove?: boolean } = {},
): Promise<CalendarConfirmations | null> {
  const confirmations: CalendarConfirmations = {
    replacement_meeting_identity: false,
    reset_exceptions: false,
  };
  if (options.confirmSeriesMove || plan.requires.replacement_meeting_identity) {
    const confirmed = await confirmWarning(
      plan.requires.replacement_meeting_identity
        ? "Moving this recurring meeting creates a replacement meeting identity in the destination calendar. Move the entire series?"
        : "Move the entire recurring series to the destination calendar?",
      "Move Recurring Meeting",
      "Move Series",
    );
    if (!confirmed) return null;
    confirmations.replacement_meeting_identity =
      plan.requires.replacement_meeting_identity;
  }
  if (plan.requires.reset_exceptions) {
    const confirmed = await confirmWarning(
      "This recurrence change removes existing exceptions. Continue?",
      "Reset Recurring Exceptions",
      "Reset Exceptions",
    );
    if (!confirmed) return null;
    confirmations.reset_exceptions = true;
  }
  return confirmations;
}

export async function chooseRescheduleScope(
  allowSingleOccurrence: boolean,
): Promise<"this-occurrence" | "entire-series" | null> {
  if (!allowSingleOccurrence) {
    const confirmed = await confirmWarning(
      "Reschedule the entire recurring series?",
      "Reschedule Recurring Event",
      "Entire Series",
    );
    return confirmed ? "entire-series" : null;
  }
  const answer = await tauriMessage(
    t("Apply this new time to only this occurrence or to the entire series?"),
    {
      title: t("Reschedule Recurring Event"),
      kind: "info",
      buttons: {
        yes: t("This Occurrence"),
        no: t("Entire Series"),
        cancel: t("Cancel"),
      },
    },
  );
  if (matchesDialogAnswer(answer, t("This Occurrence"), "Yes")) {
    return "this-occurrence";
  }
  if (matchesDialogAnswer(answer, t("Entire Series"), "No")) {
    return "entire-series";
  }
  return null;
}
