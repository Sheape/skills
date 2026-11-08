import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from "react-router";
import {
  ArrowLeftToLine,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Ellipsis,
  FileText,
  Hash,
  RotateCcw,
  SquareTerminal,
  X,
} from "lucide-react";
import { post, useApi, type CourseDetail, type Run, type StageDetail, type StageStatus } from "@/lib/api";
import { readStore, writeStore } from "@/lib/format";
import { Heatmap } from "./heatmap";
import { PointsPill } from "./site";
import { CourseIcon, ErrorState, Loading, Modal, SectionLabel, StatusPill, ThemeToggle, cx } from "./ui";

export type CourseCtx = { course: CourseDetail; run: Run | null; openLogs: () => void; reload: () => void };
export const useCourse = () => useOutletContext<CourseCtx>();

/* ---------------- sidebar ---------------- */

function StepIcon({ status }: { status: StageStatus | "intro-done" | "intro" }) {
  if (status === "completed" || status === "intro-done")
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-accent text-accent">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    );
  if (status === "current" || status === "intro")
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-accent text-accent">
        <Ellipsis className="size-3.5" strokeWidth={3} />
      </span>
    );
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded bg-hover text-ink-4">
      <Hash className="size-3.5" />
    </span>
  );
}

function SideItem({ to, label, status, collapsed }: { to: string; label: string; status: Parameters<typeof StepIcon>[0]["status"]; collapsed: boolean }) {
  const current = status === "current" || status === "intro";
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cx("flex h-10 items-center gap-3 rounded px-3 text-[15px] transition-colors", isActive ? "bg-hover" : "hover:bg-hover/60", collapsed && "justify-center px-0")
      }
    >
      <StepIcon status={status} />
      {!collapsed && <span className={cx("truncate", current ? "text-accent-ink" : status === "disabled" ? "text-ink-4" : "text-ink-2")}>{label}</span>}
    </NavLink>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx("relative h-[18px] w-8 rounded-full transition-colors", on ? "bg-button" : "bg-line")}
    >
      <span className={cx("absolute top-[2px] grid size-[14px] place-items-center rounded-full bg-white transition-all", on ? "left-[16px]" : "left-[2px]")}>
        {on && <Check className="size-2.5 text-teal-700" strokeWidth={4} />}
      </span>
    </button>
  );
}

function CourseMenu({ course, onReset }: { course: CourseDetail; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const item = "flex w-full items-center justify-between gap-6 px-3 py-2 text-left text-[15px] text-ink-2 hover:bg-hover";
  return (
    <div className="absolute inset-x-3 top-[calc(100%+4px)] z-40 overflow-hidden rounded border border-line bg-panel py-1 shadow-xl">
      <Link to="/catalog" className={item}>
        Back to Catalog <ArrowLeftToLine className="size-4 text-ink-4" />
      </Link>
      <Link to={`/courses/${course.slug}/overview`} className={item}>
        Challenge overview <BookOpen className="size-4 text-ink-4" />
      </Link>
      <button
        className={item}
        onClick={() => {
          navigator.clipboard?.writeText(course.repo.path);
          setCopied(true);
        }}
      >
        {copied ? "Copied!" : "Copy Git Repository URL"} <Copy className="size-4 text-ink-4" />
      </button>
      <button className={item} onClick={onReset}>
        Reset progress <RotateCcw className="size-4 text-ink-4" />
      </button>
    </div>
  );
}

function Sidebar({ course, collapsed, setCollapsed, reload }: { course: CourseDetail; collapsed: boolean; setCollapsed: (v: boolean) => void; reload: () => void }) {
  const [menu, setMenu] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const base = `/courses/${course.slug}`;
  // A learner who went straight to the CLI skipped the intro; don't show two "current" steps.
  const introStatus = course.introDone ? "intro-done" : course.setupDone ? "pending" : "intro";
  const setupStatus = course.setupDone ? "intro-done" : course.introDone ? "intro" : "pending";
  const baseStages = course.stages.filter((s) => !s.extension);
  return (
    <aside className={cx("relative flex shrink-0 flex-col border-r border-line-soft bg-canvas", collapsed ? "w-16" : "w-[288px]")}>
      <div className="relative px-3 pt-4">
        <button
          onClick={() => setMenu(!menu)}
          className={cx("flex w-full items-start gap-2.5 rounded px-2.5 py-2 text-left hover:bg-hover", menu && "bg-hover", collapsed && "justify-center px-0")}
        >
          <CourseIcon icon={course.icon} background={course.iconBackground} name={course.name} slug={course.slug} className="mt-0.5 size-6" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold leading-snug text-ink">{course.name}</span>
                <span className="text-[13px] text-ink-4">{course.language ? `using ${course.language.name}` : course.kind}</span>
              </span>
              <ChevronDown className={cx("mt-1 size-4 text-ink-3 transition-transform", menu && "rotate-180")} />
            </>
          )}
        </button>
        {menu && !collapsed && (
          <CourseMenu
            course={course}
            onReset={() => {
              setMenu(false);
              setConfirmReset(true);
            }}
          />
        )}
        <div className="mx-2 mt-3 border-b border-line-soft" />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        <SideItem to={`${base}/introduction`} label="Introduction" status={introStatus} collapsed={collapsed} />
        <SideItem to={`${base}/setup`} label="Local Setup" status={setupStatus} collapsed={collapsed} />
        {baseStages.map((s) => (
          <SideItem key={s.id} to={`${base}/stages/${s.id}`} label={s.name} status={s.status} collapsed={collapsed} />
        ))}
        {course.extensions.map((e) => {
          const stages = course.stages.filter((s) => s.extension === e.slug);
          return (
            <div key={e.slug} className="pt-3">
              {!collapsed && (
                <div className="mb-1 flex items-center justify-between border-b border-line-soft px-1 pb-2 pt-2">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">{e.name}</span>
                  <Switch
                    on={e.enabled}
                    label={`Enable ${e.name}`}
                    onChange={(v) => post(`/api/courses/${course.slug}/extensions/${e.slug}`, { enabled: v }).then(reload)}
                  />
                </div>
              )}
              {e.enabled && stages.map((s) => <SideItem key={s.id} to={`${base}/stages/${s.id}`} label={s.name} status={s.status} collapsed={collapsed} />)}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-line-soft px-3 py-3">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-3 rounded px-2 py-1.5 text-[15px] font-semibold text-ink-2 hover:bg-hover">
          <span className="grid size-6 place-items-center rounded border border-line">
            {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
          </span>
          {!collapsed && "Collapse"}
        </button>
      </div>
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} wide>
        <h2 className="text-2xl font-bold text-ink">Reset progress?</h2>
        <p className="mt-3 text-ink-3">
          Your points, completed stages and hint reveals for {course.name} start over. Your repository and its commits stay as they are. The old events stay in
          the log, so the activity graph keeps them.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => post(`/api/courses/${course.slug}/reset`).then(() => (setConfirmReset(false), reload()))}
            className="rounded border border-bad/50 px-4 py-2 font-semibold text-bad hover:bg-bad/10"
          >
            Reset progress
          </button>
          <button onClick={() => setConfirmReset(false)} className="rounded px-4 py-2 font-semibold text-ink-2 hover:bg-hover">
            Keep it
          </button>
        </div>
      </Modal>
    </aside>
  );
}

/* ---------------- right panel ---------------- */

function RightPanel({ course }: { course: CourseDetail }) {
  const { id } = useParams();
  const { data: stage } = useApi<StageDetail>(id ? `/api/courses/${course.slug}/stages/${id}` : null);
  return (
    <aside className="hidden w-[304px] shrink-0 space-y-7 overflow-y-auto border-l border-line-soft px-6 py-8 xl:block">
      <div>
        <Link to={`/courses/${course.slug}/overview`} className="inline-flex items-center gap-1">
          <SectionLabel>Your progress</SectionLabel>
          <ArrowUpRight className="size-3.5 text-accent-ink" />
        </Link>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[30px] font-bold leading-none text-ink">{course.points}</span>
          <span className="font-semibold text-ink-3">pts</span>
          <span className="ml-auto text-[13px] text-ink-4">of {course.maxPoints}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${course.stageCount ? (100 * course.completed) / course.stageCount : 0}%` }} />
        </div>
        <p className="mt-2 text-[13px] text-ink-3">
          {course.completed}/{course.stageCount} stages · {course.attempts} attempts · {course.progress.streak}d streak
        </p>
      </div>

      {stage && (
        <div>
          <SectionLabel>This stage</SectionLabel>
          <div className="mt-3 rounded-sm border border-line bg-panel p-4 text-[14px]">
            {stage.progress.completedAt ? (
              <p className="text-ink-2">
                Earned <b className="text-accent-ink">{stage.progress.points} pts</b>
              </p>
            ) : (
              <p className="text-ink-2">
                Worth <b className="text-[18px] text-ink">{stage.worth.points} pts</b>
                {stage.worth.multiplier < 1 && <s className="ml-2 text-ink-4">{stage.worth.base}</s>}
              </p>
            )}
            <dl className="mt-3 space-y-1.5 text-[13px]">
              {[
                ["Attempts", String(stage.progress.attempts)],
                ["Hints revealed", `${stage.progress.hints}/${stage.hints.length}`],
                ["Code examples", stage.progress.examplesViewed ? "peeked" : stage.examplesUnlocked ? "unlocked" : "locked"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="font-medium text-ink-2">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-ink-4">
            Failed attempts are free. Each hint costs {Math.round(stage.penalties.hint * 100)}%. Opening code examples before passing costs{" "}
            {Math.round(stage.penalties.examples * 100)}%.
          </p>
        </div>
      )}

      <div>
        <SectionLabel>Activity</SectionLabel>
        <div className="mt-3">
          <Heatmap days={course.progress.days} weeks={17} compact />
        </div>
      </div>
    </aside>
  );
}

/* ---------------- test runner status + logs ---------------- */

export function runState(course: CourseDetail, run: Run | null) {
  if (!run || run.status === "idle" || run.stage !== course.currentStageId) return { tone: "idle", text: "Ready to run tests" } as const;
  if (run.status === "running") return { tone: "running", text: "Running tests…" } as const;
  if (run.status === "passed") return { tone: "passed", text: run.mode === "submit" ? "Tests passed" : "Tests passed — run codelarpers submit" } as const;
  return { tone: "failed", text: "Tests failed" } as const;
}

export function RunDot({ tone }: { tone: "idle" | "running" | "passed" | "failed" }) {
  return (
    <span
      className={cx(
        "inline-block size-2.5 rounded-full",
        tone === "idle" && "bg-ink-4",
        tone === "running" && "animate-cl-pulse bg-yellow-400",
        tone === "passed" && "bg-green-500",
        tone === "failed" && "bg-red-500",
      )}
    />
  );
}

const LEVEL_TEXT: Record<string, string> = {
  command: "text-sky-500 dark:text-sky-400",
  heading: "text-sky-500 dark:text-sky-400",
  success: "text-green-600 dark:text-green-400",
  error: "text-red-600 dark:text-red-400",
  debug: "text-ink-4",
};

function LogsDrawer({ run, onClose }: { run: Run | null; onClose: () => void }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [run?.lines.length]);
  return (
    <div className="fixed inset-x-0 bottom-10 top-[18%] z-40 flex flex-col border-t border-line bg-canvas shadow-[0_-12px_40px_rgba(0,0,0,0.35)]">
      <div className="mx-auto mt-1.5 h-1 w-16 rounded-full bg-line" />
      <div className="flex items-center justify-between px-6 pt-2">
        <span className="flex items-center gap-2 border-b-2 border-accent px-1 pb-2 text-[14px] font-medium text-ink">
          <SquareTerminal className="size-4" /> Logs
          {run?.stageName && <span className="text-ink-4">· #{run.stage?.toUpperCase()} {run.stageName}</span>}
        </span>
        <button onClick={onClose} aria-label="Close logs" className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink">
          <X className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 pb-4">
        <div className="rounded-sm border border-line bg-panel py-3 font-mono text-[13px] leading-[1.6]">
          {!run || run.lines.length === 0 ? (
            <p className="px-4 text-ink-3">
              No test runs yet. Run <span className="text-ink">codelarpers test</span> in your repository and the logs stream in here.
            </p>
          ) : (
            run.lines.map((l, i) => (
              <div key={i} className="flex gap-4 px-4 hover:bg-hover/50">
                <span className="w-7 shrink-0 select-none text-right text-ink-4">{i + 1}</span>
                <span className="whitespace-pre-wrap break-all">
                  {l.prefix && <span className="text-yellow-600 dark:text-yellow-300/90">[{l.prefix}] </span>}
                  <span className={LEVEL_TEXT[l.level] ?? "text-ink"}>{l.text}</span>
                </span>
              </div>
            ))
          )}
          <div ref={end} />
        </div>
        <p className="mt-2 text-[13px] text-ink-3">Read the red line first: it says what the tester expected and what your program printed.</p>
      </div>
    </div>
  );
}

function BottomBar({ course, run, logsOpen, toggle }: { course: CourseDetail; run: Run | null; logsOpen: boolean; toggle: () => void }) {
  const state = runState(course, run);
  return (
    <div className="flex h-10 shrink-0 items-center justify-center gap-3 border-t border-line-soft bg-canvas text-[14px] text-ink-2">
      <RunDot tone={state.tone} />
      {state.text}
      <button
        onClick={toggle}
        className={cx("rounded border px-1.5 py-0.5 text-[13px] font-medium", logsOpen ? "border-accent-line bg-button text-white" : "border-line text-ink-3 hover:text-ink")}
      >
        {logsOpen ? "Hide logs" : "Show logs"}
      </button>
    </div>
  );
}

/* ---------------- layout ---------------- */

export function CourseLayout() {
  const { slug = "" } = useParams();
  const { data: course, error, reload } = useApi<CourseDetail>(`/api/courses/${slug}`);
  const { data: run } = useApi<Run>(`/api/courses/${slug}/run`);
  const [logsOpen, setLogsOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(() => readStore("codelarpers:sidebar-collapsed", "0") === "1");
  const seenRun = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!run) return;
    if (seenRun.current !== undefined && run.id !== seenRun.current && run.status === "running") setLogsOpen(true);
    seenRun.current = run.id ?? "";
  }, [run]);
  const setCollapsed = (v: boolean) => {
    writeStore("codelarpers:sidebar-collapsed", v ? "1" : "0");
    setCollapsedState(v);
  };
  if (error) return <ErrorState message={error.message} />;
  if (!course) return <Loading />;
  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar course={course} collapsed={collapsed} setCollapsed={setCollapsed} reload={reload} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            <Outlet context={{ course, run, reload, openLogs: () => setLogsOpen(true) } satisfies CourseCtx} />
          </div>
          <RightPanel course={course} />
        </div>
        <BottomBar course={course} run={run} logsOpen={logsOpen} toggle={() => setLogsOpen(!logsOpen)} />
      </div>
      {logsOpen && <LogsDrawer run={run} onClose={() => setLogsOpen(false)} />}
    </div>
  );
}

/* ---------------- page frame used by every course page ---------------- */

export function CourseFrame({
  title,
  code,
  status,
  tabs,
  overlay,
  blurred = false,
  children,
}: {
  title: string;
  code?: string;
  status?: StageStatus | null;
  tabs: { to: string; label: string; icon: "doc" | "code"; end?: boolean }[];
  overlay?: ReactNode;
  blurred?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { course } = useCourse();
  const [scrolled, setScrolled] = useState(false);
  return (
    <>
    <div className="absolute inset-0 overflow-y-auto" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 64)}>
      <div className="flex items-start justify-between gap-6 px-10 pt-7">
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[28px] font-bold leading-tight text-ink">
          {title}
          {code && <span className="font-mono text-[22px] font-normal text-ink-4">#{code.toUpperCase()}</span>}
          {status && <StatusPill status={status} />}
        </h1>
        <div className="flex shrink-0 items-center gap-3 pt-1">
          <ThemeToggle />
          <PointsPill points={course.points} />
          <button onClick={() => navigate("/catalog")} aria-label="Close" className="grid size-8 place-items-center rounded border border-line text-ink-3 hover:bg-hover hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="sticky top-0 z-10 flex items-end justify-between border-b border-line-soft bg-canvas px-10 pt-3">
        <nav className="flex gap-2">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx("flex items-center gap-2 border-b-2 px-2 pb-2.5 text-[15px]", isActive ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink")
              }
            >
              {t.icon === "doc" ? <FileText className="size-4" /> : <Code2 className="size-4" />}
              {t.label}
            </NavLink>
          ))}
        </nav>
        {scrolled && (
          <span className="flex items-center gap-2 pb-2 text-[13px] text-ink-3">
            {code ? `Stage #${code.toUpperCase()}` : title}
            {status && <StatusPill status={status} />}
          </span>
        )}
      </div>
      <div className={cx("max-w-[1084px] px-10 pb-24 pt-6", blurred && "pointer-events-none select-none blur-[5px]")}>{children}</div>
    </div>
    {overlay}
    </>
  );
}
