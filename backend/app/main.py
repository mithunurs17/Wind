from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from datetime import date
import csv
import io

from .data import stream, demo_data
from .analytics import matched_rows, metrics
from .diagnostics import inspect_sources

app = FastAPI(
    title="Wind Insight API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)


# --------------------------------------------------
# Health Check
# --------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


# --------------------------------------------------
# Diagnostic Endpoint
# --------------------------------------------------

@app.get("/api/debug/data")
async def debug_data(
    month: str = Query(
        "2026-01",
        pattern=r"^\d{4}-\d{2}$"
    )
):
    """
    Inspect source records and diagnose zero matches.
    """

    try:
        actuals_raw = await stream("FUELHH")
        forecasts_raw = await stream("WINDFOR")

        result = inspect_sources(
            actuals_raw,
            forecasts_raw,
            month
        )

        return result

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Diagnostic fetch failed: "
                f"{type(exc).__name__}: {exc}"
            )
        )


# --------------------------------------------------
# Shared Data Loading
# --------------------------------------------------

async def load(month: str):
    try:
        actuals = await stream("FUELHH")
        forecasts = await stream("WINDFOR")

        # Filter actual generation to wind.
        actuals = [
            r for r in actuals
            if str(r.get("fuelType", "")).strip().upper() == "WIND"
        ]

        # Match actual generation with eligible forecasts.
        rows = matched_rows(
            actuals,
            forecasts,
            month
        )

        # Real source data returned but no valid pairs.
        # Do not substitute fake data in this case.
        if rows:
            return rows, False

        return [], False

    except Exception:
        # Demo fallback when upstream retrieval fails.
        actual_demo, forecast_demo = demo_data()

        rows = matched_rows(
            actual_demo,
            forecast_demo,
            month
        )

        return rows, True


# --------------------------------------------------
# Dashboard API
# --------------------------------------------------

@app.get("/api/dashboard")
async def dashboard(
    month: str = Query(
        "2026-01",
        pattern=r"^\d{4}-\d{2}$"
    )
):
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

    return {
        "month": month,
        "demoMode": demo,
        "metrics": calculated_metrics,
        "daily": list(daily.values()),
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
        description="YYYY-MM-DD"
    )
):
    try:
        date.fromisoformat(day)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="date must be YYYY-MM-DD"
        )

    month = day[:7]

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
        "2026-01",
        pattern=r"^\d{4}-\d{2}$"
    )
):
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
