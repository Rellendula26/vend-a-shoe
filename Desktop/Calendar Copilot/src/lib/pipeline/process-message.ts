import { randomUUID } from "node:crypto";

import { EventExtractor } from "@/lib/ai/extractor";
import { EventSuggestion, NormalizedMessage } from "@/lib/domain/types";
import { SuggestionsStore } from "@/lib/storage/suggestions-store";

interface PipelineResult {
  status: "ignored" | "duplicate" | "queued";
  suggestion?: EventSuggestion;
  reason?: string;
}

export class MessagePipeline {
  constructor(
    private readonly extractor: EventExtractor,
    private readonly store: SuggestionsStore,
    private readonly minConfidence = 0.6,
  ) {}

  async processMessage(message: NormalizedMessage): Promise<PipelineResult> {
    const extractedEvent = await this.extractor.extractEvent(message);
    if (!extractedEvent) {
      return { status: "ignored", reason: "No actionable scheduling information." };
    }

    if (extractedEvent.confidence < this.minConfidence) {
      return { status: "ignored", reason: "Confidence below threshold." };
    }

    const now = new Date().toISOString();
    const suggestion: EventSuggestion = {
      id: randomUUID(),
      message,
      extractedEvent,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    const duplicate = await this.store.findPotentialDuplicate(suggestion);
    if (duplicate) {
      return { status: "duplicate", reason: `Matched ${duplicate.id}` };
    }

    await this.store.save(suggestion);
    return { status: "queued", suggestion };
  }
}
