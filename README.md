# Mapping Georgia's Nurse Practitioner Workforce
Overview:

This project creates an interactive, county-level choropleth map demonstrating the density and specialty distribution of Nurse Practitioners (NPs) across the state of Georgia. Developed for the **_Georgia Nursing Workforce Center at Emory University's Nell Hodgson Woodruff School of Nursing_**, this tool aims to provide clear data visualization to support workforce projections and research.


The primary deliverable is a user-friendly, publicly available map that enables researchers and policymakers to visually identify areas of high or low NP saturation across the state, broken down by specialty. The map serves as a vital tool for understanding NP resource allocation and identifying potential geographical gaps in the nursing workforce.


## Key Features
This interactive map has been built for analyzing NP density and specialties:

*Interactive County-Level Mapping:* The map displays density shading across all 159 Georgia counties, providing immediate insight into the distribution of the NP workforce.

*Specialty Filtering:* Users can select any single NP specialty (e.g., Adult/Gero Acute Care NP, Psych/Mental Health NP) to immediately visualize its unique distribution across the state.

*Geographical Identification:* The density shading directly identifies geographical areas (counties) that may be underserved or oversupplied with NPs in a selected specialty, fulfilling the objective of identifying space in Georgia's NP workforce.

*De-identified and User-Friendly:* The map displays only aggregate, county-level data, ensuring the privacy of individual NPs.

*Zoom Functionality:* Selecting a specific county from the filter automatically zooms the map to that county, focusing the visualization for detailed analysis.


_Key Data Variables Used:_

Variable	Description

NPI	National Provider Identification number.

Address/County	Address fields (City, ZIP) were processed to map NPs to their practicing county (COUNTYFP10).

NP_Type_Final	The core variable used for specialty-based filtering.


_County Mapping:_ The visualization relies on combining the provider dataset with the Georgia County GeoJSON boundaries. ZIP codes from the provider data were used to assign each NP to a specific county, allowing for accurate, county-level provider counts.


Future/Extended Scope (For Research)
While the current map provides robust density visualization and filtering, the following objectives, originally outlined in the project scope, are avenues for future research and development:


Correlation Analysis: Explore relationships between provider density (or NP-to-physician ratio) and relevant county-level health outcomes (e.g., suicide, overdose rates), potentially using the County Health Rankings data.


NP-to-Physician Ratio: Calculate and map the NP-to-physician ratio for core specialties (family practice, emergency medicine, etc.).


Specialty Concordance: Analyze the degree of specialty concordance between Georgia NPs and their supervising physicians, potentially involving web scraping to obtain physician specialties.


**Tech Stack:**

Vite

Leaflet

GeoJSON

Papa Parse (for CSV data handling)

JavaScript/HTML/CSS


## Acknowledgments

Special thanks to the team for their **rigorous data cleaning and standardization** work, which forms the basis for this accurate geospatial analysis! 
