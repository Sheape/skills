import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type Difficulty = "very_easy" | "easy" | "medium" | "hard";
export type Lang = { id: string; name: string };
export type DayStat = { attempts: number; completions: number; points: number };
export type Days = Record<string, DayStat>;

export type CourseSummary = {
  slug: string;
  name: string;
  short: string;
  kind: "codebase" | "tutorial";
  created: string;
  source: { project?: string; repository?: string; commit?: string; subject?: string };
  languages: Lang[];
  language: Lang | null;
  icon: string | null;
  iconBackground: string | null;
  stageCount: number;
  totalStages: number;
  completed: number;
  points: number;
  maxPoints: number;
  attempts: number;
  currentStageId: string | null;
  introDone: boolean;
  setupDone: boolean;
  started: boolean;
  finished: boolean;
  repoReady: boolean;
};

export type StageStatus = "completed" | "current" | "pending" | "disabled";
export type StageRow = {
  id: string;
  name: string;
  difficulty: Difficulty;
  extension: string | null;
  status: StageStatus;
  points: number;
  worth: number;
  base: number;
  attempts: number;
};

export type CourseDetail = CourseSummary & {
  overview: { description: string; faq: { title: string; body: string }[] };
  introduction: string;
  extensions: { slug: string; name: string; description: string; enabled: boolean }[];
  stages: StageRow[];
  progress: {
    intro: Record<string, string> | null;
    pingCwd: string | null;
    streak: number;
    longestStreak: number;
    startedAt: string | null;
    completedAt: string | null;
    days: Days;
  };
  repo: { path: string; display: string; cloneDir: string };
};

export type StageDetail = {
  id: string;
  name: string;
  difficulty: Difficulty;
  extension: string | null;
  status: StageStatus;
  position: number | null;
  instructions: string;
  resources: string;
  hints: { n: number; title: string; revealed: boolean; body: string | null }[];
  examplesCount: number;
  examplesUnlocked: boolean;
  progress: {
    attempts: number;
    passes: number;
    hints: number;
    examplesViewed: boolean;
    completedAt: string | null;
    points: number;
    rating: string | null;
    lastAttemptAt: string | null;
  };
  worth: { base: number; multiplier: number; points: number };
  penalties: { hint: number; examples: number };
  prev: string | null;
  next: string | null;
};

export type Example = {
  file: string;
  title?: string;
  source?: string;
  path?: string;
  lines?: string;
  commit?: string;
  url?: string;
  license?: string;
  language?: string;
  kind?: string;
  author?: string;
  body: string;
};

export type RunLine = { prefix: string; text: string; level: string };
export type Run = {
  id?: string;
  mode?: string;
  stage?: string;
  stageName?: string;
  status: "idle" | "running" | "passed" | "failed";
  startedAt?: string;
  finishedAt?: string | null;
  lines: RunLine[];
};

export type Totals = { points: number; completed: number; attempts: number; courses: number; streak: number; longestStreak: number };
export type Meta = { user: { name: string }; home: string; port: number; totals: Totals; build: string };

export type TimelineItem = {
  ts: string;
  kind: "created" | "started" | "stage" | "finished";
  course: string;
  courseName: string;
  stage?: string;
  stageName?: string;
  points?: number;
  project?: string | null;
  language?: string | null;
};
export type Profile = { user: { name: string }; totals: Totals & { days: Days }; courses: CourseSummary[]; timeline: TimelineItem[] };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = (await res.json()).error || message;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, message);
  }
  return res.json();
}

export async function post(path: string, body: unknown = {}): Promise<void> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
}

/** Bumps whenever the data directory changes (SSE), so every useApi refetches. */
const LiveContext = createContext(0);

export function LiveProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let poll: number | undefined;
    const bump = () => setVersion((v) => v + 1);
    const source = new EventSource("/api/events");
    source.onmessage = (e) => {
      try {
        if (JSON.parse(e.data).kind !== "hello") bump();
      } catch {
        bump();
      }
    };
    source.onerror = () => {
      if (!poll) poll = window.setInterval(bump, 4000);
    };
    source.onopen = () => {
      if (poll) window.clearInterval(poll);
      poll = undefined;
    };
    return () => {
      source.close();
      if (poll) window.clearInterval(poll);
    };
  }, []);
  return <LiveContext.Provider value={version}>{children}</LiveContext.Provider>;
}

export function useLiveVersion() {
  return useContext(LiveContext);
}

export function useApi<T>(path: string | null) {
  const version = useLiveVersion();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [nonce, setNonce] = useState(0);
  const pathRef = useRef(path);
  useEffect(() => {
    if (pathRef.current !== path) {
      pathRef.current = path;
      setData(null);
      setError(null);
    }
    if (!path) return;
    let cancelled = false;
    getJson<T>(path)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, [path, version, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, reload, loading: !data && !error };
}
