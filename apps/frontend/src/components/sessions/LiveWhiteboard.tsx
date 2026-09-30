import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  Excalidraw,
  convertToExcalidrawElements,
  MainMenu,
  WelcomeScreen,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import {
  Maximize2,
  Minimize2,
  Trash2,
  Download,
  FileCode,
  GitBranch,
  Layers,
  Check,
  Compass,
  PenTool,
  Sun,
  Moon,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface LiveWhiteboardProps {
  sessionId: string;
  sessionTitle: string;
  isMentor?: boolean;
}

export const LiveWhiteboard: React.FC<LiveWhiteboardProps> = ({
  sessionId,
  sessionTitle,
}) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const containerRef = useRef<HTMLDivElement>(null);

  const storageKey = `excalidraw_session_${sessionId}`;

  // Load initial data from localStorage if exists
  const initialData = useMemo(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          elements: parsed.elements || [],
          appState: {
            viewBackgroundColor: '#ffffff',
            currentItemFontFamily: 1,
            ...parsed.appState,
          },
        };
      }
    } catch {
      // ignore storage error
    }
    return null;
  }, [storageKey]);

  // Handle scene change and auto-save
  const handleChange = useCallback(
    (elements: readonly any[], appState: any) => {
      try {
        const dataToSave = {
          elements: elements.filter((el) => !el.isDeleted),
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            theme: appState.theme,
          },
        };
        localStorage.setItem(storageKey, JSON.stringify(dataToSave));
      } catch {
        // storage quota
      }
    },
    [storageKey]
  );

  // Template 1: Microservices Architecture
  const loadMicroservicesTemplate = () => {
    if (!excalidrawAPI) return;
    try {
      const elements = convertToExcalidrawElements([
        {
          type: 'rectangle',
          x: 60,
          y: 180,
          width: 150,
          height: 75,
          backgroundColor: '#e8f0fe',
          strokeColor: '#1a73e8',
          label: { text: 'Client App\n(Web & Mobile)' },
        },
        {
          type: 'arrow',
          x: 210,
          y: 217,
          points: [[0, 0], [90, 0]],
          label: { text: 'HTTPS' },
        },
        {
          type: 'rectangle',
          x: 300,
          y: 150,
          width: 170,
          height: 135,
          backgroundColor: '#f5f0fa',
          strokeColor: '#33125d',
          label: { text: 'API Gateway\n(Rate Limit & Auth)' },
        },
        {
          type: 'arrow',
          x: 470,
          y: 180,
          points: [[0, 0], [90, -50]],
          label: { text: 'gRPC' },
        },
        {
          type: 'arrow',
          x: 470,
          y: 240,
          points: [[0, 0], [90, 50]],
          label: { text: 'gRPC' },
        },
        {
          type: 'rectangle',
          x: 560,
          y: 100,
          width: 180,
          height: 85,
          backgroundColor: '#e6f4ea',
          strokeColor: '#1e8e3e',
          label: { text: 'Auth & Identity\nService' },
        },
        {
          type: 'rectangle',
          x: 560,
          y: 250,
          width: 180,
          height: 85,
          backgroundColor: '#fef7e0',
          strokeColor: '#f9ab00',
          label: { text: 'Cohort Core\nService' },
        },
        {
          type: 'ellipse',
          x: 810,
          y: 250,
          width: 130,
          height: 85,
          backgroundColor: '#ede4f7',
          strokeColor: '#33125d',
          label: { text: 'PostgreSQL\nDatabase' },
        },
        {
          type: 'arrow',
          x: 740,
          y: 292,
          points: [[0, 0], [70, 0]],
        },
      ]);
      excalidrawAPI.updateScene({ elements, commitToHistory: true });
      setTimeout(() => excalidrawAPI.scrollToContent(), 50);
      toast.success('Microservices architecture template loaded');
    } catch {
      toast.error('Failed to load template');
    }
  };

  // Template 2: Clean Architecture
  const loadCleanArchTemplate = () => {
    if (!excalidrawAPI) return;
    try {
      const elements = convertToExcalidrawElements([
        {
          type: 'ellipse',
          x: 120,
          y: 60,
          width: 500,
          height: 500,
          backgroundColor: '#e8f0fe',
          strokeColor: '#1a73e8',
          label: { text: 'Frameworks & Drivers\n(Web, DB, Devices)' },
        },
        {
          type: 'ellipse',
          x: 180,
          y: 120,
          width: 380,
          height: 380,
          backgroundColor: '#e6f4ea',
          strokeColor: '#1e8e3e',
          label: { text: 'Interface Adapters\n(Controllers, Gateways)' },
        },
        {
          type: 'ellipse',
          x: 240,
          y: 180,
          width: 260,
          height: 260,
          backgroundColor: '#fef7e0',
          strokeColor: '#f9ab00',
          label: { text: 'Application Rules\n(Use Cases)' },
        },
        {
          type: 'ellipse',
          x: 300,
          y: 240,
          width: 140,
          height: 140,
          backgroundColor: '#f5f0fa',
          strokeColor: '#33125d',
          label: { text: 'Enterprise Rules\n(Entities)' },
        },
      ]);
      excalidrawAPI.updateScene({ elements, commitToHistory: true });
      setTimeout(() => excalidrawAPI.scrollToContent(), 50);
      toast.success('Clean Architecture diagram template loaded');
    } catch {
      toast.error('Failed to load template');
    }
  };

  // Template 3: Decision Flowchart
  const loadFlowchartTemplate = () => {
    if (!excalidrawAPI) return;
    try {
      const elements = convertToExcalidrawElements([
        {
          type: 'ellipse',
          x: 120,
          y: 80,
          width: 150,
          height: 60,
          backgroundColor: '#e8f0fe',
          strokeColor: '#1a73e8',
          label: { text: 'Start Process' },
        },
        {
          type: 'arrow',
          x: 195,
          y: 140,
          points: [[0, 0], [0, 60]],
        },
        {
          type: 'diamond',
          x: 120,
          y: 200,
          width: 150,
          height: 100,
          backgroundColor: '#fef7e0',
          strokeColor: '#f9ab00',
          label: { text: 'Is Valid?' },
        },
        {
          type: 'arrow',
          x: 270,
          y: 250,
          points: [[0, 0], [100, 0]],
          label: { text: 'Yes' },
        },
        {
          type: 'rectangle',
          x: 370,
          y: 215,
          width: 170,
          height: 70,
          backgroundColor: '#e6f4ea',
          strokeColor: '#1e8e3e',
          label: { text: 'Execute Batch Task' },
        },
        {
          type: 'arrow',
          x: 195,
          y: 300,
          points: [[0, 0], [0, 70]],
          label: { text: 'No' },
        },
        {
          type: 'rectangle',
          x: 115,
          y: 370,
          width: 160,
          height: 70,
          backgroundColor: '#fce8e6',
          strokeColor: '#d93025',
          label: { text: 'Return Error (400)' },
        },
      ]);
      excalidrawAPI.updateScene({ elements, commitToHistory: true });
      setTimeout(() => excalidrawAPI.scrollToContent(), 50);
      toast.success('Flowchart template loaded');
    } catch {
      toast.error('Failed to load template');
    }
  };

  // Center/Fit to Content
  const handleFitToContent = () => {
    if (!excalidrawAPI) return;
    excalidrawAPI.scrollToContent();
  };

  // Clear Canvas
  const handleClear = () => {
    if (!excalidrawAPI) return;
    if (window.confirm('Clear all drawings on this whiteboard?')) {
      excalidrawAPI.resetScene();
      localStorage.removeItem(storageKey);
      toast.success('Whiteboard cleared');
    }
  };

  // Export Diagram as JSON
  const handleExportJSON = () => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const data = JSON.stringify({ elements, appState }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whiteboard-${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Whiteboard exported as JSON');
  };

  return (
    <div
      ref={containerRef}
      className={`bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none border-none'
          : 'h-[750px] w-full'
      }`}
    >
      {/* Studio Header Toolbar */}
      <div className="bg-white border-b border-slate-100 px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Studio Info */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-purple-50 text-kulkul-purple border border-purple-100 flex items-center justify-center shrink-0">
            <PenTool className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-slate-900 leading-tight">
              Whiteboard Studio
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                <Check className="w-3.5 h-3.5" />
                Auto-saved
              </span>
              <span>&bull;</span>
              <span className="truncate max-w-[140px] sm:max-w-xs">{sessionTitle}</span>
            </div>
          </div>
        </div>

        {/* Middle: Architecture Templates */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
          <span className="text-xs font-bold text-slate-500 px-2 hidden lg:inline">
            Templates:
          </span>
          <button
            type="button"
            onClick={loadMicroservicesTemplate}
            className="btn btn-sm btn-ghost text-slate-700 hover:text-kulkul-purple hover:bg-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-2xs"
            title="Load Microservices Architecture Diagram"
          >
            <Layers className="w-4 h-4 text-kulkul-purple" />
            <span>Microservices</span>
          </button>
          <button
            type="button"
            onClick={loadCleanArchTemplate}
            className="btn btn-sm btn-ghost text-slate-700 hover:text-kulkul-purple hover:bg-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-2xs"
            title="Load Clean Architecture Diagram"
          >
            <FileCode className="w-4 h-4 text-emerald-600" />
            <span>Clean Arch</span>
          </button>
          <button
            type="button"
            onClick={loadFlowchartTemplate}
            className="btn btn-sm btn-ghost text-slate-700 hover:text-kulkul-purple hover:bg-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-2xs"
            title="Load Process Flowchart"
          >
            <GitBranch className="w-4 h-4 text-amber-600" />
            <span>Flowchart</span>
          </button>
        </div>

        {/* Right Section: Quick Tools */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="btn btn-sm btn-ghost text-slate-600 hover:bg-slate-100 font-bold rounded-xl flex items-center gap-1.5"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
            <span className="hidden sm:inline capitalize text-xs">{theme}</span>
          </button>

          <button
            type="button"
            onClick={handleFitToContent}
            className="btn btn-sm btn-outline border-slate-200 text-slate-700 hover:bg-slate-50 font-bold rounded-xl flex items-center gap-1.5"
            title="Fit to Content"
          >
            <Compass className="w-4 h-4 text-slate-500" />
            <span className="text-xs">Fit Content</span>
          </button>

          <button
            type="button"
            onClick={handleExportJSON}
            className="btn btn-sm btn-outline border-slate-200 text-slate-700 hover:bg-slate-50 font-bold rounded-xl flex items-center gap-1.5"
            title="Export Diagram as JSON file"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span className="text-xs">Export</span>
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="btn btn-sm btn-ghost text-rose-600 hover:bg-rose-50 font-bold rounded-xl"
            title="Clear Canvas"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn btn-sm btn-ghost text-slate-600 hover:bg-slate-100 rounded-xl"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Excalidraw Canvas Area with absolute viewport filling */}
      <div className="flex-1 w-full relative bg-slate-50 overflow-hidden">
        <div className="absolute inset-0">
          <Excalidraw
            excalidrawAPI={(api: any) => setExcalidrawAPI(api)}
            initialData={initialData}
            onChange={handleChange}
            theme={theme}
            UIOptions={{
              canvasActions: {
                changeViewBackgroundColor: true,
                clearCanvas: false,
                export: {
                  saveFileToDisk: true,
                },
                loadScene: true,
                saveToActiveFile: false,
                theme: true,
              },
            }}
          >
            <WelcomeScreen>{null}</WelcomeScreen>
            <MainMenu>
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
          </Excalidraw>
        </div>
      </div>
    </div>
  );
};
