export const TIMESTAMP_REGEX = /^\d{2}:\d{2}:\d{2},\d{3}$/;
export const TIMESTAMP_LINE_REGEX =
  /^(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})$/;

export function timestampToMs(ts: string): number {
  const [timePart, msPart] = ts.split(',');
  if (!timePart || !msPart) {
    throw new Error(`Invalid timestamp format: "${ts}"`);
  }
  const [hours, minutes, seconds] = timePart.split(':').map(Number);
  const ms = parseInt(msPart, 10);

  if (
    hours === undefined ||
    minutes === undefined ||
    seconds === undefined ||
    isNaN(ms)
  ) {
    throw new Error(`Invalid timestamp format: "${ts}"`);
  }

  return hours * 3_600_000 + minutes * 60_000 + seconds * 1_000 + ms;
}

export function msToTimestamp(totalMs: number): string {
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const ms = totalMs % 1_000;

  return (
    String(hours).padStart(2, '0') +
    ':' +
    String(minutes).padStart(2, '0') +
    ':' +
    String(seconds).padStart(2, '0') +
    ',' +
    String(ms).padStart(3, '0')
  );
}

export function parseTimestampLine(line: string): {
  startTime: string;
  endTime: string;
  durationMs: number;
} | null {
  const match = TIMESTAMP_LINE_REGEX.exec(line.trim());
  if (!match || !match[1] || !match[2]) return null;

  const startTime = match[1];
  const endTime = match[2];

  try {
    const startMs = timestampToMs(startTime);
    const endMs = timestampToMs(endTime);
    const durationMs = endMs - startMs;
    return { startTime, endTime, durationMs };
  } catch {
    return null;
  }
}
