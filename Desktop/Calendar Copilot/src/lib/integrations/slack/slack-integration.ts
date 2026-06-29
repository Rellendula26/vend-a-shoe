import { NormalizedMessage } from "@/lib/domain/types";
import { IntegrationProvider } from "@/lib/integrations/contracts";

export class SlackIntegration implements IntegrationProvider {
  platform: NormalizedMessage["platform"] = "slack";

  normalizeIncomingPayload(_payload: unknown): NormalizedMessage {
    throw new Error("Slack integration is not implemented yet.");
  }
}
