import { MCQQuestion } from '@/services/types';

export interface CSVParseResult {
  questions: MCQQuestion[];
  totalRows: number;
  validRows: number;
  errors: string[];
  delimiter: ';' | ',';
}

/**
 * Normalizes answer string (e.g. 'A', 'a', 'Choice A', 'Option 1') to 'a' | 'b' | 'c' | 'd'.
 */
function normalizeAnswer(raw: string): string {
  const val = raw.trim().toLowerCase();
  if (['a', '1', 'choice a', 'option a'].includes(val)) return 'a';
  if (['b', '2', 'choice b', 'option b'].includes(val)) return 'b';
  if (['c', '3', 'choice c', 'option c'].includes(val)) return 'c';
  if (['d', '4', 'choice d', 'option d'].includes(val)) return 'd';
  return '';
}

/**
 * Splits line preserving code snippets with internal semicolons/commas.
 */
function splitLineWithCodePreservation(line: string, delimiter: ';' | ','): string[] {
  // If line contains extra delimiters, count from the end to isolate the 5 trailing columns:
  // [Choice A, Choice B, Choice C, Choice D, Correct Answer]
  let lastFifthDelim = -1;
  let count = 0;
  for (let i = line.length - 1; i >= 0; i--) {
    if (line[i] === delimiter) {
      count++;
      if (count === 5) {
        lastFifthDelim = i;
        break;
      }
    }
  }

  const firstDelim = line.indexOf(delimiter);
  if (lastFifthDelim !== -1 && lastFifthDelim > firstDelim) {
    const qNum = line.slice(0, firstDelim).trim();
    const qText = line.slice(firstDelim + 1, lastFifthDelim).trim();
    const rest = line.slice(lastFifthDelim + 1).split(delimiter).map((s) => s.trim());
    return [qNum, qText, ...rest];
  }

  // Fallback: standard character scan respecting quotes
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      parts.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current.trim().replace(/^"|"$/g, ''));
  return parts;
}

/**
 * Infers question topic/category from text.
 */
export function inferCategory(qText: string, defaultCategory: string = 'General Assessment'): string {
  const lower = qText.toLowerCase();
  if (lower.includes('javascript') || lower.includes('typeof') || lower.includes('promise')) return 'JavaScript';
  if (lower.includes('java ') || lower.includes('java,') || lower.includes('in java') || lower.includes('system.out')) return 'Java';
  if (lower.includes('http') || lower.includes('fetch()') || lower.includes('restful') || lower.includes('rate limiting')) return 'Web & APIs';
  if (lower.includes('cypress') || lower.includes('postman')) return 'QA Automation';
  if (lower.includes('testing') || lower.includes('verification and validation') || lower.includes('defect density') || lower.includes('smoke test')) return 'Quality Assurance';
  if (lower.includes('git')) return 'Git & Version Control';
  if (lower.includes('maven')) return 'Build Tools';
  if (lower.includes('jenkins')) return 'CI/CD & DevOps';
  if (lower.includes('eslint')) return 'Code Quality';
  if (lower.includes('sql') || lower.includes('join') || lower.includes('database')) return 'Databases & SQL';
  return defaultCategory;
}

/**
 * Parses a raw CSV string containing multiple-choice assessment questions.
 */
export function parseQuestionsCSV(csvContent: string, defaultCategory: string = 'General Assessment'): CSVParseResult {
  const rawLines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) {
    return { questions: [], totalRows: 0, validRows: 0, errors: ['CSV file is empty.'], delimiter: ',' };
  }

  const header = rawLines[0];
  const semiCount = (header.match(/;/g) || []).length;
  const commaCount = (header.match(/,/g) || []).length;
  const delimiter: ';' | ',' = semiCount >= commaCount ? ';' : ',';

  const questions: MCQQuestion[] = [];
  const errors: string[] = [];
  const dataLines = rawLines.slice(1);

  dataLines.forEach((line, idx) => {
    const rowNum = idx + 2;
    const parts = splitLineWithCodePreservation(line, delimiter);

    if (parts.length < 6) {
      errors.push(`Row ${rowNum}: Insufficient columns (found ${parts.length}, need at least 6).`);
      return;
    }

    const n = parts.length;
    const rawAns = parts[n - 1].replace(/^"|"$/g, '').trim();
    const cD = parts[n - 2].replace(/^"|"$/g, '').trim();
    const cC = parts[n - 3].replace(/^"|"$/g, '').trim();
    const cB = parts[n - 4].replace(/^"|"$/g, '').trim();
    const cA = parts[n - 5].replace(/^"|"$/g, '').trim();

    let qText = '';
    if (n === 6) {
      qText = parts[0];
    } else if (n === 7) {
      qText = parts[1];
    } else {
      qText = parts.slice(1, n - 5).join(`${delimiter} `);
    }
    qText = qText.replace(/^"|"$/g, '').trim();

    if (!qText) {
      errors.push(`Row ${rowNum}: Question text is missing.`);
      return;
    }
    if (!cA || !cB || !cC || !cD) {
      errors.push(`Row ${rowNum}: One or more choices (A-D) are blank.`);
      return;
    }

    const correctAnsId = normalizeAnswer(rawAns);
    if (!correctAnsId) {
      errors.push(`Row ${rowNum}: Invalid correct answer '${rawAns}'. Must be A, B, C, or D.`);
      return;
    }

    const cat = inferCategory(qText, defaultCategory);
    let correctText = cA;
    if (correctAnsId === 'b') correctText = cB;
    if (correctAnsId === 'c') correctText = cC;
    if (correctAnsId === 'd') correctText = cD;

    questions.push({
      category: cat,
      question_text: qText,
      options: [
        { id: 'a', text: cA },
        { id: 'b', text: cB },
        { id: 'c', text: cC },
        { id: 'd', text: cD },
      ],
      correct_option_id: correctAnsId,
      explanation: `Correct answer is (${correctAnsId.toUpperCase()}): ${correctText}.`,
      points: 10,
    });
  });

  return {
    questions,
    totalRows: dataLines.length,
    validRows: questions.length,
    errors,
    delimiter,
  };
}
