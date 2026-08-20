import type {
  DiscoveredLesson,
  DiscoveredTopic,
  LessonMeta,
  LessonRouteModule,
  TopicDefinition,
} from "@/app/types";

type TopicModules = Record<string, { topic: TopicDefinition }>;
type LessonMetaModules = Record<string, { meta: LessonMeta }>;
type LessonRouteModules = Record<string, () => Promise<LessonRouteModule>>;

const topicPattern = /^\.\.\/topics\/([a-z0-9]+(?:-[a-z0-9]+)*)\/topic\.ts$/;
const lessonPattern =
  /^\.\.\/topics\/([a-z0-9]+(?:-[a-z0-9]+)*)\/lessons\/(lesson-(\d{3}))\/(meta\.ts|route\.tsx)$/;

function lessonKey(path: string) {
  return path.replace(/\/(meta\.ts|route\.tsx)$/, "");
}

function matchLesson(path: string) {
  const match = lessonPattern.exec(path);
  if (!match) throw new Error(`Malformed lesson path: ${path}`);
  return {
    topicSlug: match[1],
    lessonId: match[2],
    order: Number(match[3]),
  };
}

export function buildCourse(
  topicModules: TopicModules,
  metaModules: LessonMetaModules,
  routeModules: LessonRouteModules,
): readonly DiscoveredTopic[] {
  const lessonsByTopic = new Map<string, DiscoveredLesson[]>();

  for (const [path, module] of Object.entries(metaModules)) {
    const identity = matchLesson(path);
    const load = routeModules[`${lessonKey(path)}/route.tsx`];
    if (!load) throw new Error(`Missing route.tsx for ${path}`);

    const lessons = lessonsByTopic.get(identity.topicSlug) ?? [];
    lessons.push({
      ...module.meta,
      ...identity,
      href: `/${identity.topicSlug}/${identity.lessonId}`,
      load,
    });
    lessonsByTopic.set(identity.topicSlug, lessons);
  }

  for (const path of Object.keys(routeModules)) {
    matchLesson(path);
    if (!metaModules[`${lessonKey(path)}/meta.ts`]) {
      throw new Error(`Missing meta.ts for ${path}`);
    }
  }

  return Object.entries(topicModules)
    .map(([path, module]) => {
      const match = topicPattern.exec(path);
      if (!match) throw new Error(`Malformed topic path: ${path}`);
      const slug = match[1];
      return {
        ...module.topic,
        slug,
        lessons: (lessonsByTopic.get(slug) ?? []).sort((left, right) => left.order - right.order),
      } satisfies DiscoveredTopic;
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

const topicModules = import.meta.glob("../topics/*/topic.ts", {
  eager: true,
}) as TopicModules;
const metaModules = import.meta.glob("../topics/*/lessons/lesson-*/meta.ts", {
  eager: true,
}) as LessonMetaModules;
const routeModules = import.meta.glob(
  "../topics/*/lessons/lesson-*/route.tsx",
) as LessonRouteModules;

export const course = buildCourse(topicModules, metaModules, routeModules);
