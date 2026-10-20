// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "@/components/layout/app-shell";
import { AccountEntry } from "@/features/patient/account/entry";
import ProfessionalChoice from "@/app/(auth)/auth/professional/page";
vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: () => createElement("img", { alt: "Mhistree" }),
}));
it("patient other options links to a distinct chooser with both professional paths", () => {
  const patient = renderToStaticMarkup(createElement(AccountEntry));
  expect(patient).toContain('href="/auth/professional"');
  expect(patient).toContain("Other options");
  const chooser = renderToStaticMarkup(createElement(ProfessionalChoice));
  expect(chooser).toContain('href="/auth/professional/practitioner"');
  expect(chooser).toContain('href="/auth/professional/organization"');
  expect(chooser).toContain("Healthcare professional");
});
it.each(["practitioner", "organization"] as const)(
  "%s entry has its own heading and patient-return link",
  (entry) => {
    const markup = renderToStaticMarkup(createElement(AccountEntry, { entry }));
    expect(markup).toContain(
      entry === "practitioner"
        ? "Healthcare professional sign in"
        : "Organization sign in",
    );
    expect(markup).toContain("Patient sign in");
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
