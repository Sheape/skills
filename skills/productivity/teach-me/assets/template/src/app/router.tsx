import { createBrowserRouter, Navigate, type RouteObject } from "react-router";

import { Catalog } from "@/app/catalog";
import { course } from "@/app/lesson-discovery";
import { AppLayout, CourseHome, NotFound, TopicEmpty, TopicLayout } from "@/app/layouts";
import { isLessonComplete } from "@/app/progress";
import type { DiscoveredTopic } from "@/app/types";

function TopicIndex({ topic }: { topic: DiscoveredTopic }) {
  const next = topic.lessons.find((lesson) => !isLessonComplete(lesson.href)) ?? topic.lessons[0];
  return next ? <Navigate to={next.href} replace /> : <TopicEmpty topic={topic} />;
}

const topicRoutes: RouteObject[] = course.map((topic) => ({
  path: topic.slug,
  Component: () => <TopicLayout topic={topic} />,
  children: [
    { index: true, Component: () => <TopicIndex topic={topic} /> },
    ...topic.lessons.map((lesson) => ({
      path: lesson.lessonId,
      lazy: lesson.load,
    })),
  ],
}));

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppLayout,
    children: [
      { index: true, Component: () => <CourseHome topics={course} /> },
      { path: "__catalog", Component: Catalog },
      ...topicRoutes,
      { path: "*", Component: NotFound },
    ],
  },
]);
