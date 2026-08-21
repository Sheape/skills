import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { MemoryRouter } from "react-router";

import { ChoiceActivity } from "@/app/components/activities";
import { AnnotationTarget } from "@/app/components/annotations";
import { CodeBlock, CodeScratchpad, CodeWalkthrough, type DebugCase } from "@/app/components/code";
import { LessonPage, TopicProvider, TopicSidebar } from "@/app/components/lesson-shell";
import { Citation } from "@/app/components/sources";
import { SteppedScene } from "@/app/components/stepped-scene";
import { ThemeProvider } from "@/app/theme";
import type { DiscoveredLesson, DiscoveredTopic, LessonSource, SceneStep } from "@/app/types";

const href = "/demo/lesson-001";
const lesson: DiscoveredLesson = {
  title: "State",
  summary: "State",
  mode: "generic",
  topicSlug: "demo",
  lessonId: "lesson-001",
  order: 1,
  href,
  load: async () => ({ Component: () => null }),
};
const topic: DiscoveredTopic = {
  slug: "demo",
  title: "Demo",
  summary: "Demo course",
  lessons: [lesson],
};
const source: LessonSource = {
  id: "source",
  title: "Primary source",
  url: "https://example.com/source",
  capturedAt: "2026-08-20",
  excerpt: "A short source preview.",
};

function Harness({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={[href]}>
      <ThemeProvider>
        <TopicProvider topic={topic}>{children}</TopicProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  document.body.innerHTML = '<div id="topic-controls"></div>';
});
afterEach(cleanup);

const steps: readonly SceneStep[] = [
  { id: "one", heading: "One", explanation: "First" },
  { id: "two", heading: "Two", explanation: "Second" },
  { id: "three", heading: "Three", explanation: "Third" },
];

describe("SteppedScene", () => {
  it("supports bounded keyboard navigation and reset", async () => {
    const user = userEvent.setup();
    render(<SteppedScene steps={steps}>{({ step }) => <h2>{step.heading}</h2>}</SteppedScene>);
    const scene = screen.getByRole("group", { name: "Interactive walkthrough" });
    scene.focus();
    await user.keyboard("{End}{ArrowRight}");
    expect(await screen.findByRole("heading", { name: "Three" })).toBeInTheDocument();
    await user.keyboard("{Home}");
    expect(await screen.findByRole("heading", { name: "One" })).toBeInTheDocument();
  });

  it("rejects an empty scene", () => {
    expect(() => render(<SteppedScene steps={[]}>{() => null}</SteppedScene>)).toThrow(
      "requires at least one step",
    );
  });
});

describe("lesson shell", () => {
  it("keeps the lesson drawer closed by default and closes it after navigation", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <TopicSidebar />
      </Harness>,
    );
    const open = await screen.findByRole("button", { name: "Open lesson menu" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(open);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /State/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(localStorage.getItem("teach-me:v2:drawer-open")).toBe("false");
  });

  it("requires solved activities before completion and resets the whole lesson", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <LessonPage title="State" summary="State" mode="generic" sources={[]}>
          <ChoiceActivity
            id="required"
            title="Required"
            prompt="Choose"
            options={[
              { id: "yes", label: "Yes" },
              { id: "no", label: "No" },
            ]}
            correctIds={["yes"]}
            hint="Choose yes."
            explanation="Yes is correct."
          />
        </LessonPage>
      </Harness>,
    );
    expect(screen.getByRole("button", { name: "Mark complete" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByRole("button", { name: "Mark complete" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Mark complete" }));
    expect(screen.getByText("Lesson complete")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark incomplete" }));
    expect(screen.getByRole("button", { name: "Solved" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Reset lesson" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("editor drafts");
    await user.click(screen.getAllByRole("button", { name: "Reset lesson" }).at(-1)!);
    expect(screen.getByRole("button", { name: "Check" })).toBeEnabled();
  });
});

describe("annotations and sources", () => {
  it("previews, pins, traverses, and closes annotations", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <AnnotationTarget
          annotation={{
            id: "one",
            kind: "do",
            label: "Prefer here",
            reason: "It is deterministic.",
          }}
        >
          First
        </AnnotationTarget>
        <AnnotationTarget
          annotation={{
            id: "two",
            kind: "dont",
            label: "Avoid here",
            reason: "It cannot be checked.",
          }}
        >
          Second
        </AnnotationTarget>
      </Harness>,
    );
    const first = screen.getByRole("button", { name: /First/ });
    await user.hover(first);
    expect(screen.getByRole("note")).toHaveTextContent("It is deterministic.");
    await user.click(first);
    expect(screen.getByRole("dialog")).toHaveTextContent("1 / 2");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Avoid here");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens citations on hover, pins on click, and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<Citation source={source} label="1" />);
    const marker = screen.getByRole("button", { name: "1" });
    await user.hover(marker);
    expect(screen.getByText("A short source preview.")).toBeInTheDocument();
    await user.click(marker);
    await user.unhover(marker);
    expect(screen.getByText("A short source preview.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByText("A short source preview.")).not.toBeInTheDocument(),
    );
  });
});

const walkthroughCases: readonly DebugCase[] = [
  {
    id: "normal",
    label: "Normal",
    description: "Normal case",
    frames: [
      {
        id: "line",
        line: 1,
        phase: "before",
        event: "line",
        callDepth: 0,
        heading: "Line",
        explanation: "Start",
        fidelity: "exact",
      },
      {
        id: "call",
        line: 1,
        phase: "before",
        event: "call",
        callDepth: 0,
        heading: "Call",
        explanation: "Call next",
        fidelity: "exact",
      },
      {
        id: "enter",
        line: 2,
        phase: "before",
        event: "enter",
        callDepth: 1,
        heading: "Enter",
        explanation: "Inside",
        fidelity: "exact",
        callStack: [{ functionName: "main" }, { functionName: "child", active: true }],
      },
      {
        id: "return",
        line: 2,
        phase: "after",
        event: "return",
        callDepth: 1,
        heading: "Return",
        explanation: "Return",
        fidelity: "exact",
      },
      {
        id: "done",
        line: 1,
        phase: "after",
        event: "line",
        callDepth: 0,
        heading: "Done",
        explanation: "Done",
        fidelity: "exact",
      },
    ],
  },
];

describe("code runtime", () => {
  it("renders a full active line and lazily highlights source", async () => {
    render(
      <Harness>
        <LessonPage title="Code" summary="Code" mode="technology" sources={[]}>
          <CodeBlock
            code={"const value = 1;\nconsole.log(value);"}
            language="javascript"
            activeLine={2}
          />
        </LessonPage>
      </Harness>,
    );
    expect(screen.getByText("ACTIVE").closest(".code-line")).toHaveAttribute("data-active", "true");
    await waitFor(() =>
      expect(screen.getByLabelText("Source code")).toHaveAttribute("data-highlighted", "true"),
    );
  });

  it("supports step in, step over, step out, restart, and persisted position", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <LessonPage title="Code" summary="Code" mode="technology" sources={[]}>
          <CodeWalkthrough
            id="walk"
            code={"main();\nchild();"}
            language="javascript"
            cases={walkthroughCases}
          />
        </LessonPage>
      </Harness>,
    );
    await user.click(screen.getByRole("button", { name: /Step in/ }));
    expect(await screen.findByRole("heading", { name: "Call" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Step over/ }));
    expect(await screen.findByRole("heading", { name: "Done" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Restart/ }));
    await user.click(screen.getByRole("button", { name: /Step in/ }));
    await user.click(screen.getByRole("button", { name: /Step in/ }));
    expect(await screen.findByRole("heading", { name: "Enter" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Step out/ }));
    expect(await screen.findByRole("heading", { name: "Done" })).toBeInTheDocument();
    expect(localStorage.getItem("teach-me:v2:lesson:%2Fdemo%2Flesson-001:debugger:walk")).toContain(
      '"frame":4',
    );
  });

  it("keeps an editable draft, labels output fidelity, copies, and resets", async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText");
    localStorage.setItem("teach-me:v1:theme", "dark");
    render(
      <Harness>
        <LessonPage title="Code" summary="Code" mode="technology" sources={[]}>
          <CodeScratchpad
            id="scratch"
            starter="console.log(1)"
            expectedOutput="1"
            outputKind="expected"
            runCommand="node lesson.js"
          />
        </LessonPage>
      </Harness>,
    );
    expect(document.querySelector(".cm-theme-dark")).toBeInTheDocument();
    expect(screen.getByText("Expected output")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy code" }));
    expect(copy).toHaveBeenCalledWith("console.log(1)");
    await user.click(screen.getByRole("button", { name: "Copy run command" }));
    expect(copy).toHaveBeenCalledWith("node lesson.js");
    await user.click(screen.getByRole("button", { name: "Reset code" }));
    expect(
      localStorage.getItem("teach-me:v2:lesson:%2Fdemo%2Flesson-001:scratchpad:scratch"),
    ).toContain("console.log(1)");
  });
});
