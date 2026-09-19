# Data sources and provenance

Atlas-Netic source code and third-party data are separate works. Each external provider remains subject to its own terms, attribution requirements, rate limits and availability.

| Layer | Provider | Atlas behavior | Key required |
|---|---|---|---|
| Terrain | Esri World Elevation Terrain 3D | measured terrain tiles; display exaggeration is visual only | No |
| Imagery | Esri World Imagery / Shaded Relief / Hillshade | base imagery and relief | No |
| Borders | Natural Earth | generalized country/disputed-boundary display | No |
| Aircraft | ADSB.lol | public ADS-B/MLAT near the view center; 15 s target refresh | No |
| Maritime | Fintraffic / Digitraffic | Finnish/Baltic AIS fallback | No |
| Maritime | AISStream | optional wider partial live sample | `AISSTREAM_API_KEY` |
| Earthquakes | USGS Earthquake Hazards Program | past-day GeoJSON feed | No |
| Fires | NASA FIRMS | VIIRS NOAA-21 near-real-time area CSV | `FIRMS_MAP_KEY` |
| Fires fallback | NASA EONET | open wildfire events near map center | No |
| Weather alerts | NOAA / National Weather Service | active alerts affecting the queried map-center point | No |
| Satellites | CelesTrak | current GP/TLE catalogs; positions derived locally with SGP4/SDP4 | No |
| Ground directions | HeiGIT openrouteservice | geocoding + turn-by-turn road/walk/bike routing; optional toll/highway/ferry avoidance | `OPENROUTESERVICE_API_KEY` |
| U.S. airways | FAA 28-Day NASR | effective AWY/FIX/NAV subscriber data resolved into globe routes | No |
| NOTAMs | FAA NOTAM Management Service (NMS) | authorized NMS distribution API only; never scraped from NOTAM Search | FAA-issued access |
| Amtrak rail | Amtrak GTFS | static schedule, stops and published shape geometry | No |

## Provider links

- Esri elevation: https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer
- Natural Earth: https://www.naturalearthdata.com/
- ADSB.lol API: https://www.adsb.lol/docs/open-data/api/
- Fintraffic marine traffic: https://www.digitraffic.fi/en/marine-traffic/
- AISStream: https://aisstream.io/
- USGS real-time feeds: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
- NASA FIRMS API: https://firms.modaps.eosdis.nasa.gov/api/
- NASA EONET API v3: https://eonet.gsfc.nasa.gov/docs/v3
- NWS API: https://www.weather.gov/documentation/services-web-api
- CelesTrak GP data: https://celestrak.org/NORAD/documentation/gp-data-formats.php
- satellite.js: https://github.com/shashwatak/satellite-js
- HeiGIT API: https://api.heigit.org/
- FAA NASR subscription: https://www.faa.gov/air_traffic/flight_info/aeronav/Aero_Data/NASR_Subscription/
- FAA NMS: https://www.faa.gov/about/initiatives/notam
- Amtrak GTFS: https://content.amtrak.com/content/gtfs/GTFS.zip

## Important interpretation limits

### Aircraft and vessels

Public transponder reception has geographic and receiver gaps. Silent, blocked, filtered or unreceived objects cannot appear. A military flag reflects provider metadata only. Atlas does not infer hidden military activity from absence or presence of public reports.

### FIRMS and EONET

FIRMS detections are satellite-observed thermal anomalies, not confirmed structure-level fire boundaries. EONET is a natural-event catalog; its wildfire entries are coarser event records. Atlas labels EONET as a fallback so users do not confuse it with individual FIRMS thermal detections.

### Weather

NWS point-filtered active alerts are authoritative U.S. alert products but do not provide a global weather-warning layer. Geometry may be absent for some products; when necessary Atlas places a point-query alert at the requested map center rather than inventing a polygon.

### Satellites

CelesTrak provides orbital elements rather than a continuously measured live position feed. Atlas labels satellite coordinates as `derived`: satellite.js propagates those elements using SGP4/SDP4. Accuracy degrades as elements age and varies by orbit/object.

### Terrain

Source resolution varies geographically. Terrain exaggeration changes rendering only; inspected source elevations are not multiplied.


### Mobility

Road directions depend on the current routing graph and requested avoidance preferences; they are not a substitute for posted closures or restrictions. FAA airway lines represent the effective published NASR network and are intentionally drawn without inventing an assigned flight altitude. NMS NOTAM access is credentialed by the FAA; when it is not configured Atlas reports that state instead of substituting scraped notices. Amtrak's feed used here is static GTFS, so rail results are schedules rather than live train positions or delay predictions.

## Cache and freshness

Every provider has its own refresh/freshness window. Atlas reports source state in the interface and can serve a bounded stale snapshot during a provider outage. Stale state must never be displayed as live.
