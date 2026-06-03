import React, { useState } from "react";

const C = {
  ink:"#111010", ink2:"#2E2B27", ink3:"#6B6560", ink4:"#A89E95",
  accent:"#FF1654", border:"#CCC8BF", border2:"#BAB5AC",
  white:"#FAF8F4", bg:"#F0EDE6", bg2:"#E6E2D9",
};

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Generate last 10 years of dates for historical picker (hottest months first)
function recentDates() {
  const dates = [];
  const now = new Date();
  for (let y = now.getFullYear()-1; y >= now.getFullYear()-5; y--) {
    // Add a few notable dates per year
    [7,8,6,9].forEach(m => {
      dates.push(`${y}-${String(m).padStart(2,"0")}-15`);
    });
  }
  return dates;
}

export default function ClimateModePicker({ mode, config, onChange }) {
  const [open, setOpen] = useState(false);

  const modeLabel = {
    live:       "LIVE",
    historical: "HISTORICAL",
    typical:    "TYPICAL",
  }[mode] ?? "LIVE";

  const configLabel = mode === "historical"
    ? config?.date ?? "pick date"
    : mode === "typical"
    ? MONTHS[(config?.month ?? 7) - 1]
    : "now";

  return (
    <div style={{ position:"relative" }}>
      {/* Trigger button */}
      <button onClick={() => setOpen(v => !v)} style={{
        display: "flex", alignItems: "center", gap: 6,
        background: open ? C.bg2 : C.white,
        border: `1px solid ${open ? C.accent : C.border}`,
        borderRadius: 3, padding: "4px 10px",
        cursor: "pointer", fontFamily: "inherit",
        transition: "all .1s",
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%",
          background: mode === "live" ? "#16a34a"
                    : mode === "historical" ? "#7c3aed"
                    : C.accent,
          flexShrink: 0,
        }}/>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 8, color: C.ink4, letterSpacing: "0.1em",
            fontWeight: 600 }}>CLIMATE MODE</div>
          <div style={{ fontSize: 10, color: C.ink, fontWeight: 600,
            letterSpacing: "0.04em" }}>
            {modeLabel} · <span style={{ color: C.ink3, fontWeight: 400 }}>
              {configLabel}
            </span>
          </div>
        </div>
        <span style={{ fontSize: 8, color: C.ink4, marginLeft: 2 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          background: C.white, border: `1px solid ${C.border}`,
          borderRadius: 6, zIndex: 600, width: 280,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          overflow: "hidden",
        }}>
          {/* LIVE */}
          <ModeOption
            active={mode === "live"}
            color="#16a34a"
            title="LIVE"
            desc="Current forecast from Open-Meteo. Updates in real time. No UHI correction needed — forecast models include local stations."
            onClick={() => { onChange({ mode:"live", config:{} }); setOpen(false); }}
          />

          {/* HISTORICAL */}
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            <ModeOption
              active={mode === "historical"}
              color="#7c3aed"
              title="HISTORICAL"
              desc="Any specific past date from ERA5-Land reanalysis (1950–present). Urban heat island offset applied from building density."
              onClick={() => onChange({ mode:"historical", config:{ date: config?.date ?? `${new Date().getFullYear()-1}-07-15` } })}
              noClose
            />
            {mode === "historical" && (
              <div style={{ padding:"8px 14px", borderTop:`1px solid ${C.border}`,
                background: C.bg }}>
                <div style={{ fontSize:8, color:C.ink4, letterSpacing:"0.1em",
                  marginBottom:5, fontWeight:500 }}>SELECT DATE</div>
                <input
                  type="date"
                  value={config?.date ?? `${new Date().getFullYear()-1}-07-15`}
                  min="1950-01-01"
                  max={`${new Date().getFullYear()-1}-12-31`}
                  onChange={e => onChange({ mode:"historical", config:{ date:e.target.value } })}
                  style={{
                    fontFamily:"inherit", fontSize:11, color:C.ink,
                    background:C.white, border:`1px solid ${C.border}`,
                    borderRadius:3, padding:"4px 8px", width:"100%",
                    outline:"none", cursor:"pointer",
                  }}
                />
                <div style={{ fontSize:8, color:C.ink4, marginTop:5, lineHeight:1.5 }}>
                  ERA5-Land hourly · +UHI offset from building density
                </div>
                <button onClick={() => setOpen(false)} style={{
                  marginTop:8, width:"100%", background:C.accent,
                  border:"none", borderRadius:3, padding:"5px 0",
                  color:C.white, fontSize:10, cursor:"pointer",
                  fontFamily:"inherit", fontWeight:600, letterSpacing:"0.06em",
                }}>APPLY DATE</button>
              </div>
            )}
          </div>

          {/* TYPICAL */}
          <div style={{ borderTop:`1px solid ${C.border}` }}>
            <ModeOption
              active={mode === "typical"}
              color={C.accent}
              title="TYPICAL"
              desc="5-year climatological mean for a selected month. Shows what a typical July afternoon looks like. ERA5-Land + UHI offset."
              onClick={() => onChange({ mode:"typical", config:{ month: config?.month ?? 7 } })}
              noClose
            />
            {mode === "typical" && (
              <div style={{ padding:"8px 14px", borderTop:`1px solid ${C.border}`,
                background:C.bg }}>
                <div style={{ fontSize:8, color:C.ink4, letterSpacing:"0.1em",
                  marginBottom:5, fontWeight:500 }}>SELECT MONTH</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                  {MONTHS.map((m, i) => {
                    const mo = i + 1;
                    const active = (config?.month ?? 7) === mo;
                    return (
                      <button key={mo}
                        onClick={() => onChange({ mode:"typical", config:{ month:mo } })}
                        style={{
                          background: active ? C.accent : C.bg2,
                          border: `1px solid ${active ? C.accent : C.border}`,
                          borderRadius: 2, padding:"2px 6px",
                          color: active ? C.white : C.ink3,
                          fontSize: 9, cursor:"pointer",
                          fontFamily:"inherit", fontWeight: active ? 600 : 400,
                        }}>{m.slice(0,3)}</button>
                    );
                  })}
                </div>
                <div style={{ fontSize:8, color:C.ink4, marginTop:6, lineHeight:1.5 }}>
                  5-year ERA5-Land mean · +UHI offset · diurnal cycle preserved
                </div>
                <button onClick={() => setOpen(false)} style={{
                  marginTop:8, width:"100%", background:C.accent,
                  border:"none", borderRadius:3, padding:"5px 0",
                  color:C.white, fontSize:10, cursor:"pointer",
                  fontFamily:"inherit", fontWeight:600, letterSpacing:"0.06em",
                }}>APPLY MONTH</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModeOption({ active, color, title, desc, onClick, noClose }) {
  return (
    <div onClick={onClick} style={{
      padding:"10px 14px", cursor:"pointer",
      background: active ? color+"0A" : "transparent",
      borderLeft: `3px solid ${active ? color : "transparent"}`,
      transition:"background .1s",
    }}
    onMouseEnter={e=>e.currentTarget.style.background=active?color+"0A":C.bg}
    onMouseLeave={e=>e.currentTarget.style.background=active?color+"0A":"transparent"}>
      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}>
        <div style={{ width:7, height:7, borderRadius:"50%", background:color, flexShrink:0 }}/>
        <div style={{ fontSize:10, fontWeight:700, color:active?color:C.ink,
          letterSpacing:"0.06em" }}>{title}</div>
        {active && <span style={{ fontSize:8, color:color, marginLeft:"auto" }}>ACTIVE</span>}
      </div>
      <div style={{ fontSize:9, color:C.ink4, lineHeight:1.5, paddingLeft:14 }}>
        {desc}
      </div>
    </div>
  );
}
