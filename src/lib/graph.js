/**
 * Graph utilities v2.1
 * Fix: shade routing uses time-based Dijkstra (minutes budget)
 * so penalised routes correctly shrink the time budget rather
 * than being cut by a metre threshold.
 */
import { computeSVF } from "./svf.js";

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6_371_000;
  const dLat = ((lat2-lat1)*Math.PI)/180;
  const dLon = ((lon2-lon1)*Math.PI)/180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

export function buildGraph(elements) {
  const nodes={}, graph={}, buildings=[], osmTrees=[];
  for (const el of elements) {
    if (el.type==="node") nodes[el.id]={lat:el.lat,lon:el.lon,tags:el.tags||{}};
  }
  for (const el of elements) {
    if (el.type!=="way"||!el.nodes) continue;
    if (el.tags?.highway) {
      for (let i=0;i<el.nodes.length-1;i++) {
        const a=el.nodes[i],b=el.nodes[i+1];
        if (!nodes[a]||!nodes[b]) continue;
        const d=haversine(nodes[a].lat,nodes[a].lon,nodes[b].lat,nodes[b].lon);
        if (!graph[a]) graph[a]=[];
        if (!graph[b]) graph[b]=[];
        graph[a].push({id:b,dist:d});
        graph[b].push({id:a,dist:d});
      }
    }
    if (el.tags?.building) {
      const nds=el.nodes.map(id=>nodes[id]).filter(Boolean);
      if (!nds.length) continue;
      const lat=nds.reduce((s,n)=>s+n.lat,0)/nds.length;
      const lon=nds.reduce((s,n)=>s+n.lon,0)/nds.length;
      buildings.push({lat,lon,height:resolveHeight(el.tags),tags:el.tags});
    }
  }
  for (const el of elements) {
    if (el.type==="node"&&el.tags?.natural==="tree") osmTrees.push({lat:el.lat,lon:el.lon});
  }
  return {nodes,graph,buildings,osmTrees};
}

export function computeNodeSVFs(nodes,graph,buildings,treePolygons,osmTrees) {
  const nodeIds=Object.keys(graph);
  const svfMap=new Map();
  const MIN_SPACING=15;
  const computed=[];
  for (const id of nodeIds) {
    const n=nodes[id]; if (!n) continue;
    const near=computed.find(c=>haversine(n.lat,n.lon,c.lat,c.lon)<MIN_SPACING);
    if (near) { svfMap.set(id,near.svf); }
    else {
      const svf=computeSVF(n.lat,n.lon,buildings,treePolygons,osmTrees);
      svfMap.set(id,svf);
      computed.push({lat:n.lat,lon:n.lon,svf});
    }
  }
  return svfMap;
}

/**
 * Dijkstra — time budget in SECONDS
 * effSpeed: metres per second
 * shadePrefer: penalises high-SVF (exposed) edges by consuming more time budget
 * Returns {nodeId: timeSpentSeconds}
 */
export function dijkstra(startLat,startLon,nodes,graph,timeBudgetSec,effSpeedMs,
  svfMap=null,utci=17.5,shadePrefer=false) {

  // Use the nearest WALKABLE graph node, not the nearest OSM node.
  // `nodes` also contains building vertices, POIs, trees, etc.; many of those
  // have no graph edges. If Dijkstra starts on one of them, reachable contains
  // only the start point, so no isochrone polygon can be drawn.
  let nearest = null, nearestD = Infinity;
  for (const id of Object.keys(graph)) {
    const n = nodes[id];
    if (!n || !graph[id]?.length) continue;
    const d = haversine(startLat, startLon, n.lat, n.lon);
    if (d < nearestD) { nearestD = d; nearest = id; }
  }
  if (!nearest) return {};

  const heatStress=utci>26;
  const stressLevel=heatStress?Math.min(1,(utci-26)/20):0;

  const time={[nearest]:0};
  const queue=[{id:nearest,t:0}];

  while (queue.length) {
    queue.sort((a,b)=>a.t-b.t);
    const {id,t}=queue.shift();
    if (t>time[id]) continue;
    for (const edge of (graph[id]||[])) {
      const nb=edge.id;
      // Convert distance to time using effective speed
      const baseTime=edge.dist/effSpeedMs;
      // Shade BENEFIT: shaded edges (low SVF) cost LESS time.
      // Low SVF = sheltered = walker sustains pace longer.
      // High SVF = exposed = no extra benefit beyond baseline penalty.
      // This correctly EXPANDS isochrones toward shaded routes.
      const svf=shadePrefer&&svfMap?(svfMap.get(nb)??0.85):0.85;
      // Up to 30% time saving on fully shaded (SVF≈0) edges under heat stress
      const shadeBenefit=shadePrefer&&heatStress
        ? 1 - stressLevel*(1-svf)*0.3
        : 1;
      const nt=t+baseTime*shadeBenefit;
      if (nt<timeBudgetSec&&(time[nb]===undefined||nt<time[nb])) {
        time[nb]=nt;
        queue.push({id:nb,t:nt});
      }
    }
  }
  return time;
}

export function meanPathSVF(reachable,svfMap) {
  let sumSVF=0,sumW=0;
  for (const [id,t] of Object.entries(reachable)) {
    const svf=svfMap?.get(id)??0.85;
    const w=1/(t+1);
    sumSVF+=svf*w; sumW+=w;
  }
  return sumW>0?sumSVF/sumW:0.85;
}

export function resolveHeight(tags) {
  if (tags.height){const h=parseFloat(tags.height);if(!isNaN(h)&&h>0)return h;}
  if (tags["building:levels"]){const l=parseFloat(tags["building:levels"]);if(!isNaN(l)&&l>0)return l*3.2;}
  return buildingTypePrior(tags.building);
}

function buildingTypePrior(type) {
  const p={house:6.5,detached:6.5,semidetached_house:6.5,terrace:7,apartments:14,
    residential:10,commercial:9,retail:5,office:18,industrial:8,warehouse:8,
    church:20,cathedral:30,school:9,university:12,hospital:15,hotel:20,garage:3,shed:2.5};
  return p[type]??7;
}

export function correctWindHeight(ws10m,buildingCount,radiusM=250) {
  const density=buildingCount/(Math.PI*radiusM**2/1e6);
  const z0=density>50?1.2:density>20?0.8:density>5?0.4:0.1;
  return Math.max(0.5,ws10m*Math.log(1.1/z0)/Math.log(10/z0));
}
