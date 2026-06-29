import { ChainedEventExtractor } from "@/lib/ai/chained-extractor";
import { OpenAIEventExtractor } from "@/lib/ai/openai-extractor";
import { RuleBasedEventExtractor } from "@/lib/ai/rule-based-extractor";
import { GoogleCalendarProvider } from "@/lib/calendar/google-calendar";
import { DiscordIntegration } from "@/lib/integrations/discord/discord-integration";
import { GmailIntegration } from "@/lib/integrations/gmail/gmail-webhook";
import { SlackIntegration } from "@/lib/integrations/slack/slack-integration";
import { MessagePipeline } from "@/lib/pipeline/process-message";
import { getSuggestionsStore } from "@/lib/storage/suggestions-store";

const store = getSuggestionsStore();
const extractor = new ChainedEventExtractor([
  new RuleBasedEventExtractor(),
  new OpenAIEventExtractor(process.env.OPENAI_API_KEY ?? ""),
]);

export const services = {
  integrations: {
    gmail: new GmailIntegration(),
    slack: new SlackIntegration(),
    discord: new DiscordIntegration(),
  },
  pipeline: new MessagePipeline(extractor, store),
  calendar: new GoogleCalendarProvider(),
  store,
};
