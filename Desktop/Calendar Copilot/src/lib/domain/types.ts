export type Platform = "gmail" | "slack" | "discord";

export interface NormalizedMessage {
  id: string;
  platform: Platform;
  threadId: string;
  sender: string;
  participants: string[];
  text: string;
  receivedAt: string;
  metadata?: Record<string, string>;
}

export interface ExtractedEvent {
  title: string;
  startIso: string;
  endIso: string;
  timezone: string;
  location?: string;
  participants: string[];
  description?: string;
  confidence: number;
}

export type SuggestionStatus = "pending" | "approved" | "ignored" | "auto_approved";

export interface EventSuggestion {
  id: string;
  message: NormalizedMessage;
  extractedEvent: ExtractedEvent;
  status: SuggestionStatus;
  createdAt: string;
  updatedAt: string;
  calendarEventId?: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchedSuggestionId?: string;
}
