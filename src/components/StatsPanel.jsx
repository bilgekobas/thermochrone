import React, { useState } from "react";
import { AGE_GROUPS, thermalPenalty, ACCLIMATISATION_STATES } from "../lib/penalty.js";
import { utciCategory } from "../lib/utci.js";

export default function StatsPanel({
  weather, mrtData, svfVal, utciVal, pois,
  isoStats, selectedGroup, lst,
}) {
  const [activeTab, setActiveTab] = useState("pois");
  const cat = utciVal !== null ? utciCategory(utciVal) : null;
  const ag  = AGE_GROUPS.find(g => g.id === selectedGroup);
  const poiCats = {};
  pois?.forEach(p => { poiCats[p.cat] = (poiCats[p.cat] || 0) + 1; });

  return (
    <>
      <div style={{ display: "flex", borderBottom: "1px solid #1e293b" }}>
        {["pois","stats"].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            flex: 1, padding: "9px 0",
            background: activeTab === t ? "#1e293b" : "transparent",
            color: activeTab === t ? "#f8fafc" : "#475569",
            fontSize: 10, letterSpacing: "0.07em",
            border: "none",
            borderBottom: activeTab === t ? "2px solid #f472b6" : "2px solid transparent",
            cursor: "pointer", fontFamily: "inherit",
          }}>
            {t === "pois" ? `PLACES (${pois?.length ?? 0})` : "THERMAL STATS"}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>

        {/* ── POIs ─────────────────────────────────────────────── */}
        {activeTab === "pois" && (
          <div className="fade-up">
            <div style={{ marginBottom: 10 }}>
              {Object.entries(poiCats).sort((a,b)=>b[1]-a[1]).map(([c,n]) => {
                const s = pois.find(p => p.cat === c);
                return (
                  <div key={c} style={{
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"4px 0", borderBottom:"1px solid #1e293b", fontSize:12,
                  }}>
                    <span>{s?.icon} {c}</span>
                    <span style={{ background:(s?.color??'#64748b')+"22", color:s?.color??'#64748b', borderRadius:4, padding:"1px 7px", fontSize:10 }}>{n}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize:9, color:"#475569", letterSpacing:"0.08em", marginBottom:6 }}>NEAREST PLACES</div>
            {pois?.slice(0,40).map((poi,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"1px solid #1e293b18", fontSize:12 }}>
                <span style={{ fontSize:14 }}>{poi.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ color:"#e2e8f0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {poi.tags?.name || poi.cat}
                  </div>
                  <div style={{ color:"#475569", fontSize:10 }}>{poi.cat}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Stats ─────────────────────────────────────────────── */}
        {activeTab === "stats" && weather && isoStats && (
          <div className="fade-up">

            <Section label="METEOROLOGICAL">
              {[
                ["Air Temp",        `${weather.ta}°C`],
                ["Humidity",        `${weather.rh}%`],
                ["Wind Speed",      `${weather.ws} m/s`],
                ["Cloud Cover",     `${weather.cloudCover}%`],
                ["Direct Rad.",     `${weather.directRad} W/m²`],
                ["Diffuse Rad.",    `${weather.diffuseRad} W/m²`],
              ]}
            </Section>

            <Section label="SURFACE TEMPERATURE">
              {[
                ["Ground temp source", mrtData?.lstSource ?? "—"],
                ["Ground temp",  `${mrtData?.groundTempC ?? "—"}°C`],
                ["Sky View Factor", svfVal?.toFixed(3) ?? "—"],
                ["Surface ε",    isoStats.epsilon?.toFixed(3) ?? "—"],
                ["Surface α",    isoStats.albedo?.toFixed(3) ?? "—"],
              ]}
            </Section>

            <Section label="RADIATION BALANCE → MRT">
              {[
                ["SW load",   `${mrtData?.SWload ?? "—"} W/m²`],
                ["LW load",   `${mrtData?.LWload ?? "—"} W/m²`],
                ["Tmrt",      `${mrtData?.tmrt ?? "—"}°C`, "#f472b6"],
              ]}
            </Section>

            <div style={{ fontSize:9, color:"#475569", letterSpacing:"0.08em", margin:"12px 0 7px" }}>UTCI</div>
            <div style={{ background:(cat?.color??'#334155')+"18", border:`1px solid ${(cat?.color??'#334155')}44`, borderRadius:8, padding:"10px 12px", marginBottom:12 }}>
              <div style={{ fontSize:22, fontWeight:500, color:cat?.color }}>{utciVal}°C</div>
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{cat?.emoji} {cat?.label}</div>
            </div>

            <div style={{ fontSize:9, color:"#475569", letterSpacing:"0.08em", marginBottom:7 }}>
              PENALTY · {ag?.icon} {ag?.label}
            </div>
            <div style={{ background:"#1e293b", borderRadius:8, padding:11, marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:7 }}>
                <span style={{ fontSize:11, color:"#94a3b8" }}>Speed reduction</span>
                <span style={{ color: isoStats.penalty>0.3?"#ef4444":isoStats.penalty>0.1?"#f97316":"#22c55e", fontWeight:500, fontSize:12 }}>
                  {isoStats.penalty<0.01?"None":`−${Math.round(isoStats.penalty*100)}%`}
                </span>
              </div>
              <div style={{ background:"#0a0a0f", borderRadius:4, height:5, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${isoStats.penalty*100}%`, background:isoStats.penalty>0.3?"#ef4444":isoStats.penalty>0.1?"#f97316":"#22c55e", borderRadius:4, transition:"width .4s" }} />
              </div>
              <div style={{ fontSize:9, color:"#475569", marginTop:6 }}>Effective speed: {isoStats.effectiveSpeed} m/min</div>
            </div>

            <div style={{ fontSize:9, color:"#475569", letterSpacing:"0.08em", marginBottom:7 }}>15-MIN RANGE BY AGE</div>
            {AGE_GROUPS.map(g => {
              const p = thermalPenalty(utciVal, g.id);
              const range = Math.round(15 * g.baseSpeed * (1-p));
              const base  = 15 * g.baseSpeed;
              return (
                <div key={g.id} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3, fontSize:10 }}>
                    <span style={{ color: g.id===selectedGroup?"#f472b6":"#94a3b8" }}>{g.icon} {g.label}</span>
                    <span style={{ color:"#64748b" }}>{range}m{p>0.01&&<span style={{color:"#f97316",marginLeft:4}}>−{Math.round(p*100)}%</span>}</span>
                  </div>
                  <div style={{ background:"#1e293b", borderRadius:3, height:4 }}>
                    <div style={{ height:"100%", width:`${(range/base)*100}%`, background:g.id===selectedGroup?"#f472b6":"#334155", borderRadius:3 }} />
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop:14, padding:10, background:"#1e293b", borderRadius:8, fontSize:9, color:"#475569", lineHeight:1.65 }}>
              <strong style={{color:"#64748b"}}>Methodology v2</strong><br/>
              MRT: ISO 7726. Solar: Spencer (1971). fp: Walkenhorst & David (2002). SVF: per-node horizon scan (36 sectors), Copernicus STL + OSM trees (τ=0.3; Konarska 2014). Ground LW: {mrtData?.lstSource}. LW sky: Brutsaert (1975). ε/α: building type × era table.<br/><br/>
              UTCI: Bröde et al. (2012). Wind: log profile to 1.1m, z₀ from building density.<br/><br/>
              Penalty: Kenney & Munce (2003), Havenith (2001), Cramer & Jay (2019). Acclimatisation: Kobas et al. (2026, Sci.Rep.).<br/><br/>
              Isochrones: alpha-shape concave hull (Bowyer-Watson Delaunay). Lost territory: sampling-based polygon difference.
            </div>

            <div style={{ marginTop:10, fontSize:8, color:"#334155", lineHeight:1.6 }}>
              © OpenStreetMap (ODbL) · Copernicus/EEA (STL 2018, BH 2012) · Sentinel-3 SLSTR (CDSE) · Open-Meteo (CC BY 4.0)<br/>
              Thermochrone — Bilge Kobas, TU Munich / SenseLab
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Section({ label, children }) {
  return (
    <>
      <div style={{ fontSize:9, color:"#475569", letterSpacing:"0.08em", margin:"12px 0 6px" }}>{label}</div>
      {children.map(([k,v,hl]) => (
        <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid #1e293b", fontSize:11 }}>
          <span style={{color:"#64748b"}}>{k}</span>
          <span style={{color:hl??"#e2e8f0"}}>{v}</span>
        </div>
      ))}
    </>
  );
}
