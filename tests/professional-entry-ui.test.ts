// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "@/components/layout/app-shell";
import { AccountEntry } from "@/features/patient/account/entry";
import { ProfessionalAuthForm } from "@/features/professional-onboarding/auth-form";
vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
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
  expect(chooser).toContain(
    'href="/auth/professional/signup?entry=practitioner"',
  );
  expect(chooser).toContain(
    'href="/auth/professional/signup?entry=organization"',
  );
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
