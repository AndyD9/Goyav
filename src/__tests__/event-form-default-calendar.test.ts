import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/lib/tauri", () => ({
  listRoomSuggestions: vi.fn().mockResolvedValue([]),
  checkRoomAvailability: vi.fn().mockResolvedValue({ state: "unknown", busy_start: null, busy_end: null }),
  getParticipantSchedules: vi.fn().mockResolvedValue([]),
  meetCreateUrl: vi.fn(),
  meetDiscardPending: vi.fn(),
  sendInvites: vi.fn(),
}));

import EventForm from "@/components/calendar/EventForm.vue";
import { useAccountsStore } from "@/stores/accounts";
import { useCalendarStore } from "@/stores/calendar";
import { useUiStore } from "@/stores/ui";
import type { Calendar } from "@/lib/types";

const SelectStub = {
  props: ["modelValue", "options"],
  template: `<div data-testid="calendar-select" :data-value="modelValue">
    <span v-for="o in options" :key="o.value" class="opt" :data-id="o.value" />
  </div>`,
};

function calendar(id: string, accountId: string, remoteId: string | null, isDefault: boolean): Calendar {
  return {
    id, account_id: accountId, name: id, color: "#4285f4",
    is_default: isDefault, remote_id: remoteId, is_subscribed: true,
  };
}

function account(id: string, provider: string) {
  return {
    id, display_name: id, email: `${id}@example.com`, username: id, provider,
    mail_protocol: "imap", enabled: true, mail_sync_interval_seconds: null,
    calendar_sync_interval_seconds: null, contacts_sync_interval_seconds: null,
    has_calendar_binding: true, has_contacts_binding: false, meet_protocol: "",
  } as any;
}

function mountForm() {
  return mount(EventForm, {
    global: {
      stubs: {
        RecurrenceEditor: { template: "<div />" },
        AttendeeEditor: { template: "<div />" },
        TimeInput: { template: "<input />" },
        DateInput: { template: "<input />" },
        Select: SelectStub,
      },
    },
  });
}

describe("EventForm default calendar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useUiStore().displayTimezone = "UTC";
  });

  it("skips a local placeholder on a provider account and preselects the provider default", () => {
    const accounts = useAccountsStore();
    accounts.accounts = [account("gmail", "gmail"), account("local", "generic")];
    accounts.activeAccountId = "gmail";
    // Sorted as the backend returns them: defaults first, then by name.
    useCalendarStore().calendars = [
      calendar("Calendar", "gmail", null, true),
      calendar("primary", "gmail", "me@example.com", true),
      calendar("team", "gmail", "team@group.calendar.google.com", false),
      calendar("offline", "local", null, true),
    ];

    const select = mountForm().get('[data-testid="calendar-select"]');
    expect(select.attributes("data-value")).toBe("primary");
    const offered = select.findAll(".opt").map((o) => o.attributes("data-id"));
    expect(offered).toEqual(["primary", "team", "offline"]);
  });
});
