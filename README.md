# Diwali Lights USA

[**Explore the dashboard**](https://sahilchowdhury2007.github.io/diwali-lights-usa-2026/#electricity) · [Methodology](docs/methodology.md) · [Satellite reproduction guide](docs/reproduce-satellite.md)

Can satellites detect extra light on Diwali night? The available images covered parts of the night, so the dashboard also compares hourly electricity use across the Lower 48 from 5 p.m. to 5 a.m.

| Diwali night | Lower 48 electricity use | Comparison |
| --- | ---: | --- |
| 2025 | 9.3% below the median | Six nearby Monday nights |
| 2026 | 0.3% below the median | Three earlier Sunday nights |

Both overnight totals fell within the range of their comparison nights. The totals cover grid use across homes, businesses, and industry. The [methodology](docs/methodology.md) describes the comparison dates, reporting coverage, and limits.

The dashboard has an hourly electricity chart for 13 grid regions and a satellite map of nighttime brightness. The year selector updates both views. Satellite coverage includes a national comparison for 2025 and a Phoenix pilot for 2026.

## Run locally

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Run `npm run build` before submitting changes. Use `npm run preview` to check the built site. GitHub Actions [publishes the build](.github/workflows/pages.yml) to GitHub Pages on pushes to `main`.

## Reproduce the electricity analysis

Download the [2025 EIA-930 archive](https://zenodo.org/records/21103294) or the [2026 EIA Balance CSV](https://www.eia.gov/electricity/gridmonitor/sixMonthFiles/EIA930_BALANCE_2026_Jul_Dec.csv). The generator uses Python's standard library.

```sh
python scripts/prepare-grid-demand.py "path-to/eia930-2025half2.zip"
python scripts/prepare-grid-demand.py --year 2026 "path-to/EIA930_BALANCE_2026_Jul_Dec.csv"
```

The generator writes the hourly series to `src/data/grid-demand-<year>.json`. The dashboard bundles these files at build time.

## Repository layout

| Path | Contents |
| --- | --- |
| [`src/`](src) | Dashboard and hourly electricity series |
| [`public/data/`](public/data) | Satellite exports, manifest, and Census-derived map boundaries |
| [`scripts/`](scripts) | Data download, processing, and export scripts |
| [`earth-engine/`](earth-engine) | Satellite coverage and brightness analysis |
| [`docs/`](docs) | Methods, results, and reproduction instructions |

Keep raw downloads in `data/raw/`. Supply credentials through local environment variables. The dashboard builds from public data and needs no credentials.

Contributions are welcome. Fork the repository and open a pull request with a short description of the change and how you checked it.
