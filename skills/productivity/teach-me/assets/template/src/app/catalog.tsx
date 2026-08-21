import { motion } from "motion/react";
import type { Node } from "@xyflow/react";

import {
  ChoiceActivity,
  MatchActivity,
  OrderActivity,
  SliderActivity,
  TraceActivity,
} from "@/app/components/activities";
import { AnnotationTarget } from "@/app/components/annotations";
import { CodeBlock, CodeScratchpad, CodeWalkthrough, type DebugCase } from "@/app/components/code";
import { DiagramActivity, DiagramCanvas, MermaidDiagram } from "@/app/components/diagrams";
import { LessonPage, TopicProvider, TopicSidebar } from "@/app/components/lesson-shell";
import { Citation, FidelityBadge } from "@/app/components/sources";
import { SteppedScene } from "@/app/components/stepped-scene";
import type { DiscoveredLesson, DiscoveredTopic, LessonSource, SceneStep } from "@/app/types";

const noopLoad: DiscoveredLesson["load"] = async () => ({ Component: Catalog });
const lesson = (
  lessonId: string,
  title: string,
  href: string,
  order: number,
): DiscoveredLesson => ({
  lessonId,
  title,
  href,
  order,
  topicSlug: "component-catalog",
  summary: "Synthetic catalog fixture",
  mode: "generic",
  load: noopLoad,
});

const topic: DiscoveredTopic = {
  slug: "component-catalog",
  title: "Component catalog",
  summary: "Deterministic states for the shared lesson runtime.",
  lessons: [
    lesson("lesson-001", "Before this lesson", "/__catalog?view=previous", 1),
    lesson("lesson-002", "Shared interactions", "/__catalog", 2),
    lesson("lesson-003", "After this lesson", "/__catalog?view=next", 3),
  ],
};

const sources: readonly LessonSource[] = [
  {
    id: "router-data-mode",
    title: "React Router data mode",
    url: "https://reactrouter.com/start/modes",
    capturedAt: "2026-08-20",
    locator: "Picking a Mode",
    excerpt: "Data mode keeps route configuration outside React rendering.",
  },
];

const steps: readonly SceneStep[] = [
  {
    id: "observe",
    heading: "Observe one state",
    explanation: "Start with the smallest useful state.",
    fidelity: "exact",
  },
  {
    id: "connect",
    heading: "Reveal one change",
    explanation: "Make the active relationship explicit.",
    fidelity: "simplified",
  },
  {
    id: "transfer",
    heading: "Transfer the idea",
    explanation: "Apply the mechanism to another case.",
    fidelity: "conceptual",
  },
];

const code = `function total(values) {
  let sum = 0;
  for (const value of values) {
    sum += double(value);
  }
  console.log(sum);
}

function double(value) {
  return value * 2;
}`;

const debugCases: readonly DebugCase[] = [
  {
    id: "normal",
    label: "Normal run",
    description: "Two values make the call and return visible.",
    frames: [
      {
        id: "start",
        line: 2,
        phase: "after",
        event: "line",
        callDepth: 0,
        heading: "Create the accumulator",
        explanation: "sum now owns the running total.",
        fidelity: "exact",
        variables: [{ name: "sum", value: "0", status: "created" }],
        callStack: [{ functionName: "total", active: true }],
      },
      {
        id: "call",
        line: 4,
        phase: "before",
        event: "call",
        callDepth: 0,
        heading: "Call double",
        explanation: "Step in follows the authored call.",
        fidelity: "exact",
        variables: [
          { name: "sum", value: "0" },
          { name: "value", value: "2", status: "created" },
        ],
        callStack: [{ functionName: "total", active: true }],
      },
      {
        id: "enter",
        line: 10,
        phase: "before",
        event: "enter",
        callDepth: 1,
        heading: "Enter double",
        explanation: "The callee becomes the active frame.",
        fidelity: "exact",
        variables: [{ name: "value", value: "2" }],
        callStack: [{ functionName: "total" }, { functionName: "double", active: true }],
      },
      {
        id: "return",
        line: 10,
        phase: "after",
        event: "return",
        callDepth: 1,
        heading: "Return 4",
        explanation: "The returned value flows back to the caller.",
        fidelity: "exact",
        variables: [
          { name: "value", value: "2" },
          { name: "return", value: "4", status: "created" },
        ],
        callStack: [{ functionName: "total" }, { functionName: "double", active: true }],
      },
      {
        id: "update",
        line: 4,
        phase: "after",
        event: "line",
        callDepth: 0,
        heading: "Update sum",
        explanation: "The old value leaves and the new value settles.",
        fidelity: "exact",
        variables: [{ name: "sum", previousValue: "0", value: "4", status: "changed" }],
        callStack: [{ functionName: "total", active: true }],
      },
      {
        id: "output",
        line: 6,
        phase: "after",
        event: "output",
        callDepth: 0,
        heading: "Append literal output",
        explanation: "Console output remains separate from program state.",
        fidelity: "exact",
        variables: [{ name: "sum", value: "10" }],
        callStack: [{ functionName: "total", active: true }],
        consoleOutput: ["10"],
      },
    ],
  },
  {
    id: "empty",
    label: "No input",
    description: "The loop body never runs.",
    frames: [
      {
        id: "empty-start",
        line: 2,
        phase: "after",
        event: "line",
        callDepth: 0,
        heading: "Create sum",
        explanation: "The initial state is still exact.",
        fidelity: "exact",
        variables: [{ name: "sum", value: "0", status: "created" }],
        callStack: [{ functionName: "total", active: true }],
      },
      {
        id: "empty-output",
        line: 6,
        phase: "after",
        event: "output",
        callDepth: 0,
        heading: "Print zero",
        explanation: "No iteration changed the accumulator.",
        fidelity: "exact",
        variables: [{ name: "sum", value: "0" }],
        callStack: [{ functionName: "total", active: true }],
        consoleOutput: ["0"],
      },
    ],
  },
];

const graphNodes: Node[] = [
  { id: "request", position: { x: 0, y: 80 }, data: { label: "Request" }, type: "input" },
  { id: "loader", position: { x: 220, y: 80 }, data: { label: "Route loader" } },
  { id: "view", position: { x: 440, y: 80 }, data: { label: "Lesson view" }, type: "output" },
];

const annotation = {
  id: "prefer-semantic-state",
  kind: "do" as const,
  label: "Prefer here",
  reason: "The lesson names the state change and lets the shared component animate it.",
  consequence: "The explanation stays testable even when the visual treatment changes.",
  alternative: "Author a stable state ID, changed values, and the relationship that moved.",
  source: sources[0],
};

export function Catalog() {
  return (
    <TopicProvider topic={topic}>
      <div className="topic-layout">
        <TopicSidebar />
        <main className="lesson-main">
          <LessonPage
            title="Shared interactions"
            summary="Every common component rendered with synthetic, non-lesson content."
            mode="generic"
            sources={sources}
          >
            <p className="lesson-intro">
              This route tests the shared runtime and an inline citation{" "}
              <Citation source={sources[0]} label="1" />.
            </p>

            <SteppedScene steps={steps} label="Catalog stepped scene">
              {({ step, index }) => (
                <div className="catalog-scene">
                  <div className="catalog-scene-copy">
                    <FidelityBadge fidelity={step.fidelity ?? "conceptual"} />
                    <h2>{step.heading}</h2>
                    <p>{step.explanation}</p>
                  </div>
                  <div className="catalog-nodes" aria-label={`${index + 1} visible states`}>
                    {steps.slice(0, index + 1).map((visibleStep, visibleIndex) => (
                      <motion.div
                        layout
                        key={visibleStep.id}
                        className="catalog-node"
                        data-active={visibleIndex === index}
                      >
                        <span>{visibleIndex + 1}</span>
                        {visibleStep.heading}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </SteppedScene>

            <section className="catalog-section">
              <h2>Annotations</h2>
              <p>Use a full region for a whole idea and a squiggle for one local detail.</p>
              <AnnotationTarget annotation={annotation} scope="region">
                <span className="annotation-demo">Variable state is authored semantically.</span>
              </AnnotationTarget>
            </section>

            <ChoiceActivity
              id="catalog-choice"
              title="Choose the useful state"
              prompt="Which item belongs in an authored walkthrough frame?"
              options={[
                { id: "state", label: "Changed variable values" },
                {
                  id: "essay",
                  label: "An ungraded essay",
                  feedback: "An essay cannot be checked deterministically.",
                },
                {
                  id: "fps",
                  label: "A performance score",
                  feedback: "Frame rate is not the teaching state.",
                },
              ]}
              correctIds={["state"]}
              hint="Choose the answer that the agent can author and verify."
              explanation="A walkthrough frame records what the learner should perceive after a specific transition."
            />

            <OrderActivity
              id="catalog-order"
              title="Put the feedback loop in order"
              prompt="Move the steps into the order a deterministic activity uses."
              items={[
                { id: "attempt", label: "Learner attempts" },
                { id: "feedback", label: "Specific feedback" },
                { id: "retry", label: "Learner retries" },
              ]}
              correctOrder={["attempt", "feedback", "retry"]}
              hint="Feedback needs an attempt to respond to."
              explanation="Attempt, feedback, and retry form the smallest useful deterministic loop."
              required={false}
            />

            <MatchActivity
              id="catalog-match"
              title="Match state to fidelity"
              prompt="Select one item on each side, then connect them."
              left={[
                { id: "console", label: "Console text" },
                { id: "stack", label: "Teaching call stack" },
              ]}
              right={[
                { id: "exact", label: "Exact" },
                { id: "conceptual", label: "Conceptual" },
              ]}
              correctPairs={{ console: "exact", stack: "conceptual" }}
              hint="Literal output and a teaching model make different claims."
              explanation="Console text can be exact while a simplified call stack remains conceptual."
              required={false}
            />

            <SliderActivity
              id="catalog-slider"
              title="Find the target"
              prompt="Set the value to the verified target."
              min={0}
              max={10}
              step={1}
              initialValue={2}
              target={7}
              hint="The target is greater than five."
              explanation="The checker compares the chosen number to the authored target."
              required={false}
            />

            <TraceActivity
              id="catalog-trace"
              title="Predict the trace"
              prompt="Choose the state after each event."
              checkpoints={[
                {
                  id: "create",
                  prompt: "After initialization",
                  correctId: "zero",
                  options: [
                    { id: "zero", label: "sum = 0" },
                    {
                      id: "missing",
                      label: "sum is missing",
                      feedback: "Initialization creates sum before the loop.",
                    },
                  ],
                },
                {
                  id: "update",
                  prompt: "After adding 4",
                  correctId: "four",
                  options: [
                    { id: "zero", label: "sum = 0", feedback: "The assignment changes sum." },
                    { id: "four", label: "sum = 4" },
                  ],
                },
              ]}
              hint="Follow the assignments, not the prose."
              explanation="Each checkpoint asks for one authored state after a named event."
              required={false}
            />

            <section className="catalog-section">
              <h2>Code</h2>
              <CodeBlock code={code} language="javascript" activeLine={4} />
              <CodeWalkthrough
                id="catalog-debugger"
                code={code}
                language="javascript"
                cases={debugCases}
              />
              <CodeScratchpad
                id="catalog-editor"
                starter={`console.log([2, 3].map((value) => value * 2));`}
                expectedOutput="[ 4, 6 ]"
                outputKind="expected"
                runCommand="node lesson.js"
              />
            </section>

            <section className="catalog-section">
              <h2>Diagrams</h2>
              <DiagramCanvas
                id="catalog-static-graph"
                label="Request data flow"
                nodes={graphNodes}
                edges={[
                  { id: "request-loader", source: "request", target: "loader" },
                  { id: "loader-view", source: "loader", target: "view" },
                ]}
              />
              <DiagramActivity
                id="catalog-diagram"
                title="Connect the request"
                prompt="Connect Request to Route loader."
                nodes={graphNodes.slice(0, 2)}
                expectedEdges={[{ source: "request", target: "loader" }]}
                hint="Follow the request direction."
                explanation="The route loader receives the request."
                required={false}
              />
              <div className="last-resort-diagram">
                <h3>Mermaid fallback</h3>
                <MermaidDiagram
                  label="Static fallback flow"
                  chart={`flowchart LR\n  A[Source] --> B[Static explanation]`}
                />
              </div>
            </section>
          </LessonPage>
        </main>
      </div>
    </TopicProvider>
  );
}
