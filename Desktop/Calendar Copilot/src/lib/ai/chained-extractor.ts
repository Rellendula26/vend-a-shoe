import { EventExtractor } from "@/lib/ai/extractor";
import { ExtractedEvent, NormalizedMessage } from "@/lib/domain/types";

export class ChainedEventExtractor implements EventExtractor {
  constructor(private readonly extractors: EventExtractor[]) {}

  async extractEvent(message: NormalizedMessage): Promise<ExtractedEvent | null> {
    for (const extractor of this.extractors) {
      const event = await extractor.extractEvent(message);
      if (event) return event;
    }
    return null;
  }
}
