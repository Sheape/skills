import { useId, useState } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, LinkIcon, UnlinkIcon } from "lucide-react";

import { ActivityFrame, useGradedActivity } from "@/app/components/activity-runtime";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface ChoiceOption {
  id: string;
  label: string;
  feedback?: string;
}

function sameValues(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

export function ChoiceActivity({
  id,
  title,
  prompt,
  options,
  correctIds,
  hint,
  explanation,
  multiple = false,
  required = true,
}: {
  id: string;
  title: string;
  prompt: string;
  options: readonly ChoiceOption[];
  correctIds: readonly string[];
  hint: string;
  explanation: string;
  multiple?: boolean;
  required?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const state = useGradedActivity(id, required);
  const evaluate = () => {
    const correct = sameValues(selected, correctIds);
    const chosenWrong = options.find(
      (option) => selected.includes(option.id) && !correctIds.includes(option.id),
    );
    state.submit({
      correct,
      feedback: correct
        ? "That is the intended relationship."
        : (chosenWrong?.feedback ?? "That choice misses a relationship shown in the lesson."),
    });
  };

  return (
    <ActivityFrame
      title={title}
      prompt={prompt}
      hint={hint}
      explanation={explanation}
      state={state}
      checkDisabled={!selected.length}
      onCheck={evaluate}
    >
      {multiple ? (
        <ToggleGroup
          type="multiple"
          value={selected}
          onValueChange={setSelected}
          aria-label={prompt}
          className="choice-grid"
        >
          {options.map((option) => (
            <ToggleGroupItem key={option.id} value={option.id} aria-label={option.label}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <ToggleGroup
          type="single"
          value={selected[0] ?? ""}
          onValueChange={(value) => setSelected(value ? [value] : [])}
          aria-label={prompt}
          className="choice-grid"
        >
          {options.map((option) => (
            <ToggleGroupItem key={option.id} value={option.id} aria-label={option.label}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </ActivityFrame>
  );
}

export interface OrderItem {
  id: string;
  label: string;
}

function move<T>(items: readonly T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function SortableRow({
  item,
  index,
  count,
  onMove,
}: {
  item: OrderItem;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: item.id, index });
  return (
    <li ref={ref} className="order-row" data-dragging={isDragging || undefined}>
      <button
        ref={handleRef}
        type="button"
        className="drag-handle"
        aria-label={`Drag ${item.label}`}
      >
        <GripVerticalIcon aria-hidden="true" />
      </button>
      <span>
        <small>{index + 1}</small>
        {item.label}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
        aria-label={`Move ${item.label} up`}
      >
        <ArrowUpIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
        aria-label={`Move ${item.label} down`}
      >
        <ArrowDownIcon aria-hidden="true" />
      </Button>
    </li>
  );
}

export function OrderActivity({
  id,
  title,
  prompt,
  items: initialItems,
  correctOrder,
  hint,
  explanation,
  required = true,
}: {
  id: string;
  title: string;
  prompt: string;
  items: readonly OrderItem[];
  correctOrder: readonly string[];
  hint: string;
  explanation: string;
  required?: boolean;
}) {
  const [items, setItems] = useState([...initialItems]);
  const state = useGradedActivity(id, required);
  const reorder = (from: number, to: number) => setItems((current) => move(current, from, to));

  return (
    <ActivityFrame
      title={title}
      prompt={prompt}
      hint={hint}
      explanation={explanation}
      state={state}
      onCheck={() => {
        const correct =
          sameValues(
            items.map((item) => item.id),
            correctOrder,
          ) && items.every((item, index) => item.id === correctOrder[index]);
        state.submit({
          correct,
          feedback: correct
            ? "The sequence now follows the mechanism."
            : "One transition still occurs out of order.",
        });
      }}
    >
      <DragDropProvider
        onDragEnd={(event) => {
          if (event.canceled || !isSortableOperation(event.operation) || !event.operation.source)
            return;
          reorder(
            event.operation.source.initialIndex,
            event.operation.target?.index ?? event.operation.source.initialIndex,
          );
        }}
      >
        <ol className="order-list" aria-label={prompt}>
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              index={index}
              count={items.length}
              onMove={reorder}
            />
          ))}
        </ol>
      </DragDropProvider>
    </ActivityFrame>
  );
}

export interface MatchItem {
  id: string;
  label: string;
}

export function MatchActivity({
  id,
  title,
  prompt,
  left,
  right,
  correctPairs,
  hint,
  explanation,
  required = true,
}: {
  id: string;
  title: string;
  prompt: string;
  left: readonly MatchItem[];
  right: readonly MatchItem[];
  correctPairs: Readonly<Record<string, string>>;
  hint: string;
  explanation: string;
  required?: boolean;
}) {
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const state = useGradedActivity(id, required);

  const connect = () => {
    if (!leftId || !rightId) return;
    setPairs((current) => ({ ...current, [leftId]: rightId }));
    setLeftId(null);
    setRightId(null);
  };

  return (
    <ActivityFrame
      title={title}
      prompt={prompt}
      hint={hint}
      explanation={explanation}
      state={state}
      checkDisabled={Object.keys(pairs).length !== left.length}
      onCheck={() => {
        const mismatch = left.find((item) => pairs[item.id] !== correctPairs[item.id]);
        state.submit({
          correct: !mismatch,
          feedback: mismatch
            ? `${mismatch.label} is connected to the wrong match.`
            : "Every pair expresses the intended relationship.",
        });
      }}
    >
      <div className="match-grid">
        <div role="group" aria-label="Items to match">
          {left.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={leftId === item.id ? "default" : "outline"}
              onClick={() => setLeftId(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="match-links" aria-live="polite">
          {left.map((item) => (
            <span key={item.id}>
              {pairs[item.id] ? <LinkIcon aria-hidden="true" /> : <UnlinkIcon aria-hidden="true" />}
              {pairs[item.id]
                ? right.find((candidate) => candidate.id === pairs[item.id])?.label
                : "Not connected"}
            </span>
          ))}
        </div>
        <div role="group" aria-label="Available matches">
          {right.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={rightId === item.id ? "default" : "outline"}
              onClick={() => setRightId(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      <Button type="button" variant="secondary" disabled={!leftId || !rightId} onClick={connect}>
        <LinkIcon data-icon="inline-start" aria-hidden="true" />
        Connect selected
      </Button>
    </ActivityFrame>
  );
}

export function SliderActivity({
  id,
  title,
  prompt,
  min,
  max,
  step,
  initialValue,
  target,
  tolerance = 0,
  hint,
  explanation,
  required = true,
}: {
  id: string;
  title: string;
  prompt: string;
  min: number;
  max: number;
  step: number;
  initialValue: number;
  target: number;
  tolerance?: number;
  hint: string;
  explanation: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const state = useGradedActivity(id, required);
  return (
    <ActivityFrame
      title={title}
      prompt={prompt}
      hint={hint}
      explanation={explanation}
      state={state}
      onCheck={() => {
        const correct = Math.abs(value - target) <= tolerance;
        state.submit({
          correct,
          feedback: correct ? `The target is ${value}.` : `${value} is outside the target range.`,
        });
      }}
    >
      <div className="slider-activity">
        <output aria-live="polite">{value}</output>
        <Slider
          aria-label={prompt}
          min={min}
          max={max}
          step={step}
          value={[value]}
          onValueChange={(next) => setValue(next[0])}
        />
      </div>
    </ActivityFrame>
  );
}

export interface TraceCheckpoint {
  id: string;
  prompt: string;
  options: readonly ChoiceOption[];
  correctId: string;
}

export function TraceActivity({
  id,
  title,
  prompt,
  checkpoints,
  hint,
  explanation,
  required = true,
}: {
  id: string;
  title: string;
  prompt: string;
  checkpoints: readonly TraceCheckpoint[];
  hint: string;
  explanation: string;
  required?: boolean;
}) {
  const labelId = useId();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const state = useGradedActivity(id, required);
  return (
    <ActivityFrame
      title={title}
      prompt={prompt}
      hint={hint}
      explanation={explanation}
      state={state}
      checkDisabled={Object.keys(answers).length !== checkpoints.length}
      onCheck={() => {
        const mismatch = checkpoints.find(
          (checkpoint) => answers[checkpoint.id] !== checkpoint.correctId,
        );
        const selected = mismatch?.options.find((option) => option.id === answers[mismatch.id]);
        state.submit({
          correct: !mismatch,
          feedback: mismatch
            ? (selected?.feedback ?? `Recheck the state after “${mismatch.prompt}”.`)
            : "Every predicted state matches the authored trace.",
        });
      }}
    >
      <ol className="trace-checkpoints" aria-labelledby={labelId}>
        <span id={labelId} className="sr-only">
          {prompt}
        </span>
        {checkpoints.map((checkpoint) => (
          <li key={checkpoint.id}>
            <label htmlFor={`${labelId}-${checkpoint.id}`}>{checkpoint.prompt}</label>
            <select
              id={`${labelId}-${checkpoint.id}`}
              value={answers[checkpoint.id] ?? ""}
              onChange={(event) =>
                setAnswers((current) => ({ ...current, [checkpoint.id]: event.target.value }))
              }
            >
              <option value="" disabled>
                Choose a state
              </option>
              {checkpoint.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ol>
    </ActivityFrame>
  );
}
