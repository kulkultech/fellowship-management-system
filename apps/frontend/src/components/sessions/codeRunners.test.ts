import { describe, it, expect } from 'vitest';
import {
  runPythonCode,
  runJsOrTsCode,
  generateHtmlPreview,
} from './codeRunners';

describe('codeRunners execution suite', () => {
  it('should execute JavaScript code and capture logs', async () => {
    const jsCode = `
      const numbers = [1, 2, 3, 4, 5];
      const doubled = numbers.map(n => n * 2);
      console.log("Doubled array:", doubled);
      return doubled.reduce((a, b) => a + b, 0);
    `;

    const res = await runJsOrTsCode(jsCode, 'javascript');
    expect(res.success).toBe(true);
    expect(res.logs.some((l) => l.content.includes('Doubled array:'))).toBe(true);
    expect(res.logs.some((l) => l.content.includes('=> 30'))).toBe(true);
  });

  it('should execute TypeScript code by stripping types', async () => {
    const tsCode = `
      interface Student {
        name: string;
        gpa: number;
      }
      const s: Student = { name: "Alice", gpa: 3.9 };
      console.log("Student GPA is " + s.gpa);
    `;

    const res = await runJsOrTsCode(tsCode, 'typescript');
    expect(res.success).toBe(true);
    expect(res.logs.some((l) => l.content.includes('Student GPA is 3.9'))).toBe(true);
  });

  it('should run Python code via fallback or Pyodide and capture output', async () => {
    const pyCode = `
def greet():
    print("Welcome to Python Workshop")
    print("Computed value: 42")

greet()
    `;

    const res = await runPythonCode(pyCode);
    expect(res.success).toBe(true);
    expect(res.logs.some((l) => l.content.includes('Welcome to Python Workshop'))).toBe(true);
    expect(res.logs.some((l) => l.content.includes('Computed value: 42'))).toBe(true);
  });

  it('should generate combined HTML preview with CSS and JS injected', () => {
    const html = '<h1>Title</h1>';
    const css = 'h1 { color: red; }';
    const js = 'console.log("ready");';

    const output = generateHtmlPreview(html, css, js);
    expect(output).toContain('<style>\n    h1 { color: red; }\n  </style>');
    expect(output).toContain('<h1>Title</h1>');
    expect(output).toContain('console.log("ready");');
  });
});
