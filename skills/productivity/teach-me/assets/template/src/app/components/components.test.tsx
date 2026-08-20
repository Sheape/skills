import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { MemoryRouter } from "react-router";

import { ChallengeCard, PredictionPrompt } from "@/app/components/activities";
import { LessonPage, TopicProvider } from "@/app/components/lesson-shell";
import { Citation } from "@/app/components/sources";
import { SteppedScene } from "@/app/components/stepped-scene";
import { ThemeToggle } from "@/app/layouts";
import { ThemeProvider } from "@/app/theme";
import type { DiscoveredLesson, DiscoveredTopic, LessonSource, SceneStep } from "@/app/types";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
});

afterEach(cleanup);

const steps: readonly SceneStep[] = [
  { id: "one", heading: "One", explanation: "First" },
  { id: "two", heading: "Two", explanation: "Second" },
  { id: "three", heading: "Three", explanation: "Third" },
];

describe("SteppedScene", () => {
  it("supports controls, bounded keyboard navigation, and reset", async () => {
    const user = userEvent.setup();
    render(<SteppedScene steps={steps}>{({ step }) => <h2>{step.heading}</h2>}</SteppedScene>);

    expect(screen.getByRole("heading", { name: "One" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Two" })).toBeInTheDocument();

    const scene = screen.getByRole("group", { name: "Interactive walkthrough" });
    scene.focus();
    await user.keyboard("{End}");
    expect(await screen.findByRole("heading", { name: "Three" })).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("heading", { name: "Three" })).toBeInTheDocument();
    await user.keyboard("{Home}");
    expect(await screen.findByRole("heading", { name: "One" })).toBeInTheDocument();
  });

  it("rejects an empty scene", () => {
    expect(() => render(<SteppedScene steps={[]}>{() => null}</SteppedScene>)).toThrow(
      "requires at least one step",
    );
  });
});

describe("lesson activities", () => {
  it("keeps a prediction local and resets it", async () => {
    const user = userEvent.setup();
    render(<PredictionPrompt prompt="What changes?" reveal="Only the active edge." />);

    const reveal = screen.getByRole("button", { name: "Reveal" });
    expect(reveal).toBeDisabled();
    await user.type(screen.getByLabelText("Your prediction"), "The edge changes");
    await user.click(reveal);
    expect(screen.getByText("Only the active edge.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByLabelText("Your prediction")).toHaveValue("");
    expect(screen.queryByText("Only the active edge.")).not.toBeInTheDocument();
  });

  it("reveals and hides authored challenge help", async () => {
    const user = userEvent.setup();
    render(
      <ChallengeCard title="Transfer" prompt="Apply it" hint="Start small" answer="One path" />,
    );
    await user.click(screen.getByRole("button", { name: "Show hint" }));
    expect(screen.getByText("Start small")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(screen.getByText("One path")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide hint" }));
    expect(screen.queryByText("Start small")).not.toBeInTheDocument();
  });
});

describe("sources and progress", () => {
  const source: LessonSource = {
    id: "source",
    title: "Primary source",
    url: "https://example.com/source",
    capturedAt: "2026-08-20",
    excerpt: "A short source preview.",
  };

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

  it("changes completion only through the explicit action", async () => {
    const user = userEvent.setup();
    const lesson: DiscoveredLesson = {
      title: "State",
      summary: "State",
      mode: "generic",
      topicSlug: "demo",
      lessonId: "lesson-001",
      order: 1,
      href: "/demo/lesson-001",
      load: async () => ({ Component: () => null }),
    };
    const topic: DiscoveredTopic = {
      slug: "demo",
      title: "Demo",
      summary: "Demo",
      lessons: [lesson],
    };

    render(
      <MemoryRouter initialEntries={[lesson.href]}>
        <TopicProvider topic={topic}>
          <LessonPage title="State" summary="State" mode="generic" sources={[]}>
            <p>Lesson body</p>
          </LessonPage>
        </TopicProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("Ready to move on?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark complete" }));
    expect(screen.getByText("Lesson complete")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark incomplete" }));
    expect(screen.getByText("Ready to move on?")).toBeInTheDocument();
  });
});

describe("ThemeToggle", () => {
  it("defaults to the system preference and persists an explicit toggle", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("teach-me:v1:theme")).toBe("dark");
  });
});
