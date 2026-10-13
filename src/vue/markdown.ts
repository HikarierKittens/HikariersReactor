/**
 * Minimal Markdown subset for the in-game 更新日志 tab. Produces plain data that
 * the template renders as text nodes, so document content is never injected as HTML.
 * Supported: #–#### headings, -/* lists (two-space indent nests one level), ---, > quotes,
 * paragraphs, and inline **bold** / `code`.
 */
export interface InlineSegment { kind: 'text' | 'strong' | 'code'; text: string }
export interface ListItem { segments: InlineSegment[]; children: InlineSegment[][] }
export type MarkdownBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; segments: InlineSegment[] }
  | { kind: 'list'; items: ListItem[] }
  | { kind: 'paragraph'; segments: InlineSegment[] }
  | { kind: 'quote'; segments: InlineSegment[] }
  | { kind: 'rule' };

export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ kind: 'text', text: text.slice(last, index) });
    if (match[1] !== undefined) segments.push({ kind: 'strong', text: match[1] });
    else segments.push({ kind: 'code', text: match[2] ?? '' });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) });
  return segments;
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: ListItem[] | undefined;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', segments: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.length) blocks.push({ kind: 'list', items: list });
    list = undefined;
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const item = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(); flushList();
      blocks.push({ kind: 'heading', level: heading[1]!.length as 1 | 2 | 3 | 4, segments: parseInline(heading[2]!) });
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph(); flushList();
      blocks.push({ kind: 'rule' });
    } else if (item) {
      flushParagraph();
      list ??= [];
      const parent = list[list.length - 1];
      if (item[1]!.length >= 2 && parent) parent.children.push(parseInline(item[2]!));
      else list.push({ segments: parseInline(item[2]!), children: [] });
    } else if (line.startsWith('>')) {
      flushParagraph(); flushList();
      const text = line.replace(/^>\s?/, '');
      if (text) blocks.push({ kind: 'quote', segments: parseInline(text) });
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph(); flushList();
  return blocks;
}
