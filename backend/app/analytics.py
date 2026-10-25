
from __future__ import annotations

import math
import pandas as pd


def matched_rows(
    actuals: list[dict],
    forecasts: list[dict],
    month: str,
) -> list[dict]:
    """
    Match hourly wind forecasts against hourly average actual wind generation.

    Assumptions:
    - Actual wind generation is provided in 30-minute intervals.
    - Forecast generation is provided in hourly intervals.
    - Forecast startTime represents the beginning of its forecast hour.
    - Generation values are comparable as average MW values.

    Forecast selection:
    - Select the latest available publication strictly before
      the UTC delivery-day cutoff (00:00 UTC).
    - This selection is only as reliable as the forecast vintages
      supplied by the upstream API.

    Returns:
        List of matched hourly records.
    """

    if not actuals or not forecasts:
        return []

    # Validate requested month
    try:
        start = pd.Timestamp(f"{month}-01", tz="UTC")
        end = start + pd.offsets.MonthBegin(1)
    except (ValueError, TypeError):
        raise ValueError(
            f"Invalid month {month!r}. Expected YYYY-MM."
        )

    if start.strftime("%Y-%m") != month:
        raise ValueError(
            f"Invalid month {month!r}. Expected YYYY-MM."
        )

    # ---------------------------------------------------------
    # 1. Prepare actual wind generation
    # ---------------------------------------------------------
    a = pd.DataFrame(actuals)

    required_actual = {"startTime", "generation", "fuelType"}
    if not required_actual.issubset(a.columns):
        return []

    # Only actual WIND generation
    a["fuelType"] = a["fuelType"].astype(str).str.upper()
    a = a[a["fuelType"] == "WIND"].copy()

    if a.empty:
        return []

    a["startTime"] = pd.to_datetime(
        a["startTime"], utc=True, errors="coerce"
    )
    a["generation"] = pd.to_numeric(
        a["generation"], errors="coerce"
    )

    # Use publication time to resolve duplicate actual intervals
    if "publishTime" in a.columns:
        a["publishTime"] = pd.to_datetime(
            a["publishTime"], utc=True, errors="coerce"
        )
    else:
        a["publishTime"] = pd.NaT

    a = a.dropna(subset=["startTime", "generation"])

    # Keep the requested UTC month
    a = a[
        (a["startTime"] >= start)
        & (a["startTime"] < end)
    ].copy()

    if a.empty:
        return []

    # Resolve duplicate actual interval records
    # Prefer the latest published version when available.
    a = a.sort_values(
        ["startTime", "publishTime"],
        na_position="first",
    )

    a = a.drop_duplicates(
        subset=["startTime"],
        keep="last",
    )

    # Actual interval timestamps must be aligned to
    # half-hour boundaries for this aggregation method.
    minute = a["startTime"].dt.minute
    second = a["startTime"].dt.second
    microsecond = a["startTime"].dt.microsecond

    valid_intervals = (
        minute.isin([0, 30])
        & (second == 0)
        & (microsecond == 0)
    )

    a = a[valid_intervals].copy()

    if a.empty:
        return []

    # Assign actual records to hourly buckets.
    a["hour"] = a["startTime"].dt.floor("h")

    # Count unique half-hour intervals.
    # Require two valid half-hour observations per hour.
    actual_hourly = (
        a.groupby("hour", as_index=False)
        .agg(
            actual=("generation", "mean"),
            actual_interval_count=("generation", "count"),
        )
    )

    actual_hourly = actual_hourly[
        actual_hourly["actual_interval_count"] == 2
    ].copy()

    if actual_hourly.empty:
        return []

    # ---------------------------------------------------------
    # 2. Prepare hourly forecasts
    # ---------------------------------------------------------
    f = pd.DataFrame(forecasts)

    required_forecast = {
        "startTime",
        "publishTime",
        "generation",
    }

    if not required_forecast.issubset(f.columns):
        return []

    f["startTime"] = pd.to_datetime(
        f["startTime"], utc=True, errors="coerce"
    )
    f["publishTime"] = pd.to_datetime(
        f["publishTime"], utc=True, errors="coerce"
    )
    f["generation"] = pd.to_numeric(
        f["generation"], errors="coerce"
    )

    f = f.dropna(
        subset=["startTime", "publishTime", "generation"]
    ).copy()

    # Forecast targets in the requested UTC month
    f = f[
        (f["startTime"] >= start)
        & (f["startTime"] < end)
    ].copy()

    if f.empty:
        return []

    # Forecast timestamps should represent hourly starts.
    # Do not silently round misaligned timestamps.
    valid_forecast_time = (
        (f["startTime"].dt.minute == 0)
        & (f["startTime"].dt.second == 0)
        & (f["startTime"].dt.microsecond == 0)
    )

    f = f[valid_forecast_time].copy()

    if f.empty:
        return []

    # Delivery day is based on the target interval in UTC.
    f["delivery_day"] = f["startTime"].dt.floor("D")

    # Strictly before delivery-day midnight UTC.
    f = f[
        f["publishTime"] < f["delivery_day"]
    ].copy()

    if f.empty:
        return []

    # Select the latest eligible forecast publication
    # for each forecast target hour.
    f = f.sort_values(
        ["startTime", "publishTime"]
    )

    f = f.drop_duplicates(
        subset=["startTime"],
        keep="last",
    )

    # Rename forecast startTime to match actual hourly key.
    f = f.rename(
        columns={
            "startTime": "hour",
            "generation": "forecast",
        }
    )

    forecast_hourly = f[
        ["hour", "publishTime", "forecast"]
    ].copy()

    # ---------------------------------------------------------
    # 3. Match actuals and forecasts
    # ---------------------------------------------------------
    merged = actual_hourly.merge(
        forecast_hourly,
        on="hour",
        how="inner",
        validate="one_to_one",
    )

    if merged.empty:
        return []

    merged["error"] = (
        merged["forecast"] - merged["actual"]
    )

    # Return deterministic chronological output.
    merged = merged.sort_values("hour")

    result = []

    for row in merged.itertuples(index=False):
        result.append(
            {
                "startTime": row.hour.isoformat(),
                "publishTime": row.publishTime.isoformat(),
                "actual": float(row.actual),
                "forecast": float(row.forecast),
                "error": float(row.error),
            }
        )

    return result


def metrics(rows: list[dict]) -> dict:
    """
    Calculate forecast accuracy metrics from matched records.

    Error = forecast - actual

    Positive bias = over-forecasting.
    Negative bias = under-forecasting.
    WAPE = sum(abs(error)) / sum(abs(actual)) * 100.
    """

    if not rows:
        return {
            "count": 0,
            "mae": None,
            "rmse": None,
            "bias": None,
            "wape": None,
        }

    valid_rows = []

    for row in rows:
        try:
            actual = float(row["actual"])
            forecast = float(row["forecast"])

            if not (
                math.isfinite(actual)
                and math.isfinite(forecast)
            ):
                continue

            valid_rows.append((actual, forecast))

        except (KeyError, TypeError, ValueError):
            continue

    if not valid_rows:
        return {
            "count": 0,
            "mae": None,
            "rmse": None,
            "bias": None,
            "wape": None,
        }

    errors = [
        forecast - actual
        for actual, forecast in valid_rows
    ]

    actual_abs_sum = sum(
        abs(actual)
        for actual, _ in valid_rows
    )

    count = len(errors)

    mae = sum(abs(e) for e in errors) / count

    rmse = math.sqrt(
        sum(e * e for e in errors) / count
    )

    bias = sum(errors) / count

    wape = (
        sum(abs(e) for e in errors)
        / actual_abs_sum
        * 100
        if actual_abs_sum > 0
        else None
    )

    return {
        "count": count,
        "mae": mae,
        "rmse": rmse,
        "bias": bias,
        "wape": wape,
    }
