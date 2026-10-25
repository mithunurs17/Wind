
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
import pandas as pd


# ==================================================
# CONFIGURATION
# ==================================================

API_BASE = "https://data.elexon.co.uk/bmrs/api/v1"

FUELHH_URL = f"{API_BASE}/datasets/FUELHH"

WINDFOR_LATEST_URL = (
    f"{API_BASE}/forecast/generation/wind/latest/stream"
)

WINDFOR_EARLIEST_URL = (
    f"{API_BASE}/forecast/generation/wind/earliest/stream"
)

TIMEOUT = 60.0


# Forecast source:
# "latest" or "earliest"
#
# This selects a source, NOT a guarantee of
# day-ahead forecast vintage availability.
FORECAST_SOURCE = "earliest"


# ==================================================
# DATE HELPERS
# ==================================================

def month_bounds(month: str) -> tuple[date, date]:
    """
    Return inclusive start and exclusive end dates.
    Example:
        2026-01 -> 2026-01-01, 2026-02-01
    """
    try:
        year, mon = map(int, month.split("-"))
        start = date(year, mon, 1)
    except (ValueError, AttributeError):
        raise ValueError(
            f"Invalid month {month!r}. Expected YYYY-MM."
        )

    if not 1 <= mon <= 12:
        raise ValueError(f"Invalid month: {month}")

    if mon == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, mon + 1, 1)

    return start, end


def month_bounds_utc(
    month: str,
) -> tuple[pd.Timestamp, pd.Timestamp]:
    start, end = month_bounds(month)

    return (
        pd.Timestamp(start, tz="UTC"),
        pd.Timestamp(end, tz="UTC"),
    )


def parse_datetime(value: Any):
    """Parse an ISO datetime and normalize it to UTC."""
    if not value:
        return None

    try:
        result = datetime.fromisoformat(
            str(value).replace("Z", "+00:00")
        )

        if result.tzinfo is None:
            result = result.replace(tzinfo=timezone.utc)

        return result.astimezone(timezone.utc)

    except (ValueError, TypeError):
        return None


# ==================================================
# HTTP / RESPONSE HELPERS
# ==================================================

def extract_records(
    payload: Any,
    url: str = "unknown",
) -> list[dict]:
    """
    Extract records from common API response structures.
    """
    if isinstance(payload, list):
        return [
            row for row in payload
            if isinstance(row, dict)
        ]

    if isinstance(payload, dict):
        # Direct record
        if "startTime" in payload:
            return [payload]

        for key in ("data", "results", "items"):
            value = payload.get(key)

            if isinstance(value, list):
                return [
                    row for row in value
                    if isinstance(row, dict)
                ]

    raise ValueError(
        f"Unexpected response format from {url}. "
        f"Received {type(payload).__name__}"
    )


async def fetch_json(
    client: httpx.AsyncClient,
    url: str,
    params: dict,
) -> list[dict]:
    """
    Fetch JSON and provide informative errors.
    """
    response = await client.get(
        url,
        params=params,
    )

    if response.is_error:
        raise httpx.HTTPStatusError(
            (
                f"Elexon HTTP {response.status_code}. "
                f"URL: {response.url}. "
                f"Response: {response.text[:2000]}"
            ),
            request=response.request,
            response=response,
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise ValueError(
            f"Invalid JSON from {response.url}"
        ) from exc

    return extract_records(
        payload,
        str(response.url),
    )


# ==================================================
# ACTUAL GENERATION: FUELHH
# ==================================================

async def fetch_actuals(month: str) -> list[dict]:
    """
    Fetch half-hourly actual generation for one month.

    Requests FUELHH one settlement date at a time.
    Returns records for all fuel types.

    The analytics module must filter WIND.
    """
    start, end = month_bounds(month)

    all_records: list[dict] = []

    async with httpx.AsyncClient(
        timeout=TIMEOUT,
        follow_redirects=True,
    ) as client:

        current = start

        while current < end:
            params = {
                "settlementDateFrom": current.isoformat(),
                "settlementDateTo": current.isoformat(),
            }

            records = await fetch_json(
                client,
                FUELHH_URL,
                params,
            )

            all_records.extend(records)
            current += timedelta(days=1)

    # Deduplicate exact publication records.
    unique = {}

    for row in all_records:
        key = (
            row.get("fuelType"),
            row.get("settlementDate"),
            row.get("settlementPeriod"),
            row.get("publishTime"),
        )

        unique[key] = row

    return list(unique.values())


# ==================================================
# WIND FORECASTS
# ==================================================

async def fetch_forecasts(
    month: str = "2026-01",
) -> list[dict]:
    """
    Fetch historical wind forecast records.

    Source is controlled by FORECAST_SOURCE.

    IMPORTANT:
    This does not guarantee that every record is
    a day-ahead forecast vintage.
    """
    start, end = month_bounds_utc(month)

    if FORECAST_SOURCE == "latest":
        url = WINDFOR_LATEST_URL

    elif FORECAST_SOURCE == "earliest":
        url = WINDFOR_EARLIEST_URL

    else:
        raise ValueError(
            f"Unsupported FORECAST_SOURCE: "
            f"{FORECAST_SOURCE}"
        )

    params = {
        "from": start.isoformat().replace("+00:00", "Z"),
        "to": end.isoformat().replace("+00:00", "Z"),
    }

    async with httpx.AsyncClient(
        timeout=TIMEOUT,
        follow_redirects=True,
    ) as client:

        records = await fetch_json(
            client,
            url,
            params,
        )

    # Keep records that belong to the requested month.
    # Use startTime, not publication time.
    filtered = []

    for row in records:
        target = parse_datetime(row.get("startTime"))

        if target is None:
            continue

        if start <= pd.Timestamp(target) < end:
            filtered.append(row)

    return filtered


# ==================================================
# COMMON DATA DISPATCHER
# ==================================================

async def stream(
    dataset: str,
    month: str = "2026-01",
) -> list[dict]:
    """
    Compatible with main.py:

        await stream("FUELHH", month)
        await stream("WINDFOR", month)
    """
    dataset = dataset.upper().strip()

    if dataset == "FUELHH":
        return await fetch_actuals(month)

    if dataset == "WINDFOR":
        return await fetch_forecasts(month)

    raise ValueError(
        f"Unsupported dataset: {dataset}"
    )


# ==================================================
# DEMO DATA
# ==================================================

def demo_data() -> tuple[list[dict], list[dict]]:
    """
    Synthetic sample data for UI testing only.

    NOT real Elexon observations.
    Never use demo metrics as real results.
    """
    actuals = []
    forecasts = []

    for day in range(1, 4):
        for hour in range(24):
            start_dt = datetime(
                2026,
                1,
                day,
                hour,
                tzinfo=timezone.utc,
            )

            for half in range(2):
                actual_time = start_dt + timedelta(
                    minutes=30 * half
                )

                actual = (
                    15000
                    + day * 250
                    + hour * 100
                    + half * 50
                )

                actuals.append({
                    "dataset": "FUELHH",
                    "fuelType": "WIND",
                    "generation": actual,
                    "publishTime": (
                        actual_time + timedelta(hours=1)
                    ).isoformat().replace("+00:00", "Z"),
                    "startTime": (
                        actual_time.isoformat()
                        .replace("+00:00", "Z")
                    ),
                    "settlementDate": (
                        actual_time.date().isoformat()
                    ),
                    "settlementPeriod": (
                        hour * 2 + half + 1
                    ),
                })

            # Synthetic hourly forecast
            forecast = (
                15000
                + day * 250
                + hour * 100
                + 200
            )

            forecasts.append({
                "dataset": "WINDFOR",
                "generation": forecast,
                "publishTime": (
                    start_dt - timedelta(days=1)
                ).isoformat().replace("+00:00", "Z"),
                "startTime": (
                    start_dt.isoformat()
                    .replace("+00:00", "Z")
                ),
            })

    return actuals, forecasts
