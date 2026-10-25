from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from datetime import date
import csv, io
from .data import stream, demo_data
from .analytics import matched_rows, metrics

app=FastAPI(title="Wind Insight API", version="1.0.0")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_methods=["*"],allow_headers=["*"])

@app.get("/api/health")
def health(): return {"status":"ok"}

async def load(month):
    try:
        actuals=await stream("FUELHH")
        forecasts=await stream("WINDFOR")
        # Fuel filter required by task brief.
        actuals=[r for r in actuals if str(r.get("fuelType","")).upper()=="WIND"]
        rows=matched_rows(actuals,forecasts,month)
        if rows: return rows,False
        # Don't silently substitute mock values when real source returned valid empty data.
        return [],False
    except Exception as exc:
        # Demo fallback preserves a usable walkthrough when upstream is unavailable.
        a,f=demo_data()
        return matched_rows(a,f,month),True

@app.get("/api/dashboard")
async def dashboard(month: str=Query("2026-01",pattern=r"^\d{4}-\d{2}$")):
    rows,demo=await load(month)
    m=metrics(rows)
    # Aggregate actual/forecast values per UTC date for executive trend.
    daily={}
    for r in rows:
        day=r["startTime"][:10]
        item=daily.setdefault(day,{"date":day,"actual":0.0,"forecast":0.0,"n":0})
        item["actual"]+=r["actual"]; item["forecast"]+=r["forecast"]; item["n"]+=1
    return {"month":month,"demoMode":demo,"metrics":m,"daily":list(daily.values()),"intervals":rows,
            "source":{"actuals":"Elexon FUELHH (WIND)","forecasts":"Elexon WINDFOR"}}

@app.get("/api/intervals")
async def intervals(day: str=Query(...,description="YYYY-MM-DD")):
    try: date.fromisoformat(day)
    except ValueError: raise HTTPException(400,"date must be YYYY-MM-DD")
    month=day[:7]; rows,demo=await load(month)
    selected=[r for r in rows if r["startTime"][:10]==day]
    return {"date":day,"demoMode":demo,"intervals":selected,"metrics":metrics(selected)}

@app.get("/api/export")
async def export(month: str=Query("2026-01",pattern=r"^\d{4}-\d{2}$")):
    rows,_=await load(month)
    output=io.StringIO()
    writer=csv.DictWriter(output,fieldnames=["startTime","publishTime","actual","forecast","error"])
    writer.writeheader(); writer.writerows(rows)
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]),media_type="text/csv",
        headers={"Content-Disposition":f'attachment; filename="wind-insight-{month}.csv"'})
