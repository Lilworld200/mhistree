// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("next/image", () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean },
  ) => {
    const copy = { ...props };
    delete copy.priority;
    return createElement("img", copy);
  },
}));

import { AccountEntry } from "@/features/patient/account/entry";

describe("account entry navigation layout", () => {
  it("renders Forgot password on the left and account switch on the right on the same row", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    flushSync(() =>
      root.render(createElement(AccountEntry, { initialMode: "login" })),
    );

    const row = host.querySelector(".account-row");
    expect(row).not.toBeNull();

    const recoveryLink = row?.querySelector("a.account-recovery-link");
    expect(recoveryLink).not.toBeNull();
    expect(recoveryLink?.textContent?.trim()).toBe("Forgot password?");
    expect(recoveryLink?.getAttribute("href")).toBe("/recovery");

    const switchSection = row?.querySelector(".account-switch");
    expect(switchSection).not.toBeNull();
    expect(switchSection?.textContent).toContain("Don’t have an account?");

    const switchBtn = switchSection?.querySelector("button.account-link");
    expect(switchBtn?.textContent?.trim()).toBe("Sign up");

    // Click switch button to toggle to signup mode
    flushSync(() => {
      (switchBtn as HTMLButtonElement).click();
    });

    const signupRow = host.querySelector(".account-row");
    expect(signupRow).not.toBeNull();

    const signupRecoveryLink = signupRow?.querySelector(
      "a.account-recovery-link",
    );
    expect(signupRecoveryLink?.textContent?.trim()).toBe("Forgot password?");

    const signupSwitch = signupRow?.querySelector(".account-switch");
    expect(signupSwitch?.textContent).toContain("Have an account?");

    const signInBtn = signupSwitch?.querySelector("button.account-link");
    expect(signInBtn?.textContent?.trim()).toBe("Sign in");

    // Click switch button to toggle back to login mode
    flushSync(() => {
      (signInBtn as HTMLButtonElement).click();
    });

    expect(
      host.querySelector(".account-switch")?.textContent,
    ).toContain("Don’t have an account?");

    flushSync(() => root.unmount());
    host.remove();
  });
});
