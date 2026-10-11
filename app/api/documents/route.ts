import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
import {
  documentsList,
  uploadDocument,
  parseDocument,
} from "@/features/documents/server";
const upload = z
  .object({
    filename: z.string().min(1).max(200),
    mime: z.enum(["text/plain", "application/pdf"]),
    base64: z
      .string()
      .max(14 * 1024 * 1024)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    key: z.uuid(),
    timezone: z.string().max(100),
  })
  .strict();
export async function GET(request: NextRequest) {
  try {
    return success(await documentsList(database(), sessionFrom(request)));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    mutationGuard(request);
    const input = z
      .object({ action: z.enum(["upload", "parse"]), data: z.unknown() })
      .strict()
      .parse(await jsonBody(request, 15 * 1024 * 1024));
    if (input.action === "parse")
      return success(
        await parseDocument(
          database(),
          sessionFrom(request),
          z.object({ id: z.uuid() }).strict().parse(input.data).id,
        ),
      );
    const data = upload.parse(input.data);
    return success(
      await uploadDocument(database(), sessionFrom(request), {
        filename: data.filename,
        mime: data.mime,
        bytes: new Uint8Array(Buffer.from(data.base64, "base64")),
        key: data.key,
        timezone: data.timezone,
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
