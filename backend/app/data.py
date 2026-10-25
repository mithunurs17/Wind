import os, time
import httpx

BASE="https://data.elexon.co.uk/bmrs/api/v1/datasets"
_cache={}
TTL=240

async def stream(dataset: str):
    now=time.time()
    if dataset in _cache and now-_cache[dataset][0] < TTL:
        return _cache[dataset][1]
    url=f"{BASE}/{dataset}/stream"
    params={"from":"2026-01-01T00:00:00Z","to":"2026-02-01T00:00:00Z"}
    async with httpx.AsyncClient(timeout=40, follow_redirects=True) as client:
        response=await client.get(url,params=params)
        response.raise_for_status()
        payload=response.json()
    # APIs may return a list directly or an envelope.
    if isinstance(payload,list): records=payload
    elif isinstance(payload,dict):
        records=payload.get("data") or payload.get("results") or payload.get("items") or []
    else: records=[]
    if not isinstance(records,list): records=[]
    _cache[dataset]=(now,records)
    return records

def demo_data():
    # Stable mock series explicitly marked as sample data.
    actual=[]; forecasts=[]
    for day in range(1,32):
        for slot in range(48):
            import datetime, math
            t=datetime.datetime(2026,1,day,tzinfo=datetime.timezone.utc)+datetime.timedelta(minutes=30*slot)
            base=8500+2600*math.sin((slot/48)*math.tau)+900*math.sin(day*.8)
            actual.append({"startTime":t.isoformat(),"generation":round(max(0,base+300*math.sin(day+slot*.31)),1),"fuelType":"WIND"})
            pub=t.replace(hour=0,minute=0)-datetime.timedelta(hours=1)
            forecasts.append({"startTime":t.isoformat(),"publishTime":pub.isoformat(),"generation":round(max(0,base+650*math.cos(day+slot*.21)),1)})
    return actual,forecasts
