import pandas as pd
from collections import Counter


def summarize_records(records):
    """Summarize the returned source records."""

    if not records:
        return {
            "recordCount": 0,
            "keys": [],
            "sample": None
        }

    sample = records[0]

    if not isinstance(sample, dict):
        return {
            "recordCount": len(records),
            "keys": [],
            "sample": str(sample)
        }

    return {
        "recordCount": len(records),
        "keys": sorted(sample.keys()),
        "sample": sample
    }


def parse_timestamp(value):
    """Parse timestamp into UTC."""

    return pd.to_datetime(
        value,
        utc=True,
        errors="coerce"
    )


def get_date_range(records, field):
    timestamps = []

    for row in records:
        if not isinstance(row, dict):
            continue

        value = row.get(field)

        if not value:
            continue

        timestamp = parse_timestamp(value)

        if pd.notna(timestamp):
            timestamps.append(timestamp)

    if not timestamps:
        return {
            "min": None,
            "max": None
        }

    return {
        "min": min(timestamps).isoformat(),
        "max": max(timestamps).isoformat()
    }


def inspect_sources(actuals, forecasts, month):
    """
    Inspect actual and forecast records
    to diagnose zero matched intervals.
    """

    actuals = [
        r for r in actuals
        if isinstance(r, dict)
    ]

    forecasts = [
        r for r in forecasts
        if isinstance(r, dict)
    ]

    # Actual fuel type distribution
    fuel_counts = Counter(
        str(r.get("fuelType", "MISSING"))
        .strip()
        .upper()
        for r in actuals
    )

    # Required wind actuals
    wind_actuals = [
        r for r in actuals
        if str(r.get("fuelType", ""))
        .strip()
        .upper() == "WIND"
    ]

    month_start = pd.Timestamp(
        f"{month}-01",
        tz="UTC"
    )

    month_end = (
        month_start
        + pd.offsets.MonthBegin(1)
    )

    def is_in_month(row):
        ts = parse_timestamp(
            row.get("startTime")
        )

        return (
            pd.notna(ts)
            and month_start <= ts < month_end
        )

    actual_month = [
        r for r in wind_actuals
        if is_in_month(r)
    ]

    forecast_month = [
        r for r in forecasts
        if is_in_month(r)
    ]

    # Timestamp sets for diagnostics only.
    actual_timestamps = set()

    for row in actual_month:
        ts = parse_timestamp(
            row.get("startTime")
        )

        if pd.notna(ts):
            actual_timestamps.add(ts)

    forecast_timestamps = set()
    cutoff_survivors = 0

    for row in forecast_month:
        start = parse_timestamp(
            row.get("startTime")
        )

        publish = parse_timestamp(
            row.get("publishTime")
        )

        if pd.isna(start) or pd.isna(publish):
            continue

        # Existing project's tentative cutoff:
        # publication before delivery day UTC.
        if publish < start.floor("D"):
            cutoff_survivors += 1
            forecast_timestamps.add(start)

    common_timestamps = (
        actual_timestamps
        & forecast_timestamps
    )

    return {
        "month": month,

        "actuals": summarize_records(actuals),
        "forecasts": summarize_records(forecasts),

        "actualFuelTypeCounts": dict(fuel_counts),

        "windActualRecordCount": len(wind_actuals),

        "actualRecordsInMonth": len(actual_month),

        "forecastRecordsInMonth": len(forecast_month),

        "forecastRecordsInMonthPassingPublicationCutoff":
            cutoff_survivors,

        "actualTimestampCount": len(actual_timestamps),

        "eligibleForecastTimestampCount":
            len(forecast_timestamps),

        "commonTimestampCount":
            len(common_timestamps),

        "actualStartTimeRange":
            get_date_range(wind_actuals, "startTime"),

        "forecastStartTimeRange":
            get_date_range(forecasts, "startTime"),

        "forecastPublishTimeRange":
            get_date_range(forecasts, "publishTime"),

        "hint": (
            "Compare record counts, sample records, "
            "timestamp ranges, and common timestamps. "
            "The common timestamp count is diagnostic "
            "only, not proof of valid day-ahead matches."
        )
    }
