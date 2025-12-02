import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import Papa from 'papaparse';


// create map
const map = L.map('map').setView([32.9, -83.3], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const markerCluster = L.markerClusterGroup({
  iconCreateFunction: function (cluster) {
    const count = cluster.getChildCount();

    let color;
    if (count < 10) {
      color = '#F44336';  // green = low count
    } else if (count < 30) {
      color = '#FFEB3B';  // yellow = medium count
    } else {
      color = '#4CAF50';  // red = large groups
    }

    return L.divIcon({
      html: `<div style="
        background: ${color};
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #000;
        font-weight: bold;
        border: 2px solid #fff;
      ">${count}</div>`,
      className: 'custom-cluster',
      iconSize: [40, 40]
    });
  }
});


// ---------- helpers ----------
function getLat(r) {
  return r.lat ?? r.Lat ?? r.latitude ?? r.Latitude;
}
function getLon(r) {
  return r.lon ?? r.Lon ?? r.lng ?? r.Lng ?? r.longitude ?? r.Longitude;
}

// format address
function formatAddress(r) {
  return r.address_usps_standardized || r.address || "No address";
}

// format NP name
function formatName(r) {
  return `${r.Provider_First_Name || ''} ${r.Provider_Last_Name || ''}`.trim() || "Unnamed Provider";
}

// ---------- main: load CSV + clustered markers ----------
Papa.parse('public/data/providers_with_latlon3.csv', {
  download: true,
  header: true,
  dynamicTyping: true,
  complete: ({ data }) => {

    console.log("🔥 Papa.parse COMPLETE fired");
    console.log("CSV rows:", data.length);
    console.log("First row:", data[0]);

    let good = 0;
    for (const r of data) {
      const lat = Number(r.lat);
      const lon = Number(r.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        good++;
      }
    }
    console.log("Valid lat/lon rows:", good);

    // ---------------- marker creation ----------------
    for (const r of data) {
      const lat = Number(r.lat);
      const lon = Number(r.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const marker = L.marker([lat, lon]);
      marker.bindPopup(`
  <div style="min-width: 200px;">
    <b>${r.Provider_First_Name} ${r.Provider_Last_Name}</b><br/>
    NPI: ${r.NPI}<br/>
    Address: ${r.address_usps_standardized || r.address}<br/>
  </div>
`);

      markerCluster.addLayer(marker);
    }

    console.log("Markers in cluster:", markerCluster.getLayers().length);

    map.addLayer(markerCluster);
  }
});

