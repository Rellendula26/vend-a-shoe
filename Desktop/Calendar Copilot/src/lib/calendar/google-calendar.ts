import { google } from "googleapis";

import { EventSuggestion } from "@/lib/domain/types";

export interface CalendarProvider {
  createEvent(suggestion: EventSuggestion): Promise<string>;
}

export class GoogleCalendarProvider implements CalendarProvider {
  async createEvent(suggestion: EventSuggestion): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    const calendarId = process.env.GOOGLE_CALENDAR_ID ?? "primary";

    if (!clientId || !clientSecret || !refreshToken) {
      return `local-${suggestion.id}`;
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const created = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: suggestion.extractedEvent.title,
        description: suggestion.extractedEvent.description,
        location: suggestion.extractedEvent.location,
        attendees: suggestion.extractedEvent.participants.map((email) => ({ email })),
        start: {
          dateTime: suggestion.extractedEvent.startIso,
          timeZone: suggestion.extractedEvent.timezone,
        },
        end: {
          dateTime: suggestion.extractedEvent.endIso,
          timeZone: suggestion.extractedEvent.timezone,
        },
      },
    });

    return created.data.id ?? `calendar-${suggestion.id}`;
  }
}
