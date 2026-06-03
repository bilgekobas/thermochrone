import React from "react";
import { AGE_GROUPS } from "../lib/penalty.js";

export default function AgeGroupSelector({ selected, onChange }) {
  return (
    <div style={{ padding: "13px 14px", borderBottom: "1px solid #1e293b" }}>
      <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em", marginBottom: 8 }}>
        AGE GROUP
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {AGE_GROUPS.map(g => {
          const active = selected === g.id;
          return (
            <button
              key={g.id}
              onClick={() => onChange(g.id)}
              title={g.note}
              style={{
                background:   active ? "#f472b622" : "#1e293b",
                border:       `1px solid ${active ? "#f472b6" : "#334155"}`,
                borderRadius: 6,
                padding:      "5px 8px",
                color:        active ? "#f472b6" : "#94a3b8",
                fontSize:     11,
                cursor:       "pointer",
                transition:   "all .15s",
                fontFamily:   "inherit",
              }}
            >
              {g.icon} {g.label}
            </button>
          );
        })}
      </div>
      {(() => {
        const g = AGE_GROUPS.find(g => g.id === selected);
        return g ? (
          <div style={{ fontSize: 9, color: "#475569", marginTop: 6, lineHeight: 1.5 }}>
            {g.range} · base {g.baseSpeed} m/min · {g.note}
          </div>
        ) : null;
      })()}
    </div>
  );
}
