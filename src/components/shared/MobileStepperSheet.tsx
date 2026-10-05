'use client';

import * as React from 'react';
import { useIsMobile } from './ResponsiveDialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StepperStep {
  key: string;
  label: string;
  icon?: React.ElementType;
}

export interface MobileStepperSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  steps: StepperStep[];
  /** Render function: receives the current step key and returns content */
  children: (stepKey: string, stepIndex: number) => React.ReactNode;
  /** Primary action button rendered on the last step */
  actionLabel?: string;
  actionLoading?: boolean;
  onAction?: () => void;
  /** Called when the sheet is closed — use to reset state if needed */
  onClose?: () => void;
  headerExtra?: React.ReactNode;
  className?: string;
  /** Optional: disable dragging to dismiss (default: false) */
  dismissible?: boolean;
}

// ---------------------------------------------------------------------------
// MobileStepperSheet
// ---------------------------------------------------------------------------
export function MobileStepperSheet({
  open,
  onOpenChange,
  title,
  description,
  steps,
  children,
  actionLabel,
  actionLoading = false,
  onAction,
  onClose,
  headerExtra,
  className,
  dismissible = true,
}: MobileStepperSheetProps) {
  const isMobile = useIsMobile();
  const [activeStep, setActiveStep] = React.useState(0);

  // Reset step when opened
  React.useEffect(() => {
    if (open) {
      setActiveStep(0);
    }
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && onClose) onClose();
    onOpenChange(nextOpen);
  };

  const goNext = () => {
    if (activeStep < steps.length - 1) setActiveStep(s => s + 1);
  };

  const goBack = () => {
    if (activeStep > 0) setActiveStep(s => s - 1);
  };

  const isLastStep = activeStep === steps.length - 1;
  const isFirstStep = activeStep === 0;
  const currentStep = steps[activeStep];

  // Don't render anything on desktop — let the parent use a regular Dialog
  if (!isMobile) return null;

  return (
    <Drawer
      open={open}
      onOpenChange={handleOpenChange}
      dismissible={dismissible}
      handleOnly
    >
      <DrawerContent
        className={cn(
          'max-h-[94vh]',
          'rounded-t-2xl',
          className,
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Step indicator bar */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-1.5">
            {steps.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === activeStep;
              const isCompleted = i < activeStep;
              return (
                <React.Fragment key={step.key}>
                  <button
                    onClick={() => setActiveStep(i)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all',
                      isActive && 'bg-primary text-primary-foreground shadow-sm',
                      isCompleted && 'bg-primary/15 text-primary',
                      !isActive && !isCompleted && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                  {i < steps.length - 1 && (
                    <div className="flex-1 h-0.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-300',
                          isCompleted ? 'bg-primary w-full' : 'w-0',
                        )}
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Header */}
        <DrawerHeader className="px-4 pt-2 pb-1">
          <DrawerTitle className="text-base leading-tight flex items-center gap-2">
            {currentStep.icon && React.createElement(currentStep.icon, { className: 'h-4 w-4 text-primary' })}
            {title}
          </DrawerTitle>
          {description && <DrawerDescription className="text-sm">{description}</DrawerDescription>}
          {headerExtra}
        </DrawerHeader>

        {/* Step content — scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {children(currentStep.key, activeStep)}
        </div>

        {/* Navigation footer */}
        <div
          className="border-t bg-background px-4 pt-3 flex items-center gap-2"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {!isFirstStep && (
            <Button
              variant="outline"
              size="lg"
              className="flex-1 h-12 rounded-xl"
              onClick={goBack}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {steps[activeStep - 1]?.label || 'Back'}
            </Button>
          )}

          {isLastStep ? (
            <Button
              size="lg"
              className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={actionLoading}
              onClick={onAction}
            >
              {actionLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                actionLabel || 'Submit'
              )}
            </Button>
          ) : (
            <Button
              size="lg"
              className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/90"
              onClick={goNext}
            >
              {steps[activeStep + 1]?.label || 'Next'}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
