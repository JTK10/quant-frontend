import {istSessionDate, sessionPollingDelay} from '@/utils/sessionPolling';
import {mergeViperCuts, VIPER_POLL_MS, type ViperBoard} from './model';

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

type Ports = {
  initialDate?: string;
  now: () => number;
  hidden: () => boolean;
  setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  read: (date: string, known: string[], signal: AbortSignal) => Promise<ViperBoard>;
  onReset: (date: string) => void;
  onData: (data: ViperBoard) => void;
  onError: (message: string) => void;
};

export function createViperFeed(ports: Ports) {
  let date = ports.initialDate ?? istSessionDate(ports.now());
  let board: ViperBoard | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let lastAttempt = -Infinity;
  let finalRead = false;

  function clear() {
    if (timer !== undefined) ports.clearTimer(timer);
    timer = undefined;
  }

  function refresh() {
    clear();
    if (stopped || ports.hidden() || controller) return;
    const now = ports.now();
    const today = istSessionDate(now);
    if (!ports.initialDate && today !== date) {
      date = today;
      lastAttempt = -Infinity;
      finalRead = false;
      board = null;
      ports.onReset(date);
    }

    const time = clock.format(new Date(now));
    const delay = sessionPollingDelay(date, VIPER_POLL_MS, now);
    const live = !ports.initialDate && delay !== null;
    const sessionOpen = time >= '09:14' && time < '15:35';
    const closingRead = time >= '15:35' && !finalRead;
    const cadenceReached = now - lastAttempt >= VIPER_POLL_MS;
    if (!Number.isFinite(lastAttempt) || (live && cadenceReached && (sessionOpen || closingRead))) {
      void load(now, live && closingRead);
      return;
    }

    if (!ports.initialDate) {
      const wait = live && sessionOpen
        ? Math.max(1000, VIPER_POLL_MS - (now - lastAttempt))
        : 60000;
      timer = ports.setTimer(refresh, wait);
    }
  }

  async function load(now: number, closing: boolean) {
    const requested = date;
    lastAttempt = now;
    if (closing) finalRead = true;
    controller = new AbortController();
    try {
      const update = await ports.read(requested, board?.cuts.map(item => item.cut) ?? [], controller.signal);
      if (update.date !== requested || update.source !== 'viper-signal') throw new Error('Viper returned a different session');
      if (!stopped) {
        board = mergeViperCuts(board, update);
        ports.onData(board);
        const receiptTime = ports.now();
        const receiptClock = clock.format(new Date(receiptTime));
        const latestCut = board.lastCut;
        if (!ports.initialDate && latestCut && requested === istSessionDate(receiptTime)
          && receiptClock >= '09:30' && receiptClock < '15:35'
          && receiptTime - Date.parse(requested + 'T' + latestCut + ':00+05:30') >= 12 * 60000) {
          ports.onError('Viper source is behind the expected five-minute cadence');
        }
      }
    } catch (error) {
      if (!stopped) ports.onError(error instanceof Error ? error.message : 'Viper feed unavailable');
    } finally {
      controller = undefined;
      refresh();
    }
  }

  ports.onReset(date);
  refresh();
  return {
    visibility: refresh,
    stop() {
      stopped = true;
      clear();
      controller?.abort();
    },
  };
}
