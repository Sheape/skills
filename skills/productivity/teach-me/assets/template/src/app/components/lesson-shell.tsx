import { createContext, useContext, type ReactNode } from "react";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CircleIcon } from "lucide-react";
import { Link, useLocation } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DiscoveredLesson, DiscoveredTopic, LessonMode, LessonSource } from "@/app/types";
import { setLessonComplete, useLessonCompletion } from "@/app/progress";
import { SourcePanel } from "@/app/components/sources";

const TopicContext = createContext<DiscoveredTopic | null>(null);

export function TopicProvider({
  topic,
  children,
}: {
  topic: DiscoveredTopic;
  children: ReactNode;
}) {
  return <TopicContext value={topic}>{children}</TopicContext>;
}

function useTopic() {
  const topic = useContext(TopicContext);
  if (!topic) throw new Error("Lesson components require TopicProvider");
  return topic;
}

function LessonLink({ lesson, active }: { lesson: DiscoveredLesson; active: boolean }) {
  const complete = useLessonCompletion(lesson.href);
  return (
    <Link to={lesson.href} className="topic-lesson-link" aria-current={active ? "page" : undefined}>
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
  return (
    <aside className="topic-sidebar">
      <div className="topic-summary">
        <Link to="/" className="course-home-link">
          Teach me
        </Link>
        <h2>{topic.title}</h2>
        <p>{topic.summary}</p>
      </div>
      <nav aria-label={`${topic.title} lessons`}>
        {topic.lessons.map((lesson) => (
          <LessonLink
            key={lesson.href}
            lesson={lesson}
            active={location.pathname === lesson.href}
          />
        ))}
      </nav>
    </aside>
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
  const complete = useLessonCompletion(currentHref);

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
          <strong>{complete ? "Lesson complete" : "Ready to move on?"}</strong>
          <span>Completion is explicit and stays on this device.</span>
        </div>
        <Button
          type="button"
          variant={complete ? "outline" : "default"}
          onClick={() => setLessonComplete(currentHref, !complete)}
        >
          <CheckIcon data-icon="inline-start" aria-hidden="true" />
          {complete ? "Mark incomplete" : "Mark complete"}
        </Button>
      </div>
      <LessonNavigation
        previous={index > 0 ? topic.lessons[index - 1] : undefined}
        next={index >= 0 ? topic.lessons[index + 1] : undefined}
      />
    </article>
  );
}
