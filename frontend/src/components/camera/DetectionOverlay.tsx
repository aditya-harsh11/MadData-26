import { useEffect, useRef } from 'react';
import type { Detection } from '../../types';

interface DetectionOverlayProps {
  detections: Detection[];
  width: number;
  height: number;
  className?: string;
}

const CLASS_COLORS: Record<string, string> = {
  person: '#22c55e',
  car: '#3b82f6',
  truck: '#3b82f6',
  bus: '#3b82f6',
  motorcycle: '#3b82f6',
  bicycle: '#3b82f6',
  cat: '#eab308',
  dog: '#eab308',
  bird: '#eab308',
  horse: '#eab308',
  cow: '#eab308',
  sheep: '#eab308',
  bear: '#eab308',
  elephant: '#eab308',
  zebra: '#eab308',
  giraffe: '#eab308',
  cell_phone: '#64748b',
  laptop: '#64748b',
  tv: '#64748b',
  backpack: '#f97316',
  umbrella: '#f97316',
  handbag: '#f97316',
  suitcase: '#f97316',
  knife: '#ef4444',
  scissors: '#ef4444',
};

function getColor(className: string): string {
  return CLASS_COLORS[className.toLowerCase()] || '#06b6d4';
}

interface SmoothedBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  className: string;
  confidence: number;
}

export function DetectionOverlay({
  detections,
  width,
  height,
  className = '',
}: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevBoxesRef = useRef<SmoothedBox[]>([]);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Build target boxes
    const targetBoxes: SmoothedBox[] = detections.map((d) => ({
      x1: d.bbox[0],
      y1: d.bbox[1],
      x2: d.bbox[2],
      y2: d.bbox[3],
      className: d.class_name,
      confidence: d.confidence,
    }));

    // Smooth interpolation
    const smoothFactor = 0.3;
    const smoothed: SmoothedBox[] = targetBoxes.map((target, i) => {
      const prev = prevBoxesRef.current[i];
      if (prev && prev.className === target.className) {
        return {
          x1: prev.x1 + (target.x1 - prev.x1) * smoothFactor,
          y1: prev.y1 + (target.y1 - prev.y1) * smoothFactor,
          x2: prev.x2 + (target.x2 - prev.x2) * smoothFactor,
          y2: prev.y2 + (target.y2 - prev.y2) * smoothFactor,
          className: target.className,
          confidence: target.confidence,
        };
      }
      return target;
    });

    prevBoxesRef.current = smoothed;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (const box of smoothed) {
        const color = getColor(box.className);
        const bx = box.x1 * width;
        const by = box.y1 * height;
        const bw = (box.x2 - box.x1) * width;
        const bh = (box.y2 - box.y1) * height;

        // Draw filled background with low opacity
        ctx.fillStyle = color + '15';
        ctx.fillRect(bx, by, bw, bh);

        // Draw border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(bx, by, bw, bh);

        // Corner accents
        const cornerLen = Math.min(20, bw / 4, bh / 4);
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;

        // Top-left
        ctx.beginPath();
        ctx.moveTo(bx, by + cornerLen);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + cornerLen, by);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(bx + bw - cornerLen, by);
        ctx.lineTo(bx + bw, by);
        ctx.lineTo(bx + bw, by + cornerLen);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(bx, by + bh - cornerLen);
        ctx.lineTo(bx, by + bh);
        ctx.lineTo(bx + cornerLen, by + bh);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(bx + bw - cornerLen, by + bh);
        ctx.lineTo(bx + bw, by + bh);
        ctx.lineTo(bx + bw, by + bh - cornerLen);
        ctx.stroke();

        // Label
        const label = `${box.className} ${(box.confidence * 100).toFixed(0)}%`;
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        const textMetrics = ctx.measureText(label);
        const textWidth = textMetrics.width + 10;
        const textHeight = 20;

        const labelY = by > textHeight + 4 ? by - textHeight - 2 : by + 2;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(bx, labelY, textWidth, textHeight, 3);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, bx + 5, labelY + 14);
      }
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [detections, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`absolute top-0 left-0 pointer-events-none ${className}`}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
