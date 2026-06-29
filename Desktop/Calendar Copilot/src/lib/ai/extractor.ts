import { ExtractedEvent, NormalizedMessage } from "@/lib/domain/types";

export interface EventExtractor {
  extractEvent(message: NormalizedMessage): Promise<ExtractedEvent | null>;
}
