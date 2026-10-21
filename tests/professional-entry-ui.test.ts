// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "@/components/layout/app-shell";
import { ProfileView } from "@/features/patient/account/profile";
import { AccountEntry } from "@/features/patient/account/entry";
import { ProfessionalAuthForm } from "@/features/professional-onboarding/auth-form";
const route = vi.hoisted(() => ({ pathname: "/chat", query: "" }));
beforeEach(() => {
  route.pathname = "/chat";
  route.query = "";
});
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.query),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: () => createElement("img", { alt: "Mhistree" }),
}));
it("registration options appear only on signup and lead to each registration", () => {
  const patient = renderToStaticMarkup(createElement(AccountEntry));
  expect(patient).not.toContain('href="/auth/professional');
  const signup = renderToStaticMarkup(
    createElement(AccountEntry, { initialMode: "signup" }),
  );
  expect(signup).toContain(
    'href="/auth/professional/signup?entry=practitioner"',
  );
  expect(signup).toContain(
    'href="/auth/professional/signup?entry=organization"',
  );
  expect(patient).toContain("Other options");
  const chooser = renderToStaticMarkup(
    createElement(ProfessionalAuthForm, {
      entry: "practitioner",
    }),
  );
  expect(chooser).not.toContain("pro-type-nav");
  expect(chooser).toContain("account-card");
  expect(chooser).toContain("Practitioner registration");
});
it.each(["practitioner", "organization"] as const)(
  "%s registration uses the shared sign-in link",
  (entry) => {
    const markup = renderToStaticMarkup(
      createElement(ProfessionalAuthForm, { entry }),
    );
    expect(markup).toContain(
      entry === "practitioner"
        ? "Practitioner registration"
        : "Organization registration",
    );
    expect(markup).toContain('href="/auth"');
    expect(markup).not.toContain("pro-mode-nav");
    expect(markup).not.toContain("pro-type-nav");
  },
);
it("patient-only shell exposes neither clinical nor organization navigation", () => {
  const markup = renderToStaticMarkup(
    createElement(AppShell, null, "Patient content"),
  );
  expect(markup).not.toContain('href="/clinician/dashboard"');
  expect(markup).not.toContain('href="/organizations"');
  expect(markup).toContain('href="/health"');
});
it("an approved practitioner receives the clinical link without unrelated organization access", () => {
  route.pathname = "/clinician/dashboard";
  const markup = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        workspaces: {
          practitioner: true,
          professionalProfile: true,
          organizations: false,
        },
      },
      "Work",
    ),
  );
  expect(markup).toContain('href="/clinician/dashboard"');
  expect(markup).not.toContain('href="/organizations"');
});
it("pending professionals see application status while organization members get their own section", () => {
  const markup = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        workspaces: {
          practitioner: false,
          professionalProfile: true,
          organizations: true,
        },
      },
      "Work",
    ),
  );
  expect(markup).toContain('href="/clinician/profile"');
  expect(markup).not.toContain('href="/clinician/dashboard"');
  expect(markup).toContain('href="/organizations"');
});

it("professional navigation links to profile rather than switching modes", () => {
  route.pathname = "/clinician/dashboard";
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        workspaces: {
          practitioner: true,
          professionalProfile: true,
          organizations: false,
        },
      },
      "Workspace",
    ),
  );
  const nav = host.querySelector('nav[aria-label="Practitioner navigation"]')!;
  expect(nav).not.toBeNull();
  expect(nav.querySelector('a[href="/clinician/patients"]')).not.toBeNull();
  expect(nav.querySelector('a[href="/chat"]')).toBeNull();
  expect(host.querySelector(".workspace-switch")).toBeNull();
  expect(host.querySelector(".prow")?.getAttribute("href")).toBe(
    "/profile?workspace=practitioner",
  );
  expect(host.textContent).not.toContain("RECENT CONVERSATIONS");
});
it("personal navigation links to profile without a workspace-switch button", () => {
  route.pathname = "/health";
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        workspaces: {
          practitioner: true,
          professionalProfile: true,
          organizations: false,
        },
      },
      "Personal",
    ),
  );
  expect(
    host.querySelector(
      'nav[aria-label="Patient navigation"] a[href="/health"]',
    ),
  ).not.toBeNull();
  expect(host.querySelector(".workspace-switch")).toBeNull();
  expect(host.querySelector(".prow")?.getAttribute("href")).toBe("/profile");
});

const profileFixture = {
  accountId: "synthetic-account",
  display_name: "Synthetic Practitioner",
  birth_date: null,
  profile_version: 1,
  login_identifier: "synthetic@example.com",
  contacts: [],
};
it.each(["personal", "practitioner"] as const)(
  "profile offers the opposite workspace from %s mode",
  (mode) => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      createElement(ProfileView, {
        initial: profileFixture,
        canSwitchWorkspace: true,
        currentWorkspace: mode,
      }),
    );
    const settings = host.querySelector('[aria-label="Workspace settings"]')!;
    expect(settings.querySelector("a")?.getAttribute("href")).toBe(
      mode === "practitioner" ? "/chat" : "/clinician/dashboard",
    );
  },
);
it("ordinary profiles have no workspace switching controls", () => {
  const html = renderToStaticMarkup(
    createElement(ProfileView, { initial: profileFixture }),
  );
  expect(html).not.toContain('aria-label="Workspace settings"');
});
it("opening profile from professional mode keeps professional navigation", () => {
  route.pathname = "/profile";
  route.query = "workspace=practitioner";
  const html = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        workspaces: {
          practitioner: true,
          professionalProfile: true,
          organizations: false,
        },
      },
      "Profile",
    ),
  );
  expect(html).toContain('aria-label="Practitioner navigation"');
});
it("a profile URL hint does not give an ordinary account professional navigation", () => {
  route.pathname = "/profile";
  route.query = "workspace=practitioner";
  const html = renderToStaticMarkup(createElement(AppShell, null, "Profile"));
  expect(html).not.toContain('aria-label="Practitioner navigation"');
});
