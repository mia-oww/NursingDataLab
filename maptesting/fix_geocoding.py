import pandas as pd
import requests
import time
import re

INPUT = "failed_addresses.csv"
OUTPUT_CLEAN = "providers_cleaned.csv"
OUTPUT_FAILED = "providers_failed.csv"

df = pd.read_csv(INPUT)

# ----------------------------------------
# LOAD COUNTY CENTROIDS
# ----------------------------------------
ga_centroids = pd.read_csv("ga_county_centroids.csv")
ga_centroids = ga_centroids.set_index("County")
ga_centroids.index = ga_centroids.index.str.upper()


def get_county_centroid(county_name):
    if county_name is None:
        return None, None
    name = county_name.strip().upper()
    try:
        row = ga_centroids.loc[name]
        return row["Latitude"], row["Longitude"]
    except:
        return None, None


# ----------------------------------------
# ADDRESS CLEANING
# ----------------------------------------
def clean_address(addr):
    if not addr or pd.isna(addr):
        return None

    a = addr.upper().strip()

    # ----------------------------------------
    # 1. Normalize basic patterns
    # ----------------------------------------
    a = a.replace("STE ", "SUITE ")
    a = a.replace("BLDG ", "BUILDING ")
    a = a.replace(" FT. ", " FORT ")
    a = a.replace("FT ", "FORT ")
    a = a.replace(" HWY ", " HIGHWAY ")
    a = a.replace(" OGLETHORP", " OGLETHORPE")  # common misspelling

    # ----------------------------------------
    # 2. Remove NON-USPS-DELIVERABLE UNIT IDENTIFIERS
    # ----------------------------------------
    # Remove things like: SUITE ####, BUILDING ####, UNIT #####, ROOM ###, FLOOR ##, etc.
    a = re.sub(r"\b(SUITE|UNIT|ROOM|FLOOR|FL|RM|BLDG|BUILDING)\s*[A-Z0-9\-]+", "", a)

    # Remove trailing words like: "BB4500" left behind
    a = re.sub(r"\b[A-Z]{2,}\d{2,}\b", "", a)

    # Remove any leftover multiple spaces
    while "  " in a:
        a = a.replace("  ", " ")

    # ----------------------------------------
    # 3. Remove double commas and normalize commas
    # ----------------------------------------
    while ",," in a:
        a = a.replace(",,", ",")

    a = a.replace(", ,", ",")
    a = a.replace(" ,", ",")
    a = a.replace(",  ", ", ")

    # ----------------------------------------
    # 4. Properly format "CITY, GA"
    # Only insert comma before GA if missing
    # ----------------------------------------
    a = re.sub(r"([^,])\s+GA\b", r"\1, GA", a)

    # ----------------------------------------
    # 5. Trim stray commas & whitespace
    # ----------------------------------------
    a = a.strip().rstrip(",")

    while "  " in a:
        a = a.replace("  ", " ")

    return a

# ----------------------------------------
# GEOCODERS
# ----------------------------------------
def geocode_census(addr):
    url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
    params = {"address": addr, "benchmark": "Public_AR_Current", "format": "json"}
    try:
        r = requests.get(url, params=params, timeout=4).json()
        matches = r["result"]["addressMatches"]
        if matches:
            c = matches[0]["coordinates"]
            return c["y"], c["x"]
    except:
        pass
    return None, None


def geocode_nominatim(addr):
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": addr, "format": "json"}
    try:
        # polite delay required by Nominatim policy
        time.sleep(1)
        r = requests.get(url, params=params, headers={"User-Agent": "geo"}, timeout=5).json()
        if len(r) > 0:
            return float(r[0]["lat"]), float(r[0]["lon"])
    except:
        pass
    return None, None


# ----------------------------------------
# PROCESS ROWS
# ----------------------------------------
clean_rows = []
failed_rows = []

for idx, row in df.iterrows():

    # if lat/lon already exists
    if pd.notna(row.get("lat")) and pd.notna(row.get("lon")):
        clean_rows.append(row)
        continue

    addr = clean_address(row["address_usps_standardized"] or row["address"])

    cleaned = clean_address(row["address_usps_standardized"] or row["address"])
    print(f"\nRAW:     {row['address_usps_standardized']}")
    print(f"CLEANED: {cleaned}")
    addr = cleaned


    # 1) Census
    lat, lon = geocode_census(addr)
    if lat is not None:
        print("  ✔ Census fixed")
        row["lat"], row["lon"] = lat, lon
        clean_rows.append(row)
        continue

    # 2) Nominatim (with delay inside the function)
    lat, lon = geocode_nominatim(addr)
    if lat is not None:
        print("  ✔ Nominatim fixed")
        row["lat"], row["lon"] = lat, lon
        clean_rows.append(row)
        continue

    # 3) County fallback
    try:
        county = row["address_usps_standardized"].split(",")[-2].strip()
    except:
        county = None

    lat, lon = get_county_centroid(county)
    if lat is not None:
        print(f"  ⚠️ Using county centroid for {county}")
        row["lat"], row["lon"] = lat, lon
        row["geocode_status"] = "county_fallback"
        clean_rows.append(row)
        continue

    # 4) Total failure
    print("  ❌ Fully failed")
    row["geocode_status"] = "failed"
    failed_rows.append(row)


# ----------------------------------------
# SAVE RESULTS
# ----------------------------------------
clean_df = pd.DataFrame(clean_rows)
failed_df = pd.DataFrame(failed_rows)

clean_df.to_csv(OUTPUT_CLEAN, index=False)
failed_df.to_csv(OUTPUT_FAILED, index=False)

print(f"\n✨ Done!")
print(f"✔ Clean rows saved to: {OUTPUT_CLEAN}")
print(f"❌ Failed rows saved to: {OUTPUT_FAILED}")
