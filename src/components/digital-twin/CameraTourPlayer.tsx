'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, RotateCcw, Volume2, VolumeX, Maximize, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface TourStep {
  name: string;
  cameraPosition: { x: number; y: number; z: number };
  cameraTarget: { x: number; y: number; z: number };
  cameraFov?: number;
  duration?: number;
  narration?: string;
}

interface InspectionTour {
  id: string;
  name: string;
  description?: string;
  steps: string; // JSON string
  estimatedTime: number;
  difficulty: string;
  isPublished: boolean;
}

export interface CameraTourPlayerProps {
  tour: InspectionTour;
  isActive: boolean;
  onStepChange?: (step: TourStep, index: number) => void;
  onComplete?: () => void;
  onExit?: () => void;
}

export function CameraTourPlayer({ tour, isActive, onStepChange, onComplete, onExit }: CameraTourPlayerProps) {
  const steps: TourStep[] = tour.steps ? JSON.parse(tour.steps) : [];
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStepData = steps[currentStep];

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isPlaying && isActive && currentStepData) {
      clearTimer();
      const duration = (currentStepData.duration || 3) * 1000;
      const startTime = Date.now() - (progress / 100) * duration;

      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(100, (elapsed / duration) * 100);
        setProgress(pct);

        if (pct >= 100) {
          if (currentStep < steps.length - 1) {
            const next = currentStep + 1;
            setCurrentStep(next);
            setProgress(0);
            onStepChange?.(steps[next], next);
          } else {
            setIsPlaying(false);
            onComplete?.();
          }
        }
      }, 50);
    }
    return clearTimer;
  }, [isPlaying, currentStep, isActive]);

  useEffect(() => {
    if (isActive && currentStepData) {
      onStepChange?.(currentStepData, currentStep);
    }
  }, [isActive, currentStep]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const goToStep = (idx: number) => {
    clearTimer();
    setCurrentStep(idx);
    setProgress(0);
    if (isPlaying) setIsPlaying(false);
    onStepChange?.(steps[idx], idx);
  };
  const restart = () => {
    clearTimer();
    setCurrentStep(0);
    setProgress(0);
    setIsPlaying(false);
  };
  const skip = () => {
    if (currentStep < steps.length - 1) {
      clearTimer();
      const next = currentStep + 1;
      setCurrentStep(next);
      setProgress(0);
      onStepChange?.(steps[next], next);
    }
  };
  const prev = () => {
    if (currentStep > 0) {
      clearTimer();
      const prevIdx = currentStep - 1;
      setCurrentStep(prevIdx);
      setProgress(0);
      onStepChange?.(steps[prevIdx], prevIdx);
    }
  };

  if (!isActive || !currentStepData) return null;

  const difficultyColors: Record<string, string> = { basic: 'bg-emerald-100 text-emerald-700', intermediate: 'bg-amber-100 text-amber-700', advanced: 'bg-red-100 text-red-700' };

  return (
    <div className="absolute bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <Card className="border shadow-xl">
        <CardContent className="p-3 space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-semibold truncate">{tour.name}</p>
              <Badge variant="secondary" className={cn('text-[10px] shrink-0', difficultyColors[tour.difficulty])}>{tour.difficulty}</Badge>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onExit}><Maximize className="h-3.5 w-3.5" /></Button>
          </div>

          {/* Progress bar */}
          <Slider value={[progress]} max={100} step={1} onValueChange={([v]) => setProgress(v)} className="cursor-pointer" />

          {/* Step info */}
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Step {currentStep + 1} of {steps.length}</p>
              <p className="text-sm font-medium truncate">{currentStepData.name}</p>
              {currentStepData.narration && !muted && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{currentStepData.narration}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums shrink-0 ml-2">
              {Math.ceil((currentStepData.duration || 3) * (1 - progress / 100))}s
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={restart}><RotateCcw className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prev} disabled={currentStep === 0}><SkipBack className="h-4 w-4" /></Button>
            <Button size="icon" className="h-10 w-10 rounded-full" onClick={togglePlay}>
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={skip} disabled={currentStep >= steps.length - 1}><SkipForward className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMuted(!muted)}>
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          </div>

          {/* Step dots */}
          <div className="flex justify-center gap-1">
            {steps.map((_, i) => (
              <button key={i} className={cn('h-1.5 rounded-full transition-all', i === currentStep ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30')} onClick={() => goToStep(i)} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
