import httpx
from datetime import datetime, timezone
from functools import lru_cache

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
FORECAST_BASE = "https://data.elexon.co.uk/bmrs/api/v1"


def month_bounds(month: str):
    year, mon = map(int, month.split("-"))

    start = datetime(
        year, mon, 1,
        tzinfo=timezone.utc
    )

    if mon == 12:
        end = datetime(
            year + 1, 1, 1,
            tzinfo=timezone.utc
        )
    else:
        end = datetime(
            year, mon + 1, 1,
            tzinfo=timezone.utc
        )

    return start, end


async def fetch_json(url, params):
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(
            url,
            params=params
        )
        response.raise_for_status()
        payload = response.json()

    # Handle supported API response envelopes.
    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict):
        for key in ("data", "results", "items"):
            if isinstance(payload.get(key), list):
                return payload[key]

    raise ValueError(
        f"Unexpected API response from {url}"
    )


async def fetch_actuals(month):
    start, end = month_bounds(month)

    return await fetch_json(
        f"{BASE}/FUELHH",
        {
            "settlementDateFrom": start.strftime("%Y-%m-%d"),
            "settlementDateTo": (
                end.replace(
                    hour=0,
                    minute=0,
                    second=0
                ).strftime("%Y-%m-%d")
            ),
        }
    )


async def fetch_forecasts(month):
    start, end = month_bounds(month)

    return await fetch_json(
        f"{FORECAST_BASE}/forecast/generation/wind/latest/stream",
        {
            "from": start.isoformat(),
            "to": end.isoformat(),
        }
    )


async def stream(dataset, month="2026-01"):
    if dataset == "FUELHH":
        return await fetch_actuals(month)

    if dataset == "WINDFOR":
        return await fetch_forecasts(month)

    raise ValueError(f"Unsupported dataset: {dataset}")


def demo_data():
    # Keep your existing demo_data() implementation here.
    raise NotImplementedError(
        "Preserve your existing demo_data() function."
    )
