import { useCallback, useEffect, useRef, useState } from "react";

const lessonEvent = "teach-me:lesson-state";
const version = "v2";

export function lessonStorageKey(href: string, name: string) {
  return `teach-me:${version}:lesson:${encodeURIComponent(href)}:${name}`;
}

function emit(href: string) {
  window.dispatchEvent(new CustomEvent(lessonEvent, { detail: href }));
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function isLessonComplete(href: string) {
  return localStorage.getItem(lessonStorageKey(href, "complete")) === "true";
}

export function setLessonComplete(href: string, complete: boolean) {
  const key = lessonStorageKey(href, "complete");
  if (complete) localStorage.setItem(key, "true");
  else localStorage.removeItem(key);
  emit(href);
}

export function getSolvedActivities(href: string): readonly string[] {
  const value = readJson<unknown>(lessonStorageKey(href, "solved"), []);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function setActivitySolved(href: string, activityId: string, solved: boolean) {
  const values = new Set(getSolvedActivities(href));
  if (solved) values.add(activityId);
  else values.delete(activityId);
  const key = lessonStorageKey(href, "solved");
  if (values.size) localStorage.setItem(key, JSON.stringify([...values].sort()));
  else localStorage.removeItem(key);
  emit(href);
}

export function hasLessonState(href: string) {
  const prefix = lessonStorageKey(href, "");
  for (let index = 0; index < localStorage.length; index += 1) {
    if (localStorage.key(index)?.startsWith(prefix)) return true;
  }
  return false;
}

export function resetLessonState(href: string) {
  const prefix = lessonStorageKey(href, "");
  const keys = Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index),
  ).filter((key): key is string => Boolean(key?.startsWith(prefix)));
  for (const key of keys) localStorage.removeItem(key);
  emit(href);
}

export function useLessonStateVersion(href: string) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const update = (event: Event) => {
      if (event instanceof CustomEvent && event.detail && event.detail !== href) return;
      setRevision((value) => value + 1);
    };
    window.addEventListener(lessonEvent, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(lessonEvent, update);
      window.removeEventListener("storage", update);
    };
  }, [href]);
  return revision;
}

export function useLessonCompletion(href: string) {
  useLessonStateVersion(href);
  return isLessonComplete(href);
}

export function useLessonStoredState<T>(href: string, name: string, initialValue: T) {
  const key = lessonStorageKey(href, name);
  const initialRef = useRef(initialValue);
  const revision = useLessonStateVersion(href);
  const [value, setValue] = useState<T>(() => readJson(key, initialRef.current));

  useEffect(() => setValue(readJson(key, initialRef.current)), [key, revision]);

  const save = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? (next as (value: T) => T)(current) : next;
        localStorage.setItem(key, JSON.stringify(resolved));
        return resolved;
      });
    },
    [href, key],
  );

  return [value, save] as const;
}
