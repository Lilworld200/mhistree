import { beforeEach, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({
  profile: vi.fn(),
  today: vi.fn(),
  assigned: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/auth/patient", () => ({
  requirePatient: async () => ({ session: "verified-session" }),
}));
vi.mock("@/lib/db/client", () => ({ database: () => "pool" }));
vi.mock("@/features/practitioner/profile", () => ({
  professionalProfile: state.profile,
}));
vi.mock("@/features/practitioner/daily", () => ({
  practitionerToday: state.today,
}));
vi.mock("@/features/organizations/assignments", () => ({
  assignedPatients: state.assigned,
}));
import { PractitionerDailyPage } from "@/features/practitioner/daily-page";
beforeEach(() => {
  vi.clearAllMocks();
  state.profile.mockResolvedValue({
    profile: { status: "approved", privileges: ["records.read"] },
  });
  state.today.mockResolvedValue({
    items: [],
    availability: [],
    notifications: [],
    limited: false,
  });
  state.assigned.mockResolvedValue([]);
});
it.each(["dashboard", "schedule", "inbox", "requests"] as const)(
  "%s uses current approval and server-owned care projections",
  async (view) => {
    const result = await PractitionerDailyPage({ view });
    expect(state.today).toHaveBeenCalledWith("pool", "verified-session");
    expect(result.props.view).toBe(view);
    expect(result.props.canManageAppointments).toBe(false);
  },
);
it.each(["pending", "rejected", "suspended"])(
  "%s profile cannot load professional daily data",
  async (status) => {
    state.profile.mockResolvedValue({
      profile: { status, privileges: ["appointments.manage"] },
    });
    await expect(PractitionerDailyPage({ view: "schedule" })).rejects.toThrow(
      "redirect:/clinician/profile",
    );
    expect(state.today).not.toHaveBeenCalled();
    expect(state.assigned).not.toHaveBeenCalled();
  },
);
