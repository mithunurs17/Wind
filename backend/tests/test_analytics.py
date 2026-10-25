from app.analytics import matched_rows, metrics

def test_latest_pre_delivery_forecast_selected():
    a=[{"startTime":"2026-01-02T01:00:00Z","generation":100}]
    f=[
      {"startTime":"2026-01-02T01:00:00Z","publishTime":"2026-01-01T10:00:00Z","generation":80},
      {"startTime":"2026-01-02T01:00:00Z","publishTime":"2026-01-01T18:00:00Z","generation":90},
      {"startTime":"2026-01-02T01:00:00Z","publishTime":"2026-01-02T00:00:00Z","generation":99},
    ]
    rows=matched_rows(a,f,"2026-01")
    assert len(rows)==1 and rows[0]["forecast"]==90

def test_metrics():
    m=metrics([{"actual":10,"forecast":12,"error":2},{"actual":20,"forecast":17,"error":-3}])
    assert m["count"]==2
    assert m["mae"]==2.5
    assert m["bias"]==-0.5
    assert round(m["rmse"],3)==2.55

def test_empty_metrics():
    assert metrics([])["count"]==0
