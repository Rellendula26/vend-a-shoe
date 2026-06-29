import { NormalizedMessage } from "@/lib/domain/types";

export interface IntegrationProvider {
  platform: NormalizedMessage["platform"];
  normalizeIncomingPayload(payload: unknown): NormalizedMessage;
}
