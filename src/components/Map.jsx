import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { dijkstra, meanPathSVF } from "../lib/graph.js";
import { alphaShape } from "../lib/alphashape.js";
import { AGE_GROUPS, thermalPenalty } from "../lib/penalty.js";
import { utciCategory } from "../lib/utci.js";

export const ISO_MINUTES = [5, 10, 15];

function reachableToPoints(reachable, nodes) {
  const pts = [];
  for (const id of Object.keys(reachable)) {
    const n = nodes[id];
    if (n && typeof n.lon === "number" && typeof n.lat === "number") {
      pts.push([n.lon, n.lat]);
    }
  }
  return pts;
}

// All draw logic in a pure function — no closure, no stale values
function drawIsochrones(leafletMap, layers, params) {
  const {
    nodes, graph, svfMap, lat, lon,
    selectedGroup, acclimatisation,
    showRefYoung, showRefSameGroup,
    shadePrefer, utciVal,
  } = params;

  if (!nodes || !graph || lat == null || lon == null) return;

  // Re-add layer groups if needed, then clear
  const lg = layers;
  Object.values(lg).forEach(l => {
    if (l && !leafletMap.hasLayer(l)) l.addTo(leafletMap);
    l?.clearLayers();
  });

  const ag = AGE_GROUPS.find(g => g.id === selectedGroup);
  if (!ag) return;

  const penalty    = thermalPenalty(utciVal, selectedGroup, acclimatisation);
  const effSpeedMs = ag.baseSpeed * (1 - penalty) / 60;

  // Thermal isochrones — largest first so smallest renders on top
  [...ISO_MINUTES].reverse().forEach((mins, revIdx) => {
    const i         = ISO_MINUTES.length - 1 - revIdx;
    const reachable = dijkstra(lat, lon, nodes, graph,
      mins * 60, effSpeedMs, svfMap, utciVal, shadePrefer && utciVal > 26);
    const pts  = reachableToPoints(reachable, nodes);
    if (pts.length < 4) return;
    const ring = alphaShape(pts);
    if (!ring || ring.length < 3) return;
    const meanSVF = meanPathSVF(reachable, svfMap);
    L.polygon(ring.map(([ln, lt]) => [lt, ln]), {
      color: "#FF1654", fillColor: "#FF1654",
      fillOpacity: 0.07 + i * 0.04,
      weight: 1.5 + i * 0.5,
      opacity: 0.9,
    }).bindTooltip(
      `${mins} min · ${Math.round(mins * effSpeedMs * 60)}m · SVF ${meanSVF.toFixed(2)}`,
      { direction: "top", sticky: true }
    ).addTo(lg.thermal);
  });

  // Ref: young adult neutral
  if (showRefYoung) {
    [...ISO_MINUTES].reverse().forEach(mins => {
      const reachable = dijkstra(lat, lon, nodes, graph, mins * 60, 83 / 60);
      const pts  = reachableToPoints(reachable, nodes);
      if (pts.length < 4) return;
      const ring = alphaShape(pts);
      if (!ring || ring.length < 3) return;
      L.polygon(ring.map(([ln, lt]) => [lt, ln]), {
        color: "#94a3b8", fillOpacity: 0,
        weight: 1.5, opacity: 0.6, dashArray: "6 5",
      }).addTo(lg.refYoung);
    });
  }

  // Ref: same group neutral
  if (showRefSameGroup) {
    [...ISO_MINUTES].reverse().forEach(mins => {
      const reachable = dijkstra(lat, lon, nodes, graph, mins * 60, ag.baseSpeed / 60);
      const pts  = reachableToPoints(reachable, nodes);
      if (pts.length < 4) return;
      const ring = alphaShape(pts);
      if (!ring || ring.length < 3) return;
      L.polygon(ring.map(([ln, lt]) => [lt, ln]), {
        color: "#7c3aed", fillOpacity: 0,
        weight: 1.5, opacity: 0.6, dashArray: "3 4",
      }).addTo(lg.refSame);
    });
  }

  // Origin pin
  const div = document.createElement("div");
  div.style.cssText = "width:12px;height:12px;background:#FF1654;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4);";
  L.marker([lat, lon], {
    icon: L.divIcon({ html: div.outerHTML, className: "", iconSize: [12, 12], iconAnchor: [6, 6] }),
    zIndexOffset: 1000,
  }).addTo(lg.origin);

  // Pan to location
  leafletMap.setView([lat, lon], 14, { animate: true });
}

export default function MapComponent({
  onMapClick, analysisResult,
  selectedGroup, acclimatisation,
  showRefYoung, showRefSameGroup,
  shadePrefer, utciVal, mapRefOut,
  drawKey,
}) {
  const mapDivRef  = useRef(null);
  const leafletMap = useRef(null);
  const layers     = useRef({ thermal: null, refYoung: null, refSame: null, origin: null });

  // Init map once
  useEffect(() => {
    if (leafletMap.current) return;
    const map = L.map(mapDivRef.current, { zoomControl: false }).setView([48.137, 11.576], 14);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap contributors © CARTO", maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    Object.keys(layers.current).forEach(k => {
      layers.current[k] = L.layerGroup().addTo(map);
    });
    map.on("click", e => onMapClick(e.latlng.lat, e.latlng.lng));
    leafletMap.current = map;
    if (mapRefOut) mapRefOut.current = map;
    return () => { map.remove(); leafletMap.current = null; };
  }, []); // eslint-disable-line

  // Redraw — passes ALL params explicitly to avoid stale closure
  useEffect(() => {
    if (!analysisResult || !leafletMap.current) return;

    leafletMap.current.invalidateSize();

    const params = {
      nodes: analysisResult.nodes,
      graph: analysisResult.graph,
      svfMap: analysisResult.svfMap,
      lat: analysisResult.lat,
      lon: analysisResult.lon,
      selectedGroup,
      acclimatisation,
      showRefYoung,
      showRefSameGroup,
      shadePrefer,
      utciVal,
    };

    const container = leafletMap.current.getContainer();
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
      const timer = setTimeout(() => {
        if (!leafletMap.current) return;
        leafletMap.current.invalidateSize();
        drawIsochrones(leafletMap.current, layers.current, params);
      }, 150);
      return () => clearTimeout(timer);
    }

    drawIsochrones(leafletMap.current, layers.current, params);

  }, [analysisResult, selectedGroup, acclimatisation, showRefYoung, showRefSameGroup, shadePrefer, utciVal, drawKey]); // eslint-disable-line

  return <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />;
}
