import { expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { embeddingGateway } from "@/lib/ai/embeddings";

// One short synthetic call. No records, keys, source text or vectors are logged.
it.runIf(process.env.MHISTREE_LIVE_EMBEDDING_TEST === "1")(
  "Google embedding connectivity and current quota",
  async () => {
    const env = Object.assign(
      {},
      ...[".env", ".env.local"]
        .filter(existsSync)
        .map((path) => parseEnv(readFileSync(path, "utf8"))),
      process.env,
    );
    const gateway = embeddingGateway(env);
    const vector = await gateway.embed(
      "Synthetic embedding connectivity test.",
    );
    expect(gateway.modelName).toBe("gemini-embedding-2");
    expect(vector).toHaveLength(768);
    expect(vector.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...vector)).toBeCloseTo(1, 6);
  },
  25000,
);
