import { useSyncExternalStore } from "react";

const storageKey = "teach-me:v1:completed-lessons";
const progressEvent = "teach-me:progress";

function readCompleted(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(progressEvent, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(progressEvent, listener);
    window.removeEventListener("storage", listener);
  };
}

export function isLessonComplete(href: string) {
  return readCompleted().has(href);
}

export function setLessonComplete(href: string, complete: boolean) {
  const completed = readCompleted();
  if (complete) completed.add(href);
  else completed.delete(href);
  localStorage.setItem(storageKey, JSON.stringify([...completed].sort()));
  window.dispatchEvent(new Event(progressEvent));
}

export function resetProgress() {
  localStorage.removeItem(storageKey);
  window.dispatchEvent(new Event(progressEvent));
}

export function useLessonCompletion(href: string) {
  return useSyncExternalStore(
    subscribe,
    () => isLessonComplete(href),
    () => false,
  );
}
