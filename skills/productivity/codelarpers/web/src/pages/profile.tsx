import { Fragment } from "react";
import { Link } from "react-router";
import { Flame, Layers, Sparkles, Zap } from "lucide-react";
import { useApi, type Profile, type TimelineItem } from "@/lib/api";
import { monthYear, plural, shortDate } from "@/lib/format";
import { Heatmap } from "@/components/heatmap";
import { CourseIcon, ErrorState, Loading } from "@/components/ui";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

function TimelineText({ item }: { item: TimelineItem }) {
  const course = (
    <Link to={`/courses/${item.course}/overview`} className="font-semibold text-link underline underline-offset-2">
      {item.courseName}
    </Link>
  );
  switch (item.kind) {
    case "created":
      return <>Generated the {course} challenge{item.project ? <> from <code className="font-mono text-[0.9em] text-ink-3">{item.project}</code></> : null}</>;
    case "started":
      return <>Started the {course} challenge{item.language ? ` using ${item.language}` : ""}</>;
    case "stage":
      return (
        <>
          Completed <b className="font-semibold text-ink">{item.stageName}</b> in {course} <span className="text-accent-ink">+{item.points} pts</span>
        </>
      );
    case "finished":
      return <>Finished the {course} challenge 🎉</>;
  }
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line-soft py-2.5 text-[14px] last:border-0">
      <span className="flex items-center gap-2 text-ink-3">
        {icon}
        {label}
      </span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}

export function ProfilePage() {
  const { data, error } = useApi<Profile>("/api/profile");
  if (error) return <ErrorState message={error.message} />;
  if (!data) return <Loading />;
  const { totals, user } = data;
  const firstActivity = Object.keys(totals.days).sort()[0];
  const groups: { month: string; items: TimelineItem[] }[] = [];
  for (const item of data.timeline) {
    const month = monthYear(item.ts);
    if (groups.at(-1)?.month !== month) groups.push({ month, items: [] });
    groups.at(-1)!.items.push(item);
  }
  return (
    <main>
      <div className="h-[224px] border-b border-line-soft bg-raised" />
      <div className="mx-auto -mt-24 grid max-w-[1024px] gap-8 px-6 pb-20 md:grid-cols-[192px_1fr]">
        <aside>
          <div className="grid size-48 place-items-center rounded-sm border-2 border-line bg-button font-bold text-white">
            <span className="text-6xl">{initials(user.name)}</span>
          </div>
          <h1 className="mt-6 text-[26px] font-bold text-ink">{user.name}</h1>
          <p className="mt-1 text-[13px] text-ink-3">{firstActivity ? `learning since ${shortDate(`${firstActivity}T12:00:00`)}` : "no attempts yet"}</p>
          <div className="mt-6">
            <Stat icon={<Sparkles className="size-4" />} label="Points" value={totals.points.toLocaleString()} />
            <Stat icon={<Layers className="size-4" />} label="Stages" value={totals.completed.toLocaleString()} />
            <Stat icon={<Zap className="size-4" />} label="Attempts" value={totals.attempts.toLocaleString()} />
            <Stat icon={<Flame className="size-4" />} label="Streak" value={`${totals.streak}d (best ${totals.longestStreak}d)`} />
          </div>
        </aside>
        <section className="min-w-0 pt-28 md:pt-32">
          <h2 className="text-[22px] text-ink">Activity</h2>
          <div className="mt-4 rounded-sm border border-line bg-panel p-5">
            <Heatmap days={totals.days} />
          </div>
          <p className="mt-2 text-[12px] text-ink-4">Each test run is an attempt. Failing counts: that's the practice.</p>

          <h2 className="mt-10 text-[22px] text-ink">Challenges</h2>
          {data.courses.length === 0 ? (
            <p className="mt-4 text-ink-3">No challenges yet. Run /codelarpers in a project to create one.</p>
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {data.courses.map((c) => (
                <Link key={c.slug} to={`/courses/${c.slug}/overview`} className="rounded-sm border border-line bg-panel p-5 hover:border-ink-4/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[18px] font-semibold text-ink">{c.name}</h3>
                      <p className="text-[13px] text-ink-3">{c.language ? `using ${c.language.name}` : c.kind}</p>
                    </div>
                    <CourseIcon icon={c.icon} background={c.iconBackground} name={c.name} slug={c.slug} className="size-9" />
                  </div>
                  <p className="mt-3 text-[15px] leading-6 text-ink-3">{c.short}</p>
                  <div className="mt-4 flex items-center gap-3 text-[13px] text-ink-3">
                    <span className="h-2 w-16 overflow-hidden rounded-full bg-line">
                      <span className="block h-full rounded-full bg-yellow-400" style={{ width: `${c.stageCount ? (100 * c.completed) / c.stageCount : 0}%` }} />
                    </span>
                    <span>
                      <b className="text-ink-2">
                        {c.completed}/{c.stageCount}
                      </b>{" "}
                      stages
                    </span>
                    <span className="ml-auto font-semibold text-accent-ink">{c.points} pts</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {groups.length > 0 && (
            <div className="mt-12">
              {groups.map((g) => (
                <Fragment key={g.month}>
                  <div className="mt-8 flex items-center gap-4 first:mt-0">
                    <span className="text-[15px] font-semibold text-ink-3">{g.month}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <ul className="mt-4 space-y-3">
                    {g.items.map((item, i) => (
                      <li key={`${item.ts}-${i}`} className="flex items-baseline gap-4 text-[16px] text-ink-2">
                        <span className="size-2 shrink-0 translate-y-[-2px] rounded-full bg-ink-4" />
                        <span>
                          <TimelineText item={item} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </Fragment>
              ))}
            </div>
          )}
          <p className="mt-12 text-[12px] text-ink-4">{plural(data.courses.length, "challenge")} · everything here lives on this machine.</p>
        </section>
      </div>
    </main>
  );
}
