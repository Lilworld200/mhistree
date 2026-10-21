import { afterEach, expect, it, vi } from "vitest";
import Page from "@/app/(auth)/auth/professional/[entry]/page";
import { ApplicationFlow } from "@/features/professional-onboarding/application";
import { professionalAuthPath } from "@/features/auth/entry-path";
const { current, profile, organizations } = vi.hoisted(() => ({
  current: vi.fn(),
  profile: vi.fn(),
  organizations: vi.fn(),
}));
vi.mock("@/lib/auth/patient", () => ({ currentPatient: current }));
vi.mock("@/lib/db/client", () => ({ database: () => ({}) }));
vi.mock("@/features/practitioner/profile", () => ({
  professionalProfile: profile,
}));
vi.mock("@/features/organizations/server", () => ({
  myOrganizations: organizations,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Error("not-found");
  },
  redirect: (path: string) => {
    throw Error(`redirect:${path}`);
  },
}));
afterEach(() => vi.resetAllMocks());
it.each(["practitioner", "organization"])(
  "unauthenticated %s entry renders the distinct account form",
  async (entry) => {
    current.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ entry }) })).rejects.toThrow(
      `redirect:${professionalAuthPath(entry as "practitioner" | "organization", "signup")}`,
    );
    expect(profile).not.toHaveBeenCalled();
  },
);
it("an authenticated approved professional goes to their existing workspace", async () => {
  current.mockResolvedValue({ session: "synthetic" });
  profile.mockResolvedValue({
    profile: { status: "approved" },
    applications: [],
  });
  await expect(
    Page({ params: Promise.resolve({ entry: "practitioner" }) }),
  ).rejects.toThrow("redirect:/clinician/dashboard");
});
it("an authenticated patient can explicitly enter professional application without creating another login", async () => {
  current.mockResolvedValue({ session: "synthetic" });
  profile.mockResolvedValue({ profile: null, applications: [] });
  expect(
    (await Page({ params: Promise.resolve({ entry: "practitioner" }) })).type,
  ).toBe(ApplicationFlow);
  expect(profile.mock.calls[0][1]).toBe("synthetic");
});
it("unrecognized entry types fail before checking an account", async () => {
  await expect(
    Page({ params: Promise.resolve({ entry: "administrator" }) }),
  ).rejects.toThrow("not-found");
  expect(current).not.toHaveBeenCalled();
});
