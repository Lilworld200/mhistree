import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { aiDebug } from "./debug";

export interface EmbeddingGateway {
  readonly modelName: string;
  readonly dimensions: number;
  embed(text: string, signal?: AbortSignal): Promise<number[]>;
}

/** Independent from the chat/voice provider. Does not read or index patient records. */
export class GeminiEmbeddingGateway implements EmbeddingGateway {
  readonly dimensions = 768;
  constructor(
    private key: string,
    readonly modelName = "gemini-embedding-2",
  ) {}

  async embed(text: string, signal?: AbortSignal) {
    // Conservative UTF-8 bound stays below the model's 8192-token input limit.
    // Callers split larger passages explicitly; never silently truncate evidence.
    if (!text.trim() || Buffer.byteLength(text, "utf8") > 6000)
      throw new DomainError("VALIDATION_FAILED");
    const deadline = AbortSignal.timeout(20000);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    try {
      combined.throwIfAborted();
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.modelName)}:embedContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.key,
          },
          body: JSON.stringify({
            model: `models/${this.modelName}`,
            content: { parts: [{ text }] },
            outputDimensionality: this.dimensions,
          }),
          signal: combined,
          cache: "no-store",
          redirect: "error",
        },
      );
      aiDebug("embedding.http", {
        model: this.modelName,
        upstreamStatus: response.status,
        attempt: 1,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new DomainError(
          response.status === 429
            ? "RATE_LIMITED"
            : response.status === 404
              ? "CONFIGURATION_REQUIRED"
              : "PROVIDER_UNAVAILABLE",
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new DomainError("PROVIDER_UNAVAILABLE");
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 128 * 1024) throw new DomainError("PROVIDER_UNAVAILABLE");
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
      combined.throwIfAborted();
      const result = z
        .object({
          embedding: z.object({
            values: z.array(z.number().finite()).length(this.dimensions),
          }),
        })
        .safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (!result.success) throw new DomainError("PROVIDER_UNAVAILABLE");
      const values = result.data.embedding.values;
      const norm = Math.hypot(...values);
      if (!norm || !Number.isFinite(norm))
        throw new DomainError("PROVIDER_UNAVAILABLE");
      // Reduced-dimension vectors are normalized for cosine/dot-product retrieval.
      return values.map((value) => value / norm);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("PROVIDER_UNAVAILABLE");
    }
  }
}

export function embeddingGateway(
  env: Record<string, string | undefined> = process.env,
): EmbeddingGateway {
  const config = z
    .object({
      AI_EMBEDDING_PROVIDER: z.literal("gemini").default("gemini"),
      AI_EMBEDDING_MODEL: z
        .literal("gemini-embedding-2")
        .default("gemini-embedding-2"),
      GEMINI_API_KEY: z.string().trim().min(1),
    })
    .safeParse(env);
  if (!config.success) throw new DomainError("CONFIGURATION_REQUIRED");
  return new GeminiEmbeddingGateway(
    config.data.GEMINI_API_KEY,
    config.data.AI_EMBEDDING_MODEL,
  );
}
