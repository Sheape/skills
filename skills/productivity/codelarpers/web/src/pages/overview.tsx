import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowRight, Check, ChevronDown, FolderGit2, GitCommitHorizontal, SquareTerminal } from "lucide-react";
import { useApi, type CourseDetail, type StageRow } from "@/lib/api";
import { plural } from "@/lib/format";
import { Heatmap } from "@/components/heatmap";
import { Markdown } from "@/components/markdown";
import { CourseIcon, DifficultyLabel, ErrorState, Loading, PrimaryButton, SectionLabel, cx } from "@/components/ui";

function Faq({ title, body }: { title: string; body: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line-soft">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 py-3 text-left text-[17px] font-semibold text-ink">
        <ChevronDown className={cx("size-4 text-ink-3 transition-transform", !open && "-rotate-90")} />
        {title}
      </button>
      {open && <Markdown source={body} className="pb-4 pl-7" />}
    </div>
  );
}

function StageLine({ slug, s }: { slug: string; s: StageRow }) {
  const done = s.status === "completed";
  return (
    <Link to={`/courses/${slug}/stages/${s.id}`} className="group flex items-center gap-3 py-2">
      <span className={cx("size-1.5 rounded-full", done ? "bg-accent" : "bg-ink-4/60")} />
      <SquareTerminal className="size-5 text-ink-4" strokeWidth={1.5} />
      <span className={cx("flex-1 text-[15px] group-hover:underline", s.status === "disabled" ? "text-ink-4" : "text-ink-2")}>{s.name}</span>
      {done ? <Check className="size-4 text-accent" /> : <DifficultyLabel difficulty={s.difficulty} />}
    </Link>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-4">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[15px] font-semibold text-ink-3">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function OverviewPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { data: c, error } = useApi<CourseDetail>(`/api/courses/${slug}`);
  if (error) return <ErrorState message={error.message} />;
  if (!c) return <Loading />;
  const base = c.stages.filter((s) => !s.extension);
  const started = c.started || c.completed > 0;
  return (
    <main className="mx-auto max-w-[1024px] px-6 pb-24 pt-12">
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <h1 className="text-[52px] font-bold leading-[1.05] tracking-[-0.035em] text-ink md:text-[60px]">{c.name}</h1>
          <p className="mt-3 text-lg text-ink-3">{c.short}</p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <PrimaryButton big onClick={() => navigate(`/courses/${slug}`)}>
              {c.finished ? "Review challenge" : started ? "Resume Building" : "Start Building"} <ArrowRight className="size-5" />
            </PrimaryButton>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="rounded border border-line px-2 py-1 font-semibold uppercase tracking-wide text-ink-3">
                {c.kind === "codebase" ? "Codebase study" : "Tutorial"}
              </span>
              {c.languages.map((l) => (
                <span key={l.id} className="rounded border border-line px-2 py-1 font-medium text-ink-2">
                  {l.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <CourseIcon icon={c.icon} background={c.iconBackground} name={c.name} slug={c.slug} className="hidden size-40 md:inline-grid" />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_304px]">
        <section className="rounded-sm border border-line bg-panel px-6 py-6">
          <Markdown source={c.overview.description} className="text-[17px] leading-8" />
          {c.overview.faq.length > 0 && (
            <div className="mt-6 border-b border-line-soft">
              {c.overview.faq.map((f) => (
                <Faq key={f.title} {...f} />
              ))}
            </div>
          )}
          <Divider label="Stages" />
          {base.map((s) => (
            <StageLine key={s.id} slug={slug} s={s} />
          ))}
          {c.extensions.map((e) => (
            <div key={e.slug}>
              <Divider label={e.name} />
              {e.description && <p className="-mt-1 mb-2 text-center text-[13px] text-ink-4">{e.description}</p>}
              {c.stages
                .filter((s) => s.extension === e.slug)
                .map((s) => (
                  <StageLine key={s.id} slug={slug} s={s} />
                ))}
            </div>
          ))}
        </section>

        <aside className="space-y-6">
          <div>
            <SectionLabel>Your progress</SectionLabel>
            <div className="mt-3 rounded-sm border border-line bg-panel p-4">
              <p className="text-[32px] font-bold leading-none text-ink">
                {c.points}
                <span className="ml-1 text-base font-semibold text-ink-3">pts</span>
              </p>
              <p className="mt-1 text-[13px] text-ink-4">of {c.maxPoints} possible</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  [`${c.completed}/${c.stageCount}`, "stages"],
                  [String(c.attempts), "attempts"],
                  [`${c.progress.streak}d`, "streak"],
                ].map(([v, l]) => (
                  <div key={l} className="rounded border border-line-soft bg-raised py-2">
                    <p className="font-semibold text-ink">{v}</p>
                    <p className="text-[11px] uppercase tracking-wide text-ink-4">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <SectionLabel>Activity</SectionLabel>
            <div className="mt-3 rounded-sm border border-line bg-panel p-3">
              <Heatmap days={c.progress.days} weeks={17} compact />
            </div>
          </div>
          {(c.source.project || c.source.repository || c.source.subject) && (
            <div>
              <SectionLabel>Source</SectionLabel>
              <div className="mt-3 space-y-2 rounded-sm border border-line bg-panel p-4 text-[13px] text-ink-3">
                {c.source.subject && <p className="text-ink-2">{c.source.subject}</p>}
                {c.source.project && (
                  <p className="flex items-center gap-2 break-all font-mono">
                    <FolderGit2 className="size-4 shrink-0" />
                    {c.source.project}
                  </p>
                )}
                {c.source.repository && (
                  <a href={c.source.repository} target="_blank" rel="noreferrer" className="block break-all text-link underline">
                    {c.source.repository}
                  </a>
                )}
                {c.source.commit && (
                  <p className="flex items-center gap-2 font-mono">
                    <GitCommitHorizontal className="size-4" />
                    {c.source.commit.slice(0, 12)}
                  </p>
                )}
              </div>
            </div>
          )}
          <p className="text-[12px] text-ink-4">{plural(c.totalStages, "stage")} · created {c.created}</p>
        </aside>
      </div>
    </main>
  );
}
