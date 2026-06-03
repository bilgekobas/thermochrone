import React, { useState, useCallback, useRef } from "react";
import MapComponent, { ISO_MINUTES } from "./components/Map.jsx";
import SearchBar from "./components/SearchBar.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import MonthPicker from "./components/MonthPicker.jsx";
import { solarGeometry, projectedAreaFactor } from "./lib/solar.js";
import { computeMRT } from "./lib/mrt.js";
import { computeUTCI, utciCategory } from "./lib/utci.js";
import { computeSVF } from "./lib/svf.js";
import { buildGraph, computeNodeSVFs, correctWindHeight, dijkstra, haversine } from "./lib/graph.js";
import { meanEmissivity } from "./lib/emissivity.js";
import { AGE_GROUPS, ACCLIMATISATION_STATES, thermalPenalty } from "./lib/penalty.js";
import { computeLostTerritory, formatArea } from "./lib/lostterritory.js";
import { alphaShape } from "./lib/alphashape.js";
import { fetchWeatherLive, fetchWeatherTypical, uhiOffset, MONTH_NAMES } from "./lib/climate.js";
import { checkEUCoverage, fetchOSMData, fetchCopernicusSTL, fetchLST, categorizePOI } from "./lib/fetch.js";

const C = {
  bg:"#F0EDE6", bg2:"#E6E2D9", bg3:"#D9D4C9",
  ink:"#111010", ink2:"#2E2B27", ink3:"#6B6560", ink4:"#A89E95",
  accent:"#FF1654",
  border:"#CCC8BF", border2:"#BAB5AC", white:"#FAF8F4",
};

const PRIORITY_CATS = ["Transit","Health","Shopping","Green Space","Education"];

function stressLabel(utci) {
  if (utci < 9)  return "COLD STRESS";
  if (utci < 26) return "NO THERMAL STRESS";
  if (utci < 32) return "MODERATE HEAT STRESS";
  if (utci < 38) return "STRONG HEAT STRESS";
  if (utci < 46) return "VERY STRONG HEAT STRESS";
  return "EXTREME HEAT STRESS";
}

// ── Small UI components ───────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:2000,
      background:"rgba(17,16,16,0.5)", display:"flex",
      alignItems:"center", justifyContent:"center" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:C.white, border:`1px solid ${C.border}`,
        borderRadius:6, width:580, maxHeight:"82vh",
        display:"flex", flexDirection:"column",
        boxShadow:"0 12px 48px rgba(0,0,0,0.18)",
      }}>
        <div style={{ display:"flex", justifyContent:"space-between",
          alignItems:"center", padding:"14px 20px",
          borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontFamily:"'Oswald',sans-serif", fontWeight:600,
            fontSize:14, letterSpacing:"0.06em", color:C.ink }}>{title}</div>
          <button onClick={onClose} style={{ background:"none", border:"none",
            fontSize:20, cursor:"pointer", color:C.ink3, padding:"0 4px" }}>×</button>
        </div>
        <div style={{ overflowY:"auto", padding:"20px 24px", flex:1,
          fontSize:12, color:C.ink2, lineHeight:1.85 }}>{children}</div>
      </div>
    </div>
  );
}

function MethodSection({ title, children }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontFamily:"'Oswald',sans-serif", fontWeight:600,
        fontSize:11, letterSpacing:"0.08em", color:C.ink, marginBottom:4,
        borderBottom:`1px solid ${C.border}`, paddingBottom:3 }}>{title}</div>
      <p style={{ color:C.ink2, lineHeight:1.8, fontSize:11 }}>{children}</p>
    </div>
  );
}

function Divider() {
  return <div style={{ width:1, background:C.border, flexShrink:0, alignSelf:"stretch" }}/>;
}

function Chip({ children, active, onClick, title, activeColor=C.ink }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: active ? activeColor : C.bg2,
      border:`1px solid ${active ? activeColor : C.border}`,
      borderRadius:3, padding:"3px 9px",
      color: active ? C.white : C.ink3,
      fontSize:10, fontWeight:active?600:400,
      cursor:"pointer", fontFamily:"inherit",
      letterSpacing:"0.04em", transition:"all .1s",
      whiteSpace:"nowrap",
    }}>{children}</button>
  );
}

function Check({ checked, onChange, color=C.accent, label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer" }}
      onClick={onChange}>
      <div style={{ width:13, height:13, flexShrink:0,
        background:checked?color:"transparent",
        border:`1.5px solid ${checked?color:C.border2}`,
        borderRadius:2, display:"flex", alignItems:"center",
        justifyContent:"center", fontSize:9, color:C.white,
        transition:"all .1s" }}>{checked?"✓":""}</div>
      <span style={{ fontSize:10, color:checked?C.ink2:C.ink4,
        whiteSpace:"nowrap", letterSpacing:"0.03em" }}>{label}</span>
    </div>
  );
}

function CtrlGroup({ label, sublabel, children, style={} }) {
  return (
    <div style={{ padding:"6px 14px", display:"flex", flexDirection:"column",
      justifyContent:"space-between", gap:4, minWidth:0, ...style }}>
      <div style={{ fontSize:7, color:C.ink4, letterSpacing:"0.14em",
        fontWeight:600, whiteSpace:"nowrap" }}>{label}</div>
      {children}
      <div style={{ fontSize:8, color:C.ink4, lineHeight:1.4, minHeight:12 }}>
        {sublabel ?? " "}
      </div>
    </div>
  );
}

function formatHour(h) {
  if (h==null) return "--:--";
  return `${String(h).padStart(2,"0")}:00`;
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [loadStep,        setLoadStep]        = useState(-1);
  const [climateLabel,    setClimateLabel]    = useState("");
  const [error,           setError]           = useState(null);
  const [selectedGroup,   setSelectedGroup]   = useState("youngAdult");
  const [acclimatisation, setAcclimatisation] = useState("mixed");
  const [showRefYoung,    setShowRefYoung]    = useState(true);
  const [showRefSame,     setShowRefSame]     = useState(false);
  const [shadePrefer,     setShadePrefer]     = useState(false);
  const [selectedHour,    setSelectedHour]    = useState(0);
  const [climateMode,     setClimateMode]     = useState("typical");  // always typical
  const [typicalMonth,    setTypicalMonth]    = useState(7);
  const [result,          setResult]          = useState(null);
  const [liveUtci,        setLiveUtci]        = useState(17.5);
  const [liveMrt,         setLiveMrt]         = useState(null);
  const [lostData,        setLostData]        = useState(null);
  const [modal,           setModal]           = useState(null);
  const [drawKey,         setDrawKey]         = useState(0);
  const leafletMapRef = useRef(null);

  const ag  = AGE_GROUPS.find(g => g.id===selectedGroup);
  const cat = utciCategory(liveUtci);

  // ── Recompute live UTCI when hour/group/accl changes ─────
  const recomputeLive = useCallback((res, hourIdx, group, accl) => {
    if (!res) return;
    const h   = res.weatherHourly[hourIdx] ?? res.weatherHourly[0];
    const ts  = new Date(); ts.setHours(h.hour, 0, 0, 0);
    const sol = solarGeometry(res.lat, res.lon, ts);
    const fp  = sol.altDeg > 0 ? projectedAreaFactor(sol.altDeg) : 0;
    const mrt = computeMRT({
      ta:h.ta, directRad:h.directRad, diffuseRad:h.diffuseRad,
      svf:res.svf, altDeg:sol.altDeg, fp,
      cloudCover:h.cloudCover, albedo:res.albedo,
      surfEpsilon:res.epsilon, lst:res.lst,
    });
    const ws   = correctWindHeight(h.ws, res.buildings.length);
    const utci = computeUTCI(h.ta, h.rh, ws, mrt.tmrt);
    setLiveUtci(utci); setLiveMrt(mrt);
    setDrawKey(k => k + 1);

    const agG        = AGE_GROUPS.find(g => g.id===group);
    const penalty    = thermalPenalty(utci, group, accl);
    const effSpeedMs = agG.baseSpeed * (1-penalty) / 60;

    const thermalRings = ISO_MINUTES.map(mins => {
      const reachable = dijkstra(res.lat, res.lon, res.nodes, res.graph,
        mins*60, effSpeedMs, res.svfMap, utci, false);
      const pts = Object.keys(reachable).map(id=>res.nodes[id]).filter(Boolean).map(n=>[n.lon,n.lat]);
      return alphaShape(pts);
    });
    // Ref A: young adult thermoneutral → Planning Gap (full deficit vs planning standard)
    const refRings = ISO_MINUTES.map(mins => {
      const reachable = dijkstra(res.lat, res.lon, res.nodes, res.graph, mins*60, 83/60);
      const pts = Object.keys(reachable).map(id=>res.nodes[id]).filter(Boolean).map(n=>[n.lon,n.lat]);
      return alphaShape(pts);
    });
    // Ref B: same group thermoneutral → isolates thermal penalty from demographic gap
    const sameGroupRings = ISO_MINUTES.map(mins => {
      const reachable = dijkstra(res.lat, res.lon, res.nodes, res.graph, mins*60, agG.baseSpeed/60);
      const pts = Object.keys(reachable).map(id=>res.nodes[id]).filter(Boolean).map(n=>[n.lon,n.lat]);
      return alphaShape(pts);
    });
    setLostData({
      planningGap:    computeLostTerritory(refRings, thermalRings),
      thermalPenalty: computeLostTerritory(sameGroupRings, thermalRings),
      demographicGap: computeLostTerritory(refRings, sameGroupRings),
    });
  }, []);

  const handleHourChange  = useCallback(i => { setSelectedHour(i); recomputeLive(result,i,selectedGroup,acclimatisation); }, [result,selectedGroup,acclimatisation,recomputeLive]);
  const handleGroupChange = useCallback(g => { setSelectedGroup(g); recomputeLive(result,selectedHour,g,acclimatisation); }, [result,selectedHour,acclimatisation,recomputeLive]);
  const handleAcclChange  = useCallback(a => { setAcclimatisation(a); recomputeLive(result,selectedHour,selectedGroup,a); }, [result,selectedHour,selectedGroup,recomputeLive]);

  // When mode or month changes and we have a location, re-fetch climate only
  const handleClimateModeChange = useCallback(async (newMode, newMonth) => {
    const m = newMonth ?? typicalMonth;
    setClimateMode(newMode);
    if (newMonth) setTypicalMonth(newMonth);
    if (!result) return;
    await refetchClimate(result, newMode, m);
  }, [result, typicalMonth]);

  const refetchClimate = useCallback(async (res, mode, month) => {
    try {
      const label = mode === "typical"
        ? `Computing ${MONTH_NAMES[month-1]} climatology…`
        : "Fetching live conditions…";
      setClimateLabel(label);
      setLoadStep(6);
      const weatherData = mode === "typical"
        ? await fetchWeatherTypical(res.lat, res.lon, month, res.buildings.length)
        : await fetchWeatherLive(res.lat, res.lon);
      setLoadStep(-1); setClimateLabel("");
      const newRes = { ...res, weatherHourly:weatherData.hourly, weatherMeta:weatherData };
      setResult(newRes);
      setSelectedHour(0);
      recomputeLive(newRes, 0, selectedGroup, acclimatisation);
      setDrawKey(k => k + 1);
    } catch(e) {
      setLoadStep(-1); setClimateLabel("");
      setError(`Climate fetch failed: ${e.message}`);
    }
  }, [selectedGroup, acclimatisation, recomputeLive]);

  // ── Main analysis pipeline ────────────────────────────────
  const runAnalysis = useCallback(async (lat, lon) => {
    setError(null); setLoadStep(0); setResult(null); setLostData(null);
    try {
      const { inEU, countryName } = await checkEUCoverage(lat, lon);
      if (!inEU) { setError("Thermochrone covers EU / EEA cities only."); setLoadStep(-1); return; }

      setLoadStep(1);
      const maxRadius = Math.max(...ISO_MINUTES) * 83 * 1.4;
      setLoadStep(2);
      const [osmData, stlPolygons] = await Promise.all([
        fetchOSMData(lat, lon, maxRadius),
        fetchCopernicusSTL(lat, lon, maxRadius),
      ]);
      setLoadStep(3);
      const { nodes, graph, buildings, osmTrees } = buildGraph(osmData.elements);
      setLoadStep(4);
      const now = new Date();
      const sol = solarGeometry(lat, lon, now);
      const fp  = sol.altDeg > 0 ? projectedAreaFactor(sol.altDeg) : 0;
      setLoadStep(5);
      const svfMap    = computeNodeSVFs(nodes, graph, buildings, stlPolygons, osmTrees);
      const originSVF = computeSVF(lat, lon, buildings, stlPolygons, osmTrees);

      // Climate fetch
      setLoadStep(6);
      const clLabel = climateMode === "typical"
        ? `Computing ${MONTH_NAMES[typicalMonth-1]} climatology…`
        : "Fetching live weather…";
      setClimateLabel(clLabel);
      const weatherData = climateMode === "typical"
        ? await fetchWeatherTypical(lat, lon, typicalMonth, buildings.length)
        : await fetchWeatherLive(lat, lon);
      setClimateLabel("");

      setLoadStep(7);
      const lst = await fetchLST(lat, lon);

      setLoadStep(8);
      const { epsilon, albedo } = meanEmissivity(buildings);
      const w = weatherData.current;
      const mrt = computeMRT({
        ta:w.ta, directRad:w.directRad, diffuseRad:w.diffuseRad,
        svf:originSVF, altDeg:sol.altDeg, fp,
        cloudCover:w.cloudCover, albedo, surfEpsilon:epsilon, lst,
      });
      const wsCorr = correctWindHeight(w.ws, buildings.length);
      const utci   = computeUTCI(w.ta, w.rh, wsCorr, mrt.tmrt);

      const agG        = AGE_GROUPS.find(g => g.id===selectedGroup);
      const penalty    = thermalPenalty(utci, selectedGroup, acclimatisation);
      const effSpeedMs = agG.baseSpeed * (1-penalty) / 60;
      const maxDistM   = ISO_MINUTES[2] * agG.baseSpeed * (1-penalty);

      const allPois = osmData.elements
        .filter(el => el.type==="node" && el.tags)
        .map(el => {
          const c = categorizePOI(el.tags);
          if (!c) return null;
          return { ...el, ...c, distM: haversine(lat, lon, el.lat, el.lon) };
        }).filter(Boolean);

      setLoadStep(9);
      const thermalRings = ISO_MINUTES.map(mins => {
        const reachable = dijkstra(lat, lon, nodes, graph, mins*60, effSpeedMs,
          svfMap, utci, shadePrefer && utci>26);
        const pts = Object.keys(reachable).map(id=>nodes[id]).filter(Boolean).map(n=>[n.lon,n.lat]);
        return alphaShape(pts);
      });
      // Ref A: young adult thermoneutral
      const refRings = ISO_MINUTES.map(mins => {
        const reachable = dijkstra(lat, lon, nodes, graph, mins*60, 83/60);
        const pts = Object.keys(reachable).map(id=>nodes[id]).filter(Boolean).map(n=>[n.lon,n.lat]);
        return alphaShape(pts);
      });
      // Ref B: same group thermoneutral
      const sameGroupRings = ISO_MINUTES.map(mins => {
        const reachable = dijkstra(lat, lon, nodes, graph, mins*60, agG.baseSpeed/60);
        const pts = Object.keys(reachable).map(id=>nodes[id]).filter(Boolean).map(n=>[n.lon,n.lat]);
        return alphaShape(pts);
      });
      const lost = {
        planningGap:    computeLostTerritory(refRings, thermalRings),
        thermalPenalty: computeLostTerritory(sameGroupRings, thermalRings),
        demographicGap: computeLostTerritory(refRings, sameGroupRings),
      };

      const res = {
        lat, lon, nodes, graph, svfMap, buildings, osmTrees, stlPolygons,
        allPois, svf:originSVF, epsilon, albedo, lst,
        country:countryName, weatherHourly:weatherData.hourly,
        weatherMeta: weatherData,
        isoStats:{
          penalty, effectiveSpeed:Math.round(agG.baseSpeed*(1-penalty)),
          buildingCount:buildings.length, epsilon, albedo,
          stats:ISO_MINUTES.map(m=>({mins:m,maxDist:Math.round(m*agG.baseSpeed*(1-penalty))})),
        },
      };
      setResult(res); setLiveUtci(utci); setLiveMrt(mrt);
      setLostData(lost); setSelectedHour(0); setLoadStep(-1);
      setDrawKey(k => k + 1);
    } catch(e) {
      console.error(e);
      setError(`${e.message} — please try clicking again.`);
      setLoadStep(-1); setClimateLabel("");
    }
  }, [selectedGroup, acclimatisation, shadePrefer, climateMode]);

  const isLoading = loadStep >= 0;

  // POI counts per band
  function poisPerBand(res, agG, pen) {
    if (!res?.allPois) return null;
    const effSpeed = agG.baseSpeed * (1-pen);
    return ISO_MINUTES.map(mins => {
      const maxD = mins * effSpeed;
      const inB  = res.allPois.filter(p => p.distM <= maxD);
      const counts = {};
      PRIORITY_CATS.forEach(c => { counts[c] = inB.filter(p=>p.cat===c).length; });
      return counts;
    });
  }

  const agG       = AGE_GROUPS.find(g=>g.id===selectedGroup);
  const pen       = result ? thermalPenalty(liveUtci, selectedGroup, acclimatisation) : 0;
  const bandCounts = result ? poisPerBand(result, agG, pen) : null;
  const totalIn15  = result ? result.allPois.filter(p=>p.distM<=ISO_MINUTES[2]*agG.baseSpeed*(1-pen)).length : 0;

  // UHI info for display
  const uhiVal = result ? uhiOffset(result.buildings.length, 250, result.weatherHourly[selectedHour]?.hour ?? 14) : null;

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column",
      overflow:"hidden", background:C.bg }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <header style={{ background:C.white, borderBottom:`1px solid ${C.border}`,
        flexShrink:0, zIndex:100, display:"flex", alignItems:"center",
        justifyContent:"space-between", padding:"10px 20px" }}>
        <div>
          <div style={{ fontFamily:"'Oswald',sans-serif", fontWeight:700,
            fontSize:22, letterSpacing:"0.01em", color:C.ink, lineHeight:1 }}>
            THERMO<span style={{ color:C.accent }}>CHRONE</span>
          </div>
          <div style={{ fontSize:8, color:C.ink4, letterSpacing:"0.12em", marginTop:2 }}>
            15-MINUTE CITIES — UNDER THE SUN
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>setModal("about")} style={{
            background:C.ink, border:`1px solid ${C.ink}`,
            borderRadius:3, padding:"5px 14px", fontSize:9, cursor:"pointer",
            color:C.white, fontFamily:"inherit", letterSpacing:"0.1em", fontWeight:500 }}>
            ABOUT
          </button>
          <button onClick={()=>setModal("methodology")} style={{
            background:C.ink, border:`1px solid ${C.ink}`,
            borderRadius:3, padding:"5px 14px", fontSize:9, cursor:"pointer",
            color:C.white, fontFamily:"inherit", letterSpacing:"0.1em", fontWeight:500 }}>
            METHODOLOGY
          </button>
        </div>
      </header>

      {/* ── Controls bar ─────────────────────────────────────── */}
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`,
        flexShrink:0, display:"flex", alignItems:"stretch", overflowX:"auto" }}>

        <CtrlGroup label="AGE GROUP" sublabel={ag?.note}>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {AGE_GROUPS.map(g => (
              <Chip key={g.id} active={selectedGroup===g.id}
                onClick={()=>handleGroupChange(g.id)} title={g.note}>
                {g.label}
              </Chip>
            ))}
          </div>
        </CtrlGroup>

        <Divider/>

        <CtrlGroup label="ACCLIMATISATION"
          sublabel={ACCLIMATISATION_STATES.find(s=>s.id===acclimatisation)?.sublabel}>
          <div style={{ display:"flex", gap:4 }}>
            {ACCLIMATISATION_STATES.map(s => (
              <Chip key={s.id} active={acclimatisation===s.id}
                onClick={()=>handleAcclChange(s.id)} title={s.sublabel}>
                {s.label}
              </Chip>
            ))}
          </div>
        </CtrlGroup>

        <Divider/>

        {/* Climate data — typical month only */}
        <CtrlGroup label="CLIMATE DATA" sublabel="ERA5-Land 5-yr mean · UHI offset applied">
          <MonthPicker
            month={typicalMonth}
            onMonthChange={m => handleClimateModeChange("typical", m)}
          />
        </CtrlGroup>

        <Divider/>

        <CtrlGroup
          label={`TIME OF DAY · ${result ? formatHour(result.weatherHourly[selectedHour]?.hour) : "--:--"}`}
          sublabel={result && result.weatherHourly[selectedHour]
            ? `${result.weatherHourly[selectedHour].ta}°C · ${Math.round(result.weatherHourly[selectedHour].directRad)} W/m² direct`
            : "click map to load"}
          style={{ minWidth:200, flex:1 }}>
          {result && !isLoading && (
            <div>
              <input type="range" min={0} max={result.weatherHourly.length-1}
                value={selectedHour}
                onChange={e=>handleHourChange(Number(e.target.value))}/>
              <div style={{ display:"flex", gap:1, alignItems:"flex-end",
                height:12, marginTop:3 }}>
                {result.weatherHourly.map((h,i) => {
                  const maxR = Math.max(...result.weatherHourly.map(x=>x.directRad+x.diffuseRad));
                  const val  = (h.directRad+h.diffuseRad)/(maxR||1);
                  return <div key={i} onClick={()=>handleHourChange(i)}
                    style={{ flex:1, height:`${Math.max(2,val*12)}px`, cursor:"pointer",
                      background:i===selectedHour?C.accent:val>0.1?"#FF165433":C.border,
                      borderRadius:1 }}
                    title={`${formatHour(h.hour)} · ${h.ta}°C`}/>;
                })}
              </div>
            </div>
          )}
        </CtrlGroup>

        <Divider/>

        <CtrlGroup label="OVERLAYS" sublabel="">
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            <Check checked={showRefYoung} onChange={()=>setShowRefYoung(v=>!v)}
              color="#94a3b8" label="Ref · healthy young adult"/>
            <Check checked={showRefSame} onChange={()=>setShowRefSame(v=>!v)}
              color="#7c3aed" label={`Ref · ${ag?.label} neutral`}/>
            <Check checked={shadePrefer} onChange={()=>setShadePrefer(v=>!v)}
              color={C.ink} label="Shade-preferring routing"/>
          </div>
        </CtrlGroup>
      </div>

      {/* ── Map + Sidebar ─────────────────────────────────────── */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* Map */}
        <div style={{ flex:1, position:"relative" }}>
          <MapComponent
            onMapClick={runAnalysis}
            analysisResult={result}
            selectedGroup={selectedGroup}
            acclimatisation={acclimatisation}
            showRefYoung={showRefYoung}
            showRefSameGroup={showRefSame}
            shadePrefer={shadePrefer}
            utciVal={liveUtci}
            mapRefOut={leafletMapRef}
            drawKey={drawKey}
          />

          {/* Search bar */}
          <div style={{ position:"absolute", top:12, left:"50%",
            transform:"translateX(-50%)", zIndex:400, width:340 }}>
            <SearchBar onSelect={runAnalysis} mapRef={leafletMapRef}/>
          </div>

          {/* Idle */}
          {!isLoading && !result && (
            <div style={{ position:"absolute", top:"50%", left:"50%",
              transform:"translate(-50%,-50%)",
              background:C.white, border:`1px solid ${C.border}`,
              borderRadius:6, padding:"18px 28px",
              textAlign:"center", pointerEvents:"none",
              boxShadow:"0 4px 20px rgba(0,0,0,0.08)" }}>
              <div style={{ fontFamily:"'Oswald',sans-serif", fontWeight:700,
                fontSize:15, color:C.ink, letterSpacing:"0.04em" }}>
                CLICK ANYWHERE IN AN EU CITY
              </div>
              <div style={{ fontSize:10, color:C.ink4, marginTop:5, lineHeight:1.7 }}>
                or search above · three climate modes<br/>
                live · historical · typical monthly
              </div>
            </div>
          )}

          {error && !isLoading && (
            <div style={{ position:"absolute", bottom:20, left:"50%",
              transform:"translateX(-50%)",
              background:"#fef2f2", border:"1px solid #fca5a5",
              borderRadius:4, padding:"10px 16px", fontSize:11,
              color:"#991b1b", maxWidth:360, textAlign:"center" }}>{error}</div>
          )}

          {/* Map legend */}
          {result && !isLoading && (
            <div style={{ position:"absolute", bottom:32, left:12,
              background:C.white, border:`1px solid ${C.border}`,
              borderRadius:5, padding:"9px 13px",
              boxShadow:"0 2px 8px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize:8, color:C.ink4, marginBottom:6,
                letterSpacing:"0.1em", fontWeight:500 }}>
                ISOCHRONES · {ag?.label?.toUpperCase()}
              </div>
              {ISO_MINUTES.map((m,i) => (
                <div key={m} style={{ display:"flex", alignItems:"center",
                  gap:8, marginBottom:4 }}>
                  <div style={{ width:16, height:2.5, background:C.accent,
                    opacity:0.4+i*0.25, borderRadius:1 }}/>
                  <span style={{ color:C.accent, fontWeight:600,
                    fontSize:10, opacity:0.5+i*0.25 }}>{m} MIN</span>
                  <span style={{ color:C.ink4, fontSize:9 }}>
                    {result.isoStats.stats[i]?.maxDist}m
                  </span>
                </div>
              ))}
              {showRefYoung && (
                <div style={{ display:"flex", alignItems:"center", gap:6,
                  marginTop:5, paddingTop:5, borderTop:`1px solid ${C.border}`,
                  fontSize:8, color:C.ink4 }}>
                  <div style={{ width:14, borderTop:"1.5px dashed #94a3b8" }}/>
                  REF · YOUNG ADULT
                </div>
              )}
              {showRefSame && (
                <div style={{ display:"flex", alignItems:"center", gap:6,
                  marginTop:3, fontSize:8, color:C.ink4 }}>
                  <div style={{ width:14, borderTop:"1.5px dotted #7c3aed" }}/>
                  REF · {ag?.label?.toUpperCase()} NEUTRAL
                </div>
              )}
              {shadePrefer && liveUtci>26 && (
                <div style={{ marginTop:4, fontSize:8, color:C.ink,
                  letterSpacing:"0.05em" }}>SHADE ROUTING ACTIVE</div>
              )}
              {/* Climate mode badge */}
              <div style={{ marginTop:5, paddingTop:5,
                borderTop:`1px solid ${C.border}`,
                fontSize:8, letterSpacing:"0.06em",
                color: C.ink }}>
                {result.weatherMeta?.label?.toUpperCase() ?? "LIVE"}
              </div>
            </div>
          )}

          {isLoading && <LoadingScreen step={loadStep} climateLabel={climateLabel}/>}
        </div>

        {/* ── Sidebar ──────────────────────────────────────────── */}
        {result && !isLoading && (
          <div style={{ width:280, display:"flex", flexDirection:"column",
            borderLeft:`1px solid ${C.border}`, background:C.white,
            overflow:"hidden", flexShrink:0 }}>

            {/* UTCI */}
            <div style={{ padding:"14px 16px",
              borderBottom:`1px solid ${C.border}`,
              background:cat.color+"0E",
              borderLeft:`3px solid ${cat.color}` }}>
              <div style={{ fontSize:8, color:cat.color, letterSpacing:"0.12em",
                fontWeight:600, marginBottom:2 }}>{stressLabel(liveUtci)}</div>
              <div style={{ fontFamily:"'Oswald',sans-serif", fontWeight:700,
                fontSize:28, color:C.ink, lineHeight:1, marginBottom:4 }}>
                UTCI {liveUtci}°C
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr",
                gap:"3px 10px", fontSize:9, color:C.ink3 }}>
                <span>T<sub>mrt</sub> {liveMrt?.tmrt}°C</span>
                <span>SVF {result.svf.toFixed(2)}</span>
                <span>T<sub>a</sub> {result.weatherHourly[selectedHour]?.ta}°C</span>
                <span style={{ color:C.ink4, fontSize:8 }}>
                  {liveMrt?.lstSource}
                </span>
              </div>
              {/* Climate mode + UHI info */}
              <div style={{ marginTop:6, paddingTop:6,
                borderTop:`1px solid ${cat.color}22`,
                fontSize:8, lineHeight:1.6 }}>
                <div style={{ color: C.ink,
                  fontWeight:600, letterSpacing:"0.06em" }}>
                  {result.weatherMeta?.label}
                </div>
                {result.weatherMeta?.uhiApplied && uhiVal !== null && (
                  <div style={{ color:C.ink4 }}>
                    +{uhiVal.toFixed(1)}°C UHI offset applied
                  </div>
                )}
                <div style={{ color:C.ink4 }}>{result.country}</div>
              </div>
            </div>

            {/* Lost territory — three-metric decomposition */}
            {lostData && (
              <div style={{ padding:"12px 16px",
                borderBottom:`1px solid ${C.border}`, background:C.bg }}>

                {/* ── Planning Gap ── */}
                <LostBlock
                  label="PLANNING GAP"
                  sublabel={`vs healthy young adult · thermoneutral`}
                  description="How much smaller this person's city is vs the standard planning assumption"
                  data={lostData.planningGap}
                  barColor={C.accent}
                  pctColor={C.accent}
                  agLabel={ag?.label}
                />

                <div style={{ borderTop:`1px solid ${C.border}`, margin:"10px 0" }}/>

                {/* ── Demographic Gap ── */}
                <LostBlock
                  label="DEMOGRAPHIC GAP"
                  sublabel={`vs healthy young adult · same conditions`}
                  description="Loss attributable to age and physiology alone, without heat"
                  data={lostData.demographicGap}
                  barColor={C.ink2}
                  pctColor={C.ink2}
                  agLabel={ag?.label}
                />

                <div style={{ borderTop:`1px solid ${C.border}`, margin:"10px 0" }}/>

                {/* ── Thermal Penalty ── */}
                <LostBlock
                  label="THERMAL PENALTY"
                  sublabel={`vs same group · thermoneutral`}
                  description="Loss attributable to heat stress alone — climate cost only"
                  data={lostData.thermalPenalty}
                  barColor="#d97706"
                  pctColor="#d97706"
                  agLabel={ag?.label}
                />
              </div>
            )}

            {/* POI table */}
            {bandCounts && (
              <div style={{ padding:"12px 16px",
                borderBottom:`1px solid ${C.border}` }}>
                <div style={{ fontSize:8, color:C.ink4, letterSpacing:"0.12em",
                  marginBottom:8, fontWeight:500 }}>PLACES WITHIN ISOCHRONE</div>
                <div style={{ display:"grid",
                  gridTemplateColumns:"1fr 36px 36px 36px",
                  gap:4, marginBottom:4 }}>
                  <div/>
                  {ISO_MINUTES.map(m => (
                    <div key={m} style={{ fontSize:8, color:C.accent,
                      fontWeight:700, textAlign:"center",
                      letterSpacing:"0.04em" }}>{m}′</div>
                  ))}
                </div>
                {PRIORITY_CATS.map(cat => (
                  <div key={cat} style={{ display:"grid",
                    gridTemplateColumns:"1fr 36px 36px 36px",
                    gap:4, marginBottom:3, alignItems:"center" }}>
                    <div style={{ fontSize:9, color:C.ink2,
                      overflow:"hidden", textOverflow:"ellipsis",
                      whiteSpace:"nowrap" }}>{cat}</div>
                    {bandCounts.map((bc,bi) => (
                      <div key={bi} style={{ textAlign:"center", fontSize:10,
                        fontWeight:600,
                        color:bc[cat]>0?C.ink:C.ink4,
                        fontFamily:"'Oswald',sans-serif" }}>
                        {bc[cat]||"—"}
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{ marginTop:6, paddingTop:6,
                  borderTop:`1px solid ${C.border}`,
                  fontSize:8, color:C.ink4 }}>
                  {totalIn15} total places within 15-min isochrone
                </div>
              </div>
            )}

            {/* Age group comparison */}
            <div style={{ padding:"12px 16px", flex:1, overflowY:"auto" }}>
              <div style={{ fontSize:8, color:C.ink4, letterSpacing:"0.12em",
                marginBottom:10, fontWeight:500 }}>
                15-MIN RANGE · UTCI {liveUtci}°C
              </div>
              {AGE_GROUPS.map(g => {
                const p     = thermalPenalty(liveUtci, g.id, acclimatisation);
                const range = Math.round(15 * g.baseSpeed * (1-p));
                const base  = 15 * g.baseSpeed;
                const isSel = g.id===selectedGroup;
                return (
                  <div key={g.id} style={{ marginBottom:9, cursor:"pointer" }}
                    onClick={()=>handleGroupChange(g.id)}>
                    <div style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"baseline", marginBottom:2 }}>
                      <span style={{ fontSize:10, fontWeight:isSel?600:400,
                        color:isSel?C.accent:C.ink2, letterSpacing:"0.03em" }}>
                        {g.label.toUpperCase()}
                      </span>
                      <span style={{ fontSize:10, color:C.ink3 }}>
                        {range}m
                        {p>0.01 && <span style={{ color:C.accent,
                          marginLeft:4, fontWeight:700 }}>
                          -{Math.round(p*100)}%
                        </span>}
                      </span>
                    </div>
                    <div style={{ background:C.bg3, borderRadius:1, height:3 }}>
                      <div style={{ height:"100%",
                        width:`${(range/base)*100}%`,
                        background:isSel?C.accent:C.border2,
                        borderRadius:1, transition:"width .4s" }}/>
                    </div>
                  </div>
                );
              })}

              <div style={{ marginTop:12, paddingTop:10,
                borderTop:`1px solid ${C.border}`,
                fontSize:8, color:C.ink4, lineHeight:1.8 }}>
                OSM (ODbL) · Copernicus/EEA · Sentinel-3 SLSTR ·
                Open-Meteo (CC BY 4.0)<br/>
                Thermochrone · B. Kobas · TU Munich SenseLab · 2026
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {modal==="about" && (
        <Modal title="ABOUT THERMOCHRONE" onClose={()=>setModal(null)}>
          <p style={{ marginBottom:14 }}>
            <strong>Thermochrone</strong> visualises how thermal stress reshapes
            pedestrian accessibility across age groups and acclimatisation states
            in European cities.
          </p>
          <p style={{ marginBottom:14 }}>
            Standard walkability analysis treats the 15-minute city as a fixed
            geometric construct. Thermochrone demonstrates that the effective
            walkable territory shrinks under heat stress, and that this shrinkage
            is not uniform across populations. Older adults, children, and
            unacclimatised individuals lose disproportionately more of their
            accessible city.
          </p>
          <p style={{ marginBottom:14 }}>
            Developed by <strong>Bilge Kobas</strong>, Chair of Building Technology
            and Climate Responsive Design, TU Munich / SenseLab. Connected to an
            empirical research programme on thermophysiological adaptation and
            indoor/outdoor climate resilience.
          </p>
          <p style={{ fontSize:10, color:C.ink4 }}>Open source · MIT License · 2026</p>
        </Modal>
      )}

      {modal==="methodology" && (
        <Modal title="METHODOLOGY" onClose={()=>setModal(null)}>
          <MethodSection title="CLIMATE DATA MODES">
            Three modes are available. Live mode uses Open-Meteo NWP forecasts,
            which incorporate local station data and do not require UHI correction.
            Historical mode queries the ERA5-Land reanalysis archive (1950–present)
            at 9 km resolution via Open-Meteo. Typical mode averages five years of
            ERA5-Land data for the selected month, producing a mean diurnal cycle.
            For ERA5-based modes, a building-density urban heat island offset is
            applied per hour: dense urban cores receive +3°C daytime / +4.5°C
            night; calibrated against Copernicus UrbClim 100-city dataset
            (Lauwaet et al. 2024).
          </MethodSection>
          <MethodSection title="MEAN RADIANT TEMPERATURE">
            ISO 7726 outdoor radiation balance. Solar radiation from Open-Meteo.
            Solar geometry: Spencer (1971). Projected area factor: Walkenhorst &
            David (2002). SVF per network node from OSM buildings (36-sector
            horizon scan, 250m radius) + Copernicus STL tree canopy (τ=0.3;
            Konarska et al. 2014). Sky LW: Brutsaert (1975) + cloud correction.
            Ground temperature: Sentinel-3 SLSTR when available, else Ta+2°C.
            Surface ε and albedo from building type × construction era lookup.
          </MethodSection>
          <MethodSection title="UTCI">
            Bröde et al. (2012) 6th-order polynomial. Wind corrected from 10m to
            1.1m via log profile; z₀ from local building density.
          </MethodSection>
          <MethodSection title="THERMOREGULATORY PENALTY">
            Fractional walking speed reduction per age group and acclimatisation.
            Sensitivity: Kenney & Munce (2003), Havenith (2001), Cramer & Jay
            (2019). Acclimatisation: Kobas et al. (2026, Scientific Reports).
          </MethodSection>
          <MethodSection title="ISOCHRONES">
            OSM pedestrian network via Overpass (mirror fallback). Time-budget
            Dijkstra. Shade routing penalises exposed edges by SVF × heat stress.
            Boundary: alpha-shape concave hull (Bowyer-Watson Delaunay).
          </MethodSection>
          <MethodSection title="LOST TERRITORY">
            Polygon difference: reference isochrone (healthy young adult,
            thermoneutral) vs thermal isochrone (selected group, current UTCI).
            Estimated via stratified point sampling (800 points per band).
          </MethodSection>
          <MethodSection title="UHI OFFSET CALIBRATION">
            Building density (buildings per km²) within 250m of click point.
            Dense urban (&gt;50/km²): +3.0°C day / +4.5°C night. Medium (20–50):
            +1.8°C / +2.8°C. Suburban (5–20): +0.8°C / +1.2°C. Open (&lt;5):
            +0.2°C / +0.4°C. Reference: Lauwaet et al. (2024) mean summer UHI
            for 100 European cities from UrbClim simulations.
          </MethodSection>
        </Modal>
      )}
    </div>
  );
}

// ── LostBlock — reusable lost territory sub-panel ─────────────────────────
function LostBlock({ label, sublabel, description, data, barColor, pctColor, agLabel }) {
  const C = {
    ink:"#111010", ink2:"#2E2B27", ink3:"#6B6560", ink4:"#A89E95",
    border:"#CCC8BF", bg3:"#D9D4C9",
  };
  const ISO_MINUTES = [5, 10, 15];
  if (!data) return null;
  const total = data[2];
  return (
    <div>
      <div style={{ fontSize:8, color:C.ink4, letterSpacing:"0.12em",
        marginBottom:2, fontWeight:500 }}>{label}</div>
      <div style={{ fontSize:8, color:C.ink4, marginBottom:5,
        lineHeight:1.4 }}>{sublabel}</div>
      <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:2 }}>
        <span style={{ fontFamily:"'Oswald',sans-serif", fontWeight:700,
          fontSize:24, color:pctColor, lineHeight:1 }}>
          {total?.lostPct ?? 0}%
        </span>
        <span style={{ fontSize:9, color:C.ink2 }}>of 15-min city</span>
      </div>
      <div style={{ fontSize:8, color:C.ink4, marginBottom:6 }}>
        {description}
      </div>
      {data.map((d, i) => (
        <div key={i} style={{ marginBottom:4 }}>
          <div style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", marginBottom:2, fontSize:9 }}>
            <span style={{ color:pctColor, fontWeight:700,
              letterSpacing:"0.04em" }}>{ISO_MINUTES[i]} MIN</span>
            <span style={{ color:C.ink4 }}>
              {formatArea(d.thermalArea)} / {formatArea(d.refArea)}
            </span>
            <span style={{ fontWeight:600,
              color:d.lostPct > 0 ? pctColor : C.ink4 }}>
              {d.lostPct > 0 ? `-${d.lostPct}%` : "—"}
            </span>
          </div>
          <div style={{ background:C.bg3, borderRadius:1, height:3 }}>
            <div style={{ height:"100%",
              width:`${Math.max(0, 100 - d.lostPct)}%`,
              background:barColor, opacity:0.45 + i * 0.2,
              borderRadius:1, transition:"width .4s" }}/>
          </div>
        </div>
      ))}
    </div>
  );
}
