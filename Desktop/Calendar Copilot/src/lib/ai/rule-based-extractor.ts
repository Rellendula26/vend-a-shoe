import { EventExtractor } from "@/lib/ai/extractor";
import { ExtractedEvent, NormalizedMessage } from "@/lib/domain/types";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const EXPLICIT_DATE_REGEX = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;
const TIME_REGEX = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;

function parseTime(text: string): { hour: number; minute: number } | null {
  const match = text.match(TIME_REGEX);
  if (!match) return null;

  const rawHour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3]?.toLowerCase();

  if (Number.isNaN(rawHour) || Number.isNaN(minute) || rawHour > 23 || minute > 59) return null;

  if (!meridiem) {
    return { hour: rawHour, minute };
  }

  const hour = rawHour % 12 + (meridiem === "pm" ? 12 : 0);
  return { hour, minute };
}

function nextWeekdayDate(base: Date, weekday: (typeof WEEKDAYS)[number]): Date {
  const target = WEEKDAYS.indexOf(weekday);
  const clone = new Date(base);
  const current = clone.getDay();
  const delta = (target - current + 7) % 7 || 7;
  clone.setDate(clone.getDate() + delta);
  return clone;
}

function parseDate(text: string, receivedAt: string): Date | null {
  const now = new Date(receivedAt);
  const lower = text.toLowerCase();

  if (lower.includes("today")) return now;
  if (lower.includes("tomorrow")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const nextWeekdayMatch = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (nextWeekdayMatch) {
    return nextWeekdayDate(now, nextWeekdayMatch[1] as (typeof WEEKDAYS)[number]);
  }

  const explicit = lower.match(EXPLICIT_DATE_REGEX);
  if (!explicit) return null;

  const parsed = new Date(explicit[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export class RuleBasedEventExtractor implements EventExtractor {
  async extractEvent(message: NormalizedMessage): Promise<ExtractedEvent | null> {
    const body = `${message.metadata?.subject ?? ""}\n${message.text}`;
    const date = parseDate(body, message.receivedAt);
    const time = parseTime(body);

    if (!date || !time) return null;

    const start = new Date(date);
    start.setHours(time.hour, time.minute, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    return {
      title: message.metadata?.subject || "Meeting",
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      timezone: "UTC",
      location: undefined,
      participants: message.participants,
      description: `Detected from ${message.platform} message ${message.id}`,
      confidence: 0.72,
    };
  }
}
