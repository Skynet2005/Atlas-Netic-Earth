import { inflateRawSync } from 'node:zlib';

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_ARCHIVE_BYTES = 40 * 1024 * 1024;
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;

export function listZipEntries(buffer: Buffer): ZipEntry[] {
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error('Archive exceeds Atlas safety limit.');
  let eocd = -1;
  const start = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= start; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('Invalid ZIP archive.');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL) throw new Error('Invalid ZIP directory.');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error('ZIP entry exceeds Atlas safety limit.');
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function readZipEntry(buffer: Buffer, matcher: string | RegExp): string {
  const entries = listZipEntries(buffer);
  const entry = entries.find(item =>
    typeof matcher === 'string'
      ? item.name.toLowerCase().endsWith(matcher.toLowerCase())
      : matcher.test(item.name),
  );
  if (!entry) throw new Error(`Archive entry not found: ${String(matcher)}`);
  const offset = entry.localOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== LOCAL) throw new Error('Invalid ZIP entry.');
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) throw new Error('Truncated ZIP entry.');
  const data = buffer.subarray(dataStart, dataEnd);
  let output: Buffer;
  if (entry.method === 0) output = data;
  else if (entry.method === 8) output = inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
  else throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
  return output.toString('utf8');
}

export async function fetchArchive(url: string, timeoutMs = 20_000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { 'User-Agent': 'Atlas-Netic/0.2.8' } });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_ARCHIVE_BYTES) throw new Error('Provider archive exceeds Atlas safety limit.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error('Provider archive exceeds Atlas safety limit.');
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}
