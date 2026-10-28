import { it, expect } from "vitest";
import {
  medicationStatement,
  localDay,
} from "@/features/clinical-care/medication-recommendations";
it("rejects ambiguous questions, hypothetical use, unrelated yes and contact negatives", () => {
  for (const text of [
    "yes",
    "no",
    "Can I take Paracetamol?",
    "I might start Paracetamol.",
    "I never stopped taking Paracetamol.",
    "Paracetamol is a question. I am taking Ibuprofen.",
    "I'll take para.",
  ])
    expect(medicationStatement(text, "Paracetamol")).toBeNull();
  expect(
    medicationStatement(
      "yes",
      "Paracetamol",
      "Would you like to contact your practitioner?",
    ),
  ).toBeNull();
  expect(
    medicationStatement(
      "yes",
      "Paracetamol",
      "Have you started taking Paracetamol?",
    ),
  ).toBe("taking");
  expect(
    medicationStatement(
      "I’ll start taking Paracetamol tomorrow.",
      "Paracetamol",
    ),
  ).toBe("planned");
  expect(
    medicationStatement(
      "I'll start taking Paracetamol tomorrow.",
      "Paracetamol",
    ),
  ).toBe("planned");
  expect(medicationStatement("I won't start Paracetamol.", "Paracetamol")).toBe(
    "declined",
  );
  expect(localDay(new Date("2026-10-28T23:30:00Z"), "Africa/Lagos")).toBe(
    "2026-10-29",
  );
});

it("requires clarification for the ambiguous practitioner medicine name para", async () => {
  const { proposalGaps } = await import("@/features/clinical-care/ai-proposal");
  expect(
    proposalGaps({
      category: "prescription",
      body: {
        text: "Para 500 mg once daily.",
        bodySite: null,
        contextLinks: [],
      },
      occurredAt: { precision: "unknown" },
      status: "unknown",
      sourceSpans: ["Para 500 mg once daily."],
      missingDetails: [],
      medicationDetails: {
        name: "para",
        dose: "500 mg",
        frequency: "once daily",
      },
    }),
  ).toContain("Clarify medication name.");
});

it("recognizes explicit contracted patient use without importing a recommended regimen", () => {
  expect(
    medicationStatement(
      "I've been taking Paracetamol for two weeks.",
      "Paracetamol",
    ),
  ).toBe("taking");
  expect(
    medicationStatement(
      "Yes, I've started taking it.",
      "Paracetamol",
      "Have you started taking Paracetamol?",
    ),
  ).toBe("taking");
  expect(
    medicationStatement("I've stopped taking Paracetamol.", "Paracetamol"),
  ).toBe("stopped");
  expect(
    medicationStatement(
      "Yes, I've started taking it.",
      "Paracetamol",
      "Would you like to ask your doctor?",
    ),
  ).toBeNull();
  expect(
    medicationStatement(
      "I've been thinking about taking Paracetamol.",
      "Paracetamol",
    ),
  ).toBeNull();
});
