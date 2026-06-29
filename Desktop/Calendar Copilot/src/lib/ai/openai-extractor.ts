import OpenAI from "openai";
import { z } from "zod";

import { EventExtractor } from "@/lib/ai/extractor";
import { ExtractedEvent, NormalizedMessage } from "@/lib/domain/types";

const extractionSchema = z.object({
  isSchedulingRelated: z.boolean(),
  hasEnoughInformation: z.boolean(),
  title: z.string().min(1),
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
  timezone: z.string().min(1),
  location: z.string().optional(),
  participants: z.array(z.string()).default([]),
  description: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

const modelResponseSchema = z.object({
  extracted: extractionSchema,
});

const DEFAULT_DURATION_MINUTES = 60;

function buildFallbackEvent(message: NormalizedMessage): ExtractedEvent {
  const start = new Date(message.receivedAt);
  const end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);

  return {
    title: message.metadata?.subject ?? "Potential meeting",
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    timezone: "UTC",
    participants: message.participants,
    description: message.text.slice(0, 500),
    confidence: 0.45,
  };
}

export class OpenAIEventExtractor implements EventExtractor {
  private client: OpenAI | null;
  private model: string;

  constructor(apiKey?: string, model = "gpt-4.1-mini") {
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = model;
  }

  async extractEvent(message: NormalizedMessage): Promise<ExtractedEvent | null> {
    if (!this.client) {
      return buildFallbackEvent(message);
    }

    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: "system",
          content:
            "You extract calendar events from conversational messages. Return strict JSON only.",
        },
        {
          role: "user",
          content: `Message:\n${message.text}\n\nPlatform: ${message.platform}\nThread: ${message.threadId}\nSender: ${message.sender}\nParticipants: ${message.participants.join(", ")}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "event_extraction",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              extracted: {
                type: "object",
                additionalProperties: false,
                properties: {
                  isSchedulingRelated: { type: "boolean" },
                  hasEnoughInformation: { type: "boolean" },
                  title: { type: "string" },
                  startIso: { type: "string", format: "date-time" },
                  endIso: { type: "string", format: "date-time" },
                  timezone: { type: "string" },
                  location: { type: "string" },
                  participants: {
                    type: "array",
                    items: { type: "string" },
                  },
                  description: { type: "string" },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                },
                required: [
                  "isSchedulingRelated",
                  "hasEnoughInformation",
                  "title",
                  "startIso",
                  "endIso",
                  "timezone",
                  "participants",
                  "confidence",
                ],
              },
            },
            required: ["extracted"],
          },
        },
      },
    });

    const parsedOutput = response.output_text ? JSON.parse(response.output_text) : null;
    if (!parsedOutput) {
      return null;
    }

    const parsed = modelResponseSchema.parse(parsedOutput);
    if (!parsed.extracted.isSchedulingRelated || !parsed.extracted.hasEnoughInformation) {
      return null;
    }

    const { isSchedulingRelated, hasEnoughInformation, ...event } = parsed.extracted;
    void isSchedulingRelated;
    void hasEnoughInformation;

    return event;
  }
}
