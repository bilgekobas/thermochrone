import React, { useState, useRef, useEffect, useCallback } from "react";
import { geocodeSearch } from "../lib/fetch.js";

const C = {
  ink:"#111010", ink3:"#6B6560", ink4:"#A89E95",
  accent:"#FF1654", border:"#CCC8BF",
  white:"#FAF8F4", bg2:"#E6E2D9",
};

export default function SearchBar({ onSelect, mapRef }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef  = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInput = useCallback((val) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await geocodeSearch(val);
        setResults(data);
        setOpen(data.length > 0);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 400); // 400ms debounce — reduces Nominatim calls
  }, []);

  const handleSelect = useCallback((item) => {
    const lat = parseFloat(item.lat), lon = parseFloat(item.lon);
    setQuery(item.display_name.split(",").slice(0,2).join(", "));
    setOpen(false); setResults([]);
    if (mapRef?.current) mapRef.current.setView([lat, lon], 14, { animate:true });
    onSelect(lat, lon);
  }, [onSelect, mapRef]);

  const handleKey = useCallback((e) => {
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
    if (e.key === "Enter" && results.length > 0) handleSelect(results[0]);
  }, [results, handleSelect]);

  return (
    <div ref={wrapperRef} style={{ position:"relative", width:"100%" }}>
      <div style={{
        display:"flex", alignItems:"center", gap:8,
        background:C.white, border:`1px solid ${open?C.accent:C.border}`,
        borderRadius:4, padding:"0 10px",
        boxShadow: open?"0 0 0 2px #FF165418":"0 2px 8px rgba(0,0,0,0.08)",
        transition:"all .15s",
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke={loading?C.accent:C.ink4} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" value={query}
          onChange={e=>handleInput(e.target.value)}
          onKeyDown={handleKey}
          onFocus={()=>results.length>0&&setOpen(true)}
          placeholder="Search city, address, location…"
          style={{
            flex:1, border:"none", outline:"none", background:"transparent",
            fontFamily:"'DM Mono',monospace", fontSize:11, color:C.ink,
            padding:"8px 0", letterSpacing:"0.02em",
          }}/>
        {query && (
          <button onClick={()=>{setQuery("");setResults([]);setOpen(false);}}
            style={{background:"none",border:"none",cursor:"pointer",
              color:C.ink4,fontSize:16,lineHeight:1,padding:"2px"}}>×</button>
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{
          position:"absolute", top:"calc(100% + 4px)", left:0, right:0,
          background:C.white, border:`1px solid ${C.border}`,
          borderRadius:4, overflow:"hidden", zIndex:500,
          boxShadow:"0 4px 20px rgba(0,0,0,0.12)",
        }}>
          {results.map((item, i) => {
            const parts   = item.display_name.split(", ");
            const name    = parts[0];
            const context = parts.slice(1,4).join(", ");
            return (
              <div key={item.place_id} onClick={()=>handleSelect(item)}
                style={{
                  padding:"8px 12px", cursor:"pointer",
                  borderBottom:i<results.length-1?`1px solid ${C.border}`:"none",
                }}
                onMouseEnter={e=>e.currentTarget.style.background=C.bg2}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{fontSize:11,color:C.ink,fontWeight:500,
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {name}
                </div>
                <div style={{fontSize:9,color:C.ink4,marginTop:2,
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {context}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
