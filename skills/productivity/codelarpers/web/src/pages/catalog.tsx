import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, FolderGit2, Info, Layers, X } from "lucide-react";
import { useApi, type CourseSummary } from "@/lib/api";
import { plural, readStore, writeStore } from "@/lib/format";
import { CourseIcon, ErrorState, Loading, Modal, ProgressRing } from "@/components/ui";

const DISMISS = "codelarper:start-here-dismissed";

function CourseCard({ c }: { c: CourseSummary }) {
  const started = c.started || c.completed > 0;
  return (
    <Link
      to={`/courses/${c.slug}/overview`}
      className="group flex min-h-[166px] flex-col rounded-sm border border-line bg-panel p-5 transition-colors hover:border-ink-4/60"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[19px] font-semibold text-ink">{c.name}</h2>
          <p className="mt-3 text-[15px] leading-6 text-ink-3">{c.short}</p>
        </div>
        <CourseIcon icon={c.icon} background={c.iconBackground} name={c.name} slug={c.slug} className="size-9" />
      </div>
      <div className="mt-auto flex items-center justify-between pt-5">
        <div className="flex items-center gap-3 text-[13px]">
          {started ? (
            <span className="flex items-center gap-1.5 text-accent-ink">
              <ProgressRing value={c.completed} total={c.stageCount} />
              <span>
                <b>
                  {c.completed}/{c.stageCount}
                </b>{" "}
                stages
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-ink-4">
              <Layers className="size-3.5" />
              {plural(c.stageCount, "stage")}
            </span>
          )}
          {c.points > 0 && <span className="text-ink-3">{c.points} pts</span>}
          <span className="rounded border border-line px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-ink-4">
            {c.kind === "codebase" ? "Codebase" : "Tutorial"}
          </span>
        </div>
        <ArrowRight className="size-4 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2" />
      </div>
    </Link>
  );
}

export function HowItWorks() {
  const steps = [
    ["A project becomes a challenge", "Run /codelarpers in any project. An agent studies that codebase or topic and turns it into a roadmap of small stages. Each project gets its own challenge, score and history."],
    ["Every stage is code you write", "Instructions explain the concept and the exact input and output. No stage passes by reading: you implement it in your own repository."],
    ["The tests are the teacher", "codelarper test runs the stage's tests locally; codelarper submit commits and, on a pass, completes the stage. Fail, read the log, fix, rerun."],
    ["Points reward struggle", "Failed attempts cost nothing. Each hint costs 10% of the stage's points; peeking at code examples before passing costs 50%."],
  ];
  return (
    <ol className="space-y-5">
      {steps.map(([title, body], i) => (
        <li key={title} className="flex gap-4">
          <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-sm font-semibold text-ink-2">{i + 1}</span>
          <div>
            <p className="font-semibold text-ink">{title}</p>
            <p className="mt-1 text-[15px] leading-6 text-ink-3">{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CatalogPage() {
  const { data, error } = useApi<{ courses: CourseSummary[] }>("/api/catalog");
  const [dismissed, setDismissed] = useState(() => readStore(DISMISS, "") === "1");
  const [howOpen, setHowOpen] = useState(false);
  if (error) return <ErrorState message={error.message} />;
  if (!data) return <Loading />;
  const empty = data.courses.length === 0;
  return (
    <main className="relative mx-auto max-w-[1024px] px-6 pb-20 pt-12">
      <h1 className="border-b border-line-soft pb-2.5 text-[32px] font-bold tracking-tight text-ink">Challenges</h1>
      {!dismissed && (
        <div className="mt-6 flex items-center justify-between rounded-sm border border-info-line bg-info-soft px-4 py-3 text-[15px] text-info">
          <span className="flex items-center gap-3">
            <Info className="size-5 fill-info text-info-soft" />
            <span>
              New here?{" "}
              <button onClick={() => setHowOpen(true)} className="font-bold underline underline-offset-2">
                Start here
              </button>{" "}
              to learn how challenges work.
            </span>
          </span>
          <button
            aria-label="Dismiss"
            onClick={() => {
              writeStore(DISMISS, "1");
              setDismissed(true);
            }}
            className="rounded border border-info-line p-0.5 hover:bg-info-soft"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {empty ? (
        <div className="mt-6 rounded-sm border border-dashed border-line px-8 py-14 text-center">
          <FolderGit2 className="mx-auto size-10 text-ink-4" />
          <h2 className="mt-4 text-xl font-semibold text-ink">No challenges yet</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-6 text-ink-3">
            Open a project you want to understand and run <code className="rounded bg-code px-1.5 py-0.5 font-mono text-sm text-ink">/codelarpers</code> with what
            you want to learn. Its roadmap shows up here as your first challenge.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {data.courses.map((c) => (
            <CourseCard key={c.slug} c={c} />
          ))}
        </div>
      )}
      <Modal open={howOpen} onClose={() => setHowOpen(false)} wide>
        <h2 className="mb-6 text-2xl font-bold text-ink">How challenges work</h2>
        <HowItWorks />
      </Modal>
    </main>
  );
}
