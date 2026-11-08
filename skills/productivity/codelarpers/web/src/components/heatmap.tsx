import { useMemo, useState } from "react";
import type { Days } from "@/lib/api";
import { localDay, plural, shortDate } from "@/lib/format";
import { cx } from "./ui";

const LEVEL = ["bg-heat-0", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function level(count: number, max: number) {
  if (count <= 0) return 0;
  if (max <= 4) return Math.min(4, count);
  const q = count / max;
  return q > 0.75 ? 4 : q > 0.5 ? 3 : q > 0.25 ? 2 : 1;
}

/**
 * GitHub-style contribution graph. One cell per day, Sunday-first columns,
 * shaded by test runs (attempts) plus completed stages.
 */
export function Heatmap({ days, weeks = 53, compact = false }: { days: Days; weeks?: number; compact?: boolean }) {
  const [hover, setHover] = useState<{ day: string; x: number; y: number } | null>(null);
  const { columns, months, max, total } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay() - (weeks - 1) * 7);
    const columns: { day: string; date: Date; count: number; future: boolean }[][] = [];
    const months: { col: number; label: string }[] = [];
    let max = 0;
    let total = 0;
    for (let w = 0; w < weeks; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const key = localDay(date);
        const stat = days[key];
        const count = stat ? stat.attempts + stat.completions : 0;
        const future = date > today;
        if (!future) {
          max = Math.max(max, count);
          total += stat?.attempts ?? 0;
        }
        col.push({ day: key, date, count, future });
      }
      const month = col[0].date.getMonth();
      if (w === 0 || month !== columns[w - 1][0].date.getMonth()) months.push({ col: w, label: MONTHS[month] });
      columns.push(col);
    }
    // Like GitHub: drop a leading partial month whose label would collide with the next one.
    if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();
    return { columns, months, max, total };
  }, [days, weeks]);

  const cell = compact ? 11 : 11;
  const gap = 3;
  const hovered = hover ? days[hover.day] : null;

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          <div className={cx("relative h-4 text-[11px] text-ink-3", compact ? "ml-0" : "ml-8")} style={{ width: weeks * (cell + gap) }}>
            {months.map((m) => (
              <span key={`${m.col}-${m.label}`} className="absolute" style={{ left: m.col * (cell + gap) }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex">
            {!compact && (
              <div className="mr-2 grid w-6 text-[11px] text-ink-3" style={{ gridTemplateRows: `repeat(7, ${cell}px)`, rowGap: gap }}>
                <span />
                <span className="leading-[11px]">Mon</span>
                <span />
                <span className="leading-[11px]">Wed</span>
                <span />
                <span className="leading-[11px]">Fri</span>
                <span />
              </div>
            )}
            <div className="flex" style={{ gap }} onMouseLeave={() => setHover(null)}>
              {columns.map((col, w) => (
                <div key={w} className="flex flex-col" style={{ gap }}>
                  {col.map((c) => (
                    <span
                      key={c.day}
                      className={cx("rounded-[2px] outline-1 -outline-offset-1 outline-black/5 dark:outline-white/5", c.future ? "opacity-0" : LEVEL[level(c.count, max)])}
                      style={{ width: cell, height: cell }}
                      onMouseEnter={(e) => {
                        if (c.future) return;
                        const box = (e.currentTarget.offsetParent as HTMLElement | null)?.getBoundingClientRect();
                        const r = e.currentTarget.getBoundingClientRect();
                        setHover({ day: c.day, x: r.left - (box?.left ?? 0) + cell / 2, y: r.top - (box?.top ?? 0) });
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className={cx("mt-2 flex items-center justify-between gap-4 text-[12px] text-ink-3", compact && "text-[11px]")}>
        <span>{plural(total, "attempt")} {compact ? "lately" : "in the last year"}</span>
        <span className="flex items-center gap-1">
          Less
          {LEVEL.map((l) => (
            <span key={l} className={cx(l, "inline-block rounded-[2px]")} style={{ width: cell - 1, height: cell - 1 }} />
          ))}
          More
        </span>
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-[12px] text-gray-100 shadow-lg dark:bg-gray-700"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          {hovered ? `${plural(hovered.attempts, "attempt")}${hovered.completions ? `, ${plural(hovered.completions, "stage")} completed` : ""}` : "No attempts"} on{" "}
          {shortDate(`${hover.day}T12:00:00`)}
        </div>
      )}
    </div>
  );
}
