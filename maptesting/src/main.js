import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Papa from 'papaparse';


// --- global  ---
let map; 
let providerCountByFIPS = {}; 
let geoJsonLayer; // Added for drawChoropleth/filtering
let fullGeoJsonData; // Added for filtering
let allProviderData = []; // Added to store raw CSV data for filtering
let nameToFipsMap = {}; // Moved to global scope for filtering access


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
    
    const gaCountiesPromise = fetch('/data/Georgia_Counties.geojson')
        .then(r => r.json());

    gaCountiesPromise.then(async gaCounties => {
        
        fullGeoJsonData = gaCounties; // Store globally
        const countySelect = document.getElementById('countySelect');
        
        gaCounties.features.forEach(f => {
            const countyName = f.properties.NAME10; // Use raw name for display
            const countyFips = String(f.properties.COUNTYFP10); 
            
            const cleanedName = countyName.replace(/[^a-zA-Z\s]/g, '').trim().toUpperCase();
            nameToFipsMap[cleanedName] = '13' + countyFips;

            // Populate the County dropdown
            const option = document.createElement('option');
            option.value = countyFips;
            option.textContent = countyName;
            countySelect.appendChild(option);
        });

        console.log(`Created Name-to-FIPS map with ${Object.keys(nameToFipsMap).length} entries.`);
        
        // Add event listeners for the filters
        document.getElementById('countySelect').addEventListener('change', runCombinedFilter);
        document.getElementById('resetBtn').addEventListener('click', resetFilters);

        
        Papa.parse('/data/final_cleaned_.csv', {
            download: true,
            header: true,
            dynamicTyping: false, 
            complete: ({ data }) => {
                console.log("🔥 Papa.parse COMPLETE fired for all data.");
                
                allProviderData = data; // Store all data for type filtering

                const uniqueNpTypes = new Set();
                const npTypeSelect = document.getElementById('npTypeSelect');
                
                const providersMatched = initialCountAndTypePopulation(uniqueNpTypes);
                
                // Populate NP Type dropdown
                uniqueNpTypes.forEach(type => {
                    if (type && type !== '') {
                        const option = document.createElement('option');
                        option.value = type;
                        option.textContent = type;
                        npTypeSelect.appendChild(option);
                    }
                });
                
                document.getElementById('npTypeSelect').addEventListener('change', runCombinedFilter);

                console.log("Total rows processed:", data.length);
                console.log("FIPS keys counted:", Object.keys(providerCountByFIPS).length);
                console.log("Sample FIPS keys generated from CSV:", Object.keys(providerCountByFIPS).slice(0, 5)); 
                
                updateCountPill(providersMatched);
                drawChoropleth(fullGeoJsonData);
            }
        });
    });
}

function initialCountAndTypePopulation(uniqueNpTypes) {
    providerCountByFIPS = {};
    let providersMatched = 0;

    for (const r of allProviderData) {
        if (r.NP_Type_Final) {
            uniqueNpTypes.add(r.NP_Type_Final);
        }

        const rawCountyName = r.COUNTYFP10;
        
        if (rawCountyName) {
            const normalizedCountyName = String(rawCountyName)
                .replace(/[^a-zA-Z\s]/g, '') 
                .trim()
                .toUpperCase();
            
            const fipsKey = nameToFipsMap[normalizedCountyName]; 

            if (fipsKey && fipsKey.length === 5) { 
                providerCountByFIPS[fipsKey] = (providerCountByFIPS[fipsKey] || 0) + 1;
                providersMatched++;
            }
        }
    }
    return providersMatched;
}

function drawChoropleth(data) {
    if (geoJsonLayer) {
        map.removeLayer(geoJsonLayer);
    }
    
    geoJsonLayer = L.geoJSON(data, {
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

    if (data === fullGeoJsonData) {
        map.fitBounds(geoJsonLayer.getBounds());
    }
    
    if (!document.querySelector('.info.legend')) {
        addLegend();
    }
}

function runCombinedFilter() {
    // Force the dropdown value to be a string
    const selectedFIPS = String(document.getElementById('countySelect').value);
    const selectedNPType = document.getElementById('npTypeSelect').value;
    
    let filteredProviders = allProviderData;
    
    // 1. Filter Providers by NP Type
    if (selectedNPType !== '__ALL__') {
        filteredProviders = filteredProviders.filter(r => r.NP_Type_Final === selectedNPType);
    }

    const { newCountByFIPS, totalFilteredCount } = countFilteredProviders(filteredProviders);
    
    providerCountByFIPS = newCountByFIPS;
    
    const filteredFeatures = selectedFIPS === '__ALL__' 
        ? fullGeoJsonData.features
        // force String conversion on the GeoJSON property for strict matching
        : fullGeoJsonData.features.filter(f => String(f.properties.COUNTYFP10) === selectedFIPS);

    const filteredGeoJSON = {
        type: 'FeatureCollection',
        features: filteredFeatures
    };
    
    drawChoropleth(filteredGeoJSON);

    if (geoJsonLayer && filteredFeatures.length > 0) { 
            // Zoom to the bounds of the single feature
            try {
                map.fitBounds(geoJsonLayer.getBounds());
            } catch (e) {
                // If bounds calculation fails, reset view.
                map.setView([32.9, -83.3], 7);
                console.warn("Failed to fit bounds, reset to default view.");
            }
            
            if (selectedFIPS !== '__ALL__') {
              const countInSelectedCounty = newCountByFIPS['13' + selectedFIPS] || 0;
              updateCountPill(countInSelectedCounty);
        } else {
            // Zoom to the full extent of the current layer (or total data if __ALL__)
            updateCountPill(totalFilteredCount);
        }
    } else {
        updateCountPill(0);
    }
}

function countFilteredProviders(providers) {
    const newCountByFIPS = {};
    let totalFilteredCount = 0;
    
    for (const r of providers) {
        const rawCountyName = r.COUNTYFP10; 
        
        if (rawCountyName) {
            const normalizedCountyName = String(rawCountyName).replace(/[^a-zA-Z\s]/g, '').trim().toUpperCase();
            const fipsKey = nameToFipsMap[normalizedCountyName]; 

            if (fipsKey && fipsKey.length === 5) { 
                newCountByFIPS[fipsKey] = (newCountByFIPS[fipsKey] || 0) + 1;
                totalFilteredCount++;
            }
        }
    }
    return { newCountByFIPS, totalFilteredCount };
}

function resetFilters() {
    document.getElementById('countySelect').value = '__ALL__';
    document.getElementById('npTypeSelect').value = '__ALL__';
    runCombinedFilter();
}


function updateCountPill(shownCount) {
    const totalCount = Object.values(allProviderData).length;
    document.getElementById('counts').innerHTML = `Showing ${shownCount.toLocaleString()} / ${totalCount.toLocaleString()}`;
}


function addLegend() {
    const legend = L.control({ position: "bottomright" });
    legend.onAdd = function () {
        const div = L.DomUtil.create("div", "info legend");
        const grades = [0, 10, 50, 200, 500, 1000];
        
        div.innerHTML = "<b>Provider Density</b><br>";
        
        // Loop through density intervals and generate a label with a color key
        for (let i = 0; i < grades.length; i++) {
            
            const color = getDensityColor(grades[i] + 1);
            
            const labelText = grades[i + 1] 
                ? `${grades[i]} &ndash; ${grades[i + 1]}` 
                : `${grades[i]} +`;

            // The 'i' element gets the background color from our function
            div.innerHTML +=
                '<i style="background:' + color + '"></i> ' + 
                labelText + 
                '<br>'; 
        }
        return div;
    };
    legend.addTo(map);
}