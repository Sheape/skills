import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2Icon, LightbulbIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getSolvedActivities,
  resetLessonState,
  setActivitySolved,
  useLessonStateVersion,
} from "@/app/progress";

interface LessonRuntimeValue {
  href: string;
  requiredIds: ReadonlySet<string>;
  solvedIds: ReadonlySet<string>;
  ready: boolean;
  revision: number;
  register: (id: string, required: boolean) => () => void;
  setSolved: (id: string, solved: boolean) => void;
  resetLesson: () => void;
}

const LessonRuntimeContext = createContext<LessonRuntimeValue | null>(null);

export function LessonRuntimeProvider({ href, children }: { href: string; children: ReactNode }) {
  const [requiredIds, setRequiredIds] = useState<ReadonlySet<string>>(new Set());
  const revision = useLessonStateVersion(href);
  const solvedIds = useMemo(() => new Set(getSolvedActivities(href)), [href, revision]);

  const register = useCallback((id: string, required: boolean) => {
    if (!required) return () => undefined;
    setRequiredIds((current) => new Set(current).add(id));
    return () =>
      setRequiredIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
  }, []);

  const value = useMemo<LessonRuntimeValue>(
    () => ({
      href,
      requiredIds,
      solvedIds,
      ready: requiredIds.size > 0 && [...requiredIds].every((id) => solvedIds.has(id)),
      revision,
      register,
      setSolved: (id, solved) => setActivitySolved(href, id, solved),
      resetLesson: () => resetLessonState(href),
    }),
    [href, register, requiredIds, revision, solvedIds],
  );

  return <LessonRuntimeContext value={value}>{children}</LessonRuntimeContext>;
}

export function useLessonRuntime() {
  const value = useContext(LessonRuntimeContext);
  if (!value) throw new Error("Lesson activities require LessonRuntimeProvider");
  return value;
}

export function useOptionalLessonRuntime() {
  return useContext(LessonRuntimeContext);
}

export interface ActivityEvaluation {
  correct: boolean;
  feedback: string;
}

export interface ActivityState {
  attempts: number;
  feedback: string | null;
  solved: boolean;
  showHint: boolean;
  showExplanation: boolean;
  submit: (evaluation: ActivityEvaluation) => void;
  reset: () => void;
}

export function useGradedActivity(id: string, required = true): ActivityState {
  const runtime = useLessonRuntime();
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const solved = runtime.solvedIds.has(id);

  useEffect(() => runtime.register(id, required), [id, required, runtime.register]);

  useEffect(() => {
    if (!runtime.solvedIds.has(id)) {
      setAttempts(0);
      setFeedback(null);
    }
  }, [id, runtime.revision, runtime.solvedIds]);

  const submit = (evaluation: ActivityEvaluation) => {
    setFeedback(evaluation.feedback);
    if (evaluation.correct) {
      runtime.setSolved(id, true);
      return;
    }
    setAttempts((value) => value + 1);
  };

  return {
    attempts,
    feedback,
    solved,
    showHint: !solved && attempts >= 1,
    showExplanation: !solved && attempts >= 2,
    submit,
    reset: () => {
      setAttempts(0);
      setFeedback(null);
      runtime.setSolved(id, false);
    },
  };
}

export function ActivityFrame({
  title,
  prompt,
  hint,
  explanation,
  state,
  checkDisabled,
  onCheck,
  children,
}: {
  title: string;
  prompt: string;
  hint: string;
  explanation: string;
  state: ActivityState;
  checkDisabled?: boolean;
  onCheck: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="activity-card" data-solved={state.solved || undefined}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{prompt}</CardDescription>
      </CardHeader>
      <CardContent className="activity-body">
        {children}
        {state.feedback && (
          <p className="activity-feedback" data-correct={state.solved || undefined} role="status">
            {state.solved && <CheckCircle2Icon aria-hidden="true" />}
            {state.feedback}
          </p>
        )}
        {state.showHint && (
          <p className="activity-help">
            <LightbulbIcon aria-hidden="true" />
            <span>
              <strong>Hint</strong>
              {hint}
            </span>
          </p>
        )}
        {state.showExplanation && (
          <p className="activity-explanation">
            <strong>Explanation</strong>
            {explanation}
          </p>
        )}
      </CardContent>
      <CardFooter className="activity-actions">
        <Button type="button" variant="ghost" onClick={state.reset}>
          <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
          Reset
        </Button>
        <Button type="button" onClick={onCheck} disabled={checkDisabled || state.solved}>
          {state.solved ? "Solved" : "Check"}
        </Button>
      </CardFooter>
    </Card>
  );
}
