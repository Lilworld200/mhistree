// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useAppViewport } from "@/components/layout/use-app-viewport";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, host: HTMLDivElement;
function Fixture() {
  return createElement("div", {
    ref: useAppViewport(),
    className: "app-viewport",
  });
}
async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(Fixture)));
  return host.firstElementChild as HTMLDivElement;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});
it("tracks the visible keyboard area, restores after dismissal and removes listeners on unmount", async () => {
  const viewport = Object.assign(new EventTarget(), { height: 700, scale: 1 });
  const remove = vi.spyOn(viewport, "removeEventListener");
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 800);
  const element = await mount();
  expect(element.style.getPropertyValue("--app-viewport-height")).toBe("700px");
  viewport.height = 350;
  viewport.dispatchEvent(new Event("resize"));
  expect(element.style.getPropertyValue("--app-viewport-height")).toBe("350px");
  viewport.height = 700;
  viewport.dispatchEvent(new Event("resize"));
  expect(element.style.getPropertyValue("--app-viewport-height")).toBe("700px");
  await act(async () => root.unmount());
  expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
  expect(element.style.getPropertyValue("--app-viewport-height")).toBe("");
});
it("uses CSS sizing during pinch zoom and bounds measurements to the layout viewport", async () => {
  const viewport = Object.assign(new EventTarget(), { height: 900, scale: 1 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 800);
  const element = await mount();
  expect(element.style.getPropertyValue("--app-viewport-height")).toBe("800px");
  viewport.scale = 2;
  viewport.height = 400;
  viewport.dispatchEvent(new Event("resize"));
  expect(element.style.getPropertyValue("--app-viewport-height")).toBe("");
});
it("retains the CSS dynamic-viewport fallback without VisualViewport", async () => {
  vi.stubGlobal("visualViewport", undefined);
  expect((await mount()).style.getPropertyValue("--app-viewport-height")).toBe(
    "",
  );
});
