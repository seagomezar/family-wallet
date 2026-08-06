import { useEffect, useCallback, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { useTourStore, TOUR_STEPS } from '@/stores/tour';
import { db } from '@/db/schema';
import { cn } from '@/lib/utils';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TourOverlay() {
  const { isActive, currentStep, next, prev, skip, finish } = useTourStore();
  const navigate = useNavigate();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<'top' | 'bottom'>('bottom');
  const [isAnimating, setIsAnimating] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;
  const isSmallViewport = typeof window !== 'undefined' && window.innerHeight < 700;

  // Navigate to the correct route when step changes
  useEffect(() => {
    if (!isActive || !step?.route) return;
    navigate({ to: step.route });
  }, [isActive, currentStep, step?.route, navigate]);

  // Find and measure target element
  const measureTarget = useCallback(() => {
    if (!isActive || !step?.targetSelector) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(step.targetSelector);
    if (!el) {
      setTargetRect(null);
      return;
    }

    // Scroll into view first, then measure after scroll settles
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Use a small delay to let scroll finish before measuring
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const padding = 8;
      setTargetRect({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });

      // Decide tooltip position: prefer above on small viewports
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const minTooltipSpace = isSmallViewport ? 150 : 200;

      if (spaceBelow >= minTooltipSpace) {
        setTooltipPosition('bottom');
      } else if (spaceAbove >= minTooltipSpace) {
        setTooltipPosition('top');
      } else {
        // Not enough space either way — prefer whichever has more
        setTooltipPosition(spaceAbove > spaceBelow ? 'top' : 'bottom');
      }
    });
  }, [isActive, step?.targetSelector, isSmallViewport]);

  useEffect(() => {
    if (!isActive) return;

    // Delay measurement to allow route transition
    setIsAnimating(true);
    const timeout = setTimeout(() => {
      measureTarget();
      setIsAnimating(false);
    }, 350);

    return () => clearTimeout(timeout);
  }, [isActive, currentStep, measureTarget]);

  // Re-measure on resize/scroll
  useEffect(() => {
    if (!isActive) return;

    const handleResize = () => measureTarget();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [isActive, measureTarget]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, currentStep]);

  // Focus trap + ensure tooltip is in viewport
  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      if (tooltipRef.current) {
        tooltipRef.current.focus();
        // Ensure tooltip is fully visible in viewport
        const rect = tooltipRef.current.getBoundingClientRect();
        if (rect.bottom > window.innerHeight) {
          tooltipRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        if (rect.top < 0) {
          tooltipRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [isActive, currentStep]);

  const handleNext = useCallback(async () => {
    if (isLast) {
      await db.settings.put({ key: 'hasSeenTour', value: true });
      finish();
    } else {
      next();
    }
  }, [isLast, finish, next]);

  const handlePrev = useCallback(() => {
    if (!isFirst) prev();
  }, [isFirst, prev]);

  const handleSkip = useCallback(async () => {
    await db.settings.put({ key: 'hasSeenTour', value: true });
    skip();
  }, [skip]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        handleSkip();
      }
    },
    [handleSkip]
  );

  if (!isActive) return null;

  const spotlightStyle = targetRect
    ? {
        clipPath: `polygon(
          0% 0%, 0% 100%, 
          ${targetRect.left}px 100%, 
          ${targetRect.left}px ${targetRect.top}px, 
          ${targetRect.left + targetRect.width}px ${targetRect.top}px, 
          ${targetRect.left + targetRect.width}px ${targetRect.top + targetRect.height}px, 
          ${targetRect.left}px ${targetRect.top + targetRect.height}px, 
          ${targetRect.left}px 100%, 
          100% 100%, 100% 0%
        )`,
      }
    : {};

  const tooltipStyle = (): React.CSSProperties => {
    if (!targetRect) {
      // Centered modal
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxHeight: `${window.innerHeight - 32}px`,
      };
    }

    const tooltipWidth = Math.min(340, window.innerWidth - 32);
    let left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
    // Clamp to viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));

    const viewportHeight = window.innerHeight;
    const gap = 12;

    if (tooltipPosition === 'bottom') {
      const topPos = targetRect.top + targetRect.height + gap;
      const maxH = viewportHeight - topPos - 16;
      return {
        position: 'fixed',
        top: `${topPos}px`,
        left: `${left}px`,
        width: `${tooltipWidth}px`,
        maxHeight: `${Math.max(maxH, 120)}px`,
        overflowY: 'auto',
      };
    }

    const bottomPos = viewportHeight - targetRect.top + gap;
    const maxH = viewportHeight - bottomPos - 16;
    return {
      position: 'fixed',
      bottom: `${bottomPos}px`,
      left: `${left}px`,
      width: `${tooltipWidth}px`,
      maxHeight: `${Math.max(maxH, 120)}px`,
      overflowY: 'auto',
    };
  };

  return createPortal(
    <div
      ref={overlayRef}
      className={cn(
        'fixed inset-0 z-[9999] transition-opacity duration-300',
        isAnimating ? 'opacity-0' : 'opacity-100'
      )}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial guiado"
    >
      {/* Backdrop with spotlight cutout */}
      <div
        className="absolute inset-0 bg-black/60 transition-all duration-300"
        style={spotlightStyle}
      />

      {/* Spotlight ring */}
      {targetRect && (
        <div
          className="absolute rounded-lg ring-2 ring-primary/80 ring-offset-2 transition-all duration-300 pointer-events-none"
          style={{
            top: `${targetRect.top}px`,
            left: `${targetRect.left}px`,
            width: `${targetRect.width}px`,
            height: `${targetRect.height}px`,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={cn(
          'bg-card rounded-xl shadow-2xl border border-border transition-all duration-300',
          isSmallViewport ? 'p-3' : 'p-5',
          isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        )}
        style={tooltipStyle()}
        tabIndex={-1}
        role="alertdialog"
        aria-labelledby="tour-title"
        aria-describedby="tour-desc"
      >
        {/* Progress dots */}
        <div className={cn('flex items-center justify-center gap-1.5', isSmallViewport ? 'mb-2' : 'mb-3')}>
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === currentStep
                  ? 'w-6 bg-primary'
                  : i < currentStep
                    ? 'w-1.5 bg-primary/50'
                    : 'w-1.5 bg-muted-foreground/30'
              )}
            />
          ))}
        </div>

        {/* Content */}
        <h3
          id="tour-title"
          className={cn('font-semibold text-foreground', isSmallViewport ? 'text-sm mb-1' : 'text-base mb-2')}
        >
          {step?.title}
        </h3>
        <p id="tour-desc" className={cn('text-muted-foreground leading-relaxed', isSmallViewport ? 'text-xs mb-3' : 'text-sm mb-4')}>
          {step?.description}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            aria-label="Saltar tutorial"
          >
            Saltar
          </button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent transition-colors"
                aria-label="Paso anterior"
              >
                Anterior
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              aria-label={isLast ? 'Terminar tutorial' : 'Siguiente paso'}
            >
              {isLast ? '¡Empezar!' : 'Siguiente'}
            </button>
          </div>
        </div>

        {/* Step counter */}
        <p className={cn('text-[10px] text-muted-foreground text-center', isSmallViewport ? 'mt-2' : 'mt-3')}>
          Paso {currentStep + 1} de {TOUR_STEPS.length}
        </p>
      </div>
    </div>,
    document.body
  );
}
