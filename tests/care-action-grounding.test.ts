import { expect, it } from "vitest";
import {
  intendedCareRecipient,
  reviewedCareDraft,
} from "@/features/ai-chat/care-action-schema";
const ada = {
  name: "Dr. Ada Example",
  connectionId: "ada-connection",
  practitionerId: "ada",
  revision: 1,
  kind: "direct" as const,
};
const bisi = {
  ...ada,
  name: "Dr. Bisi Example",
  connectionId: "bisi-connection",
  practitionerId: "bisi",
};
it("does not substitute an eligible doctor for an unknown named person", () => {
  expect(
    intendedCareRecipient("Please contact Mr. Unknown about my tablets.", [
      ada,
    ]),
  ).toBeUndefined();
  expect(
    intendedCareRecipient("Please message my doctor.", [ada]),
  ).toBeUndefined();
});
it("requires choosing a recipient for ambiguous or multiple named addressees", () => {
  expect(
    intendedCareRecipient("Message my doctor.", [ada, bisi]),
  ).toBeUndefined();
  expect(
    intendedCareRecipient(
      "Message both Dr. Ada Example and Dr. Bisi Example.",
      [ada, bisi],
    ),
  ).toBeUndefined();
  expect(
    intendedCareRecipient("Message Dr. Bisi Example.", [ada, bisi]),
  ).toBeUndefined();
  expect(intendedCareRecipient("Dr. Bisi Example", [ada, bisi])).toEqual(bisi);
});
it("retains conditional medication wording literally and never truncates a source into a different claim", () => {
  const text = "If I take paracetamol, would it help? I have not taken any.";
  expect(reviewedCareDraft(text)).toBe(
    "I'd like advice about this:\n\n" + text,
  );
  expect(reviewedCareDraft("x".repeat(10000))).toBe("");
});
