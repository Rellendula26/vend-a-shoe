export type MessageSource = "gmail" | "slack" | "discord";

export interface NormalizedMessageV2 {
  source: MessageSource;
  sourceMessageId: string;
  sender: string;
  recipients: string[];
  subject?: string;
  body: string;
  receivedAt: string;
  threadId?: string;
}

export interface ExtractedEventV2 {
  title: string;
  startTime: string;
  endTime?: string;
  timezone?: string;
  location?: string;
  attendees?: string[];
  description?: string;
  confidence: number;
  sourceMessageId: string;
  source: MessageSource;
}

export interface CandidateEventRecord {
  id: string;
  message: NormalizedMessageV2;
  extractedEvent: ExtractedEventV2;
  createdAt: string;
}

export interface WatcherStatus {
  watcherEnabled: boolean;
  pollingIntervalSeconds: number;
  connected: boolean;
  lastChecked: string | null;
  candidateCount: number;
  detectedCount: number;
}

export interface GoogleOAuthConfigInput {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
  calendarId?: string;
}

export interface DesktopState {
  status: WatcherStatus;
  candidates: CandidateEventRecord[];
}
