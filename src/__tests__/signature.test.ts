import { describe, expect, it } from "vitest";
import { htmlSignatureBody, htmlSignatureToText, isHtmlSignature } from "@/lib/signature";

describe("isHtmlSignature", () => {
  it.each([
    ["<!DOCTYPE html><html></html>", true],
    ["  \n<table><tr><td>x</td></tr></table>", true],
    ["<p>Hi</p>", true],
    ["-- \nAndy\n<andy@example.com>", false],
    ["<andy@example.com>", false],
    ["", false],
  ])("%j → %s", (sig, expected) => {
    expect(isHtmlSignature(sig)).toBe(expected);
  });
});

describe("htmlSignatureBody", () => {
  it("keeps only the body, without comments or scripts", () => {
    const body = htmlSignatureBody(
      "<html><head><title>T</title></head><body><!-- note --><p>Hi</p><script>x()</script></body></html>",
    );
    expect(body).toBe("<p>Hi</p>");
  });
});

describe("htmlSignatureToText", () => {
  it("renders table rows as lines and adds link targets", () => {
    const text = htmlSignatureToText(`
      <table>
        <tr><td><img src="https://x/p.png" alt="Me"></td><td>
          <table>
            <tr><td>Andy Dodakal</td></tr>
            <tr><td>Senior
              Product Designer</td></tr>
          </table>
        </td></tr>
        <tr><td colspan="2">
          <span>&middot;</span>
          <a href="https://www.franceix.net">franceix.net</a>
          <span>&middot;</span>
          <a href="https://www.youtube.com/@x">YouTube</a>
        </td></tr>
      </table>`);
    expect(text).toBe(
      "Andy Dodakal\nSenior Product Designer\nfranceix.net · YouTube <https://www.youtube.com/@x>",
    );
  });
});
