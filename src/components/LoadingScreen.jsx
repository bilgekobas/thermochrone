import React from "react";

export const STEPS = [
  { label:"Checking EU coverage" },
  { label:"Fetching street network" },
  { label:"Parsing building footprints" },
  { label:"Fetching Copernicus tree layer" },
  { label:"Computing solar geometry" },
  { label:"Computing sky view factors" },
  { label:"Fetching climate data" },
  { label:"Fetching Sentinel-3 surface temp" },
  { label:"Computing MRT & UTCI" },
  { label:"Drawing thermal isochrones" },
];

export default function LoadingScreen({ step=0, climateLabel="" }) {
  const pct = Math.round((step / STEPS.length) * 100);
  return (
    <div style={{
      position:"absolute", inset:0, zIndex:1000,
      background:"rgba(240,237,230,0.97)",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
    }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3,
        background:"#CCC8BF" }}>
        <div style={{ height:"100%", width:`${pct}%`,
          background:"#FF1654", transition:"width .4s ease" }}/>
      </div>

      <div style={{ fontFamily:"'Oswald',sans-serif", fontWeight:700,
        fontSize:30, letterSpacing:"0.01em", color:"#111010", marginBottom:4 }}>
        THERMO<span style={{ color:"#FF1654" }}>CHRONE</span>
      </div>
      <div style={{ fontSize:8, color:"#A89E95", letterSpacing:"0.15em",
        marginBottom: climateLabel ? 6 : 36 }}>
        15-MINUTE CITIES — UNDER THE SUN
      </div>
      {climateLabel && (
        <div style={{ fontSize:9, color:"#FF1654", letterSpacing:"0.08em",
          marginBottom:28, padding:"3px 10px",
          border:"1px solid #FF165444", borderRadius:3 }}>
          {climateLabel}
        </div>
      )}

      <div style={{ width:300 }}>
        {STEPS.map((s, i) => {
          const done=i<step, active=i===step, pending=i>step;
          return (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12,
              padding:"4px 0", opacity:pending?0.18:1, transition:"opacity .3s" }}>
              <div style={{
                width:18, height:18, flexShrink:0, borderRadius:2,
                background:done?"#FF1654":active?"transparent":C_BG2,
                border:active?"2px solid #FF1654":"2px solid transparent",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:9, color:"#FAF8F4", fontWeight:700,
              }}>
                {done ? "✓" : active ? (
                  <div style={{ width:7, height:7, borderRadius:"50%",
                    border:"1.5px solid #FF1654", borderTopColor:"transparent" }}
                    className="spinning"/>
                ) : ""}
              </div>
              <span style={{ fontSize:11,
                color:done?"#FF1654":active?"#111010":"#A89E95",
                fontWeight:active?500:300, letterSpacing:"0.02em" }}>
                {i===6 && climateLabel ? climateLabel : s.label}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop:28, fontSize:9, color:"#A89E95",
        letterSpacing:"0.08em" }}>
        FETCHING REAL DATA — PLEASE WAIT A FEW SECONDS
      </div>
    </div>
  );
}

const C_BG2 = "#E6E2D9";
