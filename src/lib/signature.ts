// Account signatures are stored as one string. One that opens with a tag
// (e.g. pasted from an HTML signature file) is sent as HTML; anything
// else stays plain text inserted into the compose body.

const HTML_START = /^<(!|[a-z][a-z0-9]*[\s/>])/i;
const BLOCK_TAGS = "p,div,tr,li,h1,h2,h3,h4,h5,h6,table";

export function isHtmlSignature(signature: string): boolean {
  return HTML_START.test(signature.trim());
}

// Parse a signature (fragment or full document) down to its <body>,
// minus comments and scripts, which must never reach recipients.
function parseSignature(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const comment of comments) comment.parentNode?.removeChild(comment);
  doc.body.querySelectorAll("script").forEach((el) => el.remove());
  return doc.body;
}

/** The markup to embed after the message body. */
export function htmlSignatureBody(html: string): string {
  return parseSignature(html).innerHTML.trim();
}

/** Plaintext rendering for the text/plain part of the message. */
export function htmlSignatureToText(html: string): string {
  const body = parseSignature(html);
  const doc = body.ownerDocument;

  // Collapse source formatting first so only the breaks added below count.
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    node.nodeValue = (node.nodeValue ?? "").replace(/\s+/g, " ");
  }

  body.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    const label = (a.textContent ?? "").trim();
    if (/^https?:/i.test(href) && !href.includes(label)) a.append(` <${href}>`);
  });
  body.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  body.querySelectorAll(BLOCK_TAGS).forEach((el) => el.append("\n"));

  return (body.textContent ?? "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim().replace(/^[·|]\s*/, ""))
    .filter(Boolean)
    .join("\n");
}
