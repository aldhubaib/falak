import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseDuration(raw: string | null | undefined): string {
  if (!raw) return "";
  if (/^\d+:\d+/.test(raw)) return raw;
  const m = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!m) return raw;
  const h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const sec = parseInt(m[3] || "0", 10);
  if (h > 0) {
    return `${h}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${min}:${String(sec).padStart(2, "0")}`;
}

// ─── GMT+3 date/time helpers ──────────────────────────────────────────────────
// All timestamps shown in the UI use Asia/Riyadh (UTC+3, no DST).

const TZ = "Asia/Riyadh";

/**
 * Format a date as a localised date string in GMT+3.
 * e.g. "3/14/2026"
 */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { timeZone: TZ });
}

/**
 * Format a date as a localised date + time string in GMT+3.
 * e.g. "3/14/2026, 11:19 PM"
 */
export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Return a Date object representing "now" in GMT+3.
 * Useful for day-difference calculations that need the local date.
 */
export function nowGMT3(): Date {
  // Shift the UTC epoch by +3 h so that date arithmetic works in local time
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}
