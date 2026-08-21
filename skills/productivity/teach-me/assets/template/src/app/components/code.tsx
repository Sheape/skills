import { useEffect, useMemo, useState } from "react";
import CodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import {
  ArrowDownToLineIcon,
  ArrowRightIcon,
  ArrowUpFromLineIcon,
  CopyIcon,
  PlayIcon,
  RotateCcwIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createHighlighter, type BundledLanguage, type Highlighter, type ThemedToken } from "shiki";

import {
  AnnotationTarget,
  useCloseAnnotationsOnChange,
  type AnnotationDefinition,
} from "@/app/components/annotations";
import { FidelityBadge } from "@/app/components/sources";
import { useLessonRuntime } from "@/app/components/activity-runtime";
import { useLessonStoredState } from "@/app/progress";
import { useTheme } from "@/app/theme";
import type { Fidelity } from "@/app/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const sharedLanguages: BundledLanguage[] = [
  "bash",
  "javascript",
  "json",
  "python",
  "rust",
  "tsx",
  "typescript",
];
let highlighterPromise: Promise<Highlighter> | null = null;
const tokenCache = new Map<string, ThemedToken[][]>();

function getHighlighter() {
  highlighterPromise ??= createHighlighter({
    themes: ["github-light", "vesper"],
    langs: sharedLanguages,
  });
  return highlighterPromise;
}

export interface CodeLineAnnotation {
  line: number;
  annotation: AnnotationDefinition;
}

export function CodeBlock({
  code,
  language,
  activeLine,
  annotations = [],
  label = "Source code",
}: {
  code: string;
  language: BundledLanguage;
  activeLine?: number;
  annotations?: readonly CodeLineAnnotation[];
  label?: string;
}) {
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  const { theme: appTheme } = useTheme();
  const theme = appTheme === "dark" ? "vesper" : "github-light";
  const cacheKey = `${theme}\0${language}\0${code}`;

  useEffect(() => {
    let live = true;
    const cached = tokenCache.get(cacheKey);
    if (cached) {
      setTokens(cached);
      return;
    }
    void getHighlighter().then((highlighter) => {
      const result = highlighter.codeToTokens(code, { lang: language, theme }).tokens;
      tokenCache.set(cacheKey, result);
      if (live) setTokens(result);
    });
    return () => {
      live = false;
    };
  }, [cacheKey, code, language, theme]);

  const plainLines = useMemo(() => code.split("\n"), [code]);
  const lines = tokens ?? plainLines.map((line) => [{ content: line } as ThemedToken]);

  return (
    <pre className="code-block" aria-label={label} data-highlighted={Boolean(tokens) || undefined}>
      <code>
        {lines.map((lineTokens, index) => {
          const lineNumber = index + 1;
          const annotation = annotations.find((item) => item.line === lineNumber)?.annotation;
          const content = (
            <span className="code-line-content">
              {lineTokens.map((token, tokenIndex) => (
                <span key={tokenIndex} style={token.color ? { color: token.color } : undefined}>
                  {token.content || " "}
                </span>
              ))}
            </span>
          );
          return (
            <span
              key={lineNumber}
              className="code-line"
              data-active={lineNumber === activeLine || undefined}
            >
              <span className="code-gutter" aria-hidden="true">
                {lineNumber}
              </span>
              {annotation ? (
                <AnnotationTarget annotation={annotation} scope="region">
                  {content}
                </AnnotationTarget>
              ) : (
                content
              )}
              {lineNumber === activeLine && <Badge className="active-line-badge">ACTIVE</Badge>}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

export interface DebugVariable {
  name: string;
  value: string;
  previousValue?: string;
  status?: "stable" | "changed" | "created" | "removed";
}

export interface DebugStackFrame {
  functionName: string;
  active?: boolean;
}

export interface DebugFrame {
  id: string;
  line: number;
  phase: "before" | "after";
  event: "line" | "call" | "enter" | "return" | "output";
  callDepth: number;
  heading: string;
  explanation: string;
  fidelity: Fidelity;
  variables?: readonly DebugVariable[];
  callStack?: readonly DebugStackFrame[];
  consoleOutput?: readonly string[];
}

export interface DebugCase {
  id: string;
  label: string;
  description: string;
  frames: readonly DebugFrame[];
}

function nextAtOrBelow(frames: readonly DebugFrame[], index: number, depth: number) {
  const found = frames.findIndex(
    (frame, candidate) => candidate > index && frame.callDepth <= depth,
  );
  return found < 0 ? frames.length - 1 : found;
}

function nextBelow(frames: readonly DebugFrame[], index: number, depth: number) {
  const found = frames.findIndex(
    (frame, candidate) => candidate > index && frame.callDepth < depth,
  );
  return found < 0 ? frames.length - 1 : found;
}

export function CodeWalkthrough({
  id,
  code,
  language,
  cases,
}: {
  id: string;
  code: string;
  language: BundledLanguage;
  cases: readonly DebugCase[];
}) {
  if (!cases.length || cases.some((item) => !item.frames.length)) {
    throw new Error("CodeWalkthrough requires at least one case with frames");
  }
  const runtime = useLessonRuntime();
  const initial = useMemo(() => ({ caseId: cases[0].id, frame: 0 }), [cases]);
  const [position, setPosition] = useLessonStoredState(runtime.href, `debugger:${id}`, initial);
  const activeCase = cases.find((item) => item.id === position.caseId) ?? cases[0];
  const index = Math.min(position.frame, activeCase.frames.length - 1);
  const frame = activeCase.frames[index];
  const reducedMotion = useReducedMotion();
  useCloseAnnotationsOnChange([position.caseId, index]);

  const goTo = (next: number) =>
    setPosition({
      caseId: activeCase.id,
      frame: Math.max(0, Math.min(next, activeCase.frames.length - 1)),
    });

  return (
    <section className="debugger" aria-label="Authored code walkthrough">
      <header className="debugger-toolbar">
        <div>
          <label htmlFor={`${id}-case`}>Case</label>
          <Select
            value={activeCase.id}
            onValueChange={(caseId) => setPosition({ caseId, frame: 0 })}
          >
            <SelectTrigger id={`${id}-case`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {cases.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <small>{activeCase.description}</small>
        </div>
        <span>
          {index + 1} / {activeCase.frames.length}
        </span>
      </header>
      <div className="debugger-grid">
        <CodeBlock code={code} language={language} activeLine={frame.line} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.aside
            key={frame.id}
            className="debug-state"
            initial={{ opacity: reducedMotion ? 1 : 0, x: reducedMotion ? 0 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: reducedMotion ? 1 : 0, x: reducedMotion ? 0 : -16 }}
            transition={{ duration: reducedMotion ? 0 : 0.24 }}
          >
            <div className="debug-heading">
              <div>
                <Badge variant="outline">{frame.phase}</Badge>
                <FidelityBadge fidelity={frame.fidelity} />
              </div>
              <h2>{frame.heading}</h2>
              <p>{frame.explanation}</p>
            </div>
            {frame.callStack?.length ? (
              <section className="debug-panel">
                <h3>Call stack</h3>
                <div className="call-stack">
                  {frame.callStack.map((item, stackIndex) => (
                    <motion.div
                      layoutId={`${id}-stack-${item.functionName}-${stackIndex}`}
                      key={`${item.functionName}-${stackIndex}`}
                      data-active={item.active || undefined}
                    >
                      {item.functionName}
                    </motion.div>
                  ))}
                </div>
              </section>
            ) : null}
            {frame.variables?.length ? (
              <section className="debug-panel">
                <h3>Program state</h3>
                <div className="variable-grid">
                  {frame.variables.map((variable) => (
                    <motion.div
                      layout
                      key={variable.name}
                      data-status={variable.status ?? "stable"}
                    >
                      <span>{variable.name}</span>
                      {variable.previousValue && variable.status === "changed" && (
                        <del>{variable.previousValue}</del>
                      )}
                      <code>{variable.value}</code>
                    </motion.div>
                  ))}
                </div>
              </section>
            ) : null}
            <section className="debug-panel console-panel">
              <h3>Console output</h3>
              <pre>{frame.consoleOutput?.join("\n") || "No output"}</pre>
            </section>
          </motion.aside>
        </AnimatePresence>
      </div>
      <footer className="debugger-controls">
        <Button type="button" variant="ghost" onClick={() => goTo(0)} disabled={index === 0}>
          <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
          Restart
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => goTo(index + 1)}
          disabled={index === activeCase.frames.length - 1}
        >
          Step in
          <ArrowDownToLineIcon data-icon="inline-end" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => goTo(nextAtOrBelow(activeCase.frames, index, frame.callDepth))}
          disabled={index === activeCase.frames.length - 1}
        >
          Step over
          <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          onClick={() => goTo(nextBelow(activeCase.frames, index, frame.callDepth))}
          disabled={index === activeCase.frames.length - 1 || frame.callDepth === 0}
        >
          Step out
          <ArrowUpFromLineIcon data-icon="inline-end" aria-hidden="true" />
        </Button>
      </footer>
    </section>
  );
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

export function CodeScratchpad({
  id,
  starter,
  expectedOutput,
  outputKind,
  fidelity = "exact",
  runCommand,
  extensions,
}: {
  id: string;
  starter: string;
  expectedOutput: string;
  outputKind: "expected" | "illustrative";
  fidelity?: Fidelity;
  runCommand?: string;
  extensions?: ReactCodeMirrorProps["extensions"];
}) {
  const runtime = useLessonRuntime();
  const [draft, setDraft] = useLessonStoredState(runtime.href, `scratchpad:${id}`, starter);
  const editorExtensions = extensions ?? [javascript({ jsx: true, typescript: true })];
  return (
    <section className="scratchpad" aria-label="Code scratchpad">
      <div className="scratchpad-editor">
        <header>
          <div>
            <strong>Scratchpad</strong>
            <span>Runs on your machine, not here.</span>
          </div>
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => void copy(draft)}>
              <CopyIcon data-icon="inline-start" aria-hidden="true" />
              Copy code
            </Button>
            {runCommand && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void copy(runCommand)}>
                <PlayIcon data-icon="inline-start" aria-hidden="true" />
                Copy run command
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(starter)}>
              <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
              Reset code
            </Button>
          </div>
        </header>
        <CodeMirror
          value={draft}
          extensions={editorExtensions}
          onChange={setDraft}
          basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
          aria-label="Editable code"
        />
      </div>
      <aside className="expected-output">
        <header>
          <strong>{outputKind === "expected" ? "Expected output" : "Illustrative output"}</strong>
          <FidelityBadge fidelity={outputKind === "expected" ? "exact" : fidelity} />
        </header>
        <pre>{expectedOutput}</pre>
      </aside>
    </section>
  );
}
