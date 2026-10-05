import type {PallasResponse} from './pallas';

export type PallasRefreshState={key:string;data:PallasResponse|null;error:string};
export type PallasRefreshAction=
  | {type:'reset';key:string}
  | {type:'success';key:string;data:PallasResponse}
  | {type:'failure';key:string;error:string};
export const initialPallasRefresh:PallasRefreshState={key:'',data:null,error:''};
export function pallasRefreshReducer(state:PallasRefreshState,action:PallasRefreshAction):PallasRefreshState {
  if(action.type==='reset')return {key:action.key,data:null,error:''};
  if(action.key!==state.key)return state;
  if(action.type==='success')return {...state,data:action.data,error:''};
  return {...state,error:action.error};
}
export function pallasRefreshView(state:PallasRefreshState,key:string) {
  return state.key===key?{data:state.data,error:state.error}:{data:null,error:''};
}
