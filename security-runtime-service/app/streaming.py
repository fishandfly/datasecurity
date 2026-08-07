from __future__ import annotations

import json
import math
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from .database import connection, execute, fetch_all, fetch_one


DEFAULT_CONFIG: dict[str, Any] = {
    "engineName": "量测数据流式处理引擎",
    "enabled": True,
    "windowSeconds": 60,
    "pollIntervalSeconds": 10,
    "demoInjectEnabled": True,
    "demoEventsPerTick": 20,
    "anomalyThreshold": 0.05,
    "sourceCode": "SRC-DCLOUD-001",
}


def _json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def streaming_config() -> dict[str, Any]:
    config = dict(DEFAULT_CONFIG)
    row = fetch_one(
        """
        SELECT value FROM "jcConfigCenterItems"
        WHERE "moduleKey" = %(module)s AND "groupKey" = %(group)s AND "key" = %(key)s
        LIMIT 1
        """,
        {
            "module": "security-governance",
            "group": "streaming-engine",
            "key": "streaming_engine_config",
        },
    )
    stored = _json_object(row.get("value") if row else None)
    for key, default in DEFAULT_CONFIG.items():
        if key in stored:
            config[key] = stored[key]
    return config


def _is_enabled(config: dict[str, Any], name: str) -> bool:
    value = config.get(name)
    return value is True or str(value).strip().lower() in {"1", "true", "yes", "on"}


def _window_start_iso(event_time: datetime, window_seconds: int) -> datetime:
    timestamp = int(event_time.timestamp())
    return datetime.fromtimestamp(timestamp - timestamp % max(1, window_seconds), tz=timezone.utc)


def _demo_measurement(global_seq: int) -> tuple[str, str, str, float, str]:
    """按全局序号确定性生成量测事件（可复现），与 seed 事件口径一致。"""
    specs = [
        ("电压", "PSR-DC-V", 220.0, 20.0),
        ("电流", "PSR-DC-C", 300.0, 120.0),
        ("有功功率", "PSR-DC-P", 50.0, 30.0),
    ]
    measure_type, point_prefix, base, span = specs[global_seq % len(specs)]
    region = "REGION-A" if global_seq % 2 == 0 else "REGION-B"
    organization = "ORG-A" if global_seq % 2 == 0 else "ORG-B"
    psr_id = f"{point_prefix}{str((global_seq % 10) + 1).zfill(2)}"
    quality_index = global_seq % 20
    quality = "invalid" if quality_index == 15 else "suspect" if quality_index == 17 else "normal"
    value = round(base + ((global_seq * 7) % int(span)) + (999.0 if quality_index == 15 else 0.0), 3)
    return region, organization, psr_id, measure_type, value, quality


def inject_demo_events(config: dict[str, Any]) -> int:
    if not _is_enabled(config, "demoInjectEnabled"):
        return 0
    events_per_tick = max(1, int(config.get("demoEventsPerTick") or 20))
    row = fetch_one(
        "SELECT count(*) AS total FROM security_streaming_events WHERE event_code LIKE 'STREAM-DEMO-%%'"
    )
    existing = int((row or {}).get("total") or 0)
    tick = existing // events_per_tick
    now = datetime.now(timezone.utc)
    injected = 0
    for seq in range(events_per_tick):
        global_seq = tick * events_per_tick + seq
        region, organization, psr_id, measure_type, value, quality = _demo_measurement(global_seq)
        event_code = f"STREAM-DEMO-{tick:06d}-{seq:03d}"
        existing = fetch_one(
            "SELECT 1 AS hit FROM security_streaming_events WHERE event_code = %(event_code)s",
            {"event_code": event_code},
        )
        if existing:
            continue
        execute(
            """
            INSERT INTO security_streaming_events (
              event_code, event_time, source_code, region_code, organization_code,
              psr_id, measure_type, value, quality_code, processed
            ) VALUES (
              %(event_code)s, %(event_time)s, %(source)s, %(region)s, %(organization)s,
              %(psr_id)s, %(measure_type)s, %(value)s, %(quality)s, false
            )
            """,
            {
                "event_code": event_code,
                "event_time": now,
                "source": config.get("sourceCode") or DEFAULT_CONFIG["sourceCode"],
                "region": region,
                "organization": organization,
                "psr_id": psr_id,
                "measure_type": measure_type,
                "value": value,
                "quality": quality,
            },
        )
        injected += 1
    return injected


def consume_pending_events(config: dict[str, Any]) -> dict[str, Any]:
    window_seconds = max(1, int(config.get("windowSeconds") or 60))
    started = time.perf_counter()
    now = datetime.now(timezone.utc)
    run_code = f"STREAM-RUN-{now.strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"
    with connection() as current, current.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO security_streaming_runs (
              run_code, started_at, status, processed_events, window_count,
              anomaly_count, duration_ms
            ) VALUES (%(run_code)s, %(now)s, 'running', 0, 0, 0, 0)
            RETURNING id
            """,
            {"run_code": run_code, "now": now},
        )
        run_id = int(cursor.fetchone()["id"])
        cursor.execute(
            """
            SELECT * FROM security_streaming_events
            WHERE processed = false ORDER BY event_time ASC LIMIT 500
            """
        )
        events = cursor.fetchall()
        groups: dict[str, dict[str, Any]] = {}
        anomaly_event_codes: list[str] = []
        event_time_start: datetime | None = None
        event_time_end: datetime | None = None
        demo_event_count = 0
        for raw in events:
            event = dict(raw)
            window_start = _window_start_iso(event["event_time"], window_seconds)
            window_end = datetime.fromtimestamp(
                int(window_start.timestamp()) + window_seconds, tz=timezone.utc
            )
            region = str(event.get("region_code") or "")
            measure_type = str(event.get("measure_type") or "")
            key = f"{window_start.isoformat()}|{region}|{measure_type}"
            group = groups.setdefault(
                key,
                {
                    "window_start": window_start,
                    "window_end": window_end,
                    "region": region,
                    "measure_type": measure_type,
                    "event_count": 0,
                    "anomaly_count": 0,
                    "sum": 0.0,
                },
            )
            group["event_count"] += 1
            if str(event.get("quality_code") or "") != "normal":
                group["anomaly_count"] += 1
                if len(anomaly_event_codes) < 10:
                    anomaly_event_codes.append(str(event.get("event_code") or ""))
            if str(event.get("event_code") or "").startswith("STREAM-DEMO-"):
                demo_event_count += 1
            if event_time_start is None or event["event_time"] < event_time_start:
                event_time_start = event["event_time"]
            if event_time_end is None or event["event_time"] > event_time_end:
                event_time_end = event["event_time"]
            try:
                group["sum"] += float(event.get("value") or 0)
            except (TypeError, ValueError):
                pass
        for key, group in groups.items():
            average = group["sum"] / group["event_count"] if group["event_count"] else 0.0
            cursor.execute(
                "SELECT 1 AS hit FROM security_streaming_windows WHERE window_key = %(window_key)s",
                {"window_key": key},
            )
            if cursor.fetchone():
                cursor.execute(
                    """
                    UPDATE security_streaming_windows
                    SET event_count = %(event_count)s, anomaly_count = %(anomaly_count)s,
                        sum_value = %(sum)s, avg_value = %(avg)s, run_id = %(run_id)s
                    WHERE window_key = %(window_key)s
                    """,
                    {
                        "window_key": key,
                        "event_count": group["event_count"],
                        "anomaly_count": group["anomaly_count"],
                        "sum": round(group["sum"], 3),
                        "avg": round(average, 3),
                        "run_id": run_id,
                    },
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO security_streaming_windows (
                      window_key, window_start, window_end, region_code, measure_type,
                      event_count, anomaly_count, sum_value, avg_value, run_id
                    ) VALUES (
                      %(window_key)s, %(window_start)s, %(window_end)s, %(region)s, %(measure_type)s,
                      %(event_count)s, %(anomaly_count)s, %(sum)s, %(avg)s, %(run_id)s
                    )
                    """,
                    {
                        "window_key": key,
                        "window_start": group["window_start"],
                        "window_end": group["window_end"],
                        "region": group["region"],
                        "measure_type": group["measure_type"],
                        "event_count": group["event_count"],
                        "anomaly_count": group["anomaly_count"],
                        "sum": round(group["sum"], 3),
                        "avg": round(average, 3),
                        "run_id": run_id,
                    },
                )
        event_ids = [event["id"] for event in events]
        if event_ids:
            cursor.execute(
                """
                UPDATE security_streaming_events
                SET processed = true, processed_at = %(now)s, run_id = %(run_id)s
                WHERE id = ANY(%(ids)s)
                """,
                {"now": now, "run_id": run_id, "ids": event_ids},
            )
        anomaly_count = sum(group["anomaly_count"] for group in groups.values())
        threshold = float(config.get("anomalyThreshold") or 0.05)
        total_events = sum(group["event_count"] for group in groups.values())
        anomaly_ratio = (anomaly_count / total_events) if total_events else 0.0
        status = "warning" if anomaly_count and anomaly_ratio >= threshold else "success"
        duration_ms = round((time.perf_counter() - started) * 1000)
        window_details = [
            {
                "region": group["region"],
                "measureType": group["measure_type"],
                "windowStart": group["window_start"].isoformat(),
                "eventCount": group["event_count"],
                "anomalyCount": group["anomaly_count"],
                "sum": round(group["sum"], 3),
                "avg": round(group["sum"] / group["event_count"], 3) if group["event_count"] else 0.0,
            }
            for group in groups.values()
        ]
        window_details.sort(key=lambda item: (item["region"], item["measureType"], item["windowStart"]))
        cursor.execute(
            """
            UPDATE security_streaming_runs
            SET finished_at = %(now)s, status = %(status)s,
                processed_events = %(events)s, window_count = %(windows)s,
                anomaly_count = %(anomalies)s, duration_ms = %(duration)s,
                result_detail_json = %(detail)s::jsonb
            WHERE id = %(id)s
            """,
            {
                "now": now,
                "status": status,
                "events": len(event_ids),
                "windows": len(groups),
                "anomalies": anomaly_count,
                "duration": duration_ms,
                "detail": json.dumps(
                    {
                        "windowSeconds": window_seconds,
                        "anomalyRatio": round(anomaly_ratio, 4),
                        "regions": sorted({group["region"] for group in groups.values()}),
                        "eventTimeStart": event_time_start.isoformat() if event_time_start else None,
                        "eventTimeEnd": event_time_end.isoformat() if event_time_end else None,
                        "injectedEventCount": demo_event_count,
                        "anomalyEventCodes": anomaly_event_codes,
                        "windows": window_details,
                    },
                    ensure_ascii=False,
                ),
                "id": run_id,
            },
        )
    return {
        "run_code": run_code,
        "processed_events": len(event_ids),
        "window_count": len(groups),
        "anomaly_count": anomaly_count,
        "status": status,
        "duration_ms": duration_ms,
    }


def streaming_engine_loop() -> None:
    """常驻轮询：注入确定性演示事件并消费聚合（daemon 线程）。"""
    while True:
        try:
            config = streaming_config()
            if _is_enabled(config, "enabled"):
                if _is_enabled(config, "demoInjectEnabled"):
                    inject_demo_events(config)
                consume_pending_events(config)
        except Exception:
            # 引擎轮询容错：单次失败不中断循环
            pass
        poll_interval = max(2, int(streaming_config().get("pollIntervalSeconds") or 10))
        time.sleep(poll_interval)
