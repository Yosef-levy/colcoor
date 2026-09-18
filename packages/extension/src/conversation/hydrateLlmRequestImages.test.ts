import { describe, expect, it, vi } from "vitest";

import {
  hydrateLlmRequestImages,
  mediaEnvelopesForLlmRequest,
} from "./hydrateLlmRequestImages";
import { buildUserMediaContentJson } from "./userEventMedia";
import type { LlmRequest } from "../agent/providers/types";
import type { TranscriptPathTurn } from "../transcript/buildTranscript";

describe("mediaEnvelopesForLlmRequest", () => {
  it("maps path-turn media and appended final-turn media", () => {
    const pathMedia = buildUserMediaContentJson([
      { id: "img-path", mime_type: "image/png", byte_size: 10 },
    ]);
    const finalMedia = buildUserMediaContentJson([
      { id: "img-final", mime_type: "image/jpeg", byte_size: 20 },
    ]);
    const pathFromRoot: TranscriptPathTurn[] = [
      { role: "user", content: "first", notes: [], userMediaContentJson: pathMedia },
      { role: "assistant", content: "reply", notes: [] },
    ];
    const request: LlmRequest = {
      system: "sys",
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "new\n\n[Image 1: ...]" },
      ],
    };
    const envelopes = mediaEnvelopesForLlmRequest(request, {
      pathFromRoot,
      finalUserMediaContentJson: finalMedia,
    });
    expect(envelopes[0]).toBe(pathMedia);
    expect(envelopes[1]).toBeUndefined();
    expect(envelopes[2]).toBe(finalMedia);
  });
});

describe("hydrateLlmRequestImages", () => {
  it("attaches base64 images for user media refs", async () => {
    const media = buildUserMediaContentJson([
      { id: "img-1", mime_type: "image/png", byte_size: 4 },
    ]);
    const request: LlmRequest = {
      system: "sys",
      messages: [{ role: "user", content: "look\n\n[Image 1: ...]" }],
    };
    const api = {
      getConversationImageRaw: vi.fn(async () => ({
        mimeType: "image/png",
        arrayBuffer: new Uint8Array([1, 2, 3, 4]).buffer,
      })),
    };
    const hydrated = await hydrateLlmRequestImages(
      api as never,
      "conv-1",
      request,
      {
        pathFromRoot: [{ role: "user", content: "look\n\n[Image 1: ...]", notes: [], userMediaContentJson: media }],
      },
    );
    expect(hydrated.messages[0].images).toEqual([
      { mimeType: "image/png", dataBase64: Buffer.from([1, 2, 3, 4]).toString("base64") },
    ]);
    expect(hydrated.messages[0].content).toContain("look");
  });
});
