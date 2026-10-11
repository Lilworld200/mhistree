import "server-only";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
export class LocalPrivateStore {
  constructor(
    private root = process.env.PRIVATE_STORAGE_ROOT ??
      resolve(".local/private-originals"),
  ) {
    if (
      process.env.NODE_ENV === "production" &&
      !process.env.PRIVATE_STORAGE_ROOT
    )
      throw new DomainError("CONFIGURATION_REQUIRED");
  }
  private path(key: string) {
    z.uuid().parse(key);
    return resolve(this.root, key);
  }
  async write(key: string, bytes: Uint8Array) {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.path(key), bytes, { flag: "wx", mode: 0o600 });
  }
  async read(key: string) {
    return new Uint8Array(await readFile(this.path(key)));
  }
}
