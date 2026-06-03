import React from "react";
import { MONTH_NAMES } from "../lib/climate.js";

const C = {
  ink:"#111010", ink3:"#6B6560", ink4:"#A89E95",
  border:"#CCC8BF", bg2:"#E6E2D9", white:"#FAF8F4",
};

const SHORT = MONTH_NAMES.map(m => m.slice(0,3).toUpperCase());

export default function MonthPicker({ month, onMonthChange }) {
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
      {SHORT.map((m, i) => {
        const mo     = i + 1;
        const active = month === mo;
        return (
          <button key={mo} onClick={() => onMonthChange(mo)} style={{
            background: active ? C.ink : C.bg2,
            border:     `1px solid ${active ? C.ink : C.border}`,
            borderRadius: 2,
            padding:    "2px 6px",
            color:      active ? C.white : C.ink3,
            fontSize:   9,
            fontWeight: active ? 600 : 400,
            cursor:     "pointer",
            fontFamily: "inherit",
            transition: "all .1s",
          }}>{m}</button>
        );
      })}
    </div>
  );
}
