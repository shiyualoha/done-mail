const BODY_PREVIEW_MAX_LENGTH = 180;
const SEARCH_TEXT_MAX_LENGTH = 20000;
const SEARCH_QUERY_MAX_LENGTH = 200;
const SEARCH_QUERY_MAX_TERMS = 12;
const BODY_CHUNK_MAX_BYTES = 512 * 1024;
const SEARCH_CHUNK_MAX_BYTES = 512 * 1024;
const chineseTextPattern = /[\p{Script=Han}]+/gu;
const latinTokenPattern = /[\p{Script=Latin}\p{Number}_@.+-]+/gu;
const chineseSegmenter = new Intl.Segmenter('zh', { granularity: 'word' });

interface MailSearchTextInput {
  fromAddr?: string;
  fromName?: string;
  toAddr?: string;
  toName?: string;
  receivedByAddr?: string;
  subject?: string;
  text?: string;
  html?: string;
}

export interface MailSearchFields {
  subject: string;
  addresses: string;
}

export interface MailBodyChunk {
  kind: 'text' | 'html';
  index: number;
  content: string;
}

export function textFromHtml(html: string) {
  return html
    .replace(/<\s*(script|style|title)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|section|article|header|footer|tr|li|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<\s*(p|div|section|article|header|footer|tr|li|h[1-6]|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<(img|iframe|object|embed|video|audio|source|link)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

export function normalizePreviewText(value: string) {
  return value
    .replace(/[\u200B-\u200F\uFEFF\u034F\u00A0\u3000\u00AD]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeReadableText(value: string) {
  return value
    .replace(/[\u200B-\u200F\uFEFF\u034F\u00A0\u3000\u00AD]/g, '')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function readableBodyText(text: string, html: string) {
  return normalizeReadableText(text) || normalizeReadableText(textFromHtml(html));
}

export function buildBodyPreview(text: string, html: string) {
  const value = normalizePreviewText(readableBodyText(text, html));
  if (value.length <= BODY_PREVIEW_MAX_LENGTH) return value;
  return `${value.slice(0, BODY_PREVIEW_MAX_LENGTH)}...`;
}

export function buildSearchText(values: string[]) {
  const normalized = normalizePreviewText(values.join(' ')).toLowerCase().slice(0, SEARCH_TEXT_MAX_LENGTH);
  const tokens = chineseSupplementTokens(normalized);
  return [normalized, ...tokens].join(' ').slice(0, SEARCH_TEXT_MAX_LENGTH);
}

function segmentChineseWords(value: string) {
  if (!value) return [];
  return Array.from(chineseSegmenter.segment(value))
    .filter((item) => item.isWordLike)
    .map((item) => item.segment.trim())
    .filter(Boolean);
}

function chineseBigrams(value: string) {
  const chars = Array.from(value);
  if (chars.length <= 1) return chars;
  return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`);
}

function searchTokens(value: string) {
  const tokens = new Set<string>();
  const normalized = normalizePreviewText(value).toLowerCase();
  for (const match of normalized.matchAll(latinTokenPattern)) {
    const token = match[0].trim();
    if (token) tokens.add(token);
  }
  for (const match of normalized.matchAll(chineseTextPattern)) {
    const text = match[0];
    segmentChineseWords(text).forEach((token) => tokens.add(token));
    chineseBigrams(text).forEach((token) => tokens.add(token));
  }
  return [...tokens];
}

function chineseSupplementTokens(value: string) {
  const tokens = new Set<string>();
  for (const match of normalizePreviewText(value).toLowerCase().matchAll(chineseTextPattern)) {
    const text = match[0];
    segmentChineseWords(text).forEach((token) => {
      if (token !== text) tokens.add(token);
    });
    chineseBigrams(text).forEach((token) => {
      if (token !== text) tokens.add(token);
    });
  }
  return [...tokens];
}

function utf8ByteLength(value: string) {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) || 0;
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

export function buildMailSearchText(input: MailSearchTextInput) {
  return buildSearchText([
    input.fromAddr || '',
    input.fromName || '',
    input.toAddr || '',
    input.toName || '',
    input.receivedByAddr || '',
    input.subject || '',
    input.text || '',
    textFromHtml(input.html || '')
  ]);
}

export function buildMailSearchFields(input: MailSearchTextInput): MailSearchFields {
  return {
    subject: buildSearchText([input.subject || '']),
    addresses: buildSearchText([
      input.fromAddr || '',
      input.fromName || '',
      input.toAddr || '',
      input.toName || '',
      input.receivedByAddr || ''
    ])
  };
}

function ftsTerms(value: string) {
  return searchTokens(value.slice(0, SEARCH_QUERY_MAX_LENGTH))
    .slice(0, SEARCH_QUERY_MAX_TERMS)
    .map((term) => term.replace(/"/g, '""'))
    .filter(Boolean);
}

export function buildFtsTerms(value: string, column?: keyof MailSearchFields) {
  const prefix = column ? `${column} : ` : '';
  return ftsTerms(value).map((term) => `${prefix}"${term}"*`);
}

export function buildFtsQuery(value: string, column?: keyof MailSearchFields) {
  const terms = buildFtsTerms(value, column);
  return terms.join(' AND ');
}

function pushBodyChunks(chunks: MailBodyChunk[], kind: MailBodyChunk['kind'], content: string) {
  if (!content) return;
  let index = 0;
  let current = '';
  let currentBytes = 0;

  for (const char of content) {
    const charBytes = utf8ByteLength(char);
    if (current && currentBytes + charBytes > BODY_CHUNK_MAX_BYTES) {
      chunks.push({ kind, index, content: current });
      index += 1;
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }

  if (current) chunks.push({ kind, index, content: current });
}

export function buildMailBodyChunks(text: string, html: string) {
  const chunks: MailBodyChunk[] = [];
  pushBodyChunks(chunks, 'text', text);
  pushBodyChunks(chunks, 'html', html);
  return chunks;
}

export function restoreMailBodyChunks(rows: Array<{ kind?: unknown; chunkIndex?: unknown; content?: unknown }>) {
  const text: string[] = [];
  const html: string[] = [];
  for (const row of rows) {
    const target = row.kind === 'html' ? html : text;
    target[Number(row.chunkIndex || 0)] = String(row.content || '');
  }
  return {
    textBody: text.join(''),
    htmlBody: html.join('')
  };
}

export function buildMailContentSearchChunks(text: string, html: string) {
  const tokens = searchTokens([text, textFromHtml(html)].join(' '));
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const token of tokens) {
    const prefixBytes = current ? 1 : 0;
    const tokenBytes = utf8ByteLength(token);
    if (current && currentBytes + prefixBytes + tokenBytes > SEARCH_CHUNK_MAX_BYTES) {
      chunks.push(current);
      current = token;
      currentBytes = tokenBytes;
    } else {
      current = current ? `${current} ${token}` : token;
      currentBytes += prefixBytes + tokenBytes;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function sanitizeMailHtml(html: string) {
  return html
    .replace(/<\s*(script|iframe|object|embed|form|input|button|textarea|select|base|meta|link)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|form|input|button|textarea|select|base|meta|link)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+style\s*=\s*(?:"[^"]*expression\s*\([^"]*"|'[^']*expression\s*\([^']*'|[^\s>]*expression\s*\([^\s>]*)/gi, '')
    .replace(/\s+(href|src|srcset|xlink:href)\s*=\s*(?:"\s*(javascript|data:text\/html|vbscript):[^"]*"|'\s*(javascript|data:text\/html|vbscript):[^']*'|(javascript|data:text\/html|vbscript):[^\s>]+)/gi, ' $1="#"')
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}
