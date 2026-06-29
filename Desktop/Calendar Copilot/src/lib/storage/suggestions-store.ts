import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { EventSuggestion } from "@/lib/domain/types";

interface SuggestionRow {
  id: string;
  message: EventSuggestion["message"];
  extracted_event: EventSuggestion["extractedEvent"];
  status: EventSuggestion["status"];
  created_at: string;
  updated_at: string;
  calendar_event_id: string | null;
}

export interface SuggestionsStore {
  save(suggestion: EventSuggestion): Promise<void>;
  listPending(limit?: number): Promise<EventSuggestion[]>;
  getById(id: string): Promise<EventSuggestion | null>;
  updateStatus(id: string, status: EventSuggestion["status"], calendarEventId?: string): Promise<void>;
  findPotentialDuplicate(suggestion: EventSuggestion): Promise<EventSuggestion | null>;
}

function toModel(row: SuggestionRow): EventSuggestion {
  return {
    id: row.id,
    message: row.message,
    extractedEvent: row.extracted_event,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    calendarEventId: row.calendar_event_id ?? undefined,
  };
}

function toRow(suggestion: EventSuggestion): SuggestionRow {
  return {
    id: suggestion.id,
    message: suggestion.message,
    extracted_event: suggestion.extractedEvent,
    status: suggestion.status,
    created_at: suggestion.createdAt,
    updated_at: suggestion.updatedAt,
    calendar_event_id: suggestion.calendarEventId ?? null,
  };
}

class InMemorySuggestionsStore implements SuggestionsStore {
  private suggestions = new Map<string, EventSuggestion>();

  async save(suggestion: EventSuggestion): Promise<void> {
    this.suggestions.set(suggestion.id, suggestion);
  }

  async listPending(limit = 25): Promise<EventSuggestion[]> {
    return Array.from(this.suggestions.values())
      .filter((suggestion) => suggestion.status === "pending")
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }

  async getById(id: string): Promise<EventSuggestion | null> {
    return this.suggestions.get(id) ?? null;
  }

  async updateStatus(
    id: string,
    status: EventSuggestion["status"],
    calendarEventId?: string,
  ): Promise<void> {
    const existing = this.suggestions.get(id);
    if (!existing) return;

    this.suggestions.set(id, {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
      calendarEventId: calendarEventId ?? existing.calendarEventId,
    });
  }

  async findPotentialDuplicate(suggestion: EventSuggestion): Promise<EventSuggestion | null> {
    const suggestions = Array.from(this.suggestions.values());
    return (
      suggestions.find((existing) => {
        return (
          existing.message.threadId === suggestion.message.threadId ||
          (existing.extractedEvent.title.toLowerCase() ===
            suggestion.extractedEvent.title.toLowerCase() &&
            existing.extractedEvent.startIso === suggestion.extractedEvent.startIso)
        );
      }) ?? null
    );
  }
}

class SupabaseSuggestionsStore implements SuggestionsStore {
  constructor(private readonly client: SupabaseClient) {}

  async save(suggestion: EventSuggestion): Promise<void> {
    const { error } = await this.client.from("event_suggestions").upsert(toRow(suggestion));
    if (error) throw new Error(`Failed to save suggestion: ${error.message}`);
  }

  async listPending(limit = 25): Promise<EventSuggestion[]> {
    const { data, error } = await this.client
      .from("event_suggestions")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to list suggestions: ${error.message}`);
    return (data as SuggestionRow[]).map(toModel);
  }

  async getById(id: string): Promise<EventSuggestion | null> {
    const { data, error } = await this.client
      .from("event_suggestions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Failed to fetch suggestion: ${error.message}`);
    return data ? toModel(data as SuggestionRow) : null;
  }

  async updateStatus(
    id: string,
    status: EventSuggestion["status"],
    calendarEventId?: string,
  ): Promise<void> {
    const { error } = await this.client
      .from("event_suggestions")
      .update({
        status,
        updated_at: new Date().toISOString(),
        calendar_event_id: calendarEventId ?? null,
      })
      .eq("id", id);

    if (error) throw new Error(`Failed to update suggestion: ${error.message}`);
  }

  async findPotentialDuplicate(suggestion: EventSuggestion): Promise<EventSuggestion | null> {
    const { data, error } = await this.client
      .from("event_suggestions")
      .select("*")
      .in("status", ["pending", "approved", "auto_approved"])
      .or(
        `message->>threadId.eq.${suggestion.message.threadId},and(extracted_event->>title.eq.${suggestion.extractedEvent.title},extracted_event->>startIso.eq.${suggestion.extractedEvent.startIso})`,
      )
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed duplicate check: ${error.message}`);
    return data ? toModel(data as SuggestionRow) : null;
  }
}

let singletonStore: SuggestionsStore | null = null;

export function getSuggestionsStore(): SuggestionsStore {
  if (singletonStore) return singletonStore;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    singletonStore = new SupabaseSuggestionsStore(client);
    return singletonStore;
  }

  singletonStore = new InMemorySuggestionsStore();
  return singletonStore;
}
