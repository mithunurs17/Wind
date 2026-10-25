import React,{useEffect,useState}from'react';
import{AreaChart,Area,LineChart,Line,BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid,Legend}from'recharts';
import{Wind,RefreshCw,Download,Activity,AlertCircle,CalendarDays,CheckCircle2}from'lucide-react';
const API=import.meta.env.VITE_API_BASE_URL||'';
const fmt=n=>n==null?'—':Number(n).toLocaleString(undefined,{maximumFractionDigits:1});
function Metric({label,value,unit,sub}){return <div className="metric"><span>{label}</span><strong>{value==null?'—':fmt(value)}{value!=null&&unit?<small> {unit}</small>:null}</strong><p>{sub}</p></div>}
export default function App(){
 const [month,setMonth]=useState('2026-01'),[payload,setPayload]=useState(null),[busy,setBusy]=useState(true),[err,setErr]=useState('');
 async function load(){
  setBusy(true); setErr('');
  try {
    const r = await fetch(`${API}/api/dashboard?month=${month}`);
    const contentType = r.headers.get('content-type') || '';
    if (!r.ok) throw new Error(`API returned ${r.status}`);
    if (!contentType.includes('application/json')) {
      const body = (await r.text()).slice(0, 100).replace(/\\s+/g, ' ');
      throw new Error(`Expected JSON from /api/dashboard, received ${contentType || 'unknown content type'} (${body}). Check the API URL/proxy`);
    }
    setPayload(await r.json());
  } catch (e) {
    setPayload(null);
    setErr(e.message || 'Could not reach the API');
  } finally {
    setBusy(false);
  }
}
 useEffect(()=>{load()},[month]);
 const rows=payload?.intervals||[], daily=payload?.daily||[],m=payload?.metrics||{};
 return <main className="shell">
  <header><div className="brand"><div className="logo"><Wind size={25}/></div><div><b>WIND INSIGHT</b><small>DAY-AHEAD DECISION SUPPORT</small></div></div><div className="head-actions"><label className="month"><CalendarDays size={16}/><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button onClick={load} className="iconbtn" title="Refresh"><RefreshCw size={17}/></button></div></header>
  <section className="hero"><div><div className="eyebrow">UK NATIONAL • WIND POWER</div><h1>Forecast clarity.<br/><em>Better buying decisions.</em></h1><p>Understand renewable generation outlook and quantify forecast error before the day-ahead delivery window.</p><div className="hero-foot"><span><i/> 30-minute settlement intervals</span><span>Analysis period: {month}</span></div></div><div className="hero-art"><div className="orbit o1"/><div className="orbit o2"/><Wind size={116} strokeWidth={.75}/><div className="hero-tag">WIND / FORECAST</div></div></section>
  {payload?.demoMode&&<div className="notice"><AlertCircle size={17}/> DEMO MODE — Elexon could not be reached. Visualized values are synthetic and must not be used for decisions.</div>}
  {err&&<div className="notice"><AlertCircle size={17}/> {err}. Confirm the API is running and retry.</div>}
  <div className="section-head"><div><div className="eyebrow">PERFORMANCE SNAPSHOT</div><h2>Forecast scorecard</h2></div><span className="source"><CheckCircle2 size={15}/> {payload?.demoMode?'Sample series':'Source: Elexon BMRS'}</span></div>
  <section className="metrics">
   <Metric label="Matched intervals" value={m.count} sub="Forecast + actual pairs"/>
   <Metric label="Mean absolute error" value={m.mae} unit="MW" sub="Typical absolute deviation"/>
   <Metric label="Root mean squared error" value={m.rmse} unit="MW" sub="Penalizes large misses"/>
   <Metric label="Forecast bias" value={m.bias} unit="MW" sub="Positive = overforecast"/>
   <Metric label="Weighted abs. percentage error" value={m.wape} unit="%" sub="Absolute error / actual volume"/>
  </section>
  <section className="charts">
   <article className="panel wide"><div className="panel-head"><div><span className="eyebrow">DAILY AGGREGATION</span><h3>Forecast vs actual generation</h3><p>Daily sum across matched half-hour intervals · MW intervals</p></div><span className="legend"><i className="dot blue"/>Forecast <i className="dot mint"/>Actual</span></div>
   <div className="chart">{busy?<div className="loading">Loading generation series…</div>:<ResponsiveContainer width="100%" height="100%"><AreaChart data={daily}><defs><linearGradient id="fc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#729bff" stopOpacity={.3}/><stop offset="100%" stopColor="#729bff" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 4" stroke="#e9edf3"/><XAxis dataKey="date" tickFormatter={v=>v.slice(-2)} tick={{fontSize:11}}/><YAxis tickFormatter={v=>`${Math.round(v/1000)}k`} tick={{fontSize:11}}/><Tooltip formatter={v=>[fmt(v),'']} labelFormatter={v=>`Delivery day ${v}`}/><Legend/><Area type="monotone" dataKey="forecast" name="Forecast" stroke="#527cf4" fill="url(#fc)" strokeWidth={2}/><Area type="monotone" dataKey="actual" name="Actual" stroke="#20b68b" fillOpacity={0} strokeWidth={2}/></AreaChart></ResponsiveContainer>}</div></article>
   <article className="panel"><div className="panel-head"><div><span className="eyebrow">ERROR DISTRIBUTION</span><h3>Daily forecast bias</h3><p>Forecast − actual (MW interval sum)</p></div></div><div className="chart short">{busy?'Loading…':<ResponsiveContainer width="100%" height="100%"><BarChart data={daily.map(x=>({...x,bias:x.forecast-x.actual}))}><CartesianGrid strokeDasharray="3 4" stroke="#e9edf3"/><XAxis dataKey="date" tickFormatter={v=>v.slice(-2)} tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={v=>fmt(v)}/><Bar dataKey="bias" name="Bias" fill="#8b78df" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer>}</div></article>
  </section>
  <section className="panel tablepanel"><div className="panel-head"><div><span className="eyebrow">TRANSPARENCY</span><h3>Interval audit trail</h3><p>Showing {Math.min(48,rows.length)} of {rows.length} matched intervals · first delivery day</p></div><a className="export" href={`${API}/api/export?month=${month}`}><Download size={15}/> Export CSV</a></div>
   <div className="tablewrap"><table><thead><tr><th>Delivery (UTC)</th><th>Forecast published (UTC)</th><th>Forecast MW</th><th>Actual MW</th><th>Error MW</th></tr></thead><tbody>{rows.slice(0,48).map((r,i)=><tr key={r.startTime+i}><td>{new Date(r.startTime).toLocaleString()}</td><td>{new Date(r.publishTime).toLocaleString()}</td><td>{fmt(r.forecast)}</td><td>{fmt(r.actual)}</td><td className={r.error>0?'positive':r.error<0?'negative':''}>{r.error>0?'+':''}{fmt(r.error)}</td></tr>)}</tbody></table>{!busy&&!rows.length&&<div className="empty">No matched intervals found for this month.</div>}</div>
  </section>
  <footer><div className="brand"><div className="logo mini"><Activity size={16}/></div><b>WIND INSIGHT</b></div><span>Decision support prototype · Not a trading instruction</span><span>Data: Elexon BMRS</span></footer>
 </main>
}
