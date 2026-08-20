import { useId, useState, type FormEvent } from "react";
import { EyeIcon, LightbulbIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export function PredictionPrompt({
  prompt,
  reveal,
  placeholder = "Write what you expect to happen…",
}: {
  prompt: string;
  reveal: string;
  placeholder?: string;
}) {
  const [response, setResponse] = useState("");
  const [revealed, setRevealed] = useState(false);
  const id = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (response.trim()) setRevealed(true);
  };

  return (
    <Card className="activity-card">
      <CardHeader>
        <CardTitle>Make a prediction</CardTitle>
        <CardDescription>{prompt}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={id}>Your prediction</FieldLabel>
              <Textarea
                id={id}
                value={response}
                placeholder={placeholder}
                onChange={(event) => setResponse(event.target.value)}
              />
              <FieldDescription>Saved only in this lesson state.</FieldDescription>
            </Field>
            {revealed && <p className="activity-reveal">{reveal}</p>}
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="activity-actions">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setResponse("");
            setRevealed(false);
          }}
        >
          <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
          Reset
        </Button>
        <Button type="button" disabled={!response.trim()} onClick={() => setRevealed(true)}>
          <EyeIcon data-icon="inline-start" aria-hidden="true" />
          Reveal
        </Button>
      </CardFooter>
    </Card>
  );
}

export function ChallengeCard({
  title,
  prompt,
  hint,
  answer,
}: {
  title: string;
  prompt: string;
  hint?: string;
  answer?: string;
}) {
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  return (
    <Card className="activity-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{prompt}</CardDescription>
      </CardHeader>
      {(showHint || showAnswer) && (
        <CardContent className="challenge-reveals">
          {showHint && hint && (
            <p>
              <strong>Hint</strong>
              {hint}
            </p>
          )}
          {showAnswer && answer && (
            <p>
              <strong>Authored answer</strong>
              {answer}
            </p>
          )}
        </CardContent>
      )}
      <CardFooter className="activity-actions">
        {hint && (
          <Button type="button" variant="outline" onClick={() => setShowHint((value) => !value)}>
            <LightbulbIcon data-icon="inline-start" aria-hidden="true" />
            {showHint ? "Hide hint" : "Show hint"}
          </Button>
        )}
        {answer && (
          <Button type="button" variant="ghost" onClick={() => setShowAnswer((value) => !value)}>
            <EyeIcon data-icon="inline-start" aria-hidden="true" />
            {showAnswer ? "Hide answer" : "Reveal answer"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
