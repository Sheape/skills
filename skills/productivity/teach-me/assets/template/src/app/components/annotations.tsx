import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CircleAlertIcon,
  InfoIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { LessonSource } from "@/app/types";
import { Citation } from "@/app/components/sources";

export type AnnotationKind = "do" | "dont" | "warning" | "note";
export type AnnotationScope = "region" | "detail";

export interface AnnotationDefinition {
  id: string;
  kind: AnnotationKind;
  label: string;
  reason: string;
  consequence?: string;
  alternative?: string;
  source?: LessonSource;
}

interface LessonChromeValue {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  registerAnnotation: (definition: AnnotationDefinition) => () => void;
  pinAnnotation: (id: string, target: HTMLElement) => void;
  closeAnnotation: () => void;
}

const LessonChromeContext = createContext<LessonChromeValue | null>(null);
const drawerKey = "teach-me:v2:drawer-open";

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

export function LessonChromeProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpenState] = useState(
    () => localStorage.getItem(drawerKey) === "true",
  );
  const [definitions, setDefinitions] = useState<ReadonlyMap<string, AnnotationDefinition>>(
    new Map(),
  );
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const firstRoute = useRef(true);

  const closeAnnotation = useCallback(() => {
    setPinnedId(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const setDrawerOpen = useCallback((open: boolean) => {
    setDrawerOpenState(open);
    localStorage.setItem(drawerKey, String(open));
    if (open) setPinnedId(null);
  }, []);

  const registerAnnotation = useCallback((definition: AnnotationDefinition) => {
    setDefinitions((current) => new Map(current).set(definition.id, definition));
    return () =>
      setDefinitions((current) => {
        const next = new Map(current);
        next.delete(definition.id);
        return next;
      });
  }, []);

  const pinAnnotation = useCallback((id: string, target: HTMLElement) => {
    triggerRef.current = target;
    setDrawerOpenState(false);
    localStorage.setItem(drawerKey, "false");
    setPinnedId(id);
  }, []);

  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    setPinnedId(null);
    setDrawerOpen(false);
  }, [location.pathname, setDrawerOpen]);

  const value = useMemo<LessonChromeValue>(
    () => ({
      drawerOpen,
      setDrawerOpen,
      registerAnnotation,
      pinAnnotation,
      closeAnnotation,
    }),
    [closeAnnotation, drawerOpen, pinAnnotation, registerAnnotation, setDrawerOpen],
  );

  return (
    <LessonChromeContext value={value}>
      {children}
      <AnnotationInspector
        definitions={[...definitions.values()]}
        pinnedId={pinnedId}
        onPin={setPinnedId}
        onClose={closeAnnotation}
      />
    </LessonChromeContext>
  );
}

export function useLessonChrome() {
  const value = useContext(LessonChromeContext);
  if (!value) throw new Error("Lesson chrome requires LessonChromeProvider");
  return value;
}

export function useOptionalLessonChrome() {
  return useContext(LessonChromeContext);
}

export function useCloseAnnotationsOnChange(dependencies: DependencyList) {
  const { closeAnnotation } = useLessonChrome();
  useEffect(closeAnnotation, [closeAnnotation, ...dependencies]);
}

const annotationIcons = {
  do: CheckIcon,
  dont: XIcon,
  warning: TriangleAlertIcon,
  note: InfoIcon,
};

export function AnnotationTarget({
  annotation,
  scope = "detail",
  children,
}: {
  annotation: AnnotationDefinition;
  scope?: AnnotationScope;
  children: ReactNode;
}) {
  const { registerAnnotation, pinAnnotation } = useLessonChrome();
  const [preview, setPreview] = useState(false);
  const targetRef = useRef<HTMLButtonElement>(null);
  const popupId = useId();
  const Icon = annotationIcons[annotation.kind];

  useEffect(
    () => registerAnnotation(annotation),
    [
      annotation.id,
      annotation.kind,
      annotation.label,
      annotation.reason,
      annotation.consequence,
      annotation.alternative,
      annotation.source?.id,
      annotation.source?.title,
      annotation.source?.url,
      annotation.source?.capturedAt,
      annotation.source?.excerpt,
      annotation.source?.locator,
      annotation.source?.revision,
      registerAnnotation,
    ],
  );

  return (
    <span className="annotation-wrap">
      <button
        ref={targetRef}
        type="button"
        className="annotation-target"
        data-kind={annotation.kind}
        data-scope={scope}
        aria-describedby={preview ? popupId : undefined}
        onMouseEnter={() => setPreview(true)}
        onMouseLeave={() => setPreview(false)}
        onFocus={() => setPreview(true)}
        onBlur={() => setPreview(false)}
        onClick={() => targetRef.current && pinAnnotation(annotation.id, targetRef.current)}
      >
        {children}
        <Badge variant="outline" className="annotation-label">
          <Icon aria-hidden="true" />
          {annotation.label}
        </Badge>
      </button>
      {preview && (
        <span id={popupId} role="note" className="annotation-preview">
          <strong>{annotation.label}</strong>
          {annotation.reason}
        </span>
      )}
    </span>
  );
}

function AnnotationInspector({
  definitions,
  pinnedId,
  onPin,
  onClose,
}: {
  definitions: readonly AnnotationDefinition[];
  pinnedId: string | null;
  onPin: (id: string | null) => void;
  onClose: () => void;
}) {
  const narrow = useNarrow();
  const index = definitions.findIndex((definition) => definition.id === pinnedId);
  const current = index >= 0 ? definitions[index] : null;
  if (!current && !pinnedId) return null;
  const Icon = current ? annotationIcons[current.kind] : CircleAlertIcon;

  return (
    <Sheet open={Boolean(current)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={narrow ? "bottom" : "right"} className="annotation-inspector">
        {current && (
          <>
            <SheetHeader>
              <Badge variant="outline" className="annotation-inspector-kind">
                <Icon aria-hidden="true" />
                {current.kind === "dont" ? "Don't" : current.kind}
              </Badge>
              <SheetTitle tabIndex={-1}>{current.label}</SheetTitle>
              <SheetDescription>{current.reason}</SheetDescription>
            </SheetHeader>
            <div className="annotation-inspector-body">
              {current.consequence && (
                <section>
                  <h3>What happens</h3>
                  <p>{current.consequence}</p>
                </section>
              )}
              {current.alternative && (
                <section>
                  <h3>Preferred alternative</h3>
                  <p>{current.alternative}</p>
                </section>
              )}
              {current.source && (
                <p>
                  Source <Citation source={current.source} label="1" />
                </p>
              )}
            </div>
            <div className="annotation-inspector-nav">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index <= 0}
                onClick={() => onPin(definitions[index - 1]?.id ?? null)}
              >
                <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
                Previous
              </Button>
              <span>
                {index + 1} / {definitions.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index >= definitions.length - 1}
                onClick={() => onPin(definitions[index + 1]?.id ?? null)}
              >
                Next
                <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
