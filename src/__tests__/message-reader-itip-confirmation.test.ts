// Security regression: iTIP REPLY/CANCEL parts in a received message must not
// change calendar state just because the message was opened. They are applied
// only after an explicit click (the backend also binds them to the sender).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@/lib/tauri", () => ({
  getEmailInvites: vi.fn().mockResolvedValue([]),
  processInviteReply: vi.fn().mockResolvedValue(1),
  processCancelledInvite: vi.fn().mockResolvedValue(1),
  getInviteStatus: vi.fn().mockResolvedValue(null),
  listArchivedGraphCalendars: vi.fn().mockResolvedValue([]),
  getEvents: vi.fn().mockResolvedValue([]),
  listCalendars: vi.fn().mockResolvedValue([]),
  listCalendarOccurrences: vi.fn().mockResolvedValue({
    occurrences: [], has_more: false, needs_hydration: [], unresolved: [],
  }),
}));

vi.mock("@/lib/compose-window", () => ({
  openComposeWindow: vi.fn(),
}));

import MessageReader from "@/components/mail/MessageReader.vue";
import { useAccountsStore } from "@/stores/accounts";
import { useMessagesStore } from "@/stores/messages";
import * as api from "@/lib/tauri";
import type { Account, MessageBody, ParsedInvite } from "@/lib/types";

const account: Account = {
  id: "acc1",
  display_name: "Personal",
  email: "me@example.test",
  username: "me@example.test",
  provider: "generic",
  mail_protocol: "imap",
  enabled: true,
  mail_sync_interval_seconds: null,
  calendar_sync_interval_seconds: null,
  contacts_sync_interval_seconds: null,
  has_calendar_binding: true,
  has_contacts_binding: false,
  meet_protocol: "",
};

function invite(method: string): ParsedInvite {
  return {
    method,
    uid: `${method.toLowerCase()}@example.test`,
    summary: "Weekly sync",
    description: null,
    location: null,
    dtstart: "2026-11-10T09:00:00Z",
    dtend: "2026-11-10T10:00:00Z",
    all_day: false,
    timezone: null,
    organizer_email: "organizer@example.test",
    organizer_name: null,
    attendees: [],
    recurrence_rule: null,
    sequence: 0,
  };
}

const message: MessageBody = {
  id: "message1",
  subject: "quick note",
  from: { email: "attendee@example.test", name: "Attendee" },
  to: [],
  cc: [],
  date: "2026-11-04T07:00:00Z",
  flags: [],
  body_html: null,
  body_text: "see you soon",
  attachments: [],
  is_encrypted: false,
  is_signed: false,
  list_id: null,
  has_remote_images: false,
};

let wrapper: VueWrapper | null = null;

async function openMessage(invites: ParsedInvite[]) {
  vi.mocked(api.getEmailInvites).mockResolvedValue(invites);
  const accountsStore = useAccountsStore();
  accountsStore.accounts = [account];
  accountsStore.activeAccountId = account.id;
  const messagesStore = useMessagesStore();
  wrapper = mount(MessageReader, { attachTo: document.body });
  messagesStore.activeMessageId = message.id;
  await nextTick();
  messagesStore.activeMessage = { ...message };
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
});

describe("MessageReader iTIP REPLY/CANCEL", () => {
  it("does not apply CANCEL or REPLY when the message is opened", async () => {
    const reader = await openMessage([invite("CANCEL"), invite("REPLY")]);

    expect(api.getEmailInvites).toHaveBeenCalledWith("acc1", "message1");
    expect(api.processCancelledInvite).not.toHaveBeenCalled();
    expect(api.processInviteReply).not.toHaveBeenCalled();
    expect(reader.find('[data-testid="itip-apply-cancel"]').exists()).toBe(true);
    expect(reader.find('[data-testid="itip-apply-reply"]').exists()).toBe(true);
  });

  it("applies a CANCEL only after an explicit click", async () => {
    const reader = await openMessage([invite("CANCEL")]);

    await reader.get('[data-testid="itip-apply-cancel"]').trigger("click");
    await flushPromises();

    expect(api.processCancelledInvite).toHaveBeenCalledTimes(1);
    expect(api.processCancelledInvite).toHaveBeenCalledWith("acc1", "message1");
    expect(reader.get('[data-testid="itip-outcome"]').text())
      .toContain("Event removed from your calendar.");
  });

  it("explains when the backend refuses a REPLY from a non-attendee", async () => {
    vi.mocked(api.processInviteReply).mockResolvedValue(0);
    const reader = await openMessage([invite("REPLY")]);

    await reader.get('[data-testid="itip-apply-reply"]').trigger("click");
    await flushPromises();

    expect(api.processInviteReply).toHaveBeenCalledWith("acc1", "message1");
    expect(reader.get('[data-testid="itip-outcome"]').text()).toContain("Not applied");
    expect(reader.find('[data-testid="itip-apply-reply"]').exists()).toBe(true);
  });
});
