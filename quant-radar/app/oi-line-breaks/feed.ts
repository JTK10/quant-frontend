import type {LineBoard} from './types';

type Ports={
  hidden:()=>boolean;
  read:(signal:AbortSignal)=>Promise<LineBoard>;
  onData:(board:LineBoard)=>void;
  onError:(message:string)=>void;
  onSettled:()=>void;
};

// An immutable historical cut loads once. Filters/rank mode are entirely local.
// A hidden tab defers its initial read; focus storms cannot create parallel reads.
export function createLineArchiveFeed(ports:Ports){
  let stopped=false,loaded=false,inFlight=false;
  let controller:AbortController|undefined;
  const load=async()=>{
    if(stopped||loaded||inFlight||ports.hidden())return;
    inFlight=true;controller=new AbortController();
    try{
      const board=await ports.read(controller.signal);
      if(!stopped){loaded=true;ports.onData(board);}
    }catch(error){
      if(!stopped&&!(error instanceof DOMException&&error.name==='AbortError'))
        ports.onError(error instanceof Error?error.message:'OI line board unavailable');
    }finally{inFlight=false;if(!stopped)ports.onSettled();}
  };
  void load();
  return {visibility:()=>{if(!ports.hidden())void load();},stop:()=>{stopped=true;controller?.abort();}};
}
