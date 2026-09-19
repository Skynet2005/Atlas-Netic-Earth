export type CsvRecord = Record<string, string>;

export function parseCsv(text: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(field); field = ''; continue; }
    if (char === '\n') {
      row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; continue;
    }
    field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const header = rows.shift()?.map(value => value.trim()) ?? [];
  if (!header.length) return [];
  return rows.filter(values => values.some(Boolean)).map(values =>
    Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])),
  );
}

export function normalizeId(value: string) {
  return value.trim().toUpperCase();
}

export function numberOrNull(value: unknown) {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(number) ? number : null;
}

export function compactText(value: unknown, max = 4000) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}
