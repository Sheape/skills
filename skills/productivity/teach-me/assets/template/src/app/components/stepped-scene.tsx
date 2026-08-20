import { useCallback, useState, type KeyboardEvent } from "react";
import { ArrowLeftIcon, ArrowRightIcon, RotateCcwIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import type { SceneStep, SteppedSceneProps } from "@/app/types";

interface StepControlsProps {
  index: number;
  count: number;
  canPrevious: boolean;
  canNext: boolean;
  previous: () => void;
  next: () => void;
  reset: () => void;
  goTo: (index: number) => void;
}

export function StepControls({
  index,
  count,
  canPrevious,
  canNext,
  previous,
  next,
  reset,
  goTo,
}: StepControlsProps) {
  return (
    <div className="step-controls" aria-label="Lesson steps">
      <Button type="button" variant="outline" size="sm" onClick={previous} disabled={!canPrevious}>
        <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
        Previous
      </Button>
      <div className="step-indicator" aria-label={`Step ${index + 1} of ${count}`}>
        {Array.from({ length: count }, (_, stepIndex) => (
          <button
            type="button"
            key={stepIndex}
            aria-label={`Go to step ${stepIndex + 1}`}
            aria-current={stepIndex === index ? "step" : undefined}
            onClick={() => goTo(stepIndex)}
          />
        ))}
      </div>
      <span className="step-count" aria-live="polite">
        {index + 1} / {count}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={reset}>
        <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
        Reset
      </Button>
      <Button type="button" size="sm" onClick={next} disabled={!canNext}>
        Next
        <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function SteppedScene<TStep extends SceneStep>({
  steps,
  initialStep = 0,
  label = "Interactive walkthrough",
  children,
}: SteppedSceneProps<TStep>) {
  if (!steps.length) throw new Error("SteppedScene requires at least one step");
  const initialIndex = Math.min(Math.max(initialStep, 0), steps.length - 1);
  const [index, setIndex] = useState(initialIndex);
  const reduceMotion = useReducedMotion();
  const goTo = useCallback(
    (nextIndex: number) => setIndex(Math.min(Math.max(nextIndex, 0), steps.length - 1)),
    [steps.length],
  );
  const previous = useCallback(() => goTo(index - 1), [goTo, index]);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const reset = useCallback(() => goTo(initialIndex), [goTo, initialIndex]);
  const step = steps[index];

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, button, [contenteditable='true']")) return;
    if (event.key === "ArrowLeft") previous();
    else if (event.key === "ArrowRight") next();
    else if (event.key === "Home") reset();
    else if (event.key === "End") goTo(steps.length - 1);
    else return;
    event.preventDefault();
  };

  const state = {
    step,
    index,
    count: steps.length,
    canPrevious: index > 0,
    canNext: index < steps.length - 1,
    previous,
    next,
    reset,
    goTo,
  };

  return (
    <section
      className="stepped-scene"
      role="group"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          className="scene-stage"
          key={step.id}
          initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : -8 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
        >
          {children(state)}
        </motion.div>
      </AnimatePresence>
      <StepControls {...state} />
    </section>
  );
}
