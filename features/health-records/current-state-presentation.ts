export function medicationPresentation(
  body: { medication?: { useStatus: string; plannedEnd?: string | null } },
  now = new Date(),
) {
  const use = body.medication;
  if (!use)
    return {
      useStatus: "unknown",
      explanation: "Current use has not been established.",
    };
  if (
    use.useStatus === "taking" &&
    use.plannedEnd &&
    use.plannedEnd < now.toISOString().slice(0, 10)
  )
    return {
      useStatus: "unknown",
      explanation:
        "The planned course has ended. Actual current use is not confirmed; the original report is retained.",
    };
  return {
    useStatus: use.useStatus,
    explanation:
      "Patient-reported use; a prescription does not prove use or fulfillment.",
  };
}
