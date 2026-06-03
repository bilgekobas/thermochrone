import React from "react";
import { ACCLIMATISATION_STATES } from "../lib/penalty.js";

export default function AcclimatisationSelector({ selected, onChange }) {
  return (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e293b" }}>
      <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em", marginBottom: 7 }}>
        ACCLIMATISATION STATE
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        {ACCLIMATISATION_STATES.map(s => {
          const active = selected === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onChange(s.id)}
              title={s.sublabel}
              style={{
                flex:         1,
                background:   active ? s.color + "22" : "#1e293b",
                border:       `1px solid ${active ? s.color : "#334155"}`,
                borderRadius: 6,
                padding:      "6px 4px",
                color:        active ? s.color : "#64748b",
                fontSize:     10,
                cursor:       "pointer",
                fontFamily:   "inherit",
                textAlign:    "center",
                transition:   "all .15s",
              }}
            >
              <div style={{ fontSize: 14, marginBottom: 2 }}>{s.icon}</div>
              <div style={{ fontWeight: active ? 500 : 400 }}>{s.label}</div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 9, color: "#334155", marginTop: 5, lineHeight: 1.5 }}>
        {ACCLIMATISATION_STATES.find(s => s.id === selected)?.sublabel}
        {" · "}
        <span style={{ color: "#1e293b" }}>
          Based on Kobas et al. (2026) — continuous AC attenuates thermophysiological adaptation
        </span>
      </div>
    </div>
  );
}
