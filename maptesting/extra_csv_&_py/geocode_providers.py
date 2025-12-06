#!/usr/bin/env python3
import csv, time, json, os, requests, certifi, re

# ---------- config ----------
IN_FILE   = "npi_locations_initally_clean.csv"
OUT_FILE  = "providers_with_latlon3.csv"
FAILED_FILE = "failed_addresses.csv"

CACHE_FILE = "geocode_cache.json"
DELAY_SECONDS = 0.3
CONTACT_EMAIL = "mia.dzgomez@gmail.com"
USER_AGENT = f"NursingDataLab/0.1 ({CONTACT_EMAIL})"

# ---------- http session ----------
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
VERIFY = certifi.where()

# ---------- cache helpers ----------
def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_cache(cache):
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f)
    except:
        pass


# ---------- clean STREET ONLY ----------
def clean_address(street):
    s = (street or "").upper().strip()

    # remove suite/unit + hospital junk
    s = re.sub(
        r"\b(EMORY UNIVERSITY HOSPITAL|PIEDMONT HO(SPITAL)?|DAVIS FISCH|GRADY MEMOR|BUTLER|PAVI|PAVILION|ICU|EICU|[0-9]+[A-Z]*ICU|MICU|SICU|TCU|CCU|PCU|ED|WING|ANNEX|TRAUMA|CENTER|PLAZA|TOWER|BUILDING|BLDG)\b.*",
        "",
        s
    )

    # special known fixes
    if "DEPUTY BILL CANTRELL" in s:
        s = "3970 DEPUTY BILL CANTRELL MEMORIAL RD"

    s = s.replace("OGLETHORP", "OGLETHORPE")  # fix spelling

    if s.endswith("ORTHO LN"):
        s += " NE"

    # expand abbreviations
    subs = {
        " RD ": " ROAD ",
        " DR ": " DRIVE ",
        " HWY ": " HIGHWAY ",
        " BLVD ": " BOULEVARD ",
        " LN ": " LANE ",
        " AVE ": " AVENUE ",
        " PKWY ": " PARKWAY ",
        " FY ": " FERRY ",
        " ST ": " STREET ",
    }
    for k, v in subs.items():
        s = s.replace(k, v)

    s = re.sub(r"\s{2,}", " ", s)
    return s.strip()


# ---------- geocoder ----------
def geocode(query, cache):
    key = query.strip()
    if not key:
        return None, None

    if key in cache:
        d = cache[key]
        return d.get("lat"), d.get("lon")

    def try_census(q):
        try:
            url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
            params = {"address": q, "benchmark": "Public_AR_Current", "format": "json"}
            r = SESSION.get(url, params=params, timeout=20)
            data = r.json()
            matches = data.get("result", {}).get("addressMatches", [])
            if matches:
                coords = matches[0]["coordinates"]
                return coords["y"], coords["x"]
        except:
            pass
        return None, None

    def try_nominatim(q):
        try:
            url = "https://nominatim.openstreetmap.org/search"
            params = {"format": "json", "limit": 1, "q": q, "email": CONTACT_EMAIL}
            r = SESSION.get(url, params=params, timeout=25, verify=VERIFY)
            data = r.json()
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
        except:
            return None, None
        return None, None

    cleaned = clean_address(key)

    attempts = [
        lambda: try_census(key),
        lambda: try_nominatim(key),
        lambda: try_census(cleaned),
        lambda: try_nominatim(cleaned),
    ]

    for fn in attempts:
        lat, lon = fn()
        if lat is not None and lon is not None:
            cache[key] = {"lat": lat, "lon": lon}
            return lat, lon

    cache[key] = {"lat": None, "lon": None}
    return None, None


# ---------- main ----------
def main():
    cache = load_cache()
    processed = success = failed = 0

    # prepare failed file (with header)
    failed_exists = os.path.exists(FAILED_FILE)
    with open(FAILED_FILE, "a", newline="", encoding="utf-8") as ff:
        failed_writer = None

    with open(IN_FILE, newline="", encoding="utf-8") as fin, \
         open(OUT_FILE, "w", newline="", encoding="utf-8") as fout:

        reader = csv.DictReader(fin)
        fieldnames = reader.fieldnames[:] if reader.fieldnames else []

        for extra in ("lat", "lon", "geocode_query", "geocode_status"):
            if extra not in fieldnames:
                fieldnames.append(extra)

        writer = csv.DictWriter(fout, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()

        # create failed file header if new
        if not failed_exists:
            with open(FAILED_FILE, "w", newline="", encoding="utf-8") as ff:
                fw = csv.DictWriter(ff, fieldnames=fieldnames, extrasaction="ignore")
                fw.writeheader()

        for row in reader:
            processed += 1

            # ---------- reconstruct address from USPS column ----------
            full_usps = (row.get("address_usps_standardized") or "").strip()

            if full_usps and "," in full_usps:
                parts = [p.strip() for p in full_usps.split(",")]
                if len(parts) >= 3:
                    street_raw = parts[0]
                    city = parts[1]
                    state_zip = parts[2]
                    street = clean_address(street_raw)
                    query = f"{street}, {city}, {state_zip}"
                else:
                    street = clean_address(full_usps)
                    query = street
            else:
                street = clean_address(row.get("address") or "")
                query = street

            row["geocode_query"] = query

            # ---------- geocode ----------
            try:
                lat, lon = geocode(query, cache)
                time.sleep(DELAY_SECONDS)

                if lat is not None and lon is not None:
                    row["lat"] = lat
                    row["lon"] = lon
                    row["geocode_status"] = "ok"
                    success += 1

                else:
                    row["lat"] = None
                    row["lon"] = None
                    row["geocode_status"] = "not_found"
                    failed += 1
                    print("No result:", query)

                    # write to failed file
                    with open(FAILED_FILE, "a", newline="", encoding="utf-8") as ff:
                        fw = csv.DictWriter(ff, fieldnames=fieldnames, extrasaction="ignore")
                        fw.writerow(row)

            except Exception as e:
                row["lat"] = None
                row["lon"] = None
                row["geocode_status"] = "error"
                failed += 1
                print("Geocode failed:", query, e)

                # write to failed file
                with open(FAILED_FILE, "a", newline="", encoding="utf-8") as ff:
                    fw = csv.DictWriter(ff, fieldnames=fieldnames, extrasaction="ignore")
                    fw.writerow(row)

            # write row to main output
            writer.writerow(row)

            if processed % 50 == 0:
                save_cache(cache)
                print(f"Processed {processed} | success {success} | failed {failed}")

    save_cache(cache)
    print(f"✅ Done. Processed {processed}, success {success}, failed {failed}")
    print(f"→ Wrote {OUT_FILE}")
    print(f"→ Failed rows saved to {FAILED_FILE}")


if __name__ == "__main__":
    main()
