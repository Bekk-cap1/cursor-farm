"""Smoke-тесты телеметрии (ТЗ фаза A)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_zone_telemetry_requires_auth():
    r = client.get("/api/farms/1/zones/1/telemetry")
    assert r.status_code == 401


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["openai"] in ("configured", "missing", "invalid_key_format", "unused")
    assert data["llm"] in ("openai", "gemini", "off")
