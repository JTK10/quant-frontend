// Process-local, authenticated feed reuse. Never serves expired results on error.
// Each caller owns its TTL; count and byte limits also bound retained memory.
export function resultCache<T>({maxEntries=24,maxBytes=16*1024*1024,size=(value:T)=>Buffer.byteLength(JSON.stringify(value))}={}) {
  const values=new Map<string,{value:T;expires:number;bytes:number}>();
  const pending=new Map<string,Promise<T>>();
  let bytes=0;
  const remove=(key:string)=>{const old=values.get(key);if(old)bytes-=old.bytes;values.delete(key);};
  return (key:string,ttl:number,load:()=>Promise<T>):Promise<T>=>{
    const now=Date.now();
    for(const [k,v] of values)if(v.expires<=now)remove(k);
    const hit=values.get(key);
    if(hit){values.delete(key);values.set(key,hit);return Promise.resolve(hit.value);}
    const shared=pending.get(key);if(shared)return shared;
    const task=Promise.resolve().then(load).then(value=>{
      const weight=size(value);
      if(ttl>0&&weight<=maxBytes){
        while(values.size>=maxEntries||bytes+weight>maxBytes)remove(values.keys().next().value!);
        values.set(key,{value,expires:Date.now()+ttl,bytes:weight});bytes+=weight;
      }
      return value;
    }).finally(()=>pending.delete(key));
    pending.set(key,task);return task;
  };
}
