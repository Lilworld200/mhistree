// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import ErrorBoundary from "@/app/error";
describe("error recovery presentation", () => {
  it("withholds the internal error and invokes the framework refetch callback", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const retry = vi.fn();
    flushSync(() =>
      root.render(
        createElement(ErrorBoundary, {
          error: new Error("secret payload"),
          retry,
        }),
      ),
    );
    expect(host.textContent).not.toContain("secret payload");
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    host.querySelector("button")!.click();
    expect(retry).toHaveBeenCalledOnce();
    flushSync(() => root.unmount());
    host.remove();
  });
});
