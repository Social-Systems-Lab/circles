# k6 Stress Test Plan

Report date: 2026-06-06

Script:

- `tests/k6/kamooni-1000-vus.js`

Purpose:

- Approximate 1000 concurrent public-read users hitting core public routes.

Default parameters:

- `BASE_URL=http://localhost:3000`
- `VUS=1000`
- `DURATION=5m`
- `THINK_TIME_SECONDS=1`

Endpoints:

- `/api/version`
- `/`
- `/explore`
- `/circles`

Thresholds:

- `http_req_failed`: less than 5%
- `http_req_duration`: p95 below 1500 ms
- `kamooni_endpoint_duration`: p95 below 1500 ms

## Local Smoke Run

Use a very small local smoke run first:

```powershell
$env:BASE_URL = "http://localhost:3000"; $env:VUS = "1"; $env:DURATION = "10s"; k6 run tests/k6/kamooni-1000-vus.js
```

## 1000 User Run

Run only against a staging environment or during an approved production maintenance window:

```powershell
$env:BASE_URL = "https://staging.example.com"; $env:VUS = "1000"; $env:DURATION = "5m"; k6 run tests/k6/kamooni-1000-vus.js
```

## Safety Notes

- Do not run the 1000 VU test against production without a maintenance window and monitoring.
- Monitor Next.js logs, MongoDB, MinIO, nginx, and host CPU/memory.
- Start with `VUS=50`, then `100`, then `250`, then `500`, then `1000`.
- Keep `/api/version` in the mix to distinguish app saturation from static page rendering saturation.
- Add authenticated scenarios later for chat, notifications, membership requests, and upload flows.

