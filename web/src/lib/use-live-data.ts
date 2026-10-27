import {useCallback,useEffect,useState} from 'react';
import {apiGet} from './api';
export function useLiveData<T>(path:string){
 const [data,setData]=useState<{path:string;value:T}|null>(null),[error,setError]=useState(''),[updated,setUpdated]=useState<Date|null>(null),[revision,setRevision]=useState(0);
 const refresh=useCallback(()=>setRevision(n=>n+1),[]);
 useEffect(()=>{let alive=true,working=false;
  const load=async()=>{if(working)return;working=true;try{const result=await apiGet<T>(path);if(alive){setData({path,value:result});setError('');setUpdated(new Date());}}catch(e){if(alive)setError(e instanceof Error?e.message:'No se pudo actualizar');}finally{working=false;}};
  const visible=()=>{if(document.visibilityState==='visible')void load();};
  void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},15000);document.addEventListener('visibilitychange',visible);
  return ()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[path,revision]);
 return {data:data?.path===path?data.value:null,error,updated,refresh};
}
