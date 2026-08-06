import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { useTourStore } from '@/stores/tour';

/**
 * Checks if the user has seen the tour. If not, starts it automatically.
 * Must be rendered inside the app tree.
 */
export function TourAutoStart() {
  const hasStarted = useRef(false);
  const start = useTourStore((s) => s.start);
  const isActive = useTourStore((s) => s.isActive);

  const hasSeenTour = useLiveQuery(async () => {
    const setting = await db.settings.get('hasSeenTour');
    return setting?.value === true;
  });

  useEffect(() => {
    // Only auto-start once, and only if user hasn't seen it and tour isn't already active
    if (hasSeenTour === false && !hasStarted.current && !isActive) {
      hasStarted.current = true;
      // Small delay to let the app render first
      const timer = setTimeout(() => {
        start();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [hasSeenTour, start, isActive]);

  return null;
}
