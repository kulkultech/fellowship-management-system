import React, { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

// Fixed internal resolution keeps exported signatures small and consistent (3:1).
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 300;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

interface SignaturePadProps {
  /** PNG data URL, or '' when empty */
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ value, onChange, disabled }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // Tracks the data URL this component last emitted so external value changes can be detected
  const emittedRef = useRef<string | null>(null);
  const [hasInk, setHasInk] = useState(!!value);

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  const clearCanvas = () => {
    const ctx = getCtx();
    if (ctx) ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  };

  const paintImage = (src: string, onDone?: () => void) => {
    const img = new Image();
    img.onload = () => {
      const ctx = getCtx();
      if (!ctx) return;
      clearCanvas();
      const scale = Math.min(CANVAS_WIDTH / img.width, CANVAS_HEIGHT / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (CANVAS_WIDTH - w) / 2, (CANVAS_HEIGHT - h) / 2, w, h);
      onDone?.();
    };
    img.onerror = () => toast.error('Could not load signature image');
    img.src = src;
  };

  // Sync canvas with externally provided value (initial load / reset)
  useEffect(() => {
    if (value === emittedRef.current) return;
    emittedRef.current = value;
    setHasInk(!!value);
    if (value) {
      paintImage(value);
    } else {
      clearCanvas();
    }
  }, [value]);

  const emit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    emittedRef.current = dataUrl;
    setHasInk(true);
    onChange(dataUrl);
  };

  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = toCanvasPoint(e);
    lastPointRef.current = p;
    const ctx = getCtx();
    if (ctx) {
      // Draw a dot so single taps leave a mark
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const ctx = getCtx();
    const last = lastPointRef.current;
    if (!ctx || !last) return;
    const p = toCanvasPoint(e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    emit();
  };

  const handleClear = () => {
    clearCanvas();
    emittedRef.current = '';
    setHasInk(false);
    onChange('');
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Signature must be a PNG, JPEG, or WebP image');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('Signature image must be smaller than 5 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // Re-encode through the canvas so the stored image is resized and normalized
      paintImage(String(reader.result), emit);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border border-dashed border-slate-300 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`block w-full aspect-[3/1] touch-none ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'}`}
          aria-label="Signature drawing area"
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-400">
            <PenLine className="w-4 h-4" />
            <span>Draw signature here</span>
          </div>
        )}
        <div className="pointer-events-none absolute left-6 right-6 bottom-[22%] border-b border-slate-200" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="btn btn-sm btn-outline inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload Image</span>
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled || !hasInk}
          className="btn btn-sm btn-outline inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          <Eraser className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
        <span className="text-3xs text-slate-400">PNG with transparent background works best.</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleUpload}
        />
      </div>
    </div>
  );
};
