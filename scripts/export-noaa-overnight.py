"""Align NOAA DNB swaths and JRR cloud masks for a same-night Phoenix pilot."""

import argparse
from datetime import datetime, timedelta, timezone
from math import ceil, floor
from pathlib import Path
import re

import h5py
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform, transform_bounds
from scipy.spatial import cKDTree


BOUNDS = (-112.61, 33.12, -111.48, 33.88)
RESOLUTION = 1000  # Web Mercator meters
MAX_DISTANCE = 1000  # Web Mercator meters from a sample center
NODATA = -9999.0
SATELLITES = {"j01": "NOAA-20", "j02": "NOAA-21"}


def identify(radiance, geo, cloud):
    match = re.match(r"SVDNB_(j0[12])_d(\d{8})_t(\d{7})_e(\d{7})_", radiance.name)
    if not match:
        raise ValueError(f"Invalid NOAA radiance filename: {radiance.name}")
    sat, date, start, end = match.groups()
    if not geo.name.startswith(f"GDNBO_{sat}_d{date}_t{start}_e{end}_"):
        raise ValueError("Radiance and geolocation must be from the same NOAA granule.")
    cloud_sat = "n21" if sat == "j02" else sat
    if f"_{cloud_sat}_s{date}{start}_e{date}{end}_" not in cloud.name:
        raise ValueError("The cloud mask must be from the same NOAA granule.")
    start_time = datetime.strptime(date + start, "%Y%m%d%H%M%S%f").replace(tzinfo=timezone.utc)
    return SATELLITES[sat], start_time


def nearby(lon, lat):
    west, south, east, north = BOUNDS
    return (lon >= west - 0.03) & (lon <= east + 0.03) & (lat >= south - 0.03) & (lat <= north + 0.03)


def projected_points(lon, lat):
    return np.column_stack(transform("EPSG:4326", "EPSG:3857", lon, lat))


def nearest(source, target):
    distances, indices = cKDTree(source).query(target, distance_upper_bound=MAX_DISTANCE)
    return np.isfinite(distances), np.minimum(indices, len(source) - 1)


def read_pass(files, centers):
    radiance, geo, cloud = files
    satellite, start = identify(*files)
    with h5py.File(geo) as geolocation, h5py.File(radiance) as observations, h5py.File(cloud) as clouds:
        g = geolocation["All_Data/VIIRS-DNB-GEO_All"]
        s = observations["All_Data/VIIRS-DNB-SDR_All"]
        lon, lat = g["Longitude_TC"][:], g["Latitude_TC"][:]
        region = nearby(lon, lat)
        cloud_lon, cloud_lat = clouds["Longitude"][:], clouds["Latitude"][:]
        cloud_region = nearby(cloud_lon, cloud_lat)
        if not region.any() or not cloud_region.any():
            raise ValueError(f"{satellite} does not cover the Phoenix pilot area in all products.")
        samples = projected_points(lon[region], lat[region])
        cloud_points = projected_points(cloud_lon[cloud_region], cloud_lat[cloud_region])
        cloud_found, cloud_index = nearest(cloud_points, samples)
        clear = clouds["CloudMask"][:][cloud_region][cloud_index] == 0
        cloud_quality = clouds["CloudMaskQualFlag"][:][cloud_region][cloud_index] == 0

        raw = s["Radiance"][:][region]
        view = g["SatelliteZenithAngle"][:][region]
        solar, lunar = g["SolarZenithAngle"][:][region], g["LunarZenithAngle"][:][region]
        valid = (
            cloud_found & clear & cloud_quality & (clouds["granule_level_quality_flag"][()] == 0)
            & np.isfinite(raw) & (raw >= 0) & (solar >= 102) & (solar <= 180)
            & (lunar >= 90) & (lunar <= 180) & (view >= 0) & (view <= 60)
            & (s["QF1_VIIRSDNBSDR"][:][region] == 0) & (g["QF2_VIIRSSDRGEO_TC"][:][region] == 0)
        )
        # NOAA scan timestamps are in IET. Relative times preserve the scan offsets
        # from the UTC start supplied in the granule filename.
        scans = g["StartTime"][:]
        scan_count = int(g["NumberOfScans"][0])
        if (lon.shape[0] != len(scans) * 16 or not 0 < scan_count <= len(scans)
                or np.any(np.diff(scans[:scan_count]) <= 0)):
            raise ValueError(f"Unexpected scan timestamps in {geo.name}.")
        sample_scans = np.nonzero(region)[0] // 16
        valid &= sample_scans < scan_count
        seconds = (scans[np.minimum(sample_scans, scan_count - 1)] - scans[0]) / 1e6
    found, indices = nearest(samples, centers)
    # Select the nearest reading first so a masked sample is never replaced by
    # a neighboring clear sample farther away.
    return satellite, start, raw[indices] * 1e9, view[indices], seconds[indices], found & valid[indices]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pass", dest="passes", type=Path, action="append", nargs=3,
                        required=True, metavar=("SDR", "GEO", "CLOUD"))
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if len(args.passes) != 2:
        parser.error("Supply two --pass bundles with one SDR, GEO, and cloud mask each.")

    west, south, east, north = transform_bounds("EPSG:4326", "EPSG:3857", *BOUNDS)
    x0, y0 = floor(west / RESOLUTION), ceil(north / RESOLUTION)
    width, height = ceil(east / RESOLUTION) - x0, y0 - floor(south / RESOLUTION)
    grid = from_origin(x0 * RESOLUTION, y0 * RESOLUTION, RESOLUTION, RESOLUTION)
    x, y = np.meshgrid((x0 + np.arange(width) + 0.5) * RESOLUTION,
                       (y0 - np.arange(height) - 0.5) * RESOLUTION)
    centers = np.column_stack((x.ravel(), y.ravel()))
    results = sorted((read_pass(bundle, centers) for bundle in args.passes), key=lambda result: result[1])
    first, later = results
    elapsed = (later[1] - first[1]).total_seconds() + later[4] - first[4]
    shared = first[5] & later[5] & (np.abs(first[3] - later[3]) <= 20) & (elapsed >= 900)
    if first[1].date() != later[1].date() or not shared.any():
        parser.error("No cells passed the same-day, cloud, time, and viewing-angle checks.")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Shared cells: {shared.sum():,} of {shared.size:,} ({shared.mean():.1%})")
    for name, (satellite, start, values, _, seconds, _) in zip(("first-pass", "later-pass"), results):
        time = (start + timedelta(seconds=float(np.median(seconds[shared])))).isoformat(timespec="seconds").replace("+00:00", "Z")
        path = args.output_dir / f"{name}.tif"
        with rasterio.open(path, "w", driver="GTiff", count=1, dtype="float32", crs="EPSG:3857",
                           transform=grid, width=width, height=height, nodata=NODATA, compress="deflate") as tif:
            tif.write(np.where(shared, values, NODATA).reshape(height, width), 1)
            tif.set_band_unit(1, "nW/cm²/sr")
            tif.update_tags(satellite=satellite, observation_utc=time, source="NOAA VIIRS DNB SDR and JRR Cloud Mask")
        print(f'--frame "{time}" "{path}" "{satellite} pass"')


if __name__ == "__main__":
    main()
