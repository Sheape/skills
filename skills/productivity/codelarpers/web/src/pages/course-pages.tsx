import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, CircleCheck, ExternalLink, Lightbulb, Lock, PartyPopper, Terminal } from "lucide-react";
import { post, useApi, type CourseDetail, type Example, type StageDetail } from "@/lib/api";
import { CourseFrame, RunDot, runState, useCourse } from "@/components/course-layout";
import { Markdown, highlight } from "@/components/markdown";
import { CommandBox, DifficultyLabel, ErrorState, Loading, Modal, PrimaryButton, StatusPill, cx } from "@/components/ui";

const instructionsTab = (slug: string, path: string) => ({ to: `/courses/${slug}/${path}`, label: "Instructions", icon: "doc" as const, end: true });

/** /courses/:slug — jump to wherever the learner is. */
export function CourseIndex() {
  const { course } = useCourse();
  const base = `/courses/${course.slug}`;
  if (!course.introDone) return <Navigate to={`${base}/introduction`} replace />;
  if (!course.setupDone) return <Navigate to={`${base}/setup`} replace />;
  if (course.currentStageId) return <Navigate to={`${base}/stages/${course.currentStageId}`} replace />;
  return <Navigate to={`${base}/overview`} replace />;
}

function Card({ title, status, children, right }: { title: string; status?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-sm border border-line bg-panel">
      <header className="mx-6 flex items-center justify-between gap-4 border-b border-line-soft py-4">
        <h2 className="flex items-center gap-3 text-[18px] font-semibold text-ink">
          {title}
          {status}
        </h2>
        {right}
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function StepComplete({ to }: { to: string }) {
  return (
    <div className="pointer-events-none sticky top-14 z-10 -mb-6 flex justify-center">
      <Link to={to} className="pointer-events-auto -translate-y-2 rounded-full border border-good/40 bg-good-soft px-4 py-2 text-[15px] font-semibold text-ink shadow-lg backdrop-blur">
        <span className="flex items-center gap-2">
          <CircleCheck className="size-5 text-good" /> Step complete <span className="underline underline-offset-2">Next</span> <ArrowRight className="size-4" />
        </span>
      </Link>
    </div>
  );
}

function Celebrate({ title, body, cta, onCta, onClose }: { title: string; body?: ReactNode; cta: string; onCta: () => void; onClose: () => void }) {
  return (
    <Modal open onClose={onClose}>
      <div className="text-center">
        <PartyPopper className="mx-auto size-14 text-yellow-400" strokeWidth={1.4} />
        <h2 className="mt-4 text-[24px] font-bold leading-tight text-ink">{title}</h2>
        {body && <div className="mt-3 text-[15px] text-ink-2">{body}</div>}
        <PrimaryButton className="mt-6 w-full" onClick={onCta}>
          {cta} <ArrowRight className="size-4" />
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/* ---------------- introduction ---------------- */

const QUESTIONS: { key: string; title: string; options: string[] }[] = [
  { key: "proficiency", title: "Language Proficiency", options: ["Beginner", "Intermediate", "Advanced"] },
  { key: "cadence", title: "Practice Cadence", options: ["Every day", "Few times a week", "Once a week", "Whenever I can"] },
];

export function IntroductionPage() {
  const { course, reload } = useCourse();
  const navigate = useNavigate();
  const saved = course.progress.intro ?? {};
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({
    language: saved.language ?? (course.languages.length === 1 ? course.languages[0].id : ""),
    proficiency: saved.proficiency ?? "",
    cadence: saved.cadence ?? "",
  }));
  const [open, setOpen] = useState<string | null>(course.introDone ? null : course.languages.length > 1 ? "language" : "proficiency");
  const [celebrate, setCelebrate] = useState(false);
  const questions = [{ key: "language", title: "Preferred Language", options: course.languages.map((l) => l.id) }, ...QUESTIONS];
  const label = (key: string, v: string) => (key === "language" ? (course.languages.find((l) => l.id === v)?.name ?? v) : v);
  const complete = questions.every((q) => answers[q.key]);
  const setup = `/courses/${course.slug}/setup`;
  return (
    <CourseFrame
      title="Introduction"
      status={course.introDone ? "completed" : null}
      tabs={[instructionsTab(course.slug, "introduction")]}
      overlay={celebrate && <Celebrate title="Introduction complete!" body="You've completed this step." cta="View next step" onCta={() => navigate(setup)} onClose={() => setCelebrate(false)} />}
    >
      {course.introDone && <StepComplete to={setup} />}
      <div className="space-y-6">
        <Card title="Introduction">
          <Markdown source={course.introduction} />
        </Card>
        <section className="overflow-hidden rounded-sm border border-line bg-panel">
          <header className="flex items-center gap-3 border-b border-line-soft bg-raised px-6 py-3.5">
            <h2 className="text-[18px] font-semibold text-ink">Pre-Challenge Assessment</h2>
            {course.introDone && <StatusPill status="completed" />}
          </header>
          {questions.map((q, i) => {
            const value = answers[q.key];
            const isOpen = open === q.key;
            const fixed = q.key === "language" && course.languages.length === 1;
            return (
              <div key={q.key} className="border-b border-line-soft last:border-0">
                <button onClick={() => setOpen(isOpen ? null : q.key)} className="flex w-full items-center gap-3 px-6 py-4 text-left">
                  <span className="grid size-7 place-items-center rounded-full border border-line text-[13px] text-ink-3">{i + 1}</span>
                  <span className={cx("flex-1 text-[19px] font-semibold", value ? "text-ink-3" : "text-ink")}>
                    {q.title}
                    {value && <span className="font-normal">: {label(q.key, value)}</span>}
                    {value && <CircleCheck className="ml-2 inline size-5 fill-accent text-panel" />}
                  </span>
                  <ChevronDown className={cx("size-5 text-ink-3 transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-2 px-16 pb-5">
                    {q.options.map((o) => (
                      <button
                        key={o}
                        disabled={fixed && course.introDone}
                        onClick={() => {
                          const next = { ...answers, [q.key]: o };
                          setAnswers(next);
                          const after = questions.find((x) => !next[x.key]);
                          setOpen(after ? after.key : null);
                        }}
                        className={cx(
                          "rounded border px-4 py-2 text-[15px] font-medium",
                          value === o ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:bg-hover",
                        )}
                      >
                        {label(q.key, o)}
                      </button>
                    ))}
                    {fixed && <p className="w-full pt-1 text-[13px] text-ink-4">This challenge was generated for {label(q.key, q.options[0])}.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </section>
        {!course.introDone && (
          <PrimaryButton
            className={cx(!complete && "pointer-events-none opacity-40")}
            onClick={() => post(`/api/courses/${course.slug}/introduction`, { answers }).then(() => (reload(), setCelebrate(true)))}
          >
            Continue <ArrowRight className="size-4" />
          </PrimaryButton>
        )}
      </div>
    </CourseFrame>
  );
}

/* ---------------- local setup ---------------- */

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <div className="relative flex gap-4 pb-6">
      <span className="absolute bottom-0 left-[13px] top-8 w-px bg-line" />
      {done ? (
        <CircleCheck className="relative size-7 shrink-0 fill-accent text-panel" />
      ) : (
        <span className="relative grid size-7 shrink-0 place-items-center rounded-full border border-line bg-panel text-[13px] font-semibold text-ink-2">{n}</span>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="pt-0.5 text-[17px] font-semibold text-ink">{title}</h3>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

export function SetupPage() {
  const { course } = useCourse();
  const navigate = useNavigate();
  const [celebrate, setCelebrate] = useState(false);
  const [wasDone] = useState(course.setupDone);
  useEffect(() => {
    if (course.setupDone && !wasDone) setCelebrate(true);
  }, [course.setupDone, wasDone]);
  const next = course.currentStageId ? `/courses/${course.slug}/stages/${course.currentStageId}` : `/courses/${course.slug}/overview`;
  const dir = course.repo.cloneDir;
  return (
    <CourseFrame
      title="Local Setup"
      status={course.setupDone ? "completed" : null}
      tabs={[instructionsTab(course.slug, "setup")]}
      overlay={celebrate && <Celebrate title="Local setup complete!" body="Your repository is linked. The first stage is now activated." cta="View current stage" onCta={() => navigate(next)} onClose={() => setCelebrate(false)} />}
    >
      {course.setupDone && <StepComplete to={next} />}
      <Card title="Local Setup" status={course.setupDone && <StatusPill status="completed" />}>
        {!course.repoReady ? (
          <p className="text-ink-2">
            Pick a language on the{" "}
            <Link to={`/courses/${course.slug}/introduction`} className="font-semibold text-link underline">
              Introduction
            </Link>{" "}
            page first; that creates your repository.
          </p>
        ) : (
          <>
            <p className="mb-6 text-ink-2">Follow these steps to set up your {course.language?.name ?? ""} project locally.</p>
            <Step n={1} done={course.setupDone} title="Clone the repository">
              <CommandBox icon={<Terminal className="size-3.5 text-ink-4" />} variants={[{ label: "command line", lines: [`git clone ${course.repo.path} ${dir}`, `cd ${dir}`] }]} />
              <p className="mt-2 text-[13px] text-ink-4">
                This is a local Git remote on your machine. <code className="font-mono">codelarper submit</code> pushes your work to it.
              </p>
            </Step>
            <Step n={2} done={course.setupDone} title="Test CLI connection">
              <CommandBox variants={[{ label: "codelarper cli", lines: ["codelarper ping # Run inside the cloned repository"] }]} />
              {course.setupDone ? (
                course.progress.pingCwd && <p className="mt-2 text-[13px] text-ink-4">Linked {course.progress.pingCwd}</p>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-[14px] text-ink-3">
                  <RunDot tone="running" /> Listening for <code className="font-mono">codelarper ping</code>…
                </p>
              )}
            </Step>
            {course.setupDone && (
              <>
                <p className="flex items-center gap-2 text-[17px] text-ink-2">🎉 The first stage is now activated.</p>
                <PrimaryButton className="mt-5" onClick={() => navigate(next)}>
                  Continue <ArrowRight className="size-4" />
                </PrimaryButton>
              </>
            )}
          </>
        )}
      </Card>
    </CourseFrame>
  );
}

/* ---------------- stage: instructions ---------------- */

function stageTabs(slug: string, id: string) {
  return [
    { to: `/courses/${slug}/stages/${id}`, label: "Instructions", icon: "doc" as const, end: true },
    { to: `/courses/${slug}/stages/${id}/code-examples`, label: "Code Examples", icon: "code" as const },
  ];
}

function useStage() {
  const { slug = "", id = "" } = useParams();
  return useApi<StageDetail>(`/api/courses/${slug}/stages/${id}`);
}

function Gate({ course, stage, onClose }: { course: CourseDetail; stage: StageDetail; onClose?: () => void }) {
  const navigate = useNavigate();
  if (stage.status === "pending" || stage.status === "disabled")
    return (
      <Modal open onClose={onClose}>
        <div className="text-center">
          <AlertTriangle className="mx-auto size-12 fill-yellow-400 text-panel" />
          <h2 className="mt-4 text-[24px] font-bold leading-tight text-ink">{stage.status === "disabled" ? "Extension disabled" : "Previous steps incomplete!"}</h2>
          <p className="mt-3 text-[15px] text-ink-2">
            {stage.status === "disabled" ? "Turn this extension on in the sidebar to work on it." : "This step depends on previous steps that you haven't completed yet."}
          </p>
          <PrimaryButton className="mt-6 w-full" onClick={() => navigate(`/courses/${course.slug}`)}>
            <ArrowLeft className="size-4" /> View current stage
          </PrimaryButton>
        </div>
      </Modal>
    );
  return null;
}

const FEELINGS = [
  ["too_easy", "😴", "Too easy"],
  ["just_right", "🙂", "Just right"],
  ["too_hard", "🤯", "Too hard"],
] as const;

function Feedback({ slug, stage }: { slug: string; stage: StageDetail }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-good/30 bg-good-soft px-5 py-4">
      <p className="flex items-center gap-2 font-semibold text-good">
        <CircleCheck className="size-5" /> How did this stage feel?
      </p>
      <div className="flex gap-2">
        {FEELINGS.map(([value, emoji, label]) => (
          <button
            key={value}
            onClick={() => post(`/api/courses/${slug}/stages/${stage.id}/rating`, { value })}
            className={cx(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[14px]",
              stage.progress.rating === value ? "border-accent-line bg-accent-soft text-ink" : "border-line text-ink-2 hover:bg-hover",
            )}
          >
            <span className="text-lg">{emoji}</span> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Hints({ slug, stage }: { slug: string; stage: StageDetail }) {
  const nextHint = stage.hints.find((h) => !h.revealed);
  const cost = Math.round(stage.worth.base * stage.penalties.hint);
  return (
    <section className="mt-10">
      <div className="flex items-end justify-between border-b border-line-soft pb-3">
        <h2 className="text-[22px] font-semibold text-ink">Hints</h2>
        {!stage.progress.completedAt && stage.hints.length > 0 && <span className="text-[13px] text-ink-3">Each hint costs {cost} pts on this stage</span>}
      </div>
      {stage.hints.length === 0 && <p className="mt-4 text-ink-3">No hints for this stage. The test log and resources below are your guide.</p>}
      <div className="mt-4 space-y-3">
        {stage.hints.map((h) =>
          h.revealed ? (
            <div key={h.n} className="rounded-sm border border-line bg-panel px-5 py-4">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-accent-ink">
                <Lightbulb className="size-4" /> Hint {h.n} · {h.title}
              </p>
              <Markdown source={h.body ?? ""} className="mt-2" />
            </div>
          ) : h === nextHint ? (
            <button
              key={h.n}
              onClick={() => post(`/api/courses/${slug}/stages/${stage.id}/reveal-hint`)}
              className="flex w-full items-center justify-between rounded-sm border border-dashed border-line px-5 py-4 text-left hover:border-accent-line hover:bg-hover"
            >
              <span className="flex items-center gap-2 font-semibold text-ink-2">
                <Lightbulb className="size-4 text-ink-4" /> Reveal hint {h.n}: {h.title}
              </span>
              {!stage.progress.completedAt && <span className="text-[13px] text-ink-4">−{cost} pts</span>}
            </button>
          ) : (
            <div key={h.n} className="flex items-center gap-2 rounded-sm border border-line-soft px-5 py-4 text-ink-4">
              <Lock className="size-4" /> Hint {h.n}
            </div>
          ),
        )}
      </div>
      {stage.resources.trim() && (
        <>
          <h2 className="mt-10 border-b border-line-soft pb-3 text-[22px] font-semibold text-ink">Resources</h2>
          <Markdown source={stage.resources} className="mt-4" />
        </>
      )}
    </section>
  );
}

export function StagePage() {
  const { course, run, openLogs } = useCourse();
  const { data: stage, error } = useStage();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (error) return <ErrorState message={error.message} />;
  if (!stage) return <Loading />;
  const locked = stage.status === "pending" || stage.status === "disabled";
  const showDone = stage.status === "completed" && dismissed !== stage.id;
  const next = course.currentStageId ? `/courses/${course.slug}/stages/${course.currentStageId}` : `/courses/${course.slug}/overview`;
  const rs = runState(course, run);
  const isCurrent = stage.status === "current";
  return (
    <CourseFrame
      title={stage.name}
      code={stage.id}
      status={stage.status}
      tabs={stageTabs(course.slug, stage.id)}
      blurred={locked || showDone}
      overlay={
        locked ? (
          <Gate course={course} stage={stage} />
        ) : showDone ? (
          <Celebrate
            title="Stage complete!"
            body={
              <div className="mt-2 rounded border border-accent-line bg-accent-soft px-4 py-5">
                <p className="text-[14px] text-accent-ink">You earned</p>
                <p className="mt-1 text-[30px] font-bold text-accent-ink">+{stage.progress.points} pts</p>
              </div>
            }
            cta={course.currentStageId ? "View current stage" : "Back to overview"}
            onCta={() => (setDismissed(stage.id), navigate(next))}
            onClose={() => setDismissed(stage.id)}
          />
        ) : null
      }
    >
      {stage.status === "completed" && <Feedback slug={course.slug} stage={stage} />}
      <Card title="Your Task" status={<StatusPill status={stage.status} />} right={<DifficultyLabel difficulty={stage.difficulty} />}>
        <Markdown source={stage.instructions} assetBase={`/api/courses/${course.slug}/asset/stages/${stage.id}`} />
        <h3 className="mt-10 text-[20px] font-semibold text-ink">How to pass this stage</h3>
        <div className="mt-5">
          <Step n={1} done={false} title="Write code to pass this stage">
            <p className="text-ink-2">Head over to your editor / IDE and implement your solution.</p>
            <p className="mt-2 text-ink-2">
              Stuck? Reveal a hint below, or check the{" "}
              <Link to={`/courses/${course.slug}/stages/${stage.id}/code-examples`} className="font-semibold text-link underline underline-offset-2">
                Code Examples
              </Link>
              {course.kind === "codebase" ? " from the codebase itself" : " from professional codebases"}.
            </p>
          </Step>
          <Step n={2} done={stage.status === "completed"} title="Submit code">
            <p className="mb-3 text-ink-2">To run tests, make changes to your code and run the submit command:</p>
            <CommandBox
              variants={[
                { label: "submit", lines: ["codelarper submit # Commit, then run tests"] },
                { label: "test only", lines: ["codelarper test # Run tests without committing"] },
              ]}
            />
          </Step>
        </div>
      </Card>
      <div className="mt-6 flex items-center justify-between rounded-sm border border-line bg-panel px-4 py-2.5 text-[14px]">
        <span className="flex items-center gap-2 text-ink-2">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">Test runner:</span>
          {isCurrent ? (
            <>
              <RunDot tone={rs.tone} /> {rs.text}
            </>
          ) : stage.status === "completed" ? (
            <>
              <RunDot tone="passed" /> Passed
            </>
          ) : (
            <>
              <RunDot tone="idle" /> Waiting for earlier stages
            </>
          )}
        </span>
        <button onClick={openLogs} className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-[13px] font-semibold text-ink-2 hover:bg-hover">
          <Terminal className="size-3.5" /> View logs
        </button>
      </div>
      <Hints slug={course.slug} stage={stage} />
    </CourseFrame>
  );
}

/* ---------------- stage: code examples ---------------- */

function ExampleCard({ ex, kind }: { ex: Example; kind: string }) {
  const fence = /```(\w*)\n([\s\S]*?)```/.exec(ex.body);
  const explanation = fence ? ex.body.slice(0, fence.index).trim() : ex.body;
  const after = fence ? ex.body.slice(fence.index + fence[0].length).trim() : "";
  const start = Number((ex.lines || "1").split("-")[0]) || 1;
  const code = fence ? fence[2].replace(/\n$/, "") : "";
  const lines = highlight(code, fence?.[1] || ex.language).split("\n");
  const fromCodebase = ex.kind === "codebase" || kind === "codebase";
  return (
    <article className="overflow-hidden rounded-sm border border-line bg-panel">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft px-5 py-3">
        <span className="grid size-7 place-items-center rounded-full bg-hover font-mono text-[12px] font-bold text-ink-2">
          {(ex.source || ex.author || "?").replace(/^.*\//, "").slice(0, 2).toUpperCase()}
        </span>
        <span className="font-semibold text-ink">{ex.source || ex.author}</span>
        <span className={cx("rounded px-1.5 py-0.5 text-[12px] font-semibold", fromCodebase ? "bg-accent-soft text-accent-ink" : "bg-info-soft text-info")}>
          {fromCodebase ? "From the studied codebase" : "Professional code"}
        </span>
        {ex.license && <span className="text-[12px] text-ink-4">{ex.license}</span>}
        {ex.url && (
          <a href={ex.url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-[13px] font-semibold text-link">
            View source <ExternalLink className="size-3.5" />
          </a>
        )}
      </header>
      <div className="px-5 pt-4">
        <h3 className="text-[17px] font-semibold text-ink">{ex.title}</h3>
        <p className="mt-1 font-mono text-[12px] text-ink-4">
          {ex.path}
          {ex.lines && `:${ex.lines}`}
          {ex.commit && ` @ ${ex.commit.slice(0, 10)}`}
        </p>
        {explanation && <Markdown source={explanation} className="mt-3" />}
      </div>
      {fence && (
        <pre className="mx-5 my-4 overflow-x-auto rounded-md bg-code py-3 font-mono text-[13px] leading-[1.65] text-ink-2">
          {lines.map((l, i) => (
            <div key={i} className="flex">
              <span className="w-12 shrink-0 select-none pr-4 text-right text-ink-4">{start + i}</span>
              <code className="hljs pr-4" dangerouslySetInnerHTML={{ __html: l || " " }} />
            </div>
          ))}
        </pre>
      )}
      {after && <Markdown source={after} className="px-5 pb-4" />}
    </article>
  );
}

export function CodeExamplesPage() {
  const { course } = useCourse();
  const { data: stage, error } = useStage();
  const { data: examples, error: exError } = useApi<{ examples: Example[]; kind: string }>(
    stage?.examplesUnlocked ? `/api/courses/${course.slug}/stages/${stage.id}/examples` : null,
  );
  const navigate = useNavigate();
  if (error) return <ErrorState message={error.message} />;
  if (!stage) return <Loading />;
  const gatedByOrder = stage.status === "pending" || stage.status === "disabled";
  const needsConfirm = !gatedByOrder && !stage.examplesUnlocked && stage.examplesCount > 0;
  const cost = Math.round(stage.worth.base * stage.penalties.examples);
  return (
    <CourseFrame
      title={stage.name}
      code={stage.id}
      status={stage.status}
      tabs={stageTabs(course.slug, stage.id)}
      blurred={gatedByOrder || needsConfirm}
      overlay={
        gatedByOrder ? (
          <Gate course={course} stage={stage} />
        ) : needsConfirm ? (
          <Modal open wide>
            <h2 className="text-[26px] font-bold text-ink">Stage incomplete</h2>
            <p className="mt-4 text-[16px] leading-7 text-ink-2">
              You haven't completed this stage yet. The struggle is where the learning happens: try the hints first. Viewing code examples now costs{" "}
              <b className="text-ink">{cost} pts</b> on this stage.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-5">
              <PrimaryButton onClick={() => navigate(`/courses/${course.slug}/stages/${stage.id}`)}>
                <ArrowLeft className="size-4" /> No, back to instructions
              </PrimaryButton>
              <button
                onClick={() => post(`/api/courses/${course.slug}/stages/${stage.id}/unlock-examples`)}
                className="border-b border-ink-3 text-[15px] text-ink-2 hover:text-ink"
              >
                Yes, show me the code 👀
              </button>
            </div>
          </Modal>
        ) : null
      }
    >
      <div className="flex items-center justify-between border-b border-line-soft pb-4">
        <h2 className="text-[20px] font-semibold text-ink">
          Code Examples{course.kind === "codebase" ? " from the codebase" : course.language ? ` using ${course.language.name}` : ""}
        </h2>
        <span className="text-[13px] text-ink-3">
          {stage.examplesCount} example{stage.examplesCount === 1 ? "" : "s"}
        </span>
      </div>
      {stage.examplesCount === 0 ? (
        <p className="mt-8 text-ink-3">No code examples for this stage.</p>
      ) : needsConfirm || gatedByOrder ? (
        <div className="mt-6 space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-72 rounded-sm border border-line bg-panel p-5">
              <div className="h-4 w-48 rounded bg-hover" />
              <div className="mt-6 space-y-3">
                {Array.from({ length: 9 }, (_, j) => (
                  <div key={j} className="h-3 rounded bg-code" style={{ width: `${30 + ((j * 37) % 60)}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : exError ? (
        <ErrorState message={exError.message} />
      ) : !examples ? (
        <Loading />
      ) : (
        <div className="mt-6 space-y-6">
          {stage.progress.examplesViewed && !stage.progress.completedAt && (
            <p className="flex items-center gap-2 text-[14px] text-warn">
              <Check className="size-4" /> Unlocked early: this stage now pays {stage.worth.points} pts.
            </p>
          )}
          {examples.examples.map((ex) => (
            <ExampleCard key={ex.file} ex={ex} kind={examples.kind} />
          ))}
        </div>
      )}
    </CourseFrame>
  );
}
