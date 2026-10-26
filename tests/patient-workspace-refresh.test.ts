// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { usePatientWorkspace } from "@/features/practitioner/use-patient-workspace";
import {
  WorkspaceView,
  type Workspace,
} from "@/features/practitioner/workspace-view";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-api", () => ({
  api: request,
  errorMessage: (e: Error) => e.message,
}));
const snapshot: Workspace = {
  patientPersonId: "synthetic-patient",
  revision: 1,
  state: [],
  recent: [],
  work: [],
  requests: [],
  messages: null,
};
let root: Root, host: HTMLDivElement;
let state: ReturnType<typeof usePatientWorkspace<Workspace>>;
const changed = vi.fn();
function Harness({
  view = "profile",
  initial = snapshot,
}: {
  view?: "profile" | "work";
  initial?: Workspace;
}) {
  const current = usePatientWorkspace(
    "synthetic-connection",
    view,
    initial,
    changed,
  );
  useEffect(() => {
    state = current;
  });
  return createElement(
    "div",
    null,
    current.error || "Ready",
    view === "work"
      ? createElement(WorkspaceView, {
          connectionId: "synthetic-connection",
          section: "work",
          controller: {
            data: current.data,
            ready: current.loadedView === view,
            refresh: current.refresh,
            clear: current.clear,
          },
        })
      : null,
  );
}
async function render(view: "profile" | "work" = "profile") {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () =>
    root.render(
      createElement(StrictMode, null, createElement(Harness, { view })),
    ),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  host = undefined as unknown as HTMLDivElement;
  request.mockReset();
  changed.mockReset();
  vi.useRealTimers();
});
it("hydrates the authorized snapshot without a duplicate fetch, including StrictMode effect replay", async () => {
  await render();
  expect(state.data).toBe(snapshot);
  expect(request).not.toHaveBeenCalled();
});
it("one slow refresh absorbs timer and focus events without overlapping requests", async () => {
  vi.useFakeTimers();
  let resolve!: (value: Workspace) => void;
  request.mockImplementation(
    () =>
      new Promise<Workspace>((done) => {
        resolve = done;
      }),
  );
  await render();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(45000);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => resolve(snapshot));
  expect(state.data).toBe(snapshot);
});
it("the open care panel shares one refresh owner and requests only its focused view", async () => {
  vi.useFakeTimers();
  request.mockResolvedValue(snapshot);
  await render();
  await render("work");
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toContain("view=work");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(request).toHaveBeenCalledTimes(2); // No independent WorkspaceView poll/fetch.
  expect(host.textContent).toContain("Care notes");
});
it("queues a changed view behind the current request and ignores the old view response", async () => {
  const pending: ((value: Workspace) => void)[] = [];
  request.mockImplementation(
    () => new Promise<Workspace>((done) => pending.push(done)),
  );
  await render();
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  await render("work");
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => pending[0](snapshot));
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1][0]).toContain("view=work");
  expect(state.loadedView).toBe("profile");
  await act(async () => pending[1](snapshot));
  expect(state.loadedView).toBe("work");
});
it("access loss clears sensitive state; changed scope closes the active panel", async () => {
  await render();
  request.mockResolvedValueOnce({ ...snapshot, revision: 2 });
  await act(async () => {
    await state.refresh();
  });
  expect(changed).toHaveBeenCalledTimes(1);
  request.mockRejectedValueOnce(new Error("ACCESS_DENIED"));
  await act(async () => {
    await state.refresh();
  });
  expect(state.data).toBeNull();
  expect(state.error).toBe("ACCESS_DENIED");
  expect(changed).toHaveBeenCalledTimes(2);
});
it("a failed clinical save retains the unsaved form and never retries the mutation", async () => {
  request.mockResolvedValue(snapshot);
  await render("work");
  request.mockClear();
  const input = host.querySelector<HTMLTextAreaElement>(
    'textarea[name="text"]',
  )!;
  input.value = "Unsent synthetic care note";
  request.mockRejectedValueOnce(new Error("DATABASE_UNAVAILABLE"));
  await act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][1].action).toBe("save");
  expect(
    host.querySelector<HTMLTextAreaElement>('textarea[name="text"]')?.value,
  ).toBe("Unsent synthetic care note");
  expect(host.textContent).toContain("DATABASE_UNAVAILABLE");
  expect(changed).not.toHaveBeenCalled();
});
