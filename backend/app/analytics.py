from __future__ import annotations
import math
import pandas as pd

def matched_rows(actuals: list[dict], forecasts: list[dict], month: str) -> list[dict]:
    """Match one forecast per period, choosing latest publishTime before delivery-day cutoff."""
    a = pd.DataFrame(actuals)
    f = pd.DataFrame(forecasts)
    if a.empty or f.empty:
        return []
    for df, col in [(a,"startTime"),(f,"startTime")]:
        df[col] = pd.to_datetime(df[col], utc=True, errors="coerce")
    f["publishTime"] = pd.to_datetime(f["publishTime"], utc=True, errors="coerce")
    a["generation"] = pd.to_numeric(a["generation"], errors="coerce")
    f["generation"] = pd.to_numeric(f["generation"], errors="coerce")
    a = a.dropna(subset=["startTime","generation"])
    f = f.dropna(subset=["startTime","publishTime","generation"])
    # Target calendar month is defined in UTC for deterministic interval grouping.
    start = pd.Timestamp(month + "-01", tz="UTC")
    end = start + pd.offsets.MonthBegin(1)
    a = a[(a.startTime >= start) & (a.startTime < end)]
    f = f[(f.startTime >= start) & (f.startTime < end)].copy()
    # Exclude forecast publications at/after delivery day's start.
    f["delivery_day"] = f.startTime.dt.floor("D")
    f = f[f.publishTime < f.delivery_day]
    f = f.sort_values("publishTime").drop_duplicates("startTime", keep="last")
    a = a.sort_values("startTime").drop_duplicates("startTime", keep="last")
    merged = a.merge(f[["startTime","publishTime","generation"]], on="startTime", suffixes=("_actual","_forecast"))
    out=[]
    for _,r in merged.iterrows():
        av=float(r.generation_actual); fv=float(r.generation_forecast)
        out.append({"startTime":r.startTime.isoformat(),"publishTime":r.publishTime.isoformat(),
                    "actual":av,"forecast":fv,"error":fv-av})
    return out

def metrics(rows: list[dict]) -> dict:
    if not rows:
        return {"count":0,"mae":None,"rmse":None,"bias":None,"wape":None}
    e=[float(x["error"]) for x in rows]
    a=sum(abs(float(x["actual"])) for x in rows)
    return {"count":len(rows),"mae":sum(abs(x) for x in e)/len(e),
            "rmse":math.sqrt(sum(x*x for x in e)/len(e)),
            "bias":sum(e)/len(e),
            "wape":sum(abs(x) for x in e)/a*100 if a else None}
