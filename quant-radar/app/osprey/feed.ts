import {istSessionDate, sessionPollingDelay} from '@/utils/sessionPolling';
import {POLL_MS,type OspreyBoard} from './model';

const clock = new Intl.DateTimeFormat('en-GB',{
  timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
});
type Ports = {
  initialDate?: string; selectedCut?: string; now:()=>number; hidden:()=>boolean;
  setTimer:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>;
  clearTimer:(timer:ReturnType<typeof setTimeout>)=>void;
  read:(date:string,cut:string|undefined,signal:AbortSignal)=>Promise<OspreyBoard>;
  onReset:(date:string)=>void;
  onData:(board:OspreyBoard)=>void;
  onError:(message:string)=>void;
};

export function createOspreyFeed(ports: Ports) {
  let date=ports.initialDate ?? istSessionDate(ports.now());
  let board: OspreyBoard | null = null;
  let stopped=false, finalRead=false, lastAttempt=-Infinity;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let controller:AbortController|undefined;
  const followsSession = !ports.initialDate && !ports.selectedCut;
  const clear = () => {
    if (timer!==undefined) ports.clearTimer(timer);
    timer=undefined;
  };
  function refresh() {
    clear();
    if (stopped || ports.hidden() || controller) return;
    const now=ports.now();
    const today=istSessionDate(now);
    if (followsSession && today!==date) {
      date=today;board=null;lastAttempt=-Infinity;finalRead=false;
      ports.onReset(date);
    }
    const live=followsSession && sessionPollingDelay(date,POLL_MS,now)!==null;
    const time=clock.format(new Date(now));
    const open=time>='09:14' && time<'15:35';
    const closing=time>='15:35' && !finalRead;
    if (!Number.isFinite(lastAttempt) || (live && now-lastAttempt>=POLL_MS && (open || closing))) {
      void load(now,live&&closing);
      return;
    }
    if (followsSession) timer=ports.setTimer(refresh,live&&(open||closing)
      ? Math.max(1000,POLL_MS-(now-lastAttempt)):60000);
  }
  async function load(now:number,closing:boolean) {
    const requested=date;
    lastAttempt=now;
    if (closing) finalRead=true;
    controller=new AbortController();
    try {
      const update=await ports.read(requested,ports.selectedCut,controller.signal);
      if (stopped) return;
      if (update.date!==requested || update.source!=='osprey' || (ports.selectedCut && update.available && update.cut!==ports.selectedCut))
        throw Error('Osprey returned a different session or cut');
      if (board?.available && (!update.available || board.cut>update.cut)) {
        ports.onError('Latest Osprey snapshot unavailable. Showing the last received cut.');
        return;
      }
      board=update;
      ports.onData(update);
      const receipt=ports.now(), time=clock.format(new Date(receipt));
      ports.onError(followsSession && update.available && time>='09:30' && time<'15:35' &&
        receipt-Date.parse(requested+'T'+update.cut+':00+05:30')>=12*60000
        ? 'Osprey source is behind. Showing the last received cut.' : '');
    } catch {
      if (!stopped) ports.onError(board?.available
        ? 'Osprey feed unavailable. Showing the last received cut.' : 'Osprey feed unavailable.');
    } finally {
      controller=undefined;
      refresh();
    }
  }
  ports.onReset(date);
  refresh();
  return {visibility:refresh,stop(){stopped=true;clear();controller?.abort();}};
}
