from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.streaming import (
    DEFAULT_CONFIG,
    _demo_measurement,
    _window_start_iso,
    consume_pending_events,
    streaming_config,
)


class FakeCursor:
    def __init__(self, rows_after_select, run_id=7, window_hits=1):
        self.rows_after_select = rows_after_select
        self.run_id = run_id
        self.window_hits = window_hits
        self.statements = []
        self._fetchone_results = [{"id": run_id}] + [{"hit": 1} for _ in range(window_hits)]
        self._fetchone_index = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, statement, parameters=None):
        self.statements.append((statement, parameters or {}))

    def fetchone(self):
        if self._fetchone_index < len(self._fetchone_results):
            result = self._fetchone_results[self._fetchone_index]
            self._fetchone_index += 1
            return result
        return None

    def fetchall(self):
        return self.rows_after_select


class Current:
    def __init__(self, cursor):
        self.cursor_value = cursor

    def cursor(self):
        return self.cursor_value


def streaming_connection(rows_after_select, run_id=7, window_hits=1):
    cursor = FakeCursor(rows_after_select, run_id, window_hits)

    @contextmanager
    def connection_factory(*_args, **_kwargs):
        yield Current(cursor)

    return cursor, connection_factory


def test_demo_measurement_is_deterministic_and_quality_distributed():
    first = _demo_measurement(3)
    second = _demo_measurement(3)
    assert first == second
    qualities = [_demo_measurement(index)[5] for index in range(20)]
    assert qualities.count("invalid") == 1
    assert qualities.count("suspect") == 1
    assert qualities.count("normal") == 18


def test_window_start_iso_floors_to_window():
    base = datetime(2026, 7, 10, 10, 0, 30, tzinfo=timezone.utc)
    floored = _window_start_iso(base, 60)
    assert floored.minute == 0
    assert floored.second == 0


def test_streaming_config_uses_defaults_when_missing():
    with patch("app.streaming.fetch_one", return_value=None):
        config = streaming_config()
    assert config["enabled"] is True
    assert config["windowSeconds"] == DEFAULT_CONFIG["windowSeconds"]
    assert config["sourceCode"] == DEFAULT_CONFIG["sourceCode"]


def test_consume_pending_events_aggregates_window_and_updates_run():
    base = datetime(2026, 7, 10, 10, 0, 0, tzinfo=timezone.utc)
    events = [
        {"id": 1, "event_time": base, "region_code": "REGION-A", "measure_type": "电压", "value": 220.0, "quality_code": "normal"},
        {"id": 2, "event_time": base + timedelta(seconds=10), "region_code": "REGION-A", "measure_type": "电压", "value": 221.0, "quality_code": "normal"},
        {"id": 3, "event_time": base + timedelta(seconds=20), "region_code": "REGION-A", "measure_type": "电压", "value": 999.0, "quality_code": "invalid"},
    ]
    cursor, connection_factory = streaming_connection(events, window_hits=1)
    with patch("app.streaming.connection", connection_factory):
        summary = consume_pending_events(dict(DEFAULT_CONFIG))

    statements = cursor.statements
    assert summary["processed_events"] == 3
    assert summary["window_count"] == 1
    assert summary["anomaly_count"] == 1
    assert summary["status"] == "warning"
    window_update = next(
        (parameters for statement, parameters in statements if "security_streaming_windows" in statement and "UPDATE" in statement),
        None,
    )
    assert window_update is not None
    assert window_update["event_count"] == 3
    assert window_update["anomaly_count"] == 1
    assert window_update["sum"] == 1440.0
    assert window_update["avg"] == 480.0
    assert window_update["run_id"] == 7
    run_update = next(
        (parameters for statement, parameters in statements if "security_streaming_runs" in statement and "UPDATE" in statement),
        None,
    )
    assert run_update is not None
    assert run_update["status"] == "warning"
    assert run_update["events"] == 3
    assert run_update["windows"] == 1
    assert run_update["anomalies"] == 1


def test_consume_pending_events_success_without_anomalies():
    base = datetime(2026, 7, 10, 10, 0, 0, tzinfo=timezone.utc)
    events = [
        {"id": 4, "event_time": base, "region_code": "REGION-B", "measure_type": "电流", "value": 300.0, "quality_code": "normal"},
    ]
    cursor, connection_factory = streaming_connection(events, window_hits=0)
    with patch("app.streaming.connection", connection_factory):
        summary = consume_pending_events(dict(DEFAULT_CONFIG))
    assert summary["status"] == "success"
    assert summary["anomaly_count"] == 0
    window_insert = next(
        (parameters for statement, parameters in cursor.statements if "security_streaming_windows" in statement and "INSERT" in statement),
        None,
    )
    assert window_insert is not None
    assert window_insert["event_count"] == 1
