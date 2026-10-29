// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { InboxView } from "@/features/messaging/inbox-view";
import { InboxFindings } from "@/features/messaging/inbox-findings";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-api", () => ({
  api: request,
  errorMessage: (e: Error) => e.message,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, host: HTMLDivElement;
const connection = {
  connectionId: "connection",
  name: "Dr Synthetic",
  context: { kind: "patient" as const },
  unread: 1,
};
const page = {
  items: [
    {
      id: "message",
      content: "Please come for a check-up.",
      own: false,
      sequence: "7",
      sent_at: "2026-10-28T09:00:00Z",
    },
  ],
  nextCursor: null,
  analysis: { jobs: [] },
};
async function mount(element: ReturnType<typeof createElement>) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(element));
}
async function type(value: string) {
  await act(async () => {
    const field = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(label: string) {
  return [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(label),
  )!;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.resetAllMocks();
});
it("opens a standalone patient thread, preserves failed sends and binds retry to the same message key", async () => {
  let fail = true;
  request.mockImplementation(
    async (path: string, body?: { action: string }) => {
      if (body?.action === "send" && fail)
        throw new Error("DATABASE_UNAVAILABLE");
      if (body) return {};
      if (path === "/api/care/inbox") return { items: [connection] };
      return page;
    },
  );
  await mount(createElement(InboxView, { initialConnection: "connection" }));
  expect(host.textContent).toContain(page.items[0].content);
  expect(host.textContent).not.toContain("author_account_id");
  await type("My reply.");
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(host.querySelector("textarea")!.value).toBe("My reply.");
  fail = false;
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  const sends = request.mock.calls.filter(
    ([, body]) => body?.action === "send",
  );
  expect(sends).toHaveLength(2);
  expect(sends[0][1].data.requestKey).toBe(sends[1][1].data.requestKey);
  expect(host.querySelector("textarea")!.value).toBe("");
  expect(request.mock.calls.some(([path]) => path === "/api/chat")).toBe(false);
  await act(async () => button("Mark displayed messages read").click());
  expect(
    request.mock.calls.find(([, body]) => body?.action === "read")![1].data,
  ).toEqual({ throughSequence: "7" });
});
it("retains separate unsent drafts when switching care conversations", async () => {
  const other = { ...connection, connectionId: "second", name: "Dr Second" };
  request.mockImplementation(async (path: string) =>
    path === "/api/care/inbox" ? { items: [connection, other] } : page,
  );
  await mount(createElement(InboxView, { initialConnection: "connection" }));
  await type("Keep my draft.");
  await act(async () =>
    root.render(createElement(InboxView, { initialConnection: "second" })),
  );
  expect(host.querySelector("textarea")!.value).toBe("");
  await act(async () =>
    root.render(createElement(InboxView, { initialConnection: "connection" })),
  );
  expect(host.querySelector("textarea")!.value).toBe("Keep my draft.");
});
it("offers practitioner review without posting an automatic reply or publishing a record", async () => {
  const onOpened = vi.fn();
  request.mockImplementation(async (_path: string, body?: unknown) =>
    body
      ? { id: "run" }
      : {
          jobs: [],
          findings: [
            {
              id: "finding",
              message_id: "message",
              category: "ongoing",
              proposal: {
                body: {
                  text: "Suspected asthma.",
                  careDetails: { certainty: "suspected" },
                },
              },
              state: "pending",
              version: 1,
            },
          ],
        },
  );
  await mount(
    createElement(InboxFindings, {
      connectionId: "connection",
      context: { kind: "direct", connectionId: "connection" },
      onOpened,
    }),
  );
  expect(host.textContent).toContain("suspected");
  await act(async () => button("Review findings").click());
  expect(onOpened).toHaveBeenCalledTimes(1);
  expect(
    request.mock.calls
      .filter(([, body]) => body)
      .map(([, body]) => body.action),
  ).toEqual(["finding"]);
  expect(request.mock.calls.find(([, body]) => body)![1].data).toEqual({
    id: "finding",
    version: 1,
    action: "review",
  });
});

it.each([false, true])(
  "shows newest conversations first with read/unread and search filters (practitioner=%s)",
  async (practitioner) => {
    const older = {
      ...connection,
      unread: 0,
      latest_at: "2026-10-27T09:00:00Z",
    };
    const newer = {
      ...connection,
      connectionId: "newer",
      name: "Newer Person",
      unread: 3,
      latest_at: "2026-10-29T09:00:00Z",
    };
    const untouched = {
      ...connection,
      connectionId: "empty",
      name: "Another Person",
      unread: 0,
      latest_at: null,
    };
    request.mockResolvedValue({ items: [untouched, older, newer] });
    await mount(createElement(InboxView, { practitioner }));
    const rows = () => [
      ...host.querySelectorAll<HTMLAnchorElement>(".care-conversation"),
    ];
    expect(rows().map((r) => r.querySelector("strong")!.textContent)).toEqual([
      "Newer Person",
      "Dr Synthetic",
      "Another Person",
    ]);
    expect(rows()[0].getAttribute("href")).toContain(
      `${practitioner ? "/clinician/inbox" : "/inbox"}?connection=newer&context=`,
    );
    expect(host.querySelector("textarea")).toBeNull();
    await act(async () => button("Unread").click());
    expect(rows()).toHaveLength(1);
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Read")!
        .click(),
    );
    expect(rows()).toHaveLength(2);
    await act(async () => button("All").click());
    await act(async () => {
      const field = host.querySelector("input")!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(field, "newer");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rows()).toHaveLength(1);
    expect(request.mock.calls.some(([, body]) => body)).toBe(false);
  },
);
it.each([false, true])(
  "opens only the chosen chat with back navigation and retained pagination (practitioner=%s)",
  async (practitioner) => {
    const selected = practitioner
      ? {
          ...connection,
          context: { kind: "direct", connectionId: "connection" },
        }
      : connection;
    request.mockImplementation(async (path: string) => {
      if (!path.includes("connection=")) return { items: [selected] };
      if (path.includes("before="))
        return {
          ...page,
          items: [
            {
              ...page.items[0],
              id: "older",
              sequence: "6",
              content: "Earlier conversation",
            },
          ],
        };
      return { ...page, nextCursor: "6" };
    });
    await mount(
      createElement(InboxView, {
        practitioner,
        initialConnection: "connection",
      }),
    );
    expect(host.querySelector(".care-inbox-list")).toBeNull();
    expect(
      host
        .querySelector('a[aria-label="Back to care inbox"]')
        ?.getAttribute("href"),
    ).toBe(practitioner ? "/clinician/inbox" : "/inbox");
    expect(host.querySelector("textarea")).not.toBeNull();
    expect(host.textContent).toContain(page.items[0].content);
    expect(request.mock.calls.some(([, body]) => body?.action === "read")).toBe(
      false,
    );
    await act(async () => button("Earlier messages").click());
    expect(host.textContent).toContain("Earlier conversation");
    expect(host.textContent).toContain(page.items[0].content);
  },
);
