import React, { useEffect, useRef, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  Wind, RefreshCw, Download, Activity, AlertCircle, CalendarDays,
  CheckCircle2, Sun, Moon, Gauge, TrendingUp, Scale,
} from 'lucide-react';
import WindField from './fx/WindField';
import Turbine from './fx/Turbine';
import { startPointer } from './fx/pointer';
import { useTilt, useMagnetic, useTypewriter } from './fx/hooks';

const API = import.meta.env.VITE_API_BASE_URL || '';
const fmt = n => (n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 }));

/* ---------- chart palettes (SVG colours are set in JS so they follow the theme) ---------- */
const PALETTE = {
  light: {
    grid: '#e3e9f3', axis: '#8693a8', forecast: '#4f7cff', actual: '#12b886',
    over: '#f2894a', under: '#12b886', cursor: 'rgba(79,124,255,.07)', zero: '#9aa7bd', dotRing: '#ffffff',
  },
  dark: {
    grid: '#223049', axis: '#7f90b0', forecast: '#7ea4ff', actual: '#35e0b0',
    over: '#ff9d66', under: '#35e0b0', cursor: 'rgba(126,164,255,.10)', zero: '#5d6f91', dotRing: '#0f1a2e',
  },
};

/* ---------- theme ---------- */
function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('wind-theme', theme); } catch (e) { /* storage unavailable */ }
  }, [theme]);
  // follow OS changes until the user picks a theme manually
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => {
      try { if (localStorage.getItem('wind-theme')) return; } catch (err) { /* ignore */ }
      setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  const toggle = () => {
    const root = document.documentElement;
    root.classList.add('theming'); // enables a short colour cross-fade
    setTheme(t => (t === 'dark' ? 'light' : 'dark'));
    window.setTimeout(() => root.classList.remove('theming'), 450);
  };
  return [theme, toggle];
}

function ThemeToggle({ theme, onToggle }) {
  const dark = theme === 'dark';
  const ref = useRef(null);
  useMagnetic(ref, 0.22);
  return (
    <button
      ref={ref}
      type="button"
      className={`theme-toggle ${dark ? 'is-dark' : 'is-light'}`}
      onClick={onToggle}
      role="switch"
      aria-checked={dark}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`}
      title={`Switch to ${dark ? 'light' : 'dark'} theme`}
    >
      <span className="tt-icon tt-sun"><Sun size={14} /></span>
      <span className="tt-icon tt-moon"><Moon size={14} /></span>
      <span className="tt-thumb" />
    </button>
  );
}

/* ---------- on-screen animation helpers ---------- */
function useInView(once = true, threshold = 0.18) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); if (once) io.disconnect(); }
      else if (!once) setSeen(false);
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [once, threshold]);
  return [ref, seen];
}

function Reveal({ as: Tag = 'div', delay = 0, tilt = 0, className = '', children, ...rest }) {
  const [ref, seen] = useInView();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!seen) return undefined;
    const t = window.setTimeout(() => setSettled(true), delay + 900);
    return () => window.clearTimeout(t);
  }, [seen, delay]);
  useTilt(ref, tilt);
  return (
    <Tag
      ref={ref}
      className={`reveal ${seen ? 'in' : ''} ${settled ? 'settled' : ''} ${tilt ? 'tilt' : ''} ${className}`}
      style={{ '--d': `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

function ScrollProgress() {
  const bar = useRef(null);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);
  return <div className="progress" aria-hidden="true"><i ref={bar} /></div>;
}

function Magnetic({ as: Tag = 'button', strength = 0.3, children, ...rest }) {
  const ref = useRef(null);
  useMagnetic(ref, strength);
  return <Tag ref={ref} {...rest}>{children}</Tag>;
}

function CountUp({ value, duration = 1100 }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (value == null || Number.isNaN(Number(value))) { setShown(value); return undefined; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return undefined; }
    const start = performance.now();
    const a = from.current, b = Number(value);
    let raf;
    const tick = now => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(a + (b - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{fmt(shown)}</>;
}

/* ---------- small components ---------- */
function Metric({ label, value, unit, sub, delay, accent }) {
  return (
    <Reveal className={`metric accent-${accent}`} delay={delay} tilt={7}>
      <span>{label}</span>
      <strong>
        {value == null ? '—' : <CountUp value={value} />}
        {value != null && unit ? <small> {unit}</small> : null}
      </strong>
      <p>{sub}</p>
    </Reveal>
  );
}

function ChartSkeleton() {
  return (
    <div className="skeleton" aria-label="Loading chart">
      {Array.from({ length: 12 }).map((_, i) => (
        <i key={i} style={{ height: `${28 + ((i * 37) % 60)}%`, animationDelay: `${i * 70}ms` }} />
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label, mode }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="tip">
      <div className="tip-title">{mode === 'bias' ? 'Bias · ' : 'Delivery day '}{label}</div>
      {payload.map(p => (
        <div className="tip-row" key={p.dataKey}>
          <i style={{ background: p.color || p.stroke || p.fill }} />
          <span>{p.name}</span>
          <b>{mode === 'bias' && p.value > 0 ? '+' : ''}{fmt(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

function Insights({ daily, m }) {
  if (!daily.length) return null;
  const worst = daily.reduce((a, d) => (Math.abs(d.forecast - d.actual) > Math.abs(a.forecast - a.actual) ? d : a), daily[0]);
  const wb = worst.forecast - worst.actual;
  const over = daily.filter(d => d.forecast > d.actual).length;
  const acc = m.wape == null ? null : Math.max(0, 100 - m.wape);
  const items = [
    { Icon: Gauge, label: 'Tracking accuracy', value: acc == null ? '—' : `${acc.toFixed(1)}%`, note: '100 − weighted abs. % error', a: 'mint' },
    { Icon: TrendingUp, label: 'Largest daily miss', value: `${fmt(Math.abs(wb))} MW`, note: `${worst.date} · ${wb > 0 ? 'over' : 'under'}forecast`, a: 'amber' },
    { Icon: Scale, label: 'Over / under days', value: `${over} / ${daily.length - over}`, note: 'Days forecast above / below actual', a: 'blue' },
  ];
  return (
    <section className="insights">
      {items.map((it, i) => (
        <Reveal className={`insight accent-${it.a}`} delay={i * 80} key={it.label}>
          <div className="ins-ico"><it.Icon size={18} /></div>
          <div><span>{it.label}</span><strong>{it.value}</strong><p>{it.note}</p></div>
        </Reveal>
      ))}
    </section>
  );
}

/* ---------- app ---------- */
export default function App() {
  const [month, setMonth] = useState('2026-01');
  const [payload, setPayload] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [theme, toggleTheme] = useTheme();
  const typed = useTypewriter([
    'Quantify forecast error before the day-ahead window.',
    'Compare 30-minute forecasts with settled actuals.',
    'Spot over- and under-forecast days at a glance.',
  ]);
  useEffect(() => { startPointer(); }, []);
  const c = PALETTE[theme];

  async function load() {
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
  useEffect(() => { load(); }, [month]);

  const rows = payload?.intervals || [];
  const daily = payload?.daily || [];
  const m = payload?.metrics || {};
  const biasData = daily.map(x => ({ ...x, bias: x.forecast - x.actual }));

  const [mainRef, mainSeen] = useInView(true, 0.2);
  const [biasRef, biasSeen] = useInView(true, 0.2);
  const axisTick = size => ({ fontSize: size, fill: c.axis, fontFamily: 'DM Mono, monospace' });

  return (
    <main className="shell">
      <ScrollProgress />
      <div className="bg-glow" aria-hidden="true"><i className="g1" /><i className="g2" /></div>

      <header className="top">
        <div className="brand">
          <div className="logo"><Wind size={25} /></div>
          <div><b>WIND INSIGHT</b><small>DAY-AHEAD DECISION SUPPORT</small></div>
        </div>
        <div className="head-actions">
          <label className="month"><CalendarDays size={16} /><input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
          <Magnetic onClick={load} className={`iconbtn ${busy ? 'spin' : ''}`} title="Refresh" aria-label="Refresh data" strength={0.22}><RefreshCw size={17} /></Magnetic>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <section className="hero">
        <WindField />
        <div className="hero-copy">
          <div className="eyebrow rise" style={{ '--d': '0ms' }}>UK NATIONAL • WIND POWER</div>
          <h1 className="rise" style={{ '--d': '90ms' }}>Forecast clarity.<br /><em>Better buying decisions.</em></h1>
          <p className="rise" style={{ '--d': '180ms' }}>Understand renewable generation outlook and quantify forecast error before the day-ahead delivery window.</p>
          <div className="typed rise" style={{ '--d': '240ms' }} aria-hidden="true"><b>›</b> {typed}<i className="caret" /></div>
          <div className="hero-foot rise" style={{ '--d': '300ms' }}>
            <span><i /> 30-minute settlement intervals</span>
            <span>Analysis period: {month}</span>
          </div>
        </div>
        <Turbine />
        <div className="hero-hint" aria-hidden="true"><span className="mouse"><i /></span> Move your cursor to steer the wind</div>
      </section>

      {payload?.demoMode && <div className="notice"><AlertCircle size={17} /> DEMO MODE — Elexon could not be reached. Visualized values are synthetic and must not be used for decisions.</div>}
      {err && <div className="notice"><AlertCircle size={17} /> {err}. Confirm the API is running and retry.</div>}

      <Reveal className="section-head">
        <div><div className="eyebrow">PERFORMANCE SNAPSHOT</div><h2>Forecast scorecard</h2></div>
        <span className="source"><CheckCircle2 size={15} /> {payload?.demoMode ? 'Sample series' : 'Source: Elexon BMRS'}</span>
      </Reveal>

      <section className="metrics">
        <Metric label="Matched intervals" value={m.count} sub="Forecast + actual pairs" delay={0} accent="blue" />
        <Metric label="Mean absolute error" value={m.mae} unit="MW" sub="Typical absolute deviation" delay={70} accent="mint" />
        <Metric label="Root mean squared error" value={m.rmse} unit="MW" sub="Penalizes large misses" delay={140} accent="violet" />
        <Metric label="Forecast bias" value={m.bias} unit="MW" sub="Positive = overforecast" delay={210} accent="amber" />
        <Metric label="Weighted abs. percentage error" value={m.wape} unit="%" sub="Absolute error / actual volume" delay={280} accent="rose" />
      </section>

      {!busy && <Insights daily={daily} m={m} />}

      <section className="charts">
        <Reveal as="article" className="panel wide" delay={0} tilt={1.6}>
          <div className="panel-head">
            <div>
              <span className="eyebrow">DAILY AGGREGATION</span>
              <h3>Forecast vs actual generation</h3>
              <p>Daily sum across matched half-hour intervals · MW intervals</p>
            </div>
            <span className="legend"><i className="dot blue" />Forecast <i className="dot mint" />Actual</span>
          </div>
          <div className="chart" ref={mainRef}>
            {busy || !mainSeen ? <ChartSkeleton /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.forecast} stopOpacity={theme === 'dark' ? .42 : .30} />
                      <stop offset="100%" stopColor={c.forecast} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ac" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.actual} stopOpacity={theme === 'dark' ? .26 : .18} />
                      <stop offset="100%" stopColor={c.actual} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke={c.grid} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={v => v.slice(-2)} tick={axisTick(11)} axisLine={false} tickLine={false} tickMargin={8} />
                  <YAxis tickFormatter={v => `${Math.round(v / 1000)}k`} tick={axisTick(11)} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.axis, strokeDasharray: '3 4', strokeOpacity: .6 }} />
                  <Area type="monotone" dataKey="forecast" name="Forecast" stroke={c.forecast} fill="url(#fc)" strokeWidth={2.5}
                    activeDot={{ r: 5, stroke: c.dotRing, strokeWidth: 2, fill: c.forecast }}
                    animationDuration={1400} animationEasing="ease-out" />
                  <Area type="monotone" dataKey="actual" name="Actual" stroke={c.actual} fill="url(#ac)" strokeWidth={2.5}
                    activeDot={{ r: 5, stroke: c.dotRing, strokeWidth: 2, fill: c.actual }}
                    animationDuration={1700} animationBegin={200} animationEasing="ease-out" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Reveal>

        <Reveal as="article" className="panel" delay={120} tilt={2.2}>
          <div className="panel-head">
            <div>
              <span className="eyebrow">ERROR DISTRIBUTION</span>
              <h3>Daily forecast bias</h3>
              <p>Forecast − actual (MW interval sum)</p>
            </div>
            <span className="legend"><i className="dot amber" />Over <i className="dot mint" />Under</span>
          </div>
          <div className="chart short" ref={biasRef}>
            {busy || !biasSeen ? <ChartSkeleton /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={biasData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="22%">
                  <defs>
                    <linearGradient id="over" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.over} stopOpacity={1} />
                      <stop offset="100%" stopColor={c.over} stopOpacity={.45} />
                    </linearGradient>
                    <linearGradient id="under" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor={c.under} stopOpacity={.45} />
                      <stop offset="100%" stopColor={c.under} stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke={c.grid} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={v => v.slice(-2)} tick={axisTick(10)} axisLine={false} tickLine={false} tickMargin={8} />
                  <YAxis tick={axisTick(10)} axisLine={false} tickLine={false} width={44} tickFormatter={v => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                  <Tooltip content={<ChartTooltip mode="bias" />} cursor={{ fill: c.cursor }} />
                  <ReferenceLine y={0} stroke={c.zero} strokeWidth={1.2} />
                  <Bar dataKey="bias" name="Bias" radius={[5, 5, 5, 5]} animationDuration={1200} animationEasing="ease-out">
                    {biasData.map((d, i) => <Cell key={d.date || i} fill={d.bias >= 0 ? 'url(#over)' : 'url(#under)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Reveal>
      </section>

      <Reveal as="section" className="panel tablepanel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">TRANSPARENCY</span>
            <h3>Interval audit trail</h3>
            <p>Showing {Math.min(48, rows.length)} of {rows.length} matched intervals · first delivery day</p>
          </div>
          <Magnetic as="a" className="export" href={`${API}/api/export?month=${month}`} strength={0.25}><Download size={15} /> Export CSV</Magnetic>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Delivery (UTC)</th><th>Forecast published (UTC)</th><th>Forecast MW</th><th>Actual MW</th><th>Error MW</th></tr></thead>
            <tbody>
              {rows.slice(0, 48).map((r, i) => (
                <tr key={r.startTime + i}>
                  <td>{new Date(r.startTime).toLocaleString()}</td>
                  <td>{new Date(r.publishTime).toLocaleString()}</td>
                  <td>{fmt(r.forecast)}</td>
                  <td>{fmt(r.actual)}</td>
                  <td className={r.error > 0 ? 'positive' : r.error < 0 ? 'negative' : ''}>{r.error > 0 ? '+' : ''}{fmt(r.error)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!busy && !rows.length && <div className="empty">No matched intervals found for this month.</div>}
        </div>
      </Reveal>

      <footer>
        <div className="brand"><div className="logo mini"><Activity size={16} /></div><b>WIND INSIGHT</b></div>
        <span>Decision support prototype · Not a trading instruction</span>
        <span>Data: Elexon BMRS</span>
      </footer>
    </main>
  );
}