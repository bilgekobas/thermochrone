import React from "react";
import { formatArea } from "../lib/lostterritory.js";

const ISO_COLORS = ["#22d3ee", "#818cf8", "#f472b6"];
const ISO_MINS   = [5, 10, 15];

export default function LostTerritoryPanel({ lostData, selectedGroup, agLabel }) {
  if (!lostData?.length) return null;

  const total15 = lostData[2];

  return (
    <div style={{
      margin: "0 0 12px",
      background: "#1e293b",
      borderRadius: 10,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding:    "10px 12px 8px",
        borderBottom: "1px solid #0f172a",
      }}>
        <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.08em", marginBottom: 4 }}>
          THERMALLY LOST TERRITORY
        </div>
        {total15 && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 500, color: "#f97316" }}>
              {total15.lostPct}%
            </span>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>
              of 15-min city lost
            </span>
          </div>
        )}
        {total15 && (
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
            {formatArea(total15.lostArea)} unreachable ·{" "}
            {agLabel} under current conditions
          </div>
        )}
      </div>

      {/* Per-band breakdown */}
      <div style={{ padding: "8px 12px" }}>
        {lostData.map((d, i) => (
          <div key={i} style={{ marginBottom: i < 2 ? 8 : 0 }}>
            <div style={{
              display:        "flex",
              justifyContent: "space-between",
              alignItems:     "center",
              marginBottom:   3,
              fontSize:       10,
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  display:      "inline-block",
                  width:        10, height: 10,
                  borderRadius: 2,
                  background:   ISO_COLORS[i] + "44",
                  border:       `1px solid ${ISO_COLORS[i]}`,
                }} />
                <span style={{ color: ISO_COLORS[i] }}>{ISO_MINS[i]} min</span>
              </span>
              <span style={{ color: "#64748b" }}>
                {formatArea(d.thermalArea)} / {formatArea(d.refArea)}
              </span>
              <span style={{
                color:     d.lostPct > 30 ? "#ef4444" : d.lostPct > 10 ? "#f97316" : "#22c55e",
                fontWeight: 500,
              }}>
                {d.lostPct > 0 ? `−${d.lostPct}%` : "no loss"}
              </span>
            </div>
            <div style={{ background: "#0f172a", borderRadius: 3, height: 4 }}>
              <div style={{
                height:     "100%",
                width:      `${Math.max(0, 100 - d.lostPct)}%`,
                background: ISO_COLORS[i],
                borderRadius: 3,
                transition: "width .4s",
              }} />
            </div>
          </div>
        ))}
      </div>

      {total15?.gainedArea > 0 && (
        <div style={{ padding: "0 12px 10px", fontSize: 9, color: "#22c55e" }}>
          +{formatArea(total15.gainedArea)} gained (mild conditions extend range)
        </div>
      )}
    </div>
  );
}
