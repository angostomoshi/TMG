import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

export default function useIdleLogout({ idleMs, warningMs, onIdle, enabled = true }) {
  const [warningSecondsLeft, setWarningSecondsLeft] = useState(null);
  const warningTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const clearTimers = useCallback(() => {
    clearTimeout(warningTimerRef.current);
    clearTimeout(logoutTimerRef.current);
    clearInterval(countdownIntervalRef.current);
  }, []);

  const startTimers = useCallback(() => {
    clearTimers();
    setWarningSecondsLeft(null);

    warningTimerRef.current = setTimeout(() => {
      const warningDurationSec = Math.round(warningMs / 1000);
      setWarningSecondsLeft(warningDurationSec);

      countdownIntervalRef.current = setInterval(() => {
        setWarningSecondsLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
      }, 1000);

      logoutTimerRef.current = setTimeout(() => {
        clearInterval(countdownIntervalRef.current);
        onIdle();
      }, warningMs);
    }, idleMs - warningMs);
  }, [idleMs, warningMs, onIdle, clearTimers]);

  const stayLoggedIn = useCallback(() => {
    startTimers();
  }, [startTimers]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setWarningSecondsLeft(null);
      return undefined;
    }

    startTimers();

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, startTimers));

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, startTimers));
      clearTimers();
    };
  }, [enabled, startTimers]);

  return { warningSecondsLeft, stayLoggedIn };
}
