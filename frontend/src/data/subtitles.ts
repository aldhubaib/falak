/**
 * Convert timestamped script text to SRT subtitle format.
 *
 * Input: "0:00 مقدمة\n0:30 المحتوى\n1:15 التحقيق"
 * Output: SRT string for YouTube upload
 */

function parseTimestamp(ts: string): number | null {
  const parts = ts.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function secondsToSRT(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function scriptToSRT(
  scriptText: string,
  { defaultEndOffsetSec = 5 }: { defaultEndOffsetSec?: number } = {},
): string {
  if (!scriptText) return "";

  const timestampRegex = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/;
  const entries: { start: number; text: string }[] = [];

  for (const line of scriptText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(timestampRegex);
    if (match) {
      const seconds = parseTimestamp(match[1]);
      if (seconds !== null) {
        entries.push({ start: seconds, text: match[2].trim() });
      }
    } else if (entries.length > 0) {
      entries[entries.length - 1].text += " " + trimmed;
    }
  }

  if (entries.length === 0) return "";

  const srtLines: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const nextStart =
      i < entries.length - 1
        ? entries[i + 1].start
        : entry.start + defaultEndOffsetSec;
    const endTime = Math.max(nextStart, entry.start + 1);

    srtLines.push(String(i + 1));
    srtLines.push(`${secondsToSRT(entry.start)} --> ${secondsToSRT(endTime)}`);
    srtLines.push(entry.text);
    srtLines.push("");
  }

  return srtLines.join("\n");
}
