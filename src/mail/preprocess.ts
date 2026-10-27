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
  let current = lines;
  let removed = false;
  for (;;) {
    const index = current.findIndex((line, i) => {
      const text = line.trim();
      const next = current[i + 1]?.trim() ?? "";
      return /^(On .+wrote:|-----Original Message-----|From:\s*.+|差出人[:：]|送信日時[:：]|件名[:：].*(?:Re:|返信|転送))/i.test(text)
        || /^(202\d[\u002f.-].*(?: wrote:|さんは書きました))/i.test(text)
        || (/^>+\s?/.test(text) && current.slice(i).filter((line) => /^>+\s?/.test(line.trim())).length >= 2)
        || (/^-{5,}$/.test(text) && /^(From|差出人|送信日時|件名)[:：]/i.test(next));
    });
    if (index === -1) break;
    current = current.slice(0, index).join("\n").trimEnd().split("\n");
    removed = true;
  }
  return { text: current.join("\n").trimEnd(), removed };
}

function removeSignature(value: string): { text: string; removed: boolean } {
  const lines = value.split("\n");
  const start = Math.max(1, lines.length - 8);
  for (let i = start; i < lines.length; i += 1) {
    const tail = lines.slice(i).join("\n");
    const contactSignals = [/(?:TEL|FAX|電話|〒)/i, /[\w.+-]+@[\w.-]+\.[A-Z]{2,}/i, /https?:\/\//i, /(?:株式会社|有限会社|合同会社)/, /(?:担当|営業|部|課|氏名)[:：]/].filter((pattern) => pattern.test(tail)).length;
    const hasSeparator = /^(--\s*$|□■|_{5,}|-{5,})/.test(lines[i]!.trim());
    const hasSignatureLabel = /^(署名|敬具|以上|よろしくお願いいたします)[。．!！]?$/i.test(lines[i]!.trim());
    if ((hasSeparator || hasSignatureLabel) && contactSignals >= 1) return { text: lines.slice(0, i).join("\n").trimEnd(), removed: true };
    if (!hasSeparator && contactSignals >= 2 && lines.slice(i).filter((line) => line.trim()).length >= 2) return { text: lines.slice(0, i).join("\n").trimEnd(), removed: true };
  }
  return { text: value, removed: false };
}

function removeBoilerplateFooter(value: string): string {
  const lines = value.split("\n");
  const start = Math.max(0, lines.length - 8);
  for (let i = start; i < lines.length; i += 1) {
    const tail = lines.slice(i).join("\n");
    const signals = [/(?:配信停止|購読解除|unsubscribe|メールマガジン)/i, /(?:広告|宣伝|キャンペーン|サービスのご案内)/i, /(?:自動配信|自動送信|このメールは.*返信)/i, /(?:免責事項|confidential|©)/i].filter((pattern) => pattern.test(lines[i]!.trim())).length;
    const followingSignals = [/(?:配信停止|購読解除|unsubscribe|メールマガジン)/i, /(?:広告|宣伝|キャンペーン|サービスのご案内)/i, /(?:自動配信|自動送信|このメールは.*返信)/i, /(?:免責事項|confidential|©)/i].filter((pattern) => pattern.test(tail)).length;
    if (signals >= 1 && (followingSignals >= 2 || (i >= lines.length - 3 && /(?:配信停止|購読解除|unsubscribe|免責事項)/i.test(tail)))) return lines.slice(0, i).join("\n").trimEnd();
  }
  return value;
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
  return { originalBody, processedBody: normalizeText(removeBoilerplateFooter(withoutGreetings)), signatureRemoved: signature.removed, quotedReplyRemoved: quoted.removed };
}
