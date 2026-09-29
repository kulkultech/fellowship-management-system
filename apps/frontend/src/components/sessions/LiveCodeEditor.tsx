import React, { useState, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import {
  Play,
  RotateCcw,
  Copy,
  Download,
  Terminal,
  Eye,
  Check,
  Code2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Smartphone,
  Tablet,
  Monitor,
  AlignLeft,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  runJavaCode,
  runPythonCode,
  runJsOrTsCode,
  generateHtmlPreview,
  LogItem,
} from './codeRunners';

export type SupportedLanguage = 'java' | 'html' | 'css' | 'javascript' | 'typescript' | 'python';

interface LanguageConfig {
  id: SupportedLanguage;
  name: string;
  tag: string;
  extension: string;
  monacoLang: string;
}

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  { id: 'java', name: 'Java', tag: 'JAVA', extension: '.java', monacoLang: 'java' },
  { id: 'html', name: 'HTML', tag: 'HTML', extension: '.html', monacoLang: 'html' },
  { id: 'css', name: 'CSS', tag: 'CSS', extension: '.css', monacoLang: 'css' },
  { id: 'javascript', name: 'JavaScript', tag: 'JS', extension: '.js', monacoLang: 'javascript' },
  { id: 'typescript', name: 'TypeScript', tag: 'TS', extension: '.ts', monacoLang: 'typescript' },
  { id: 'python', name: 'Python', tag: 'PY', extension: '.py', monacoLang: 'python' },
];

export interface SnippetOption {
  title: string;
  description: string;
  code: string;
}

export const LANGUAGE_SNIPPET_COLLECTIONS: Record<SupportedLanguage, SnippetOption[]> = {
  java: [
    {
      title: 'Cohort Curriculum & Collections',
      description: 'ArrayList iteration, formatted string printing, and class structure',
      code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        System.out.println("=== Fellowship Live Java Session ===");
        System.out.println("Runtime initialized successfully.\\n");

        List<String> cohortSkills = new ArrayList<>();
        cohortSkills.add("High-Performance Backend Engineering");
        cohortSkills.add("Concurrency & Multithreading");
        cohortSkills.add("Microservices & Cloud Infra");

        System.out.println("Mastery Curriculum:");
        for (int i = 0; i < cohortSkills.size(); i++) {
            System.out.printf("  [%d] %s\\n", i + 1, cohortSkills.get(i));
        }
    }
}`,
    },
    {
      title: 'Algorithm: Fibonacci & Math',
      description: 'Iterative computation and algorithmic speed benchmark',
      code: `public class Main {
    public static void main(String[] args) {
        System.out.println("=== Java Fibonacci Sequence ===");
        int n = 12;
        int a = 0;
        int b = 1;
        System.out.print("F(0.." + n + "): " + a + ", " + b);
        for (int i = 2; i <= n; i++) {
            int next = a + b;
            System.out.print(", " + next);
            a = b;
            b = next;
        }
        System.out.println("\\nComputed successfully.");
    }
}`,
    },
  ],

  html: [
    {
      title: 'Interactive Web Component',
      description: 'Card layout with input and interactive greeting button',
      code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fellowship Live Session</title>
</head>
<body>
  <div class="container">
    <div class="badge">LIVE WORKSHOP</div>
    <h1>Fellowship Code Lab</h1>
    <p>Build and preview dynamic web components live during cohort workshops.</p>
    
    <div class="interactive-box">
      <input type="text" id="nameInput" placeholder="Enter fellow name..." />
      <button id="greetBtn">Run Interaction</button>
      <div id="greetingOutput"></div>
    </div>
  </div>
</body>
</html>`,
    },
    {
      title: 'Candidate Profile Badge',
      description: 'Cohort participant card with metrics and track information',
      code: `<div class="container">
  <div class="profile-header">
    <div class="avatar">FK</div>
    <div>
      <h2>Fellowship Candidate</h2>
      <div class="badge">BACKEND TRACK</div>
    </div>
  </div>
  <p>Enrolled in Cloud Architecture & Go Microservices cohort.</p>
  <button id="greetBtn">Validate Status</button>
  <div id="greetingOutput"></div>
</div>`,
    },
  ],

  css: [
    {
      title: 'Modern Deep-Purple Theme',
      description: 'Kulkul color palette, typography, inputs, and buttons',
      code: `:root {
  --primary: #33125d;
  --primary-hover: #260c47;
  --accent: #fe900d;
  --bg: #f8fafc;
  --card-bg: #ffffff;
}

body {
  margin: 0;
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: var(--bg);
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 85vh;
}

.container {
  background: var(--card-bg);
  padding: 2.5rem;
  border-radius: 1.5rem;
  box-shadow: 0 10px 25px -5px rgba(51, 18, 93, 0.08);
  max-width: 480px;
  width: 100%;
  border: 1px solid #e2e8f0;
}

.badge {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: var(--primary);
  margin-bottom: 0.5rem;
}

h1 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
}

p {
  color: #64748b;
  font-size: 0.875rem;
  line-height: 1.5;
  margin-bottom: 1.5rem;
}

.interactive-box {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

input {
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  border: 1px solid #cbd5e1;
  font-size: 0.875rem;
  outline: none;
}

input:focus {
  border-color: var(--primary);
}

button {
  background: var(--primary);
  color: white;
  border: none;
  padding: 0.75rem 1.25rem;
  border-radius: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}

button:hover {
  background: var(--primary-hover);
}

#greetingOutput {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #059669;
  min-height: 1.25rem;
}`,
    },
  ],

  javascript: [
    {
      title: 'DOM Event Listener & Logic',
      description: 'Attaches click listener to input and generates dynamic DOM response',
      code: `// Interactive Web & Logic script
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('nameInput');
  const btn = document.getElementById('greetBtn');
  const output = document.getElementById('greetingOutput');

  if (btn && input && output) {
    btn.addEventListener('click', () => {
      const name = input.value.trim() || 'Fellow';
      output.textContent = \`Hello, \${name}! Ready to build production-grade software.\`;
      console.log(\`[Interaction] Greeted user: \${name}\`);
    });
  }
});

console.log("Fellowship JS runtime initialized successfully.");`,
    },
  ],

  typescript: [
    {
      title: 'Cohort Graduation Eligibility Model',
      description: 'Interfaces, type guards, and functional business rules',
      code: `interface CohortStudent {
  id: string;
  name: string;
  track: string;
  attendanceRate: number;
  completedTasks: number;
}

function calculateGraduationEligibility(student: CohortStudent): {
  isEligible: boolean;
  status: string;
} {
  const meetsAttendance = student.attendanceRate >= 80;
  const meetsTasks = student.completedTasks >= 4;

  if (meetsAttendance && meetsTasks) {
    return { isEligible: true, status: "Eligible for Fellowship Certificate" };
  }
  return { isEligible: false, status: "In progress - attend remaining syncs" };
}

const activeFellow: CohortStudent = {
  id: "fel-2026-01",
  name: "Jordan Lee",
  track: "Full-Stack Software Architecture",
  attendanceRate: 92,
  completedTasks: 5,
};

const result = calculateGraduationEligibility(activeFellow);
console.log(\`Fellow: \${activeFellow.name}\`);
console.log(\`Track: \${activeFellow.track}\`);
console.log(\`Attendance: \${activeFellow.attendanceRate}%\`);
console.log(\`Result: \${result.status}\`);`,
    },
  ],

  python: [
    {
      title: 'Python Benchmark & Comprehensions',
      description: 'List comprehensions, dict aggregation, and formatted execution',
      code: `# Fellowship Python Live Script
def run_benchmark():
    print("=== Fellowship Python Performance Benchmark ===")
    
    # Generate algorithmic sequence
    squares = [x**2 for x in range(1, 11)]
    evens = [x for x in squares if x % 2 == 0]
    
    print(f"Computed squares (1-10): {squares}")
    print(f"Even squares filtered: {evens}")
    
    metrics = {
        "memory_overhead": "Low",
        "time_complexity": "O(N)",
        "status": "Optimal"
    }
    
    print("\\nExecution Metrics:")
    for key, value in metrics.items():
        print(f"  • {key}: {value}")
        
    print("\\nBenchmark completed successfully.")

run_benchmark()`,
    },
    {
      title: 'Fibonacci Generator',
      description: 'Iterative generation of sequence',
      code: `def fibonacci_series(n):
    print(f"Generating Fibonacci sequence for N={n}:")
    a, b = 0, 1
    seq = []
    for _ in range(n):
        seq.append(a)
        a, b = b, a + b
    return seq

result = fibonacci_series(10)
print(f"Result: {result}")
print(f"Sum of sequence: {sum(result)}")`,
    },
  ],
};

interface LiveCodeEditorProps {
  initialLanguage?: SupportedLanguage;
  sessionTitle?: string;
  onCodeChange?: (lang: SupportedLanguage, code: string) => void;
}

export const LiveCodeEditor: React.FC<LiveCodeEditorProps> = ({
  initialLanguage = 'java',
  sessionTitle = 'Fellowship Live Session',
  onCodeChange,
}) => {
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(initialLanguage);
  const [codeMap, setCodeMap] = useState<Record<SupportedLanguage, string>>({
    java: LANGUAGE_SNIPPET_COLLECTIONS.java[0].code,
    html: LANGUAGE_SNIPPET_COLLECTIONS.html[0].code,
    css: LANGUAGE_SNIPPET_COLLECTIONS.css[0].code,
    javascript: LANGUAGE_SNIPPET_COLLECTIONS.javascript[0].code,
    typescript: LANGUAGE_SNIPPET_COLLECTIONS.typescript[0].code,
    python: LANGUAGE_SNIPPET_COLLECTIONS.python[0].code,
  });

  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [fontSize, setFontSize] = useState<number>(14);
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on');
  const [minimap, setMinimap] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // View mode: 'split' | 'editor-only' | 'preview-only'
  const [viewMode, setViewMode] = useState<'split' | 'editor-only' | 'preview-only'>('split');
  // Right panel tab: 'console' | 'web-preview'
  const [rightPanelTab, setRightPanelTab] = useState<'console' | 'web-preview'>(
    initialLanguage === 'html' || initialLanguage === 'css' ? 'web-preview' : 'console'
  );

  // Web Preview viewport size: 'desktop' | 'tablet' | 'mobile'
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  // Console output state
  const [consoleLogs, setConsoleLogs] = useState<LogItem[]>([
    {
      id: 'init-1',
      type: 'info',
      content: `Workspace ready. Language: ${SUPPORTED_LANGUAGES.find((l) => l.id === initialLanguage)?.name}. Press Run (Ctrl/Cmd+Enter) to execute.`,
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [hasCopied, setHasCopied] = useState<boolean>(false);

  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // When language changes, auto-set right panel if HTML/CSS
  useEffect(() => {
    if (currentLang === 'html' || currentLang === 'css') {
      setRightPanelTab('web-preview');
    }
  }, [currentLang]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleCodeChange = (newCode: string | undefined) => {
    const val = newCode || '';
    setCodeMap((prev) => ({
      ...prev,
      [currentLang]: val,
    }));
    if (onCodeChange) {
      onCodeChange(currentLang, val);
    }
  };

  // Keyboard shortcut Ctrl/Cmd + Enter to run code
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunCode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentLang, codeMap]);

  // Run Code logic using multi-language execution engines
  const handleRunCode = async () => {
    setIsRunning(true);
    const timeStr = new Date().toLocaleTimeString();

    try {
      if (currentLang === 'html' || currentLang === 'css') {
        setRightPanelTab('web-preview');
        setConsoleLogs((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            type: 'success',
            content: `Live Web Preview updated with current ${currentLang.toUpperCase()} styles & markup.`,
            timestamp: timeStr,
          },
        ]);
        return;
      }

      if (currentLang === 'javascript' || currentLang === 'typescript') {
        setRightPanelTab('console');
        const res = await runJsOrTsCode(codeMap[currentLang], currentLang);
        setConsoleLogs((prev) => [...prev, ...res.logs]);
      } else if (currentLang === 'python') {
        setRightPanelTab('console');
        const res = await runPythonCode(codeMap.python);
        setConsoleLogs((prev) => [...prev, ...res.logs]);
      } else if (currentLang === 'java') {
        setRightPanelTab('console');
        const res = await runJavaCode(codeMap.java);
        setConsoleLogs((prev) => [...prev, ...res.logs]);
      }
    } catch (err: any) {
      setConsoleLogs((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          type: 'error',
          content: `Execution Exception: ${err.message || String(err)}`,
          timestamp: timeStr,
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleFormatCode = () => {
    if (editorRef.current) {
      const action = editorRef.current.getAction('editor.action.formatDocument');
      if (action) {
        action.run();
        toast.success('Code formatted');
      } else {
        toast.success('Auto-format applied');
      }
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(codeMap[currentLang]);
      setHasCopied(true);
      toast.success(`${SUPPORTED_LANGUAGES.find((l) => l.id === currentLang)?.name} code copied to clipboard`);
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      toast.error('Failed to copy code to clipboard');
    }
  };

  const handleResetSnippet = () => {
    const defaultCode = LANGUAGE_SNIPPET_COLLECTIONS[currentLang][0].code;
    if (window.confirm(`Reset ${SUPPORTED_LANGUAGES.find((l) => l.id === currentLang)?.name} editor to starter template?`)) {
      setCodeMap((prev) => ({
        ...prev,
        [currentLang]: defaultCode,
      }));
      toast.success('Starter code template restored');
    }
  };

  const handleLoadSnippet = (snippetCode: string) => {
    setCodeMap((prev) => ({
      ...prev,
      [currentLang]: snippetCode,
    }));
    toast.success('Template loaded into editor');
  };

  const handleDownloadFile = () => {
    const config = SUPPORTED_LANGUAGES.find((l) => l.id === currentLang)!;
    const blob = new Blob([codeMap[currentLang]], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `main${config.extension}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded main${config.extension}`);
  };

  const handleOpenExternalPreview = () => {
    const htmlContent = generateHtmlPreview(codeMap.html, codeMap.css, codeMap.javascript);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const currentConfig = SUPPORTED_LANGUAGES.find((l) => l.id === currentLang)!;
  const availableSnippets = LANGUAGE_SNIPPET_COLLECTIONS[currentLang] || [];

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'h-[750px] w-full'
      }`}
    >
      {/* 1. TOP TOOLBAR */}
      <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs select-none">
        {/* Left: Language Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <div className="flex items-center gap-1.5 mr-2 text-slate-400 font-extrabold uppercase text-3xs tracking-wider">
            <Code2 className="w-3.5 h-3.5 text-kulkul-orange" />
            <span className="hidden sm:inline">Language:</span>
          </div>

          {SUPPORTED_LANGUAGES.map((lang) => {
            const isActive = currentLang === lang.id;
            return (
              <button
                key={lang.id}
                type="button"
                onClick={() => setCurrentLang(lang.id)}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 shrink-0 ${
                  isActive
                    ? 'bg-kulkul-purple text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span className="text-3xs font-extrabold px-1 py-0.5 rounded bg-white/10 text-white">
                  {lang.tag}
                </span>
                <span>{lang.name}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Actions & Controls */}
        <div className="flex items-center gap-2">
          {/* Run Code Button */}
          <button
            type="button"
            onClick={handleRunCode}
            disabled={isRunning}
            className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 shadow-sm"
            title="Execute Code (Ctrl/Cmd + Enter)"
          >
            {isRunning ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{currentLang === 'html' || currentLang === 'css' ? 'Run Preview' : 'Run Code'}</span>
          </button>

          {/* Snippets / Templates dropdown */}
          {availableSnippets.length > 1 && (
            <div className="relative group">
              <button
                type="button"
                className="btn btn-sm btn-ghost text-slate-300 hover:text-white flex items-center gap-1"
                title="Select Starter Template"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Templates</span>
              </button>
              <div className="absolute right-0 top-full mt-1 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-2 hidden group-hover:block z-50">
                <div className="text-3xs uppercase font-extrabold text-slate-500 px-2 py-1">
                  {currentConfig.name} Templates
                </div>
                {availableSnippets.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleLoadSnippet(s.code)}
                    className="w-full text-left p-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition space-y-0.5"
                  >
                    <div className="text-2xs font-bold">{s.title}</div>
                    <div className="text-3xs text-slate-400">{s.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Format Code */}
          <button
            type="button"
            onClick={handleFormatCode}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition"
            title="Format Document"
          >
            <AlignLeft className="w-4 h-4" />
          </button>

          {/* View Mode Toggle */}
          <div className="hidden md:flex items-center bg-slate-900 rounded-xl p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`px-2.5 py-1 rounded-lg text-2xs font-bold transition ${
                viewMode === 'split' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Split
            </button>
            <button
              type="button"
              onClick={() => setViewMode('editor-only')}
              className={`px-2.5 py-1 rounded-lg text-2xs font-bold transition ${
                viewMode === 'editor-only' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Editor Only
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview-only')}
              className={`px-2.5 py-1 rounded-lg text-2xs font-bold transition ${
                viewMode === 'preview-only' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Output Only
            </button>
          </div>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopyCode}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition"
            title="Copy Code"
          >
            {hasCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>

          {/* Reset Snippet */}
          <button
            type="button"
            onClick={handleResetSnippet}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition"
            title="Reset to Starter Template"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Download File */}
          <button
            type="button"
            onClick={handleDownloadFile}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition"
            title="Download Source File"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. SUB-BAR: File Info & Preferences */}
      <div className="bg-slate-900 px-4 py-1.5 border-b border-slate-800 flex items-center justify-between text-2xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-mono text-slate-300 font-bold flex items-center gap-1.5">
            <span className="text-3xs px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-sans">
              {currentConfig.tag}
            </span>
            <span>main{currentConfig.extension}</span>
          </span>
          <span className="text-slate-600">&bull;</span>
          <span className="text-slate-500">
            {codeMap[currentLang].split('\n').length} lines
          </span>
        </div>

        {/* Preferences */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Theme:</span>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'vs-dark' ? 'light' : 'vs-dark'))}
              className="text-slate-300 hover:text-white font-semibold underline decoration-dotted"
            >
              {theme === 'vs-dark' ? 'Dark' : 'Light'}
            </button>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-500">Font:</span>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="bg-transparent text-slate-300 font-semibold focus:outline-none cursor-pointer"
            >
              <option value={12} className="bg-slate-900 text-slate-200">12px</option>
              <option value={14} className="bg-slate-900 text-slate-200">14px</option>
              <option value={16} className="bg-slate-900 text-slate-200">16px</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setWordWrap((w) => (w === 'on' ? 'off' : 'on'))}
            className={`font-semibold transition ${wordWrap === 'on' ? 'text-emerald-400' : 'text-slate-500'}`}
            title="Toggle Word Wrap"
          >
            Wrap {wordWrap === 'on' ? 'On' : 'Off'}
          </button>

          <button
            type="button"
            onClick={() => setMinimap((m) => !m)}
            className={`font-semibold transition ${minimap ? 'text-emerald-400' : 'text-slate-500'}`}
            title="Toggle Code Minimap"
          >
            Map {minimap ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* 3. MAIN WORKSPACE (EDITOR & OUTPUT / PREVIEW) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 bg-slate-950">
        {/* LEFT: MONACO EDITOR */}
        {(viewMode === 'split' || viewMode === 'editor-only') && (
          <div
            className={`flex-1 flex flex-col overflow-hidden relative ${
              viewMode === 'split' ? 'lg:border-r border-slate-800' : 'w-full'
            }`}
          >
            <Editor
              height="100%"
              language={currentConfig.monacoLang}
              value={codeMap[currentLang]}
              theme={theme}
              onMount={handleEditorMount}
              onChange={handleCodeChange}
              options={{
                fontSize: fontSize,
                wordWrap: wordWrap,
                minimap: { enabled: minimap },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                automaticLayout: true,
                tabSize: 2,
                cursorBlinking: 'smooth',
                renderWhitespace: 'selection',
                formatOnPaste: true,
                formatOnType: true,
                lineNumbersMinChars: 3,
                fontFamily: `'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace`,
              }}
              loading={
                <div className="flex items-center justify-center h-full text-slate-400 text-xs font-bold gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-kulkul-purple" />
                  <span>Loading Monaco Code Engine...</span>
                </div>
              }
            />
          </div>
        )}

        {/* RIGHT: CONSOLE TERMINAL OR LIVE WEB PREVIEW */}
        {(viewMode === 'split' || viewMode === 'preview-only') && (
          <div
            className={`flex flex-col overflow-hidden bg-slate-950 ${
              viewMode === 'split' ? 'lg:w-[48%] h-64 lg:h-auto border-t lg:border-t-0 border-slate-800' : 'w-full h-full'
            }`}
          >
            {/* Panel Tabs Header */}
            <div className="bg-slate-900/90 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs select-none">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRightPanelTab('console')}
                  className={`px-3 py-1 rounded-xl font-bold flex items-center gap-1.5 transition ${
                    rightPanelTab === 'console'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Terminal / Console</span>
                  {consoleLogs.length > 0 && (
                    <span className="text-3xs px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300">
                      {consoleLogs.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setRightPanelTab('web-preview')}
                  className={`px-3 py-1 rounded-xl font-bold flex items-center gap-1.5 transition ${
                    rightPanelTab === 'web-preview'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Live Web Preview</span>
                </button>
              </div>

              {/* Context Actions */}
              {rightPanelTab === 'console' ? (
                <button
                  type="button"
                  onClick={() => setConsoleLogs([])}
                  className="text-2xs font-bold text-slate-500 hover:text-slate-300 transition"
                  title="Clear Console"
                >
                  Clear Logs
                </button>
              ) : (
                <div className="flex items-center gap-1 text-slate-400">
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('desktop')}
                    className={`p-1 rounded-lg transition ${previewViewport === 'desktop' ? 'bg-slate-800 text-white' : 'hover:text-slate-200'}`}
                    title="Desktop Preview (100%)"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('tablet')}
                    className={`p-1 rounded-lg transition ${previewViewport === 'tablet' ? 'bg-slate-800 text-white' : 'hover:text-slate-200'}`}
                    title="Tablet Preview (768px)"
                  >
                    <Tablet className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('mobile')}
                    className={`p-1 rounded-lg transition ${previewViewport === 'mobile' ? 'bg-slate-800 text-white' : 'hover:text-slate-200'}`}
                    title="Mobile Preview (375px)"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenExternalPreview}
                    className="p-1 rounded-lg hover:text-slate-200 transition ml-1"
                    title="Open Preview in New Window"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Panel Body: Console Logs */}
            {rightPanelTab === 'console' && (
              <div className="flex-1 p-4 font-mono text-2xs overflow-y-auto space-y-1.5 bg-slate-950 text-slate-300 select-text">
                {consoleLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
                    <Terminal className="w-8 h-8 stroke-1 text-slate-700" />
                    <p className="text-xs">No console logs. Run code to inspect stdout output.</p>
                  </div>
                ) : (
                  consoleLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`flex items-start gap-2.5 leading-relaxed ${
                        log.type === 'error'
                          ? 'text-rose-400 font-bold'
                          : log.type === 'warn'
                          ? 'text-amber-400'
                          : log.type === 'success'
                          ? 'text-emerald-400 font-bold'
                          : log.type === 'info'
                          ? 'text-blue-400'
                          : 'text-slate-300'
                      }`}
                    >
                      <span className="text-slate-600 select-none text-3xs shrink-0 pt-0.5">
                        [{log.timestamp}]
                      </span>
                      <pre className="whitespace-pre-wrap break-all font-mono m-0 flex-1">
                        {log.content}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Panel Body: Live Web Preview iframe */}
            {rightPanelTab === 'web-preview' && (
              <div className="flex-1 bg-slate-900/50 p-3 overflow-hidden flex items-center justify-center">
                <div
                  className={`h-full bg-white rounded-2xl overflow-hidden shadow-lg border border-slate-700/50 transition-all ${
                    previewViewport === 'mobile'
                      ? 'w-[375px]'
                      : previewViewport === 'tablet'
                      ? 'w-[768px]'
                      : 'w-full'
                  }`}
                >
                  <iframe
                    title="Live Web Component Preview"
                    srcDoc={generateHtmlPreview(codeMap.html, codeMap.css, codeMap.javascript)}
                    sandbox="allow-scripts allow-modals"
                    className="w-full h-full border-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. FOOTER STATUS BAR */}
      <div className="bg-slate-950 px-4 py-1.5 border-t border-slate-800 text-3xs text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          <span className="font-medium text-slate-400">Monaco Engine: Ready</span>
          <span>&bull;</span>
          <span>{sessionTitle}</span>
        </div>

        <div className="flex items-center gap-3">
          <span>Encoding: UTF-8</span>
          <span>&bull;</span>
          <span>Spaces: 2</span>
          <span>&bull;</span>
          <span>Press <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Ctrl+Enter</kbd> to Run</span>
        </div>
      </div>
    </div>
  );
};
