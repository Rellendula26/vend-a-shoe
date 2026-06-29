import { services } from "@/lib/server/services";
import { GmailPoller } from "@/lib/integrations/gmail/gmail-poller";

interface WatcherTickResult {
  polled: number;
  queued: number;
  duplicates: number;
  ignored: number;
}

export class DesktopBackgroundWatcherService {
  private readonly poller: GmailPoller | null;

  constructor() {
    this.poller = GmailPoller.fromEnvironment();
  }

  async tick(): Promise<WatcherTickResult> {
    if (!this.poller) {
      throw new Error("Gmail watcher is not configured. Set GOOGLE_* env variables for polling.");
    }

    const messages = await this.poller.poll();
    const result: WatcherTickResult = {
      polled: messages.length,
      queued: 0,
      duplicates: 0,
      ignored: 0,
    };

    for (const message of messages) {
      const pipelineResult = await services.pipeline.processMessage(message);
      if (pipelineResult.status === "queued") {
        result.queued += 1;
      } else if (pipelineResult.status === "duplicate") {
        result.duplicates += 1;
      } else {
        result.ignored += 1;
      }
    }

    return result;
  }
}
