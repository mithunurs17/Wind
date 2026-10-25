
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from datetime import date
import csv
import io
import calendar

from .data import stream, demo_data
from .analytics import matched_rows, metrics
from .diagnostics import inspect_sources

app = FastAPI(
    title="Wind Insight API",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Helpers
# --------------------------------------------------

def validate_month(month: str):
    """Validate YYYY-MM and return month boundaries."""
    try:
        year, mon = map(int, month.split("-"))
        if not 1 <= mon <= 12:
            raise ValueError
        start = date(year, mon, 1)
        if mon == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, mon + 1, 1)
        return start, end
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail="Invalid month. Use YYYY-MM, e.g. 2026-01"
        )


async def fetch_month_data(month: str):
    """
    Fetch source records for the requested month.

    IMPORTANT:
    stream() must support stream(dataset, month).
    """
    validate_month(month)

    actuals, forecasts = await __import__("asyncio").gather(
        stream("FUELHH", month),
        stream("WINDFOR", month),
    )

    return actuals, forecasts


async def load(month: str):
    """
    Return matched rows and demo mode status.

    Demo data is used only when source retrieval fails.
    Valid but empty source data remains empty.
    """
    try:
        actuals, forecasts = await fetch_month_data(month)

        # Keep only wind generation actuals.
        actuals = [
            row for row in actuals
            if str(row.get("fuelType", "")).strip().upper() == "WIND"
        ]

        rows = matched_rows(
            actuals,
            forecasts,
            month
        )

        return rows, False

    except Exception as exc:
        # Fallback only for retrieval/processing failures.
        print(
            f"[WARN] Real data loading failed for {month}: "
            f"{type(exc).__name__}: {exc}"
        )

        actual_demo, forecast_demo = demo_data()

        rows = matched_rows(
            actual_demo,
            forecast_demo,
            month
        )

        return rows, True


# --------------------------------------------------
# Health Check
# --------------------------------------------------

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "Wind Insight API"
    }


# --------------------------------------------------
# Debug Endpoint
# --------------------------------------------------

@app.get("/api/debug/data")
async def debug_data(
    month: str = Query(
        default="2026-01",
        pattern=r"^\d{4}-\d{2}$"
    )
):
    """
    Inspect source data for the selected month.
    """
    validate_month(month)

    try:
        actuals, forecasts = await fetch_month_data(month)

        result = inspect_sources(
            actuals,
            forecasts,
            month
        )

        return result

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Source diagnostic failed: "
                f"{type(exc).__name__}: {exc}"
            )
        )


# --------------------------------------------------
# Dashboard API
# --------------------------------------------------

@app.get("/api/dashboard")
async def dashboard(
    month: str = Query(
        default="2026-01",
        pattern=r"^\d{4}-\d{2}$"
    )
):
    validate_month(month)

    rows, demo = await load(month)

    calculated_metrics = metrics(rows)

    daily = {}

    for row in rows:
        day = row["startTime"][:10]

        item = daily.setdefault(
            day,
            {
                "date": day,
                "actual": 0.0,
                "forecast": 0.0,
                "n": 0
            }
        )

        item["actual"] += row["actual"]
        item["forecast"] += row["forecast"]
        item["n"] += 1

    daily_values = sorted(
        daily.values(),
        key=lambda item: item["date"]
    )

    return {
        "month": month,
        "demoMode": demo,
        "metrics": calculated_metrics,
        "daily": daily_values,
        "intervals": rows,
        "source": {
            "actuals": "Elexon FUELHH (WIND)",
            "forecasts": "Elexon WINDFOR"
        }
    }


# --------------------------------------------------
# Intervals API
# --------------------------------------------------

@app.get("/api/intervals")
async def intervals(
    day: str = Query(
        ...,
        description="Date in YYYY-MM-DD format"
    )
):
    try:
        parsed_day = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid date. Use YYYY-MM-DD"
        )

    month = parsed_day.strftime("%Y-%m")

    rows, demo = await load(month)

    selected = [
        row for row in rows
        if row["startTime"][:10] == day
    ]

    return {
        "date": day,
        "demoMode": demo,
        "intervals": selected,
        "metrics": metrics(selected)
    }


# --------------------------------------------------
# CSV Export API
# --------------------------------------------------

@app.get("/api/export")
async def export(
    month: str = Query(
        default="2026-01",
        pattern=r"^\d{4}-\d{2}$"
    )
):
    validate_month(month)

    rows, demo = await load(month)

    output = io.StringIO()

    fieldnames = [
        "startTime",
        "publishTime",
        "actual",
        "forecast",
        "error"
    ]

    writer = csv.DictWriter(
        output,
        fieldnames=fieldnames,
        extrasaction="ignore"
    )

    writer.writeheader()
    writer.writerows(rows)

    output.seek(0)

    filename = f"wind-insight-{month}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition":
                f'attachment; filename="{filename}"',
            "X-Demo-Mode": str(demo).lower()
        }
    )
