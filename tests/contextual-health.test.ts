import { expect, it } from "vitest";
import { contextPlan } from "@/features/ai-chat/context-plan";
import {
  chooseCareRecipients,
  confirmationAnswer,
} from "@/features/ai-chat/care-action-schema";
import {
  groundedContactDraft,
  conversationalHealthText,
  contactOfferAccepted,
  requestedCareAction,
  unresolvedMedicineName,
} from "@/features/ai-chat/health-context";
const symptom = {
  topic: "health",
  decision: "clarification",
  question: { kind: "symptom", subject: "dry throat" },
};
it("routes named drugs and personal treatment wording without a separate model router", () => {
  expect(contextPlan("Tell me about parastamol").medication).toBe(true);
  expect(contextPlan("Is it safe for me to drink omeprazole?")).toMatchObject({
    timeline: true,
    medication: true,
    personalMedication: true,
  });
  expect(
    contextPlan("I want to take a medicine called co trimazole"),
  ).toMatchObject({ timeline: true, medication: true });
  expect(
    contextPlan("Can I take a drug called unfamiliar-name?"),
  ).toMatchObject({ timeline: true, medication: true });
});
it("retains short health follow-ups and stops when the topic changes", () => {
  const history = [
    { role: "patient", content: "I have a dry throat this morning" },
    {
      role: "assistant",
      content: "Is your throat still dry?",
      dialogue: symptom,
    },
    { role: "patient", content: "yes" },
  ];
  expect(contextPlan("yes", history)).toMatchObject({ timeline: true });
  expect(
    contextPlan("yes", [
      { role: "patient", content: "I want to take co trimazole" },
      {
        role: "assistant",
        content: "Is that for your earlier concern?",
        dialogue: symptom,
      },
      { role: "patient", content: "yes" },
    ]).searchText,
  ).toContain("dry throat");
  expect(contextPlan("Let's talk about coding", history).timeline).toBe(false);
  expect(
    contextPlan("yes", [
      ...history,
      {
        role: "assistant",
        content: "Would you like a code example?",
        dialogue: {
          topic: "everyday",
          question: { kind: "other", subject: "code" },
        },
      },
    ]).timeline,
  ).toBe(false);
});
it("distinguishes symptom agreement from contact preparation", () => {
  expect(
    contactOfferAccepted(
      [{ role: "assistant", content: "Still dry?", dialogue: symptom }],
      "yes",
    ),
  ).toBe(false);
  expect(
    contactOfferAccepted(
      [
        {
          role: "assistant",
          content: "Would you like to ask your practitioner?",
          dialogue: {
            question: { kind: "offer_contact", subject: "medicine" },
          },
        },
      ],
      "yes",
    ),
  ).toBe(true);
});
it("builds a nonblank multi-turn question without inventing medicine use", () => {
  const history = [
    { role: "patient", content: "I am considering co trimazole" },
    {
      role: "assistant",
      content: "Is your throat still dry?",
      dialogue: symptom,
    },
    { role: "patient", content: "yes" },
    {
      role: "assistant",
      content: "Would you like help asking your practitioner?",
      dialogue: { question: { kind: "offer_contact", subject: "medicine" } },
    },
    { role: "patient", content: "yes" },
  ];
  const draft = groundedContactDraft(history, "yes", [
    "I have been taking 20mg every day",
  ]);
  expect(draft).toContain("I am considering co trimazole");
  expect(draft).toContain("Is your throat still dry?");
  expect(draft).not.toContain("20mg");
  expect(draft).toContain("Could you advise");
});
it("blocks the observed unsupported reassurance and routine disclaimer", () => {
  const text = conversationalHealthText(
    "I'm not a doctor, but it is usually fine if you are not taking other medicines.",
    true,
    true,
    false,
  );
  expect(text).not.toMatch(/not a doctor|usually fine/i);
  expect(text).toContain("related to what you mentioned earlier");
});
it("preselects a named recipient or the first eligible server-ranked default", () => {
  const a = {
      name: "Dr Ada Example",
      connectionId: "a",
      practitionerId: "aa",
      revision: 1,
      kind: "direct" as const,
    },
    b = {
      ...a,
      name: "Dr Bisi Example",
      connectionId: "b",
      practitionerId: "bb",
    };
  expect(chooseCareRecipients("my doctor", [a, b])[0].connectionId).toBe("a");
  expect(
    chooseCareRecipients("Please ask Dr Bisi Example", [a, b])[0].connectionId,
  ).toBe("b");
  expect(chooseCareRecipients("Ask Dr Unknown", [a, b])).toEqual([]);
});
it("accepts only standalone confirmation/cancellation, not mixed or quoted consent", () => {
  for (const text of ["yes", "okay", "go ahead", "proceed", "yes please"])
    expect(confirmationAnswer(text)).toBe("yes");
  for (const text of ["no", "cancel", "don't send"])
    expect(confirmationAnswer(text)).toBe("no");
  for (const text of [
    "okay but change it",
    "yes my throat hurts",
    'He said "okay"',
    "okay?",
  ])
    expect(confirmationAnswer(text)).toBeNull();
});

it("clarifies the reported ambiguous drug without guessing its class", () => {
  const text = conversationalHealthText(
    "It is an antibiotic.",
    true,
    true,
    false,
    "I want to take co trimazole",
    true,
  );
  expect(text).toContain("dry throat");
  expect(text).toContain("exact name");
  expect(text).not.toContain("antibiotic");
});
it("requires patient intent before preparing a model-suggested message", () => {
  const reply = {
    text: "Ask your doctor",
    action: {
      kind: "message" as const,
      connectionId: null,
      practitionerId: null,
      draft: "",
    },
  };
  expect(
    requestedCareAction(reply, "I want to take co trimazole", false),
  ).toBeNull();
  expect(requestedCareAction(reply, "yes", true)?.kind).toBe("message");
});

it("keeps spelling uncertainty through yes and accepts the patient's corrected name", () => {
  const history = [{ role: "patient", content: "I want co trimazole" }];
  expect(unresolvedMedicineName(history, "yes my throat is dry")).toBe(true);
  expect(
    unresolvedMedicineName(history, "The packet says co-trimoxazole"),
  ).toBe(false);
  expect(
    conversationalHealthText(
      "An antibiotic like co-trimoxazole may help",
      true,
      true,
      false,
      "Yes",
      true,
      true,
    ),
  ).toContain("exact name");
});
