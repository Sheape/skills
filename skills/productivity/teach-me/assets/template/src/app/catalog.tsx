import { motion } from "motion/react";

import { ChallengeCard, PredictionPrompt } from "@/app/components/activities";
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
  summary: "Synthetic states used to verify the shared teaching runtime.",
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
    heading: "Start with one state",
    explanation: "The learner sees only the first meaningful part of the mechanism.",
    fidelity: "exact",
  },
  {
    id: "connect",
    heading: "Reveal the relationship",
    explanation: "A second state appears and the active connection becomes explicit.",
    fidelity: "simplified",
  },
  {
    id: "transfer",
    heading: "Name the transferable idea",
    explanation: "The final state asks the learner to apply the mechanism elsewhere.",
    fidelity: "conceptual",
  },
];

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
              This route exercises progressive scenes, local activities, completion, and an inline
              citation
              <Citation source={sources[0]} label="1" />.
            </p>
            <SteppedScene steps={steps} label="Catalog stepped scene">
              {({ step, index }) => (
                <div className="catalog-scene">
                  <div className="catalog-scene-copy">
                    <div className="fidelity-row">
                      <FidelityBadge fidelity={step.fidelity ?? "conceptual"} />
                    </div>
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
            <PredictionPrompt
              prompt="What should the second step reveal?"
              reveal="A useful second step changes one relationship and explains why it changed."
            />
            <ChallengeCard
              title="Transfer the pattern"
              prompt="Choose a mechanism you know and divide it into three authored states."
              hint="Start with what changes, not with the surrounding prose."
              answer="A good answer names the initial state, one meaningful transition, and the state the learner must transfer."
            />
          </LessonPage>
        </main>
      </div>
    </TopicProvider>
  );
}
