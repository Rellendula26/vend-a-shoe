import { NormalizedMessage } from "@/lib/domain/types";
import { IntegrationProvider } from "@/lib/integrations/contracts";

export class DiscordIntegration implements IntegrationProvider {
  platform: NormalizedMessage["platform"] = "discord";

  normalizeIncomingPayload(_payload: unknown): NormalizedMessage {
    throw new Error("Discord integration is not implemented yet.");
  }
}
