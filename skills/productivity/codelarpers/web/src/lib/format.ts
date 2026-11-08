import type { Difficulty } from "./api";

export const difficultyLabel: Record<Difficulty, string> = {
  very_easy: "Very easy",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const difficultyBars: Record<Difficulty, number> = { very_easy: 1, easy: 1, medium: 2, hard: 3 };

export function plural(n: number, word: string, many = `${word}s`) {
  return `${n.toLocaleString()} ${n === 1 ? word : many}`;
}

export function monthYear(ts: string) {
  return new Date(ts).toLocaleDateString(undefined, { month: "long", year: "numeric" }).toUpperCase();
}

export function shortDate(ts: string) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function relative(ts: string | null | undefined) {
  if (!ts) return "";
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.round(mo / 12);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

export function localDay(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function readStore(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
