import { Clock3, Filter, RefreshCw, Search, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

function formatDate(date:string){return new Date(date).toLocaleString([], {weekday:'short', hour:'numeric', minute:'2-digit', second:'2-digit'}).replace(',', '')}
export function EmailList({items,status,onOpen,onRefresh}:{items:any[];status:'scheduled'|'sent';onOpen:(id:string)=>void;onRefresh:()=>void}){
 const [q,setQ]=useState(''); const [searching,setSearching]=useState(false); const [displayItems,setDisplayItems]=useState(items);
 useEffect(()=>setDisplayItems(items),[items]);
 const runSearch=async()=>{if(!q.trim()){onRefresh();return}setSearching(true);try{const results=await api.search(q);setDisplayItems(results);}finally{setSearching(false)}};
 return <main className="flex min-w-0 flex-1 flex-col">
  <div className="flex items-center gap-4 px-10 py-6"><div className="flex h-12 flex-1 items-center gap-3 rounded-full bg-[#f3f6f4] px-5"><Search size={20} className="text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&runSearch()} placeholder="Search" className="w-full bg-transparent text-[17px] outline-none placeholder:text-slate-400"/></div><Filter size={21} className="text-slate-400"/><button onClick={runSearch} title="Refresh" className="text-slate-400"><RefreshCw size={21} className={searching?'animate-spin':''}/></button></div>
  <div className="px-10">{displayItems.length===0?<div className="flex h-[60vh] items-center justify-center text-slate-400">No {status} emails</div>:displayItems.map((email)=><button key={email.id} onClick={()=>onOpen(email.id)} className="flex w-full items-center gap-5 border-b border-slate-100 px-3 py-5 text-left hover:bg-slate-50">
    <div className="w-[230px] shrink-0 text-[17px] text-slate-800">To: {email.recipient}</div><div className="flex min-w-0 flex-1 items-center gap-2"><span className={`rounded-full px-3 py-1 text-sm ${status==='scheduled'?'bg-[#fff0d8] text-[#f07b20]':'bg-[#f0f2f3] text-slate-600'}`}>{status==='scheduled'?<><Clock3 size={13} className="mr-1 inline"/>{formatDate(email.scheduledAt)}</>:'Sent'}</span><span className="truncate text-[17px] font-medium text-slate-800">{email.subject}</span><span className="truncate text-[16px] text-slate-400">- {email.body.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,80)}...</span></div><Star size={21} className="shrink-0 text-slate-300"/>
  </button>)}</div>
 </main>
}
