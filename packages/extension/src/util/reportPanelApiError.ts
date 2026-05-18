import { ColcoorApiHttpError } from "../api/colcoorApiHttpError";
import { showColcoorApiFailure } from "./showColcoorApiFailure";

/** Toast for HTTP API failures in the conversation panel (all statuses, not only 402). */
export function reportPanelApiError(e: unknown): void {
  if (e instanceof ColcoorApiHttpError) {
    void showColcoorApiFailure(e);
  }
}
