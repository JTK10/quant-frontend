// Test preload only: never enabled in deployment. Intercepts only this non-routable test origin.
const originalFetch=globalThis.fetch, values=new Map(), attempts=new Map();
globalThis.fetch=async(input,init)=>{
  if(String(input)!=='https://mock-redis.invalid')return originalFetch(input,init);
  const [op,...a]=JSON.parse(init.body);let result;
  if(op==='GET')result=values.get(a[0])??null;
  else if(op==='SET'){if(a[2]==='NX'&&values.has(a[0]))result=null;else{values.set(a[0],a[1]);result='OK';}}
  else if(op==='EVAL'&&a[0].includes("redis.call('GET'")){result=values.get(a[2])===a[3]?1:0;if(result)values.set(a[2],a[4]);}
  else if(op==='EVAL'){result=(attempts.get(a[2])??0)+1;attempts.set(a[2],result);}
  else if(op==='DEL'){result=attempts.delete(a[0])?1:0;}
  else throw Error('Unsupported mock command');
  return new Response(JSON.stringify({result}),{status:200});
};
