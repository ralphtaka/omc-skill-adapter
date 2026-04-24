/**
 * Minimal YAML subset parser — no external deps.
 * Supports: key: value, key: [a,b,c], block arrays (- item),
 * block sequences of objects (- key: val\n  key: val), # comments.
 */

type YamlScalar = string;
type YamlValue = YamlScalar | YamlScalar[] | YamlObject | YamlObject[];
export interface YamlObject { [key: string]: YamlValue }

export function parseYaml(content: string): YamlObject {
  const lines = content.split('\n').map(l => l.replace(/\s+#.*$/, '').trimEnd());
  return parseObject(lines, 0, 0).obj;
}

interface ParseResult { obj: YamlObject; nextIdx: number }
interface ArrayResult { items: YamlValue[]; nextIdx: number }

function parseObject(lines: string[], startIdx: number, baseIndent: number): ParseResult {
  const obj: YamlObject = {};
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const indent = getIndent(line);
    if (indent < baseIndent) break;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) { i++; continue; }

    const key = line.slice(0, colonIdx).trim();
    if (!key || key.startsWith('-')) { break; }

    const rawVal = line.slice(colonIdx + 1).trim();

    if (rawVal.startsWith('[')) {
      obj[key] = parseInlineArray(rawVal);
      i++;
    } else if (rawVal !== '') {
      obj[key] = unquote(rawVal);
      i++;
    } else {
      // Empty value — look ahead for block content
      const nextContentIdx = findNextContent(lines, i + 1);
      if (nextContentIdx === -1) { obj[key] = ''; i++; continue; }

      const nextLine = lines[nextContentIdx];
      const nextIndent = getIndent(nextLine);

      if (nextIndent <= indent) { obj[key] = ''; i++; continue; }

      if (nextLine.trimStart().startsWith('- ')) {
        // Block sequence
        const result = parseArray(lines, nextContentIdx, nextIndent);
        obj[key] = result.items as YamlValue;
        i = result.nextIdx;
      } else if (nextLine.includes(':')) {
        // Nested object
        const result = parseObject(lines, nextContentIdx, nextIndent);
        obj[key] = result.obj;
        i = result.nextIdx;
      } else {
        obj[key] = '';
        i++;
      }
    }
  }

  return { obj, nextIdx: i };
}

function parseArray(lines: string[], startIdx: number, baseIndent: number): ArrayResult {
  const items: YamlValue[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const indent = getIndent(line);
    if (indent < baseIndent) break;

    const trimmed = line.trimStart();
    if (!trimmed.startsWith('- ') && !trimmed.startsWith('-\n') && trimmed !== '-') break;

    const afterDash = trimmed.slice(1).trim();
    i++;

    if (afterDash === '' || afterDash === undefined) {
      // Multi-line object item starting on next line
      const nextContent = findNextContent(lines, i);
      if (nextContent === -1) { items.push(''); continue; }
      const nextIndent = getIndent(lines[nextContent]);
      if (nextIndent > indent && lines[nextContent].includes(':')) {
        const result = parseObject(lines, nextContent, nextIndent);
        items.push(result.obj);
        i = result.nextIdx;
      } else {
        items.push('');
      }
      continue;
    }

    // afterDash has content: could be `key: value` (object) or plain value
    if (afterDash.includes(':')) {
      const colonIdx = afterDash.indexOf(':');
      const key = afterDash.slice(0, colonIdx).trim();
      const val = afterDash.slice(colonIdx + 1).trim();

      // Peek ahead: if next non-empty line has deeper indent + colon → object item
      const nextContent = findNextContent(lines, i);
      const nextIsObjField = nextContent !== -1 &&
        getIndent(lines[nextContent]) > indent &&
        lines[nextContent].includes(':') &&
        !lines[nextContent].trimStart().startsWith('-');

      if (nextIsObjField) {
        // Build object item: first field from afterDash, rest from subsequent lines
        const obj: YamlObject = {};
        obj[key] = unquote(val);
        const result = parseObject(lines, i, getIndent(lines[nextContent]));
        Object.assign(obj, result.obj);
        items.push(obj);
        i = result.nextIdx;
      } else {
        // Treat as simple string value (the whole afterDash)
        items.push(unquote(afterDash));
      }
    } else {
      items.push(unquote(afterDash));
    }
  }

  return { items, nextIdx: i };
}

function findNextContent(lines: string[], startIdx: number): number {
  for (let j = startIdx; j < lines.length; j++) {
    if (lines[j].trim()) return j;
  }
  return -1;
}

function getIndent(line: string): number {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return i;
}

function parseInlineArray(raw: string): string[] {
  const inner = raw.slice(raw.indexOf('[') + 1, raw.lastIndexOf(']'));
  if (!inner.trim()) return [];
  return inner.split(',').map(s => unquote(s.trim())).filter(Boolean);
}

function unquote(s: string): string {
  if (!s) return '';
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

export function stringifyYamlValue(val: YamlValue): string {
  if (Array.isArray(val)) return val.map(v => `  - "${v}"`).join('\n');
  return String(val);
}
