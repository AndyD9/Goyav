import { afterEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import ModalShell from "@/components/common/ModalShell.vue";

function bodyEl<T extends Element = HTMLElement>(selector: string): T | null {
  return document.body.querySelector<T>(selector);
}

function press(target: Element, key: string, shiftKey = false) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ConfirmDialog", () => {
  function mountDialog(
    props: Partial<{ busy: boolean; error: string | null }> = {},
  ) {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: { open: true, title: "Delete thing", message: "Sure?", testId: "thing", ...props },
    });
    return { wrapper, opener };
  }

  it("is a labelled alertdialog that starts on Cancel", async () => {
    mountDialog();
    await flushPromises();
    const dialog = bodyEl('[role="alertdialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const title = document.getElementById(dialog.getAttribute("aria-labelledby")!);
    expect(title?.textContent).toBe("Delete thing");
    const message = document.getElementById(dialog.getAttribute("aria-describedby")!);
    expect(message?.textContent).toBe("Sure?");
    expect(document.activeElement?.textContent?.trim()).toBe("Cancel");
  });

  it("cancels on Escape and confirms on the button", async () => {
    const { wrapper } = mountDialog();
    await flushPromises();
    press(bodyEl('[role="alertdialog"]')!, "Escape");
    expect(wrapper.emitted("cancel")).toHaveLength(1);

    bodyEl<HTMLButtonElement>('[data-testid="thing-confirm"]')!.click();
    expect(wrapper.emitted("confirm")).toHaveLength(1);
  });

  it("cannot be dismissed while busy", async () => {
    const { wrapper } = mountDialog({ busy: true });
    await flushPromises();
    press(bodyEl('[role="alertdialog"]')!, "Escape");
    bodyEl<HTMLElement>(".modal-overlay")!.click();
    expect(wrapper.emitted("cancel")).toBeUndefined();

    const confirm = bodyEl<HTMLButtonElement>('[data-testid="thing-confirm"]')!;
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toContain("Deleting");
    expect(confirm.querySelector(".btn-spinner")).not.toBeNull();
  });

  it("keeps Tab inside the dialog", async () => {
    mountDialog();
    await flushPromises();
    const dialog = bodyEl('[role="alertdialog"]')!;
    const [cancel, confirm] = dialog.querySelectorAll("button");

    confirm.focus();
    press(dialog, "Tab");
    expect(document.activeElement).toBe(cancel);

    cancel.focus();
    press(dialog, "Tab", true);
    expect(document.activeElement).toBe(confirm);
  });

  it("returns focus to the opener when closed", async () => {
    const { wrapper, opener } = mountDialog();
    await flushPromises();
    expect(document.activeElement).not.toBe(opener);
    await wrapper.setProps({ open: false });
    await flushPromises();
    expect(document.activeElement).toBe(opener);
  });

  it("shows an error as an alert", async () => {
    mountDialog({ error: "Server said no" });
    await flushPromises();
    const error = bodyEl('[data-testid="thing-error"]')!;
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toContain("Server said no");
  });
});

describe("ModalShell", () => {
  it("is a labelled dialog with a named close button that closes on Escape", async () => {
    const wrapper = mount(ModalShell, {
      attachTo: document.body,
      props: { open: true, title: "Settings" },
      slots: { default: "<input data-testid='field' />" },
    });
    await flushPromises();

    const dialog = bodyEl('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent)
      .toBe("Settings");
    expect(bodyEl(".modal-close")!.getAttribute("aria-label")).toBe("Close");
    expect(dialog.contains(document.activeElement)).toBe(true);

    press(dialog, "Escape");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
