import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { LessonRuntimeProvider } from "@/app/components/activity-runtime";
import {
  ChoiceActivity,
  MatchActivity,
  OrderActivity,
  SliderActivity,
  TraceActivity,
} from "@/app/components/activities";
import { getSolvedActivities } from "@/app/progress";

const href = "/catalog/lesson-001";

function renderActivity(children: React.ReactNode) {
  return render(<LessonRuntimeProvider href={href}>{children}</LessonRuntimeProvider>);
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("ChoiceActivity", () => {
  const choice = (
    <ChoiceActivity
      id="choice"
      title="Choose"
      prompt="Pick the exact state"
      options={[
        { id: "wrong", label: "Guess", feedback: "A guess is not verified." },
        { id: "right", label: "Verified state" },
      ]}
      correctIds={["right"]}
      hint="Look for evidence."
      explanation="The verified state has evidence."
    />
  );

  it("supports keyboard selection, specific retry help, persistence, and reset", async () => {
    const user = userEvent.setup();
    const view = renderActivity(choice);
    const wrong = screen.getByRole("radio", { name: "Guess" });
    wrong.focus();
    await user.keyboard(" ");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("A guess is not verified.")).toBeInTheDocument();
    expect(screen.getByText("Look for evidence.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("The verified state has evidence.")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Verified state" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByRole("button", { name: "Solved" })).toBeDisabled();
    expect(getSolvedActivities(href)).toContain("choice");

    view.unmount();
    renderActivity(choice);
    expect(screen.getByRole("button", { name: "Solved" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Check" })).toBeDisabled());
    expect(getSolvedActivities(href)).not.toContain("choice");
  });
});

describe("OrderActivity", () => {
  it("checks wrong order, reveals help, supports move buttons, and persists success", async () => {
    const user = userEvent.setup();
    renderActivity(
      <OrderActivity
        id="order"
        title="Order"
        prompt="Order the events"
        items={[
          { id: "b", label: "Second" },
          { id: "a", label: "First" },
        ]}
        correctOrder={["a", "b"]}
        hint="First comes before second."
        explanation="The events follow time."
      />,
    );

    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("One transition still occurs out of order.")).toBeInTheDocument();
    expect(screen.getByText("First comes before second.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("The events follow time.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move First up" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(getSolvedActivities(href)).toContain("order");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(getSolvedActivities(href)).not.toContain("order");
  });
});

describe("MatchActivity", () => {
  it("reports the mismatched item, reconnects by keyboard controls, and stores success", async () => {
    const user = userEvent.setup();
    renderActivity(
      <MatchActivity
        id="match"
        title="Match"
        prompt="Match each side"
        left={[
          { id: "a", label: "Alpha" },
          { id: "b", label: "Beta" },
        ]}
        right={[
          { id: "one", label: "One" },
          { id: "two", label: "Two" },
        ]}
        correctPairs={{ a: "one", b: "two" }}
        hint="Alpha belongs with One."
        explanation="Each term has one stable match."
      />,
    );

    for (const [left, right] of [
      ["Alpha", "Two"],
      ["Beta", "One"],
    ]) {
      await user.click(screen.getByRole("button", { name: left }));
      await user.click(screen.getByRole("button", { name: right }));
      await user.click(screen.getByRole("button", { name: "Connect selected" }));
    }
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Alpha is connected to the wrong match.")).toBeInTheDocument();
    expect(screen.getByText("Alpha belongs with One.")).toBeInTheDocument();

    for (const [left, right] of [
      ["Alpha", "One"],
      ["Beta", "Two"],
    ]) {
      await user.click(screen.getByRole("button", { name: left }));
      await user.click(screen.getByRole("button", { name: right }));
      await user.click(screen.getByRole("button", { name: "Connect selected" }));
    }
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(getSolvedActivities(href)).toContain("match");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(getSolvedActivities(href)).not.toContain("match");
  });
});

describe("SliderActivity", () => {
  it("checks a numeric target, reveals two levels of help, and accepts keyboard input", async () => {
    const user = userEvent.setup();
    renderActivity(
      <SliderActivity
        id="slider"
        title="Target"
        prompt="Choose three"
        min={0}
        max={5}
        step={1}
        initialValue={1}
        target={3}
        hint="Increase it."
        explanation="Three is the authored target."
      />,
    );
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Increase it.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Three is the authored target.")).toBeInTheDocument();
    const slider = screen.getByRole("slider", { name: "Choose three" });
    slider.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(getSolvedActivities(href)).toContain("slider");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(getSolvedActivities(href)).not.toContain("slider");
  });
});

describe("TraceActivity", () => {
  it("checks each semantic checkpoint and supports retry, help, persistence, and reset", async () => {
    const user = userEvent.setup();
    renderActivity(
      <TraceActivity
        id="trace"
        title="Trace"
        prompt="Predict both states"
        checkpoints={[
          {
            id: "one",
            prompt: "First state",
            correctId: "a",
            options: [
              { id: "a", label: "A" },
              { id: "b", label: "B", feedback: "The first state is A." },
            ],
          },
          {
            id: "two",
            prompt: "Second state",
            correctId: "b",
            options: [
              { id: "a", label: "A", feedback: "The second state changes." },
              { id: "b", label: "B" },
            ],
          },
        ]}
        hint="The second state changes."
        explanation="The authored trace moves from A to B."
      />,
    );
    await user.selectOptions(screen.getByLabelText("First state"), "b");
    await user.selectOptions(screen.getByLabelText("Second state"), "a");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("The first state is A.")).toBeInTheDocument();
    expect(screen.getByText("The second state changes.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("The authored trace moves from A to B.")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("First state"), "a");
    await user.selectOptions(screen.getByLabelText("Second state"), "b");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(getSolvedActivities(href)).toContain("trace");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(getSolvedActivities(href)).not.toContain("trace");
  });
});
