import {istSessionDate, sessionPollingDelay} from '@/utils/sessionPolling';
import type {AurumResponse} from './types';

export const AURUM_POLL_MS = 300000;
const morningClock = new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Kolkata', hourCycle: 'h23', hour: '2-digit', minute: '2-digit'});

export function aurumPollingDelay(date: string, now = Date.now()): number | null {
  if (sessionPollingDelay(date, AURUM_POLL_MS, now) === null) return null;
  const hm = morningClock.format(new Date(now));
  return hm >= '09:14' && hm <= '10:40' ? AURUM_POLL_MS : null;
}

export function preserveAurumBoard(previous: AurumResponse | null, next: AurumResponse): AurumResponse {
  if (previous?.date === next.date && previous.signals.length > 0 && next.signals.length === 0 &&
    !['READY', 'EMPTY'].includes(next.state ?? next.status)) {
    return {...next, signals: previous.signals, asof: previous.asof, stale: true,
      message: `${next.message || next.status} · Last successful same-session signals retained.`};
  }
  return next;
}

type Ports = {
  date: string;
  live: boolean;
  now: () => number;
  hidden: () => boolean;
  setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  read: (date: string, signal: AbortSignal) => Promise<AurumResponse>;
  onReset: (date: string) => void;
  onData: (data: AurumResponse) => void;
  onError: (message: string) => void;
  onSettled: () => void;
};

// One network consumer for the entire board. Filtering and sorting never refetch.
export function createAurumFeed(ports: Ports) {
  let stopped = false, inFlight = false, loaded = false, date = ports.date;
  let lastAttempt = -Infinity, timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const clear = () => {if (timer !== undefined) ports.clearTimer(timer); timer = undefined;};
  const rollDate = () => {
    if (!ports.live) return;
    const today = istSessionDate(ports.now());
    if (today === date) return;
    date = today; loaded = false; lastAttempt = -Infinity; ports.onReset(date);
  };
  const schedule = () => {
    clear();
    if (stopped || ports.hidden() || !ports.live) return;
    const delay = aurumPollingDelay(date, ports.now());
    // A weekend clock check is local only and permits a new IST session rollover.
    timer = ports.setTimer(() => {
      timer = undefined; rollDate();
      if (!loaded || aurumPollingDelay(date, ports.now()) !== null) void load();
      else schedule();
    }, delay ?? 60000);
  };
  const load = async () => {
    if (stopped || ports.hidden() || inFlight) return;
    rollDate();
    if (loaded && (!ports.live || aurumPollingDelay(date, ports.now()) === null || ports.now() - lastAttempt < AURUM_POLL_MS)) {schedule(); return;}
    clear(); loaded = true; inFlight = true; lastAttempt = ports.now();
    controller = new AbortController();
    try {
      const data = await ports.read(date, controller.signal);
      if (data.date !== date || !Array.isArray(data.signals)) throw new Error('Aurum returned a different session or invalid board');
      if (!stopped) ports.onData(data);
    } catch (error) {
      if (!stopped && !(error instanceof DOMException && error.name === 'AbortError')) ports.onError(error instanceof Error ? error.message : 'Aurum feed unavailable');
    } finally {
      inFlight = false;
      if (!stopped) {ports.onSettled(); schedule();}
    }
  };
  const visibility = () => {
    clear();
    if (stopped || ports.hidden()) return;
    rollDate();
    if (!loaded || (ports.live && aurumPollingDelay(date, ports.now()) !== null)) void load();
    else schedule();
  };
  void load();
  return {visibility, stop: () => {stopped = true; clear(); controller?.abort();}};
}
