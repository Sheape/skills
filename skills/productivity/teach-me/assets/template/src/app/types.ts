import type { ComponentType, ReactNode } from "react";

export const lessonModes = [
  "technology",
  "pr-diff",
  "math",
  "algorithm",
  "document-plan",
  "codebase",
  "generic",
] as const;

export type LessonMode = (typeof lessonModes)[number];
export type Fidelity = "exact" | "simplified" | "conceptual";

export interface TopicDefinition {
  title: string;
  summary: string;
}

export interface LessonMeta {
  title: string;
  summary: string;
  mode: LessonMode;
}

export interface LessonSource {
  id: string;
  title: string;
  url: string;
  capturedAt: string;
  excerpt?: string;
  locator?: string;
  revision?: string;
}

export interface LessonRouteModule {
  Component: ComponentType;
  ErrorBoundary?: ComponentType;
}

export interface DiscoveredLesson extends LessonMeta {
  topicSlug: string;
  lessonId: string;
  order: number;
  href: string;
  load: () => Promise<LessonRouteModule>;
}

export interface DiscoveredTopic extends TopicDefinition {
  slug: string;
  lessons: readonly DiscoveredLesson[];
}

export interface SceneStep {
  id: string;
  heading: string;
  explanation: string;
  fidelity?: Fidelity;
}

export interface SceneRenderState<TStep extends SceneStep> {
  step: TStep;
  index: number;
  count: number;
  canPrevious: boolean;
  canNext: boolean;
  previous: () => void;
  next: () => void;
  reset: () => void;
  goTo: (index: number) => void;
}

export interface SteppedSceneProps<TStep extends SceneStep> {
  steps: readonly TStep[];
  initialStep?: number;
  label?: string;
  children: (state: SceneRenderState<TStep>) => ReactNode;
}
