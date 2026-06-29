import { OpenAIEventExtractor } from "@/lib/ai/openai-extractor";
import { GoogleCalendarProvider } from "@/lib/calendar/google-calendar";
import { GmailIntegration } from "@/lib/integrations/gmail/gmail-webhook";
import { MessagePipeline } from "@/lib/pipeline/process-message";
import { getSuggestionsStore } from "@/lib/storage/suggestions-store";

const store = getSuggestionsStore();

export const services = {
  integrations: {
    gmail: new GmailIntegration(),
  },
  pipeline: new MessagePipeline(new OpenAIEventExtractor(process.env.OPENAI_API_KEY ?? ""), store),
  calendar: new GoogleCalendarProvider(),
  store,
};
