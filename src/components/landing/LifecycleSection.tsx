"use client";
import { useEffect, useRef, useState } from "react";

const STAGES = [
  { id:"evaluate", n:"1", title:"Evaluate", short:"Where am I?",       color:"#00d9ff", desc:"Assess skills, gaps, and market fit. Get an honest baseline before making any moves." },
  { id:"advise",   n:"2", title:"Advise",   short:"What should I do?", color:"#00ff88", desc:"AI-powered path recommendations tailored to your background, goals, and the current market." },
  { id:"learn",    n:"3", title:"Learn",    short:"Fill the gaps.",     color:"#a0f080", desc:"A curated learning path — certifications, projects, and skills — timed to your next target role." },
  { id:"act",      n:"4", title:"Act",      short:"Execute.",           color:"#ffff00", desc:"Apply, network, build. Cover letters, outreach drafts, and offer negotiation — ready to send." },
  { id:"coach",    n:"5", title:"Coach",    short:"Get better.",        color:"#ffa366", desc:"Feedback, interview prep, and resume refinement — continuously optimised as your cycle progresses." },
  { id:"achieve",  n:"6", title:"Achieve",  short:"Land it. Repeat.",   color:"#ff6b6b", desc:"Hit the milestone. Then the system loops — new goals, new gaps, new cycle. The OS never stops." },
];

function CycleRing({ activeIndex, onSelect }: { activeIndex: number; onSelect: (i: number) => void }) {
  const cx = 250, cy = 250, r = 175;
  const nodePositions = STAGES.map((_, i) => {
    const angle = (i / STAGES.length) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  function arcPath(from: number, to: number) {
    const a = nodePositions[from], b = nodePositions[to];
    return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
  }

  return (
    <svg viewBox="0 0 500 500" width="100%" style={{ maxWidth:480, margin:"0 auto", display:"block" }}>
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="var(--neutral-400)" />
        </marker>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--neutral-200)" strokeWidth="2" strokeDasharray="6 4" />

      {STAGES.map((_, i) => {
        const next = (i + 1) % STAGES.length;
        const isActive = i === activeIndex;
        return (
          <path key={`arc-${i}`} d={arcPath(i, next)} fill="none"
            stroke={isActive ? STAGES[i].color : "var(--neutral-300)"}
            strokeWidth={isActive ? 3 : 1.5}
            markerEnd="url(#arrowhead)"
            style={{ transition:"all 0.3s" }} />
        );
      })}

      <text x={cx} y={cy - 12} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--neutral-600)">Career</text>
      <text x={cx} y={cy + 8}  textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--neutral-600)">Operating</text>
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--neutral-600)">System</text>
      <text x={cx} y={cy + 48} textAnchor="middle" fontSize="10" fill="var(--neutral-400)">↻ continuous loop</text>

      {STAGES.map((s, i) => {
        const pos = nodePositions[i];
        const isActive = i === activeIndex;
        return (
          <g key={s.id} onClick={() => onSelect(i)} style={{ cursor:"pointer" }}>
            <circle cx={pos.x} cy={pos.y} r={isActive ? 34 : 28}
              fill={isActive ? s.color : "var(--neutral-100)"}
              stroke={s.color} strokeWidth={isActive ? 0 : 2.5}
              filter={isActive ? "url(#glow)" : undefined}
              style={{ transition:"all 0.3s" }} />
            <text x={pos.x} y={pos.y - 5} textAnchor="middle"
              fontSize={isActive ? "11" : "10"} fontWeight="800"
              fill={isActive ? "#fff" : s.color}
              style={{ transition:"all 0.3s", userSelect:"none" }}>{s.n}</text>
            <text x={pos.x} y={pos.y + 9} textAnchor="middle"
              fontSize={isActive ? "9" : "8.5"} fontWeight="600"
              fill={isActive ? "#fff" : "var(--neutral-700)"}
              style={{ transition:"all 0.3s", userSelect:"none" }}>{s.title}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function LifecycleSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setActiveIndex(prev => (prev + 1) % STAGES.length), 2800);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  function pauseRotation() { if (intervalRef.current) clearInterval(intervalRef.current); }
  function resumeRotation() {
    intervalRef.current = setInterval(() => setActiveIndex(prev => (prev + 1) % STAGES.length), 2800);
  }

  const active = STAGES[activeIndex];

  return (
    <section id="lifecycle" style={{ padding:"6rem 3rem", background:"linear-gradient(135deg,var(--neutral-100) 0%,#f8fcff 100%)", textAlign:"center" }}>
      <div ref={ref} style={{ maxWidth:1200, margin:"0 auto" }}>
        <div style={{ marginBottom:"1rem", display:"inline-block", background:"var(--primary)", color:"#fff", padding:"0.25rem 1rem", borderRadius:"2rem", fontSize:"0.85rem", fontWeight:600, textTransform:"uppercase", letterSpacing:"1px" }}>
          How it works
        </div>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"1rem", color:"var(--neutral-900)", marginTop:"0.75rem" }}>
          Six stages. One loop. Real outcomes.
        </h2>
        <p style={{ fontSize:"1.1rem", color:"var(--neutral-700)", marginBottom:"3.5rem", maxWidth:600, marginLeft:"auto", marginRight:"auto" }}>
          Unlike advice-only tools, iCareerOS runs a continuous cycle — each stage feeding the next until you hit your milestone, then resets for your next level.
        </p>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4rem", alignItems:"center", maxWidth:1000, margin:"0 auto" }}
          onMouseEnter={pauseRotation} onMouseLeave={resumeRotation}>

          <CycleRing activeIndex={activeIndex} onSelect={setActiveIndex} />

          <div style={{ textAlign:"left" }}>
            <div style={{ marginBottom:"2rem" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"1rem", marginBottom:"1rem" }}>
                <div style={{ width:56, height:56, borderRadius:"50%", background:active.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"1.5rem", color:"#fff", boxShadow:`0 4px 20px ${active.color}60`, flexShrink:0, transition:"all 0.3s" }}>
                  {active.n}
                </div>
                <div>
                  <div style={{ fontSize:"0.8rem", fontWeight:600, color:"var(--neutral-500)", textTransform:"uppercase", letterSpacing:"1px" }}>Stage {active.n} of 6</div>
                  <h3 style={{ fontSize:"1.8rem", fontWeight:800, color:"var(--neutral-900)", margin:0 }}>{active.title}</h3>
                </div>
              </div>
              <div style={{ fontSize:"1.1rem", fontWeight:600, color:active.color, marginBottom:"0.75rem" }}>{active.short}</div>
              <p style={{ fontSize:"1.05rem", color:"var(--neutral-700)", lineHeight:1.7, margin:0 }}>{active.desc}</p>
            </div>

            <div style={{ display:"flex", flexWrap:"wrap", gap:"0.5rem" }}>
              {STAGES.map((s, i) => (
                <button key={s.id} onClick={() => setActiveIndex(i)} style={{ padding:"0.35rem 0.85rem", borderRadius:"2rem", border:`2px solid ${i === activeIndex ? s.color : "var(--neutral-300)"}`, background:i === activeIndex ? s.color : "transparent", color:i === activeIndex ? "#fff" : "var(--neutral-600)", fontWeight:600, fontSize:"0.85rem", cursor:"pointer", transition:"all 0.2s" }}>
                  {s.title}
                </button>
              ))}
            </div>

            <div style={{ marginTop:"2rem", padding:"1rem 1.25rem", borderRadius:"0.75rem", background:"var(--neutral-200)", borderLeft:`4px solid ${active.color}` }}>
              <div style={{ fontSize:"0.85rem", color:"var(--neutral-600)", fontWeight:500 }}>
                ↻ After Achieve, the cycle resets — new goal, new gaps, next level.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
