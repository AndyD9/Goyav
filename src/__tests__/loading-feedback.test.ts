import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";

vi.mock("@/lib/tauri", () => ({
  getInviteStatus: vi.fn().mockResolvedValue(null),
  respondToInvite: vi.fn().mockResolvedValue(undefined),
  copyMessages: vi.fn().mockResolvedValue(undefined),
  getMessages: vi.fn().mockResolvedValue({ messages: [], total: 0, page: 0, per_page: 100 }),
  getLastView: vi.fn().mockResolvedValue({ account_id: null, folder_path: null }),
  saveLastView: vi.fn().mockResolvedValue(undefined),
  listFolders: vi.fn().mockResolvedValue([]),
  triggerSync: vi.fn().mockResolvedValue(undefined),
  getThreadedMessages: vi.fn().mockResolvedValue({
    threads: [], total_threads: 0, total_messages: 0, page: 0, per_page: 100,
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import InviteCard from "@/components/calendar/InviteCard.vue";
import MessageList from "@/components/mail/MessageList.vue";
import * as api from "@/lib/tauri";
import { useToasts } from "@/lib/toast";
import { withProgressToast } from "@/lib/loading";
import { useMessagesStore } from "@/stores/messages";
import { useAccountsStore } from "@/stores/accounts";
import { useFoldersStore } from "@/stores/folders";
import { useUiStore } from "@/stores/ui";
import type { ParsedInvite } from "@/lib/types";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  useToasts().value = [];
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("withProgressToast", () => {
  it("shows a loading toast only for slow work and removes it when the work ends", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let finish: () => void = () => {};
    const pending = withProgressToast("Working…", () => new Promise<void>((r) => { finish = r; }));
    vi.advanceTimersByTime(100);
    expect(useToasts().value).toEqual([]);
    vi.advanceTimersByTime(200);
    expect(useToasts().value.map((toast) => [toast.type, toast.message])).toEqual([
      ["loading", "Working…"],
    ]);
    finish();
    await pending;
    expect(useToasts().value).toEqual([]);

    // Fast work never shows a toast.
    await withProgressToast("Quick…", async () => {});
    vi.advanceTimersByTime(500);
    expect(useToasts().value).toEqual([]);
  });
});

describe("InviteCard busy state", () => {
  const invite: ParsedInvite = {
    method: "REQUEST",
    uid: "uid-1",
    summary: "Planning",
    description: null,
    location: null,
    dtstart: "2026-04-03T10:00:00Z",
    dtend: "2026-04-03T11:00:00Z",
    all_day: false,
    timezone: null,
    organizer_email: "boss@example.com",
    organizer_name: null,
    attendees: [],
    recurrence_rule: null,
    sequence: 0,
  };

  it("marks only the clicked response button aria-busy while it is sent", async () => {
    let finish: () => void = () => {};
    vi.mocked(api.respondToInvite).mockImplementationOnce(
      () => new Promise<void>((resolve) => { finish = resolve; }),
    );
    const wrapper = mount(InviteCard, {
      props: { invite, messageId: "msg1", sourceAccountId: "acc1" },
    });
    await flushPromises();

    await wrapper.get('[data-testid="invite-tentative"]').trigger("click");
    const accept = wrapper.get('[data-testid="invite-accept"]');
    const maybe = wrapper.get('[data-testid="invite-tentative"]');
    const decline = wrapper.get('[data-testid="invite-decline"]');
    expect(maybe.attributes("aria-busy")).toBe("true");
    expect(accept.attributes("aria-busy")).toBe("false");
    expect(decline.attributes("aria-busy")).toBe("false");
    expect((accept.element as HTMLButtonElement).disabled).toBe(true);

    finish();
    await flushPromises();
    expect(wrapper.text()).toContain("You tentatively accepted this invite.");
  });
});

describe("MessageList loading states", () => {
  function mountList() {
    const accounts = useAccountsStore();
    accounts.accounts = [
      {
        id: "acc1", display_name: "Test", email: "t@t.com",
        provider: "generic", mail_protocol: "imap" as const, enabled: true,
        mail_sync_interval_seconds: null,
        calendar_sync_interval_seconds: null,
        contacts_sync_interval_seconds: null,
        username: "",
        has_calendar_binding: false,
        has_contacts_binding: false,
        meet_protocol: "",
      },
    ];
    accounts.activeAccountId = "acc1";
    useFoldersStore().activeFolderPath = "INBOX";
    useUiStore().threadingEnabled = false;
    const router = createRouter({
      history: createWebHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
    return mount(MessageList, { global: { plugins: [router] } });
  }

  it("shows a spinner placeholder while the first page loads, and an inline one for the next page", async () => {
    const store = useMessagesStore();
    store.loading = true;
    const wrapper = mountList();

    const placeholder = wrapper.get('[data-testid="loading-state"]');
    expect(placeholder.attributes("role")).toBe("status");
    expect(placeholder.text()).toBe("Loading messages…");
    expect(placeholder.find('[data-testid="spinner"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("No messages");

    store.loading = false;
    store.messages = [{
      id: "m1", subject: "Hello", from_name: "A", from_email: "a@x.org",
      date: "2026-04-03T00:00:00Z", flags: ["seen"], has_attachments: false,
      is_encrypted: false, is_signed: false, snippet: null,
    } as never];
    store.loadingMore = true;
    await wrapper.vm.$nextTick();
    const footer = wrapper.get(".loading-more");
    expect(footer.classes()).toContain("inline");
    expect(footer.text()).toBe("Loading more...");
  });
});
