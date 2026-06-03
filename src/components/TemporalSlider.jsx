import React from "react";

export default function TemporalSlider({ hourly, selectedHour, onChange }) {
  if (!hourly?.length) return null;

  const now = new Date().getHours();

  return (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e293b" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em" }}>
          TIME OF DAY
        </div>
        <div style={{ fontSize: 10, color: "#f472b6", fontWeight: 500 }}>
          {formatHour(hourly[selectedHour]?.hour ?? now)}
          {selectedHour === 0 && <span style={{ color: "#475569", marginLeft: 4 }}>· now</span>}
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={hourly.length - 1}
        value={selectedHour}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width:      "100%",
          accentColor: "#f472b6",
          cursor:     "pointer",
          marginBottom: 4,
        }}
      />

      {/* Radiation sparkline */}
      <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 20, marginTop: 4 }}>
        {hourly.map((h, i) => {
          const maxRad = Math.max(...hourly.map(x => x.directRad + x.diffuseRad));
          const val    = (h.directRad + h.diffuseRad) / (maxRad || 1);
          const active = i === selectedHour;
          return (
            <div
              key={i}
              onClick={() => onChange(i)}
              style={{
                flex:         1,
                height:       `${Math.max(2, val * 20)}px`,
                background:   active ? "#f472b6" : val > 0.1 ? "#f59e0b44" : "#1e293b",
                borderRadius: 1,
                cursor:       "pointer",
                transition:   "background .1s",
              }}
              title={`${formatHour(h.hour)} · ${Math.round(h.ta)}°C · ${Math.round(h.directRad)}W/m²`}
            />
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#334155", marginTop: 2 }}>
        <span>now</span>
        <span style={{ color: "#475569", fontSize: 9 }}>
          {Math.round(hourly[selectedHour]?.ta ?? 0)}°C ·{" "}
          {Math.round(hourly[selectedHour]?.directRad ?? 0)}W/m² direct
        </span>
        <span>+24h</span>
      </div>
    </div>
  );
}

function formatHour(h) {
  if (h == null) return "--:--";
  return `${String(h).padStart(2, "0")}:00`;
}
