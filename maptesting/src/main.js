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
// family phys data
let countyPsychDataByFIPS = {}; 
// phys data
let countyPhysicianNPDataByFIPS = {};

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
    const physicianSelect = document.getElementById('physicianSelect'); 
    if(physicianSelect){
      physicianSelect.addEventListener("change", runCombinedFilter);
    }

    const gaCountiesPromise = fetch('/data/Georgia_Counties.geojson')
        .then(r => r.json());

    gaCountiesPromise.then(async gaCounties => {
        
        fullGeoJsonData = gaCounties; 
        const countySelect = document.getElementById('countySelect');
        
        gaCounties.features.forEach(f => {
            const countyName = f.properties.NAME10; 
            const countyFips = String(f.properties.COUNTYFP10); 
            
            const cleanedName = countyName.replace(/[^a-zA-Z\s]/g, '').trim().toUpperCase();
            nameToFipsMap[cleanedName] = '13' + countyFips;

            const option = document.createElement('option');
            option.value = countyFips;
            option.textContent = countyName;
            countySelect.appendChild(option);
        });

        console.log(`Created Name-to-FIPS map with ${Object.keys(nameToFipsMap).length} entries.`);
        
        document.getElementById('countySelect').addEventListener('change', runCombinedFilter);
        document.getElementById('resetBtn').addEventListener('click', resetFilters);


        const psychDataPromise = new Promise(resolve => {
            Papa.parse('/data/family_physician_count_rate.csv', {
                download: true,
                header: true,
                dynamicTyping: true, 
                complete: ({ data }) => {
                    data.forEach(row => {
                      const normalizedName = String(row.COUNTYFP10)
                        .replace(/[^a-zA-Z\s]/g, '')
                        .trim()
                        .toUpperCase();

                        const fipsKey = nameToFipsMap[normalizedName];
                        if(!fipsKey){
                          console.warn("No FIPS found for county name:", row.COUNTYFP10, normalizedName);
                          return
                        } 
                        
                        countyPsychDataByFIPS[fipsKey] = {
                            famPsych_num: row.famPsych_num,
                            famPsych_rate: row.famPsych_rate
                        };
                    });
                    console.log("Loaded psych data for", Object.keys(countyPsychDataByFIPS).length, "counties.");
                    resolve();
                }
            });
        });

        const physicianNpDataPromise = new Promise(resolve => {
            Papa.parse('/data/total_physician_np_count_ratio.csv', { // *** ASSUMING THIS IS THE FILE PATH ***
                download: true,
                header: true,
                dynamicTyping: true, 
                complete: ({ data }) => {
                    data.forEach(row => {
                      // Note: COUNTYFP10 in the CSV seems to be the name, let's use nameToFipsMap
                      const normalizedName = String(row.COUNTYFP10)
                        .replace(/[^a-zA-Z\s]/g, '')
                        .trim()
                        .toUpperCase();

                        const fipsKey = nameToFipsMap[normalizedName];

                        if(!fipsKey){
                          console.warn("No FIPS found for county name (phys/np):", row.COUNTYFP10, normalizedName);
                          return
                        } 
                        
                        countyPhysicianNPDataByFIPS[fipsKey] = {
                            phys_count: row.phys_count,
                            phys_rate_p_100k: row.phys_rate_p_100k,
                            '2023_pop': row['2023_pop'],
                            NP_count: row.NP_count,
                            NP_rate_p_100k: row.NP_rate_p_100k,
                            NP_to_phy_ratio: row.NP_to_phy_ratio
                        };
                    });
                    console.log("Loaded Physician/NP data for", Object.keys(countyPhysicianNPDataByFIPS).length, "counties.");
                    resolve();
                }
            });
        });
      
        Promise.all([psychDataPromise, physicianNpDataPromise]).then(() => {
            Papa.parse('/data/final_cleaned_.csv', {
                download: true,
                header: true,
                dynamicTyping: false, 
                complete: ({ data }) => {
                    console.log("Papa.parse COMPLETE fired for all data.");
                    
                    allProviderData = data; 

                    const uniqueNpTypes = new Set();
                    const npTypeSelect = document.getElementById('npTypeSelect');
                    
                    const providersMatched = initialCountAndTypePopulation(uniqueNpTypes);
                    
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
                    const loadingDiv = document.getElementById('loadingMessage');
                    if (loadingDiv) {
                        loadingDiv.style.display = 'none';
                    }
                }
            });
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
            const fipsKey = '13' + padFips(countyFips); 
            const count = providerCountByFIPS[fipsKey] || 0;
            
            const countyName = feature.properties.NAME10; 
            const psychData = countyPsychDataByFIPS[fipsKey] || { psych_num: 'N/A', psych_rate: 'N/A' };

            const physNpData = countyPhysicianNPDataByFIPS[fipsKey] || { 
              phys_count: 'N/A', 
              phys_rate_p_100k: 'N/A', 
              '2023_pop': 'N/A', 
              NP_count: 'N/A', 
              NP_rate_p_100k: 'N/A', 
              NP_to_phy_ratio: 'N/A' 
            };

            const ratioDisplay = typeof physNpData.NP_to_phy_ratio === 'string' && physNpData.NP_to_phy_ratio.toUpperCase() === 'N/A'
            ? 'N/A'
            : (typeof physNpData.NP_to_phy_ratio === 'number' ? physNpData.NP_to_phy_ratio.toFixed(2) : physNpData.NP_to_phy_ratio);

            layer.bindPopup(
                `<b>${countyName} County</b><br>` +
                `<b>2023-2024 Population:</b> ${physNpData['2023_pop'].toLocaleString()}<br>` +

                `<hr style="margin: 5px 0;">` +

                `<b>Nurse Practitioner Count:</b> ${physNpData.NP_count}<br>` +
                `<b>NP Rate per 100k:</b> ${physNpData.NP_rate_p_100k} <br>` +

                `<hr style="margin: 5px 0;">` +

                `<b>All Physician Count:</b> ${physNpData.phys_count}<br>` +
                `<b>Physician Rate per 100k:</b> ${physNpData.phys_rate_p_100k} <br>` +
                `<b>NP to Physician Ratio:</b> ${ratioDisplay}<br>` +

                `<hr style="margin: 5px 0;">` +

                `<b>Family Physicians:</b> ${psychData.famPsych_num}<br>` +
                `<b>Family Physicians Rate per 100k:</b> ${psychData.famPsych_rate}<br>`
            );
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
    
    const selectedFIPS = String(document.getElementById('countySelect').value);
    const selectedNPType = document.getElementById('npTypeSelect').value;
    const physicianMetric = document.getElementById("physicianSelect").value;

    
    // --- NO PSYCH FILTER LOGIC HERE ---
    
    let filteredProviders = allProviderData;
    
   
    if (selectedNPType !== '__ALL__') {
        filteredProviders = filteredProviders.filter(r => r.NP_Type_Final === selectedNPType);
    }

    const { newCountByFIPS, totalFilteredCount } = countFilteredProviders(filteredProviders);
    
    providerCountByFIPS = newCountByFIPS;
    
    
    let filteredFeatures = fullGeoJsonData.features;

    if (selectedFIPS !== '__ALL__') {
        filteredFeatures = filteredFeatures.filter(f => String(f.properties.COUNTYFP10) === selectedFIPS);
    }

    const filteredGeoJSON = {
        type: 'FeatureCollection',
        features: filteredFeatures
    };
    
    drawChoropleth(filteredGeoJSON, '__ALL__');

    if (geoJsonLayer && filteredFeatures.length > 0) { 
           
            try {
                map.fitBounds(geoJsonLayer.getBounds());
            } catch (e) {
              
                map.setView([32.9, -83.3], 7);
                console.warn("Failed to fit bounds, reset to default view.");
            }
            
            if (selectedFIPS !== '__ALL__') {
              const countInSelectedCounty = newCountByFIPS['13' + selectedFIPS] || 0;
              updateCountPill(countInSelectedCounty);
        } else {
           
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
        
        div.innerHTML = "<b>Nurse Practicioner Density</b><br>";
        
        for (let i = 0; i < grades.length; i++) {
            
            const color = getDensityColor(grades[i] + 1);
            
            const labelText = grades[i + 1] 
                ? `${grades[i]} &ndash; ${grades[i + 1]}` 
                : `${grades[i]} +`;

           
            div.innerHTML +=
                '<i style="background:' + color + '"></i> ' + 
                labelText + 
                '<br>'; 
        }
        return div;
    };
    legend.addTo(map);
}