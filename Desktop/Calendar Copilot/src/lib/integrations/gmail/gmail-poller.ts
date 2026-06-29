import { gmail_v1, google } from "googleapis";

import { NormalizedMessage } from "@/lib/domain/types";

interface PollerOptions {
  query: string;
  maxResults: number;
}

interface GmailMessageCandidate {
  id: string;
  threadId: string;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function extractPlainBody(parts: gmail_v1.Schema$MessagePart[] | undefined): string | null {
  if (!parts || parts.length === 0) {
    return null;
  }

  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }

    const nested = extractPlainBody(part.parts);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  if (!headers) return "";
  const found = headers.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return found?.value?.trim() ?? "";
}

function toNormalizedMessage(message: gmail_v1.Schema$Message): NormalizedMessage | null {
  if (!message.id || !message.threadId || !message.payload) {
    return null;
  }

  const payloadHeaders = message.payload.headers;
  const from = getHeader(payloadHeaders, "from");
  const to = getHeader(payloadHeaders, "to");
  const subject = getHeader(payloadHeaders, "subject");
  const date = getHeader(payloadHeaders, "date");

  if (!from || !subject) {
    return null;
  }

  const plainBody =
    message.payload.body?.data ? decodeBase64Url(message.payload.body.data) : extractPlainBody(message.payload.parts);

  return {
    id: message.id,
    platform: "gmail",
    threadId: message.threadId,
    sender: from,
    participants: to ? to.split(",").map((value) => value.trim()) : [],
    text: `Subject: ${subject}\n\n${plainBody ?? message.snippet ?? ""}`.trim(),
    receivedAt: date ? new Date(date).toISOString() : new Date().toISOString(),
    metadata: {
      subject,
    },
  };
}

export class GmailPoller {
  private readonly gmailClient: gmail_v1.Gmail;

  constructor(
    private readonly refreshToken: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly userId = "me",
  ) {
    const oauth2 = new google.auth.OAuth2(this.clientId, this.clientSecret);
    oauth2.setCredentials({ refresh_token: this.refreshToken });
    this.gmailClient = google.gmail({ version: "v1", auth: oauth2 });
  }

  static fromEnvironment(): GmailPoller | null {
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN ?? "";
    const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
    const userId = process.env.GMAIL_WATCHER_USER_ID ?? "me";

    if (!refreshToken || !clientId || !clientSecret) {
      return null;
    }

    return new GmailPoller(refreshToken, clientId, clientSecret, userId);
  }

  async poll(options?: Partial<PollerOptions>): Promise<NormalizedMessage[]> {
    const query = options?.query ?? process.env.GMAIL_WATCHER_QUERY ?? "is:unread newer_than:2d";
    const maxResults = options?.maxResults ?? Number(process.env.GMAIL_WATCHER_MAX_RESULTS ?? "5");

    const listing = await this.gmailClient.users.messages.list({
      userId: this.userId,
      maxResults,
      q: query,
    });

    const candidates = (listing.data.messages ?? []) as GmailMessageCandidate[];
    if (candidates.length === 0) {
      return [];
    }

    const fetched = await Promise.all(
      candidates.map((candidate) =>
        this.gmailClient.users.messages.get({
          userId: this.userId,
          id: candidate.id,
          format: "full",
        }),
      ),
    );

    return fetched
      .map((response) => toNormalizedMessage(response.data))
      .filter((message): message is NormalizedMessage => Boolean(message));
  }
}
