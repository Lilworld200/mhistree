import { afterEach, expect, it, vi } from "vitest";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
const { access, patient } = vi.hoisted(() => ({
  access: vi.fn(),
  patient: vi.fn(),
}));
vi.mock("@/lib/auth/patient", () => ({ requirePatient: patient }));
vi.mock("@/features/auth/workspace-access", () => ({
  workspaceAccess: access,
}));
vi.mock("@/lib/db/client", () => ({ database: () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw Error(`redirect:${path}`);
  },
}));
afterEach(() => vi.resetAllMocks());
it.each(["practitioner", "organization"] as const)(
  "patient direct navigation to %s returns to explicit enrollment",
  async (area) => {
    patient.mockResolvedValue({ session: "synthetic-session" });
    access.mockResolvedValue({
      practitioner: false,
      professionalProfile: false,
      organizations: false,
    });
    await expect(
      AuthenticatedShell({ area, children: "private" }),
    ).rejects.toThrow(`redirect:/auth/professional/${area}`);
    expect(patient).toHaveBeenCalledWith(`/auth/professional/${area}`);
  },
);
it("patient pages render with a server-derived empty workspace projection", async () => {
  patient.mockResolvedValue({ session: "synthetic-session" });
  access.mockResolvedValue({
    practitioner: false,
    professionalProfile: false,
    organizations: false,
  });
  const result = await AuthenticatedShell({ children: "patient" });
  expect(result.props.workspaces.organizations).toBe(false);
  expect(access.mock.calls[0][1]).toBe("synthetic-session");
});
