import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import type { AccountSignature } from "@/lib/types";

vi.mock("@/lib/tauri", () => ({
  pickSignatureFile: vi.fn(),
  getSignaturePreviewHtml: vi.fn(async (html: string) => html),
}));

import * as api from "@/lib/tauri";
import SignatureEditor from "@/components/settings/SignatureEditor.vue";

function mountEditor(initial: AccountSignature[]) {
  const wrapper = mount(SignatureEditor, {
    props: {
      modelValue: initial,
      "onUpdate:modelValue": (value: AccountSignature[]) => wrapper.setProps({ modelValue: value }),
    },
  });
  return wrapper;
}

const current = (wrapper: ReturnType<typeof mountEditor>) =>
  wrapper.props("modelValue") as AccountSignature[];

describe("SignatureEditor", () => {
  beforeEach(() => vi.mocked(api.pickSignatureFile).mockReset());

  it("adds a first signature as the default", async () => {
    const wrapper = mountEditor([]);
    expect(wrapper.find('[data-testid="signature-empty"]').exists()).toBe(true);
    await wrapper.get('[data-testid="signature-add"]').trigger("click");
    expect(current(wrapper)).toHaveLength(1);
    expect(current(wrapper)[0].is_default).toBe(true);
    expect(current(wrapper)[0].name).toBe("Signature 1");
  });

  it("edits, switches the default and deletes", async () => {
    const wrapper = mountEditor([
      { id: "a", name: "Work", body: "W", is_default: true },
      { id: "b", name: "Short", body: "S", is_default: false },
    ]);
    const items = wrapper.findAll('[data-testid="signature-item"]');
    await items[1].trigger("click");
    await wrapper.get('[data-testid="signature-body"]').setValue("-- \nA.");
    await wrapper.get('[data-testid="signature-default"]').setValue(true);
    expect(current(wrapper).map((s) => [s.id, s.body, s.is_default])).toEqual([
      ["a", "W", false],
      ["b", "-- \nA.", true],
    ]);

    // Deleting the default hands it to the first remaining signature.
    await wrapper.get('[data-testid="signature-delete"]').trigger("click");
    expect(current(wrapper)).toEqual([{ id: "a", name: "Work", body: "W", is_default: true }]);
  });

  it("imports an HTML file as a new signature and previews it", async () => {
    vi.mocked(api.pickSignatureFile).mockResolvedValue({
      name: "newsletter",
      content: "<table><tr><td><b>Andy</b></td></tr></table>",
    });
    const wrapper = mountEditor([{ id: "a", name: "Work", body: "W", is_default: true }]);
    await wrapper.get('[data-testid="signature-import"]').trigger("click");
    await flushPromises();
    const list = current(wrapper);
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ name: "newsletter", is_default: false });
    expect(wrapper.find('[data-testid="signature-preview"]').exists()).toBe(true);
  });

  it("keeps the list unchanged when the picker is cancelled or fails", async () => {
    vi.mocked(api.pickSignatureFile).mockResolvedValueOnce(null);
    const wrapper = mountEditor([]);
    await wrapper.get('[data-testid="signature-import"]').trigger("click");
    await flushPromises();
    expect(current(wrapper)).toEqual([]);

    vi.mocked(api.pickSignatureFile).mockRejectedValueOnce(new Error("too big"));
    await wrapper.get('[data-testid="signature-import"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Could not read the file: too big");
  });
});
