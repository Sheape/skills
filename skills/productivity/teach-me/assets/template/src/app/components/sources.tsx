import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import type { Fidelity, LessonSource } from "@/app/types";

export function FidelityBadge({ fidelity }: { fidelity: Fidelity }) {
  const variant =
    fidelity === "exact" ? "default" : fidelity === "simplified" ? "secondary" : "outline";
  return <Badge variant={variant}>{fidelity}</Badge>;
}

export function Citation({ source, label }: { source: LessonSource; label: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (pinned && !rootRef.current?.contains(event.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, pinned]);

  const onBlur = (event: FocusEvent<HTMLSpanElement>) => {
    if (!pinned && !event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
    }
  };

  return (
    <span
      className="citation"
      ref={rootRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !pinned && setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={onBlur}
    >
      <button
        type="button"
        className="citation-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setPinned((current) => !current);
          setOpen(!pinned);
        }}
      >
        {label}
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="note"
            className="citation-popover"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.16 }}
          >
            <strong>{source.title}</strong>
            {source.excerpt && <span>{source.excerpt}</span>}
            <small>
              {[source.locator, source.revision, source.capturedAt].filter(Boolean).join(" · ")}
            </small>
            <a href={source.url} target="_blank" rel="noreferrer">
              Open source <ExternalLinkIcon aria-hidden="true" />
            </a>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function SourcePanel({ sources }: { sources: readonly LessonSource[] }) {
  if (!sources.length) return null;
  return (
    <section className="source-panel" aria-labelledby="lesson-sources-heading">
      <h2 id="lesson-sources-heading">Sources</h2>
      <ol>
        {sources.map((source) => (
          <li key={source.id}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
              <ExternalLinkIcon aria-hidden="true" />
            </a>
            <span>
              {[source.locator, source.revision, `captured ${source.capturedAt}`]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
