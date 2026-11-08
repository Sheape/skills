import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, Copy, Monitor, Moon, Sun, X } from "lucide-react";
import type { Difficulty, StageStatus } from "@/lib/api";
import { difficultyBars, difficultyLabel } from "@/lib/format";
import { useTheme, type ThemePref } from "@/lib/theme";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const MASK =
  "M32 24.2C36.5 20.4 43 18.4 49 18.6 53 18.8 56 17.4 58.6 14.6 59.8 23.4 58 32.8 53 38.5 48.5 43.5 41.5 44 38 41.5 35.5 39.8 33.8 37.2 32 36 30.2 37.2 28.5 39.8 26 41.5 22.5 44 15.5 43.5 11 38.5 6 32.8 4.2 23.4 5.4 14.6 8 17.4 11 18.8 15 18.6 21 18.4 27.5 20.4 32 24.2Z";

/** The CodeLarpers mark: a masquerade mask whose eyes read `</>`. You put on the author's mask and play their part. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}bg`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="0.55" stopColor="#0d9488" />
          <stop offset="1" stopColor="#115e59" />
        </linearGradient>
        <linearGradient id={`${id}face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ccfbf1" />
        </linearGradient>
        <mask id={`${id}cut`}>
          <rect width="64" height="64" fill="#fff" />
          <path d="M23 25.5 17.5 31l5.5 5.5M41 25.5l5.5 5.5-5.5 5.5" fill="none" stroke="#000" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M33.2 27.4 30.8 33.8" stroke="#000" strokeWidth="2.9" strokeLinecap="round" />
        </mask>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id}bg)`} />
      <rect x="1" y="1" width="62" height="62" rx="14" fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="2" />
      <g transform="translate(32 33) scale(.88) translate(-32 -30)">
        <path d={MASK} fill="#042f2e" fillOpacity=".3" transform="translate(0 2.4)" />
        <path d={MASK} fill={`url(#${id}face)`} mask={`url(#${id}cut)`} />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className="size-8" />
      <span className="text-[20px] font-bold tracking-[-0.02em] text-ink">
        Code<span className="text-accent-ink">Larpers</span>
      </span>
    </span>
  );
}

/** Two letters for the fallback tile: initials of a multi-word subject ("rustc lexer" → "RL"), else "Re" for "Redis". */
function initialsFor(name: string) {
  const subject = name.replace(/^build your own\s+/i, "").replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const words = subject.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] || "?";
  return w[0].toUpperCase() + (w[1] ?? "").toLowerCase();
}

/**
 * A course's logo: the studied project's or technology's own logo when the course has one
 * (optionally on a solid tile for dark or monochrome logos), else a letter tile.
 */
export function CourseIcon({
  icon,
  background,
  name,
  slug,
  className = "size-8",
}: {
  icon: string | null;
  background?: string | null;
  name: string;
  slug: string;
  className?: string;
}) {
  if (icon && background)
    return (
      <span className={cx(className, "inline-grid shrink-0 place-items-center overflow-hidden rounded-[22%] ring-1 ring-black/5")} style={{ background }}>
        <img src={icon} alt="" className="size-[72%] object-contain" />
      </span>
    );
  if (icon) return <img src={icon} alt="" className={cx(className, "shrink-0 rounded-[18%] object-contain")} />;
  const hue = [...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
  return (
    <span
      className={cx(className, "inline-grid shrink-0 place-items-center rounded-[22%] font-bold tracking-tight text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]")}
      style={{ background: `linear-gradient(140deg, hsl(${hue} 70% 52%), hsl(${(hue + 25) % 360} 65% 32%))`, containerType: "inline-size" }}
    >
      <span className="text-[42cqw] leading-none">{initialsFor(name)}</span>
    </span>
  );
}

export function ProgressRing({ value, total, size = 18 }: { value: number; total: number; size?: number }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const frac = total ? Math.min(1, value / total) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth="2.5" className="fill-none stroke-line" />
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} className="fill-none stroke-accent" />
    </svg>
  );
}

export function DifficultyLabel({ difficulty, size = "sm" }: { difficulty: Difficulty; size?: "sm" | "xs" }) {
  const bars = difficultyBars[difficulty];
  const hard = difficulty === "hard";
  return (
    <span className={cx("inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide", size === "sm" ? "text-[13px]" : "text-[11px]", hard ? "text-amber-500" : "text-accent-ink")}>
      {difficultyLabel[difficulty]}
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cx("w-[3px] rounded-[1px]", i === 0 ? "h-[7px]" : i === 1 ? "h-[10px]" : "h-[13px]", i < bars ? (hard ? "bg-amber-500" : "bg-accent") : "bg-line")} />
        ))}
      </span>
    </span>
  );
}

export function StatusPill({ status }: { status: StageStatus | "intro" }) {
  if (status === "completed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-good/25 bg-good-soft px-2 py-0.5 text-[13px] font-semibold text-good">
        <Check className="size-3.5" strokeWidth={3} /> Completed
      </span>
    );
  if (status === "current")
    return <span className="rounded-full border border-warn/25 bg-warn-soft px-2 py-0.5 text-[13px] font-semibold text-warn">In-progress</span>;
  if (status === "disabled") return <span className="rounded-full border border-line px-2 py-0.5 text-[13px] font-semibold text-ink-4">Disabled</span>;
  return <span className="rounded-full border border-line px-2 py-0.5 text-[13px] font-semibold text-ink-3">Pending</span>;
}

export function Modal({ open, onClose, children, wide = false }: { open: boolean; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center bg-canvas/40 px-4 pt-8 backdrop-blur-[5px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        className={cx("relative w-full rounded-md border border-line bg-panel p-8 shadow-2xl", wide ? "max-w-xl" : "max-w-[320px]")}
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button onClick={onClose} className="absolute right-4 top-4 rounded p-1 text-ink-3 hover:bg-hover hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function PrimaryButton({ children, onClick, className, big = false }: { children: ReactNode; onClick?: () => void; className?: string; big?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded border border-accent-line bg-button font-bold text-white transition-colors hover:bg-button-hover",
        big ? "px-4 py-3 text-xl" : "px-5 py-2.5 text-[17px]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="inline-flex items-center gap-1 rounded border border-line bg-panel px-1.5 py-0.5 text-[13px] font-semibold text-ink-2 hover:bg-hover"
    >
      {copied ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5" />}
      {copied ? "copied" : "copy"}
    </button>
  );
}

/** A command box: tab labels on the left, copy on the right, shell lines below. */
export function CommandBox({ variants, icon }: { variants: { label: string; lines: string[] }[]; icon?: ReactNode }) {
  const [active, setActive] = useState(0);
  const current = variants[Math.min(active, variants.length - 1)];
  const copyText = current.lines.map((l) => l.split(" # ")[0]).join("\n");
  return (
    <div className="overflow-hidden rounded-md border border-line bg-raised">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <div className="flex items-center gap-1">
          {icon}
          {variants.map((v, i) => (
            <button
              key={v.label}
              onClick={() => setActive(i)}
              className={cx(
                "rounded px-1.5 py-0.5 text-[13px] font-medium",
                variants.length === 1 ? "text-ink-3" : i === active ? "bg-button text-white" : "bg-hover text-ink-3 hover:text-ink",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <CopyButton text={copyText} />
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-6 text-ink-2">
        {current.lines.map((l, i) => (
          <div key={i}>
            <ShellLine text={l} />
          </div>
        ))}
      </pre>
    </div>
  );
}

export function ShellLine({ text }: { text: string }) {
  const [cmd, ...rest] = text.split(" ");
  const comment = rest.join(" ").split(" # ");
  return (
    <>
      <span className="cmd-name text-amber-500">{cmd}</span> <span className="text-ink">{comment[0]}</span>
      {comment[1] && <span className="text-ink-4"> # {comment[1]}</span>}
    </>
  );
}

export function ThemeToggle() {
  const [pref, setPref] = useTheme();
  const options: { id: ThemePref; icon: ReactNode; label: string }[] = [
    { id: "system", icon: <Monitor className="size-3.5" />, label: "System theme" },
    { id: "light", icon: <Sun className="size-3.5" />, label: "Light theme" },
    { id: "dark", icon: <Moon className="size-3.5" />, label: "Dark theme" },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-line bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setPref(o.id)}
          aria-label={o.label}
          title={o.label}
          className={cx("grid size-7 place-items-center rounded-full", pref === o.id ? "bg-hover text-ink" : "text-ink-4 hover:text-ink-2")}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

export function Loading() {
  return <div className="p-10 text-ink-3">Loading…</div>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl p-10">
      <div className="rounded-md border border-bad/40 bg-panel p-6 text-ink-2">
        <p className="font-semibold text-bad">Something went wrong</p>
        <p className="mt-2 text-sm">{message}</p>
      </div>
    </div>
  );
}

export function SectionLabel({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-accent-ink">
      {children}
      {count !== undefined && <span className="rounded border border-accent-line bg-accent-soft px-1.5 text-xs">{count}</span>}
    </div>
  );
}
