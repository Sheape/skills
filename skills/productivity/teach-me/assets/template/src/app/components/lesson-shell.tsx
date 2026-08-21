import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CircleIcon,
  MenuIcon,
  RotateCcwIcon,
} from "lucide-react";
import { Link, useLocation } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DiscoveredLesson, DiscoveredTopic, LessonMode, LessonSource } from "@/app/types";
import { hasLessonState, setLessonComplete, useLessonCompletion } from "@/app/progress";
import { SourcePanel } from "@/app/components/sources";
import { LessonRuntimeProvider, useLessonRuntime } from "@/app/components/activity-runtime";
import { LessonChromeProvider, useLessonChrome } from "@/app/components/annotations";

const TopicContext = createContext<DiscoveredTopic | null>(null);

export function TopicProvider({
  topic,
  children,
}: {
  topic: DiscoveredTopic;
  children: ReactNode;
}) {
  return (
    <TopicContext value={topic}>
      <LessonChromeProvider>{children}</LessonChromeProvider>
    </TopicContext>
  );
}

function useTopic() {
  const topic = useContext(TopicContext);
  if (!topic) throw new Error("Lesson components require TopicProvider");
  return topic;
}

function LessonLink({ lesson, active }: { lesson: DiscoveredLesson; active: boolean }) {
  const complete = useLessonCompletion(lesson.href);
  const { setDrawerOpen } = useLessonChrome();
  return (
    <Link
      to={lesson.href}
      className="topic-lesson-link"
      aria-current={active ? "page" : undefined}
      onClick={() => setDrawerOpen(false)}
    >
      {complete ? <CheckIcon aria-label="Complete" /> : <CircleIcon aria-hidden="true" />}
      <span>
        <small>{lesson.lessonId.replace("lesson-", "Lesson ")}</small>
        {lesson.title}
      </span>
    </Link>
  );
}

export function TopicSidebar() {
  const topic = useTopic();
  const location = useLocation();
  const { drawerOpen, setDrawerOpen } = useLessonChrome();
  const [controls, setControls] = useState<HTMLElement | null>(null);
  useEffect(() => setControls(document.getElementById("topic-controls")), []);

  return (
    <>
      {controls &&
        createPortal(
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open lesson menu"
          >
            <MenuIcon data-icon="inline-start" aria-hidden="true" />
            Lessons
          </Button>,
          controls,
        )}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="topic-sidebar">
          <SheetHeader>
            <SheetTitle>{topic.title}</SheetTitle>
            <SheetDescription>{topic.summary}</SheetDescription>
          </SheetHeader>
          <nav aria-label={`${topic.title} lessons`}>
            {topic.lessons.map((lesson) => (
              <LessonLink
                key={lesson.href}
                lesson={lesson}
                active={location.pathname === lesson.href}
              />
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function LessonNavigation({
  previous,
  next,
}: {
  previous?: DiscoveredLesson;
  next?: DiscoveredLesson;
}) {
  if (!previous && !next) return null;
  return (
    <nav className="lesson-navigation" aria-label="Adjacent lessons">
      {previous ? (
        <Button asChild variant="outline">
          <Link to={previous.href}>
            <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
            <span>
              <small>Previous</small>
              {previous.title}
            </span>
          </Link>
        </Button>
      ) : (
        <span />
      )}
      {next && (
        <Button asChild variant="outline">
          <Link to={next.href}>
            <span>
              <small>Next</small>
              {next.title}
            </span>
            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      )}
    </nav>
  );
}

function modeLabel(mode: LessonMode) {
  return mode.replaceAll("-", " ");
}

function LessonPageContent({
  title,
  summary,
  mode,
  sources,
  children,
  currentHref,
  previous,
  next,
}: {
  title: string;
  summary: string;
  mode: LessonMode;
  sources: readonly LessonSource[];
  children: ReactNode;
  currentHref: string;
  previous?: DiscoveredLesson;
  next?: DiscoveredLesson;
}) {
  const runtime = useLessonRuntime();
  const complete = useLessonCompletion(currentHref);
  const hasState = hasLessonState(currentHref);

  return (
    <article className="lesson-page">
      <header className="lesson-header">
        <div>
          <h1>{title}</h1>
          <p>{summary}</p>
        </div>
        <Badge variant="secondary">{modeLabel(mode)}</Badge>
      </header>
      <div className="lesson-content">{children}</div>
      <SourcePanel sources={sources} />
      <div className="lesson-completion">
        <div>
          <strong>
            {complete
              ? "Lesson complete"
              : runtime.ready
                ? "Ready to move on?"
                : "Finish the required activities"}
          </strong>
          <span>Completion and solved activities stay on this device.</span>
        </div>
        <div className="lesson-completion-actions">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" disabled={!hasState}>
                <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
                Reset lesson
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset this lesson?</AlertDialogTitle>
                <AlertDialogDescription>
                  This clears solved activities, completion, editor drafts, debugger position,
                  diagram layout, and revealed help for this lesson.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep progress</AlertDialogCancel>
                <AlertDialogAction onClick={runtime.resetLesson}>Reset lesson</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            type="button"
            variant={complete ? "outline" : "default"}
            disabled={!complete && !runtime.ready}
            onClick={() => setLessonComplete(currentHref, !complete)}
          >
            <CheckIcon data-icon="inline-start" aria-hidden="true" />
            {complete ? "Mark incomplete" : "Mark complete"}
          </Button>
        </div>
      </div>
      <LessonNavigation previous={previous} next={next} />
    </article>
  );
}

export function LessonPage({
  title,
  summary,
  mode,
  sources,
  children,
}: {
  title: string;
  summary: string;
  mode: LessonMode;
  sources: readonly LessonSource[];
  children: ReactNode;
}) {
  const topic = useTopic();
  const location = useLocation();
  const index = topic.lessons.findIndex((lesson) => lesson.href === location.pathname);
  const currentHref = index >= 0 ? topic.lessons[index].href : location.pathname;
  return (
    <LessonRuntimeProvider href={currentHref}>
      <LessonPageContent
        title={title}
        summary={summary}
        mode={mode}
        sources={sources}
        currentHref={currentHref}
        previous={index > 0 ? topic.lessons[index - 1] : undefined}
        next={index >= 0 ? topic.lessons[index + 1] : undefined}
      >
        {children}
      </LessonPageContent>
    </LessonRuntimeProvider>
  );
}
