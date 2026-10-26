export type MailContentType = "text" | "html";

export interface PreprocessedMailBody {
  originalBody: string;
  processedBody: string;
  signatureRemoved: boolean;
  quotedReplyRemoved: boolean;
}

const blockTags = new Set(["p", "div", "li", "tr", "table", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"]);
const entityMap: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.toLowerCase().startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return entityMap[entity.toLowerCase()] ?? whole;
  });
}

function htmlToText(html: string): string {
  let output = "";
  let cursor = 0;
  let skip: string | undefined;
  while (cursor < html.length) {
    const open = html.indexOf("<", cursor);
    if (open === -1) { if (!skip) output += html.slice(cursor); break; }
    if (!skip) output += html.slice(cursor, open);
    const close = html.indexOf(">", open + 1);
    if (close === -1) { if (!skip) output += html.slice(open); break; }
    const rawTag = html.slice(open + 1, close).trim();
    const match = rawTag.match(/^\/?\s*([a-z0-9]+)/i);
    const name = match?.[1]?.toLowerCase();
    if (name === "script" || name === "style") { if (!rawTag.startsWith("/")) skip = name; else if (skip === name) skip = undefined; }
    else if (!skip && name && blockTags.has(name)) output += "\n";
    cursor = close + 1;
  }
  return decodeEntities(output);
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function removeQuotedReply(value: string): { text: string; removed: boolean } {
  const lines = value.split("\n");
  const index = lines.findIndex((line) => /^(On .+wrote:|-----Original Message-----|From:.+\n?Sent:)/i.test(line.trim()) || /^>+\s?/.test(line.trim()));
  return index === -1 ? { text: value, removed: false } : { text: lines.slice(0, index).join("\n").trimEnd(), removed: true };
}

function removeSignature(value: string): { text: string; removed: boolean } {
  const lines = value.split("\n");
  const separator = lines.findIndex((line, index) => index >= Math.floor(lines.length / 2) && /^(--\s*$|□■|_{5,}|-{5,})/.test(line.trim()));
  if (separator === -1) return { text: value, removed: false };
  const tail = lines.slice(separator).join("\n");
  const hasContact = /(?:TEL|FAX|MAIL|電話|メール|〒|@)/i.test(tail);
  return hasContact ? { text: lines.slice(0, separator).join("\n").trimEnd(), removed: true } : { text: value, removed: false };
}

const openingGreetings = new Set(["お世話になっております。", "いつもお世話になっております。", "お疲れ様です。", "平素よりお世話になっております。"]);
const closingGreetings = new Set(["よろしくお願いいたします。", "何卒よろしくお願いいたします。", "ご検討のほどよろしくお願いいたします。", "引き続きよろしくお願いいたします。"]);

function removeGreetingLines(value: string): string {
  const lines = value.split("\n");
  while (lines.length > 0 && openingGreetings.has(lines[0]!.trim())) lines.shift();
  while (lines.length > 0 && closingGreetings.has(lines[lines.length - 1]!.trim())) lines.pop();
  return lines.join("\n");
}

export function preprocessMailBody(body: string, contentType: MailContentType = "text"): PreprocessedMailBody {
  const originalBody = body;
  const converted = contentType === "html" ? htmlToText(body) : body;
  const normalized = normalizeText(converted);
  const quoted = removeQuotedReply(normalized);
  const signature = removeSignature(quoted.text);
  const withoutGreetings = removeGreetingLines(signature.text);
  return { originalBody, processedBody: normalizeText(withoutGreetings), signatureRemoved: signature.removed, quotedReplyRemoved: quoted.removed };
}
