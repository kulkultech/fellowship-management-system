import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sliders,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
  X,
  Move,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Eye,
  Crop,
  Maximize2,
} from 'lucide-react';

export interface AspectRatioOption {
  id: string;
  label: string;
  ratio: number;
  width: number;
  height: number;
  description: string;
}

export const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  { id: '3:1', label: '3:1', ratio: 3, width: 1200, height: 400, description: 'Slim Banner' },
  { id: '2.5:1', label: '2.5:1', ratio: 2.5, width: 1200, height: 480, description: 'Wide Banner' },
  { id: '2:1', label: '2:1', ratio: 2, width: 1200, height: 600, description: 'Standard Banner' },
  { id: '16:9', label: '16:9', ratio: 16 / 9, width: 1200, height: 675, description: 'Widescreen (16:9)' },
  { id: '4:3', label: '4:3', ratio: 4 / 3, width: 1200, height: 900, description: 'Card / Photo (4:3)' },
  { id: '1:1', label: '1:1', ratio: 1, width: 800, height: 800, description: 'Square (1:1)' },
];

export interface ProgramImageAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string; // Blob URL, data URL, or remote URL
  onApply: (adjustedFile: File, previewUrl: string, aspectRatio?: number) => Promise<void> | void;
  defaultRatio?: number; // Optional initial ratio (defaults to 3:1)
}

export const ProgramImageAdjustModal: React.FC<ProgramImageAdjustModalProps> = ({
  isOpen,
  onClose,
  imageSrc,
  onApply,
  defaultRatio = 3,
}) => {
  const [selectedRatioId, setSelectedRatioId] = useState<string>('3:1');
  const [customRatio, setCustomRatio] = useState<number>(3);
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [posX, setPosX] = useState<number>(50); // 0% (left) to 100% (right)
  const [posY, setPosY] = useState<number>(50); // 0% (top) to 100% (bottom)
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; startPosX: number; startPosY: number }>({
    x: 0,
    y: 0,
    startPosX: 50,
    startPosY: 50,
  });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Active computed aspect ratio (width / height)
  const activeRatio: number = isCustom
    ? customRatio
    : (ASPECT_RATIO_OPTIONS.find((opt) => opt.id === selectedRatioId)?.ratio ?? defaultRatio);

  // Target canvas dimensions based on active ratio
  const targetW = activeRatio >= 1 ? 1200 : Math.round(1200 * activeRatio);
  const targetH = activeRatio >= 1 ? Math.round(1200 / activeRatio) : 1200;

  // Reset adjustments when a new image source is loaded or modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedRatioId('3:1');
      setCustomRatio(defaultRatio);
      setIsCustom(false);
      setZoom(1);
      setPosX(50);
      setPosY(50);
      setImageLoaded(false);
      setLoadError(null);
    }
  }, [isOpen, imageSrc, defaultRatio]);

  // Handle Drag / Pan with Mouse or Touch
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      startPosX: posX,
      startPosY: posY,
    });
  };

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const deltaX = ((e.clientX - dragStart.x) / rect.width) * 100;
      const deltaY = ((e.clientY - dragStart.y) / rect.height) * 100;

      // Invert delta: moving mouse down moves focal point down
      const newX = Math.min(100, Math.max(0, dragStart.startPosX - deltaX));
      const newY = Math.min(100, Math.max(0, dragStart.startPosY - deltaY));

      setPosX(Number(newX.toFixed(1)));
      setPosY(Number(newY.toFixed(1)));
    },
    [isDragging, dragStart]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [isDragging, handlePointerMove, handlePointerUp]);

  // Handle Alignment Presets
  const handleSetPreset = (preset: 'top' | 'center' | 'bottom' | 'left' | 'right') => {
    if (preset === 'top') setPosY(0);
    if (preset === 'center') {
      setPosX(50);
      setPosY(50);
    }
    if (preset === 'bottom') setPosY(100);
    if (preset === 'left') setPosX(0);
    if (preset === 'right') setPosX(100);
  };

  // Reset all to default
  const handleReset = () => {
    setSelectedRatioId('3:1');
    setCustomRatio(3);
    setIsCustom(false);
    setZoom(1);
    setPosX(50);
    setPosY(50);
  };

  // Generate cropped/framed canvas and export high-res image
  const handleApplyFraming = async () => {
    if (!imageSrc) return;
    setIsProcessing(true);
    let tempBlobUrl: string | null = null;

    try {
      let resolvedSrc = imageSrc;
      if (!imageSrc.startsWith('blob:') && !imageSrc.startsWith('data:')) {
        try {
          const resp = await fetch(imageSrc, { mode: 'cors' });
          if (resp.ok) {
            const blob = await resp.blob();
            tempBlobUrl = URL.createObjectURL(blob);
            resolvedSrc = tempBlobUrl;
          }
        } catch {
          // fallback to direct src
        }
      }

      const img = new Image();
      if (!resolvedSrc.startsWith('blob:') && !resolvedSrc.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image for framing.'));
        img.src = resolvedSrc;
      });

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas context unavailable');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Dimensions math based on dynamic active ratio
      const canvasAspect = targetW / targetH;
      const imgAspect = img.naturalWidth / img.naturalHeight;

      let renderWidth = targetW;
      let renderHeight = targetH;

      if (imgAspect > canvasAspect) {
        // Image is wider than target frame
        renderHeight = targetH * zoom;
        renderWidth = renderHeight * imgAspect;
      } else {
        // Image is taller than target frame
        renderWidth = targetW * zoom;
        renderHeight = renderWidth / imgAspect;
      }

      // Calculate offsets based on posX and posY percentages
      const maxOffsetX = renderWidth - targetW;
      const maxOffsetY = renderHeight - targetH;

      const offsetX = -(maxOffsetX * (posX / 100));
      const offsetY = -(maxOffsetY * (posY / 100));

      // Draw onto canvas
      ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);

      // Convert to blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/webp', 0.92);
      });

      if (!blob) {
        throw new Error('Failed to export canvas blob');
      }

      const file = new File([blob], `banner_adjusted_${Date.now()}.webp`, {
        type: 'image/webp',
      });
      const previewUrl = URL.createObjectURL(blob);

      await onApply(file, previewUrl, activeRatio);
      onClose();
    } catch (err: any) {
      console.error('Error adjusting image:', err);
      setLoadError(err?.message || 'Failed to adjust image.');
    } finally {
      if (tempBlobUrl) {
        URL.revokeObjectURL(tempBlobUrl);
      }
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-kulkul-purple flex items-center justify-center">
              <Sliders className="w-4 h-4 text-kulkul-orange" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Adjust Program Banner &amp; Ratio</h3>
              <p className="text-2xs text-slate-500">
                Choose an aspect ratio, pan, reposition, and zoom to ensure key details display cleanly.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {loadError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              {loadError}
            </div>
          )}

          {/* 1. Aspect Ratio Selector Controls */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-extrabold uppercase tracking-wider text-slate-700 text-2xs flex items-center gap-1.5">
                <Crop className="w-3.5 h-3.5 text-kulkul-purple" />
                Banner Aspect Ratio
              </span>
              <span className="text-2xs font-mono font-bold text-kulkul-purple bg-purple-100/80 px-2.5 py-0.5 rounded-lg border border-purple-200/60">
                {isCustom ? `${customRatio.toFixed(2)}:1` : selectedRatioId} ({targetW} × {targetH}px)
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
              {ASPECT_RATIO_OPTIONS.map((opt) => {
                const isSelected = !isCustom && selectedRatioId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSelectedRatioId(opt.id);
                      setIsCustom(false);
                    }}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl text-center border transition ${
                      isSelected
                        ? 'bg-kulkul-purple text-white border-kulkul-purple shadow-xs ring-2 ring-kulkul-purple/20'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-kulkul-purple/40 hover:bg-purple-50/20'
                    }`}
                  >
                    <span className="text-xs font-black leading-tight">{opt.label}</span>
                    <span className={`text-3xs mt-0.5 ${isSelected ? 'text-purple-200' : 'text-slate-400'}`}>
                      {opt.description.split(' ')[0]}
                    </span>
                  </button>
                );
              })}

              {/* Custom Ratio Button */}
              <button
                type="button"
                onClick={() => setIsCustom(true)}
                className={`flex flex-col items-center justify-center p-2 rounded-xl text-center border transition ${
                  isCustom
                    ? 'bg-kulkul-purple text-white border-kulkul-purple shadow-xs ring-2 ring-kulkul-purple/20'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-kulkul-purple/40 hover:bg-purple-50/20'
                }`}
              >
                <span className="text-xs font-black leading-tight flex items-center gap-1">
                  <Maximize2 className="w-3 h-3" />
                  <span>Custom</span>
                </span>
                <span className={`text-3xs mt-0.5 ${isCustom ? 'text-purple-200' : 'text-slate-400'}`}>
                  Freeform
                </span>
              </button>
            </div>

            {/* Custom Ratio Slider */}
            {isCustom && (
              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-2xs font-bold text-slate-600">
                  <span>Custom Aspect Ratio Slider</span>
                  <span className="font-mono text-kulkul-purple">{customRatio.toFixed(2)}:1</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-3xs text-slate-400 font-mono">1.0 (Square)</span>
                  <input
                    type="range"
                    min="1.0"
                    max="4.0"
                    step="0.05"
                    value={customRatio}
                    onChange={(e) => setCustomRatio(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-kulkul-purple"
                  />
                  <span className="text-3xs text-slate-400 font-mono">4.0 (Ultra-wide)</span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Interactive Preview Viewport */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold uppercase tracking-wider text-slate-500 text-2xs flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-kulkul-purple" />
                Live Frame Preview ({isCustom ? `${customRatio.toFixed(2)}:1` : selectedRatioId})
              </span>
              <span className="text-2xs text-slate-400 flex items-center gap-1">
                <Move className="w-3 h-3 text-kulkul-orange" />
                Click &amp; drag inside frame to pan
              </span>
            </div>

            <div className="flex justify-center items-center w-full bg-slate-900/5 p-3 rounded-2xl border border-slate-200/80 min-h-[200px]">
              <div
                ref={containerRef}
                onPointerDown={handlePointerDown}
                style={{
                  aspectRatio: `${activeRatio}`,
                  maxHeight: '280px',
                  width: '100%',
                  maxWidth: activeRatio >= 2 ? '100%' : `${Math.round(280 * activeRatio)}px`,
                }}
                className={`relative rounded-2xl border-2 border-dashed border-slate-300 bg-slate-950 overflow-hidden select-none touch-none mx-auto transition-all duration-150 cursor-grab shadow-inner ${
                  isDragging ? 'cursor-grabbing border-kulkul-purple ring-2 ring-kulkul-purple/20' : ''
                }`}
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Framing preview"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => {
                    setImageLoaded(false);
                    setLoadError('Failed to load image source.');
                  }}
                  style={{
                    objectPosition: `${posX}% ${posY}%`,
                    transform: `scale(${zoom})`,
                    transformOrigin: `${posX}% ${posY}%`,
                  }}
                  className="w-full h-full object-cover transition-transform duration-75 pointer-events-none"
                />

                {/* Grid Guide Overlay */}
                <div className="absolute inset-0 pointer-events-none border border-white/20">
                  <div className="w-full h-full grid grid-cols-3 grid-rows-3 opacity-20">
                    <div className="border-r border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div />
                  </div>
                </div>

                {/* Status Pill */}
                <div className="absolute bottom-2 left-2 pointer-events-none bg-black/65 backdrop-blur-md px-2.5 py-1 rounded-lg text-3xs font-bold text-white flex items-center gap-2">
                  <span>Ratio: {isCustom ? `${customRatio.toFixed(2)}:1` : selectedRatioId}</span>
                  <span>•</span>
                  <span>Pos: {posX}% X, {posY}% Y</span>
                  <span>•</span>
                  <span>Zoom: {Math.round(zoom * 100)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Positioning & Zoom Controls Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
            {/* Zoom Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <ZoomIn className="w-3.5 h-3.5 text-kulkul-purple" />
                  Zoom Level
                </span>
                <span className="text-kulkul-purple font-mono">{zoom.toFixed(2)}x</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(1, Number((z - 0.1).toFixed(2))))}
                  className="btn-icon-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min="1"
                  max="2.5"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-kulkul-purple"
                />
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(2))))}
                  className="btn-icon-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Vertical Position Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <ArrowUp className="w-3 h-3 text-kulkul-orange" />
                  Vertical Position
                </span>
                <span className="text-kulkul-purple font-mono">{posY}%</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPosY((y) => Math.max(0, y - 10))}
                  className="btn-icon-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  title="Shift Up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={posY}
                  onChange={(e) => setPosY(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-kulkul-purple"
                />
                <button
                  type="button"
                  onClick={() => setPosY((y) => Math.min(100, y + 10))}
                  className="btn-icon-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  title="Shift Down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Horizontal Position Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <ArrowLeft className="w-3 h-3 text-kulkul-orange" />
                  Horizontal Position
                </span>
                <span className="text-kulkul-purple font-mono">{posX}%</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPosX((x) => Math.max(0, x - 10))}
                  className="btn-icon-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  title="Shift Left"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={posX}
                  onChange={(e) => setPosX(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-kulkul-purple"
                />
                <button
                  type="button"
                  onClick={() => setPosX((x) => Math.min(100, x + 10))}
                  className="btn-icon-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  title="Shift Right"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Alignment & Reset Presets */}
            <div className="space-y-2">
              <span className="font-bold text-slate-700 block">Focal Presets</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleSetPreset('top')}
                  className={`btn btn-xs ${
                    posY === 0 ? 'btn-primary' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Top
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPreset('center')}
                  className={`btn btn-xs ${
                    posX === 50 && posY === 50
                      ? 'btn-primary'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Center
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPreset('bottom')}
                  className={`btn btn-xs ${
                    posY === 100
                      ? 'btn-primary'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Bottom
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn btn-xs bg-slate-100 text-slate-600 hover:bg-slate-200 ml-auto flex items-center gap-1"
                  title="Reset Zoom, Position & Ratio"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset All</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="btn btn-sm btn-ghost"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApplyFraming}
            disabled={isProcessing || !imageLoaded}
            className="btn btn-sm btn-primary flex items-center gap-1.5 disabled:opacity-50"
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4 text-kulkul-orange" />
            )}
            <span>{isProcessing ? 'Processing Banner...' : 'Apply Framing & Ratio'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
