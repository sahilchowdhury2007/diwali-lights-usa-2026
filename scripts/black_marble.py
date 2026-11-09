"""Read time, radiance, and quality flags from Collection 2 Black Marble A1 tiles."""

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import re

import h5py
import numpy as np


FIELDS = "HDFEOS/GRIDS/VIIRS_Grid_DNB_2d/Data Fields"
PRODUCTS = {"VJ146A1": "NOAA-20", "VJ246A1": "NOAA-21", "VNP46A1": "Suomi NPP"}
TERRITORIES = {"American Samoa", "Guam", "Commonwealth of the Northern Mariana Islands",
               "Puerto Rico", "United States Virgin Islands"}


def us_states(path):
    source = json.loads(path.read_text(encoding="utf-8"))
    return sorted((feature for feature in source["features"] if feature["properties"]["name"] not in TERRITORIES),
                  key=lambda feature: feature["properties"]["name"])


@dataclass
class Tile:
    path: Path
    satellite: str
    radiance: np.ndarray
    utc_hours: np.ndarray
    granule: np.ndarray
    view: np.ndarray
    valid: np.ndarray
    lat: np.ndarray
    lon: np.ndarray


def identity(path):
    match = re.fullmatch(r"(VJ146A1|VJ246A1|VNP46A1)\.A(\d{7})\.(h\d{2}v\d{2})\.002\.\d+\.h5", path.name)
    if not match:
        raise ValueError(f"Expected a NASA Collection 2 A1 .h5 filename, got {path.name}.")
    product, day, tile = match.groups()
    return PRODUCTS[product], datetime.strptime(day, "%Y%j").replace(tzinfo=timezone.utc), tile


def physical(dataset, raw):
    values = raw.astype(np.float32)
    fill = dataset.attrs.get("_FillValue")
    if fill is not None:
        values[values == np.asarray(fill).item()] = np.nan
    return values * np.asarray(dataset.attrs.get("scale_factor", 1)).item() + np.asarray(dataset.attrs.get("add_offset", 0)).item()


def closest(axis, target):
    step = (axis[-1] - axis[0]) / (len(axis) - 1)
    if not np.allclose(np.diff(axis), step, rtol=1e-5):
        raise ValueError("Expected a regular Black Marble grid.")
    return np.clip(np.rint((target - axis[0]) / step).astype(int), 0, len(axis) - 1)


def read_tile(path, satellite, bounds=None, *, target_axes=None):
    with h5py.File(path, "r") as source:
        fields = source[FIELDS]
        lat, lon = fields["lat"][:], fields["lon"][:]
        if target_axes is None:
            west, south, east, north = bounds
            rows = np.flatnonzero((lat >= south) & (lat <= north))
            cols = np.flatnonzero((lon >= west) & (lon <= east))
            if len(rows) < 2 or len(cols) < 2:
                raise ValueError(f"{path.name} does not cover the requested bounds.")
        else:
            rows, cols = (closest(axis, target) for axis, target in zip((lat, lon), target_axes))
        row_start, col_start = rows.min(), cols.min()
        subset = np.s_[row_start:rows.max() + 1, col_start:cols.max() + 1]
        sample = np.ix_(rows - row_start, cols - col_start)
        lat, lon = lat[rows], lon[cols]
        arrays = [
            physical(fields[name], fields[name][subset][sample]) for name in
            ("DNB_At_Sensor_Radiance", "UTC_Time", "Solar_Zenith", "Lunar_Zenith", "Sensor_Zenith")
        ]
        arrays += [fields[name][subset][sample] for name in ("QF_Cloud_Mask", "QF_DNB", "Granule")]
    if lat[0] < lat[-1]:
        lat, arrays = lat[::-1], [array[::-1, :] for array in arrays]
    if lon[0] > lon[-1]:
        lon, arrays = lon[::-1], [array[:, ::-1] for array in arrays]
    radiance, utc_hours, solar, lunar, view, cloud, dnb, granule = arrays
    # NASA Black Marble Collection 2 user guide, Tables 5–7.
    land = (cloud >> 1) & 7
    valid = (
        np.isfinite(radiance) & (radiance >= 0) & (utc_hours >= 0) & (utc_hours < 24)
        & (solar >= 102) & (lunar >= 90) & (view >= 0) & (view <= 60)
        & (dnb == 0) & (granule != 255)
        & ((cloud & 1) == 0) & np.isin(land, [0, 1, 5])
        & (((cloud >> 4) & 3) == 3) & (((cloud >> 6) & 3) == 0)
        & (((cloud >> 8) & 7) == 0) & (((cloud >> 12) & 3) == 0)
    )
    return Tile(path, satellite, radiance, utc_hours, granule, view, valid, lat, lon)
