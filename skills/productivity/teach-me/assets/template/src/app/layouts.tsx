import { BookOpenIcon, MoonIcon, SunIcon } from "lucide-react";
import { Link, Outlet } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TopicProvider, TopicSidebar } from "@/app/components/lesson-shell";
import { useTheme } from "@/app/theme";
import type { DiscoveredTopic } from "@/app/types";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "light" ? "dark" : "light";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === "light" ? <MoonIcon aria-hidden="true" /> : <SunIcon aria-hidden="true" />}
    </Button>
  );
}

export function AppLayout() {
  return (
    <div className="app-shell">
      {/*
        THESIS: authored states make mechanisms inspectable; refuse the one-page lesson dump.
        OWN-WORLD: Notion paper-light surfaces, Vercel ink-dark surfaces, restrained blue action.
        STORY: choose a lesson, predict, step through state, inspect sources, mark the lesson complete.
        FIRST VIEWPORT: compact utility bar, closed topic drawer, and one generous reading column.
        FORM: quiet technical notebook; pinned brief overrides concept seed 0085c8c1.
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
      */}
      <header className="app-bar">
        <Link to="/" className="app-mark">
          <BookOpenIcon aria-hidden="true" />
          <span>Teach me</span>
        </Link>
        <div className="app-actions">
          <div id="topic-controls" />
          <ThemeToggle />
        </div>
      </header>
      <Outlet />
    </div>
  );
}

export function TopicLayout({ topic }: { topic: DiscoveredTopic }) {
  return (
    <TopicProvider topic={topic}>
      <div className="topic-layout">
        <TopicSidebar />
        <main className="lesson-main">
          <Outlet />
        </main>
      </div>
    </TopicProvider>
  );
}

export function CourseHome({ topics }: { topics: readonly DiscoveredTopic[] }) {
  if (!topics.length) {
    return (
      <main className="empty-home">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No lessons yet</EmptyTitle>
            <EmptyDescription>
              Ask the teaching agent for a topic. The first verified lesson will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }

  return (
    <main className="course-home">
      <header>
        <h1>Your topics</h1>
        <p>Continue where you stopped or open a different course.</p>
      </header>
      <div className="topic-grid">
        {topics.map((topic) => (
          <Card key={topic.slug}>
            <CardHeader>
              <CardTitle>{topic.title}</CardTitle>
              <CardDescription>{topic.summary}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to={`/${topic.slug}`}>
                  Open {topic.lessons.length} lesson{topic.lessons.length === 1 ? "" : "s"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

export function TopicEmpty({ topic }: { topic: DiscoveredTopic }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{topic.title} has no lessons yet</EmptyTitle>
        <EmptyDescription>
          The topic workspace exists, but its first verified lesson has not been authored.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function NotFound() {
  return (
    <main className="empty-home">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>That lesson does not exist</EmptyTitle>
          <EmptyDescription>Check the URL or return to the course index.</EmptyDescription>
        </EmptyHeader>
        <Button asChild variant="outline">
          <Link to="/">Return home</Link>
        </Button>
      </Empty>
    </main>
  );
}
