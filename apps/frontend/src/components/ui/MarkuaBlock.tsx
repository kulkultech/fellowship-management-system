import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

/** One Markua question: "? prompt", optional choices ("a) wrong", "B) right"), optional "! answer". */
export interface MarkuaQuestion {
  prompt: string;
  choices: Array<{ text: string; correct: boolean }>;
  answer: string;
}

const CHOICE_RE = /^([A-Za-z])\)\s+(.*)$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/** Splits a Markua {quiz} or {exercise} body into its intro text and questions. */
export function parseMarkuaBlock(src: string): { intro: string; questions: MarkuaQuestion[] } {
  const intro: string[] = [];
  const questions: MarkuaQuestion[] = [];
  let q: { prompt: string[]; choices: MarkuaQuestion['choices']; answer: string[] } | null = null;
  let part: 'prompt' | 'choices' | 'answer' = 'prompt';
  let fence = '';
  const finish = () => {
    if (q) {
      questions.push({ prompt: q.prompt.join('\n').trim(), choices: q.choices, answer: q.answer.join('\n').trim() });
    }
  };

  for (const line of src.split('\n')) {
    const f = line.match(FENCE_RE);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim().replace(/[`~]/g, '') === '') fence = '';
    } else if (f) {
      fence = f[1];
    }
    const inCode = Boolean(fence) || Boolean(f);
    if (!inCode && line.startsWith('? ')) {
      finish();
      q = { prompt: [line.slice(2)], choices: [], answer: [] };
      part = 'prompt';
      continue;
    }
    if (!q) {
      intro.push(line);
      continue;
    }
    if (!inCode && line.startsWith('! ')) {
      part = 'answer';
      q.answer.push(line.slice(2));
      continue;
    }
    const choice = !inCode && part !== 'answer' ? line.match(CHOICE_RE) : null;
    if (choice) {
      part = 'choices';
      q.choices.push({ text: choice[2], correct: choice[1] === choice[1].toUpperCase() });
      continue;
    }
    if (part === 'choices') {
      // An indented line continues the last choice; anything else after the choices is an explanation
      if (/^\s+\S/.test(line) && q.choices.length) q.choices[q.choices.length - 1].text += ` ${line.trim()}`;
      else if (line.trim()) q.answer.push(line);
      continue;
    }
    (part === 'answer' ? q.answer : q.prompt).push(line);
  }
  finish();
  return { intro: intro.join('\n').trim(), questions };
}

/** A Markua quiz or exercise from an imported book: fellows answer and check themselves. */
export const MarkuaBlock: React.FC<{
  kind: 'quiz' | 'exercise';
  source: string;
  renderMarkdown: (markdown: string) => React.ReactNode;
}> = ({ kind, source, renderMarkdown }) => {
  const { intro, questions } = parseMarkuaBlock(source);
  return (
    <div className="not-prose my-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
      <p className="text-3xs font-extrabold uppercase tracking-wider text-slate-500">{kind === 'quiz' ? 'Quiz' : 'Exercise'}</p>
      {intro && renderMarkdown(intro)}
      <div className="space-y-4">
        {questions.map((question, i) => (
          <MarkuaQuestionView key={i} index={i} question={question} renderMarkdown={renderMarkdown} />
        ))}
      </div>
    </div>
  );
};

const MarkuaQuestionView: React.FC<{
  index: number;
  question: MarkuaQuestion;
  renderMarkdown: (markdown: string) => React.ReactNode;
}> = ({ index, question, renderMarkdown }) => {
  const [picked, setPicked] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const multiple = question.choices.filter((c) => c.correct).length > 1;
  const right =
    checked && question.choices.every((c, i) => c.correct === picked.includes(i));

  const toggle = (i: number) => {
    setChecked(false);
    setPicked((p) => (multiple ? (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]) : [i]));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <span className="text-xs font-extrabold text-slate-500 pt-0.5">{index + 1}.</span>
        <div className="flex-1 min-w-0">{renderMarkdown(question.prompt)}</div>
      </div>
      {question.choices.length > 0 && (
        <div className="pl-5 space-y-1.5">
          {multiple && <p className="meta-text">Choose all that apply.</p>}
          {question.choices.map((c, i) => {
            const chosen = picked.includes(i);
            const mark = checked && (c.correct || chosen);
            return (
              <label
                key={i}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer transition ${
                  mark && c.correct
                    ? 'border-emerald-300 bg-emerald-50'
                    : mark && !c.correct
                      ? 'border-rose-300 bg-rose-50'
                      : chosen
                        ? 'border-kulkul-purple bg-white'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  className="mt-1"
                  checked={chosen}
                  onChange={() => toggle(i)}
                />
                <span className="flex-1 min-w-0">{renderMarkdown(c.text)}</span>
                {mark && (c.correct ? <Check className="w-4 h-4 text-emerald-600 mt-0.5" /> : <X className="w-4 h-4 text-rose-600 mt-0.5" />)}
              </label>
            );
          })}
          <div className="flex items-center gap-3">
            <button type="button" disabled={picked.length === 0} onClick={() => setChecked(true)} className="btn btn-sm btn-outline">
              Check
            </button>
            {checked && (
              <span className={`text-xs font-bold ${right ? 'text-emerald-700' : 'text-rose-700'}`}>{right ? 'Correct' : 'Not quite'}</span>
            )}
          </div>
          {checked && question.answer && <div className="text-sm">{renderMarkdown(question.answer)}</div>}
        </div>
      )}
      {question.choices.length === 0 && question.answer && (
        <div className="pl-5 space-y-2">
          <button type="button" onClick={() => setShowAnswer((s) => !s)} className="btn btn-sm btn-ghost -ml-2">
            {showAnswer ? 'Hide answer' : 'Show answer'}
          </button>
          {showAnswer && <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">{renderMarkdown(question.answer)}</div>}
        </div>
      )}
    </div>
  );
};
