import { describe, expect, it } from "vite-plus/test";

import { buildCourse } from "@/app/lesson-discovery";
import type { LessonRouteModule } from "@/app/types";

const route = async (): Promise<LessonRouteModule> => ({
  Component: () => null,
});

describe("buildCourse", () => {
  it("pairs lessons and sorts their numeric suffix", () => {
    const course = buildCourse(
      {
        "../topics/rust/topic.ts": {
          topic: { title: "Rust", summary: "Ownership and borrowing" },
        },
      },
      {
        "../topics/rust/lessons/lesson-010/meta.ts": {
          meta: { title: "Ten", summary: "Later", mode: "technology" },
        },
        "../topics/rust/lessons/lesson-002/meta.ts": {
          meta: { title: "Two", summary: "Earlier", mode: "technology" },
        },
      },
      {
        "../topics/rust/lessons/lesson-010/route.tsx": route,
        "../topics/rust/lessons/lesson-002/route.tsx": route,
      },
    );

    expect(course[0].lessons.map((lesson) => lesson.lessonId)).toEqual([
      "lesson-002",
      "lesson-010",
    ]);
    expect(course[0].lessons[0].href).toBe("/rust/lesson-002");
  });

  it("rejects malformed and orphaned lesson files", () => {
    expect(() =>
      buildCourse(
        { "../topics/rust/topic.ts": { topic: { title: "Rust", summary: "" } } },
        {
          "../topics/rust/lessons/lesson-two/meta.ts": {
            meta: { title: "Bad", summary: "", mode: "technology" },
          },
        },
        {},
      ),
    ).toThrow("Malformed lesson path");

    expect(() =>
      buildCourse(
        { "../topics/rust/topic.ts": { topic: { title: "Rust", summary: "" } } },
        {
          "../topics/rust/lessons/lesson-001/meta.ts": {
            meta: { title: "Missing route", summary: "", mode: "technology" },
          },
        },
        {},
      ),
    ).toThrow("Missing route.tsx");

    expect(() =>
      buildCourse(
        { "../topics/rust/topic.ts": { topic: { title: "Rust", summary: "" } } },
        {},
        { "../topics/rust/lessons/lesson-001/route.tsx": route },
      ),
    ).toThrow("Missing meta.ts");
  });
});
