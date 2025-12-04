import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Papa from 'papaparse';


// --- global  ---
let map; 
let providerCountByFIPS = {}; 

// ==========================================================
// 1. helper (not used)
// ==========================================================
function padFips(fips) {
    if (fips === null || fips === undefined) return '';
    return String(fips).padStart(3, '0');
}


document.addEventListener('DOMContentLoaded', () => {

    map = L.map('map').setView([32.9, -83.3], 7); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    loadAllDataAndDrawLayers();
});



function getDensityColor(x) {
    return x > 1000 ? "#1a9850" :
           x > 500  ? "#66bd63" :
           x > 200  ? "#d9ef8b" :
           x > 50   ? "#fee08b" :
           x > 10   ? "#f46d43" :
                       "#d73027";
}


function loadAllDataAndDrawLayers() {
    
    // --- load GeoJSON and create a name to FIPS lookup map ---
    
    const gaCountiesPromise = fetch('/data/Georgia_Counties.geojson')
        .then(r => r.json());

    gaCountiesPromise.then(async gaCounties => {
        
        const nameToFipsMap = {};
        
        gaCounties.features.forEach(f => {
            const countyName = f.properties.NAME10.trim().toUpperCase(); 
            const countyFips = String(f.properties.COUNTYFP10); 
            
            nameToFipsMap[countyName] = '13' + countyFips;
        });

        console.log(`Created Name-to-FIPS map with ${Object.keys(nameToFipsMap).length} entries.`);
        
        
        Papa.parse('final_cleaned_.csv', {
            download: true,
            header: true,
            dynamicTyping: false, 
            complete: ({ data }) => {
                console.log("🔥 Papa.parse COMPLETE fired for all data.");
                
                providerCountByFIPS = {};

                for (const r of data) {
                    const rawCountyName = r.COUNTYFP10;
                    
                    if (rawCountyName) {
                      console.log(`Processing county name from CSV: "${rawCountyName}"`);

                      const cleanedCSVName = String(rawCountyName)
                        .replace(/[^a-zA-Z\s]/g, '') 
                        .trim()
                        .toUpperCase(); // Normalize case
                        
                        const normalizedCountyName = rawCountyName.trim().toUpperCase();
                        
                        
                        const fipsKey = nameToFipsMap[normalizedCountyName]; 

                        if (fipsKey && fipsKey.length === 5) { 
                            providerCountByFIPS[fipsKey] = (providerCountByFIPS[fipsKey] || 0) + 1;
                        }
                    }
                }

                console.log("Total rows processed:", data.length);
                console.log("FIPS keys counted:", Object.keys(providerCountByFIPS).length);
                console.log("Sample FIPS keys generated from CSV:", Object.keys(providerCountByFIPS).slice(0, 5)); 
                
               
                drawChoropleth(gaCounties);
            }
        });
    });
}


function drawChoropleth(gaCounties) {
    L.geoJSON(gaCounties, {
        style: f => {
            
            const countyFips = String(f.properties.COUNTYFP10); 
            
            
            const fipsKey = '13' + countyFips;
            
           
            const count = providerCountByFIPS[fipsKey] || 0; 
            
            return {
                fillColor: getDensityColor(count),
                color: "white",
                weight: 1,
                fillOpacity: 0.65
            };
        },
        onEachFeature: (feature, layer) => {
            const countyFips = String(feature.properties.COUNTYFP10); 
            const fipsKey = '13' + countyFips;
            const count = providerCountByFIPS[fipsKey] || 0;
            
            const countyName = feature.properties.NAME10; 
            layer.bindPopup(`<b>${countyName} County</b><br>Providers: ${count}`);
        }
    }).addTo(map);

    
    const legend = L.control({ position: "bottomright" });
    legend.onAdd = function () {
        const div = L.DomUtil.create("div", "info legend");
        const grades = [0, 10, 50, 200, 500, 1000];
        div.innerHTML += "<b>Provider Density</b><br>";
        for (let i = 0; i < grades.length; i++) {
            div.innerHTML +=
            `<i style="background:${getDensityColor(grades[i] + 1)}"></i> ` +
            grades[i] +
            (grades[i + 1] ? `–${grades[i + 1]}<br>` : "+");
        }
        return div;
    };
    legend.addTo(map);
}