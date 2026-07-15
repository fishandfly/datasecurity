from __future__ import annotations

import time
from datetime import datetime, timezone
import json
from typing import Any
from uuid import uuid4

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .database import connection, execute, fetch_one
from .runtime import (
    RuntimeDenied,
    aggregate_measurements,
    authorize,
    execute_data_api,
    publish_api,
    publish_policy,
    ensure_behavior_baseline_unique_index,
    upsert_behavior_baseline,
    ensure_resource_api,
    preview_resource_latest_rows,
    unpublish_api,
    record_allowed,
    record_denied,
    runtime_summary,
)
from .settings import settings
from .source_connection import check_database_connection


app = FastAPI(
    title="量测数据安全运行服务",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
)


@app.on_event("startup")
def ensure_runtime_constraints() -> None:
    try:
        ensure_behavior_baseline_unique_index()
    except Exception:
        # 首次安装时管理表可能尚未创建，保存基线时会再次执行并返回明确错误。
        pass


def _error(status: int, code: str, message: str, request_id: str | None = None) -> JSONResponse:
    resolved_request_id = request_id or str(uuid4())
    return JSONResponse(
        status_code=status,
        content={
            "requestId": resolved_request_id,
            "code": code,
            "message": message,
            "details": [],
        },
        headers={"X-Request-Id": resolved_request_id},
    )


async def _require_management_session(request: Request) -> JSONResponse | None:
    authorization = request.headers.get("authorization", "")
    if not authorization:
        return _error(401, "AUTH_MISSING", "登录状态已失效")
    headers = {"authorization": authorization}
    for name in ("x-authenticator", "x-role", "x-locale", "x-timezone"):
        value = request.headers.get(name)
        if value:
            headers[name] = value
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{settings.management_api_url}auth:check", headers=headers)
        if response.status_code != 200:
            return _error(401, "AUTH_MISSING", "登录状态已失效")
    except httpx.HTTPError:
        return _error(503, "MANAGEMENT_UNAVAILABLE", "管理服务暂不可用")
    return None


@app.get("/health")
async def health() -> dict[str, Any]:
    database_status = "ok"
    homomorphic_status = "ok"
    try:
        summary = runtime_summary()
    except Exception:
        database_status = "unavailable"
        summary = {"sources": 0, "apis": 0, "policies": 0, "subjects": 0, "calls": 0, "risks": 0}
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            response = await client.get(f"{settings.homomorphic_service_url}/health")
            response.raise_for_status()
    except (httpx.HTTPError, ValueError):
        homomorphic_status = "unavailable"
    status = "ok" if database_status == "ok" else "degraded"
    return {
        "status": status,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "services": {
            "configuration": database_status,
            "dataAccess": database_status,
            "policyControl": database_status,
            "homomorphicComputation": homomorphic_status,
        },
        "configuration": summary,
    }


@app.get("/existing-api/region-load")
def existing_region_load(request: Request):
    try:
        return aggregate_measurements(request.query_params)
    except ValueError:
        return _error(400, "VALIDATION_ERROR", "请求参数不符合要求")


@app.api_route("/data-api/{path:path}", methods=["GET", "POST"])
async def data_api(request: Request):
    started_at = time.perf_counter()
    body = await request.body()
    context = None
    try:
        context = authorize(request, body)
        payload, returned_rows = await execute_data_api(request, context)
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        record_allowed(context, returned_rows, duration_ms)
        return JSONResponse(
            content=payload,
            headers={
                "X-Request-Id": context.request_id,
                "X-Decision": "allow",
                "X-Risk-Level": context.level,
            },
        )
    except RuntimeDenied as error:
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        try:
            record_denied(error, duration_ms)
        except Exception:
            pass
        return _error(error.status, error.code, error.message, error.request_id)
    except (ValueError, PermissionError) as error:
        code = str(error) if str(error) in {"VALIDATION_ERROR", "FIELD_NOT_ALLOWED", "POLICY_NOT_FOUND"} else "VALIDATION_ERROR"
        denied = RuntimeDenied(
            code,
            request_id=context.request_id if context else str(uuid4()),
            api=context.api if context else None,
            subject=context.subject if context else None,
            policy=context.policy if context else None,
            client_ip=context.client_ip if context else "gateway",
            query_days=context.query_days if context else 0,
            requested_rows=context.requested_rows if context else 0,
        )
        try:
            record_denied(denied, round((time.perf_counter() - started_at) * 1000))
        except Exception:
            pass
        return _error(denied.status, denied.code, denied.message, denied.request_id)
    except Exception:
        return _error(500, "INTERNAL_ERROR", "服务处理失败", context.request_id if context else None)


@app.post("/management/data-sources/{source_id}/test")
async def test_data_source(source_id: int, request: Request):
    auth_error = await _require_management_session(request)
    if auth_error:
        return auth_error
    source = fetch_one("SELECT * FROM security_data_sources WHERE id=%(id)s", {"id": source_id})
    if not source:
        return _error(404, "NOT_FOUND", "数据源不存在")
    execute(
        "UPDATE security_data_sources SET connection_status='testing', \"updatedAt\"=%(now)s WHERE id=%(id)s",
        {"id": source_id, "now": datetime.now(timezone.utc)},
    )
    started_at = datetime.now(timezone.utc)
    started_timer = time.perf_counter()
    issue = "连接检查通过"
    status = "connected"
    try:
        source_type = str(source.get("source_type") or "")
        if source_type in {"existing_api", "third_party_api"}:
            url = str(source.get("host") or "")
            if not url.startswith(("http://", "https://")):
                raise ValueError("接口地址格式不正确")
            async with httpx.AsyncClient(timeout=settings.connection_timeout_seconds) as client:
                response = await client.get(url, params={
                    "regionCode": "REGION-A",
                    "startAt": "2026-07-01T00:00:00+08:00",
                    "endAt": "2026-07-01T01:00:00+08:00",
                })
                response.raise_for_status()
        else:
            secret = settings.source_secrets.get(str(source.get("secret_ref") or ""), "")
            if not secret:
                raise ValueError("连接凭据尚未配置")
            check_database_connection(
                source,
                secret,
                settings.connection_timeout_seconds,
            )
    except (ValueError, httpx.HTTPError) as error:
        status = "exception"
        issue = str(error).splitlines()[0][:180] or "连接检查失败"
    latency_ms = round((time.perf_counter() - started_timer) * 1000)
    counts = fetch_one(
        """
        SELECT count(*) AS resource_count, coalesce(sum(field_count), 0) AS field_count
        FROM eco_data_resources WHERE data_source_id=%(id)s
        """,
        {"id": source_id},
    ) or {"resource_count": 0, "field_count": 0}
    now = datetime.now(timezone.utc)
    monitor = dict(source.get("last_monitor_json") or {})
    monitor.update(
        {
            "resourceCount": int(counts["resource_count"] or 0),
            "fieldCount": int(counts["field_count"] or 0),
            "latencyMs": latency_ms if status == "connected" else None,
            "lastHeartbeat": now.isoformat(),
            "issue": issue,
        }
    )
    execute(
        """
        UPDATE security_data_sources
        SET connection_status=%(status)s, last_checked_at=%(now)s,
            last_monitor_json=%(monitor)s::jsonb,
            last_check_summary_json=%(summary)s::jsonb, "updatedAt"=%(now)s
        WHERE id=%(id)s
        """,
        {
            "id": source_id,
            "status": status,
            "now": now,
            "monitor": json.dumps(monitor, ensure_ascii=False),
            "summary": json.dumps(
                {"status": "success" if status == "connected" else "failed", "checkedAt": now.isoformat(), "latencyMs": latency_ms, "message": issue},
                ensure_ascii=False,
            ),
        },
    )
    connection_options = source.get("connection_options_json") or {}
    dialect = str(connection_options.get("dialect") or "postgresql") if isinstance(connection_options, dict) else "postgresql"
    execute(
        """
        INSERT INTO security_ingest_logs
          (batch_code, execution_type, rule_version, started_at, finished_at,
           input_count, passed_count, rejected_count, duration_ms, result_status,
           error_summary, result_detail_json, data_source_id, "createdAt", "updatedAt")
        VALUES
          (%(batch_code)s, 'connection_test', 1, %(started_at)s, %(finished_at)s,
           1, %(passed_count)s, %(rejected_count)s, %(duration_ms)s, %(result_status)s,
           %(error_summary)s, %(result_detail)s::jsonb, %(source_id)s, %(finished_at)s, %(finished_at)s)
        """,
        {
            "batch_code": f"CONN-{now.strftime('%Y%m%d%H%M%S')}-{source_id}-{uuid4().hex[:8]}",
            "started_at": started_at,
            "finished_at": now,
            "passed_count": 1 if status == "connected" else 0,
            "rejected_count": 0 if status == "connected" else 1,
            "duration_ms": latency_ms,
            "result_status": "success" if status == "connected" else "failed",
            "error_summary": None if status == "connected" else issue,
            "result_detail": json.dumps(
                {
                    "check": "SELECT 1",
                    "dialect": dialect,
                    "database": str(source.get("database_name") or ""),
                    "message": issue,
                },
                ensure_ascii=False,
            ),
            "source_id": source_id,
        },
    )
    payload = {
        "sourceId": source_id,
        "status": status,
        "checkedAt": now.isoformat(),
        "latencyMs": latency_ms if status == "connected" else None,
        "message": issue,
    }
    return JSONResponse(status_code=200 if status == "connected" else 422, content={"data": payload})


@app.post("/management/apis/{api_id}/publish")
async def publish_api_endpoint(api_id: int, request: Request):
    auth_error = await _require_management_session(request)
    if auth_error:
        return auth_error
    try:
        return {"data": publish_api(api_id)}
    except LookupError as error:
        return _error(404, "NOT_FOUND", str(error))
    except ValueError as error:
        return _error(422, "VALIDATION_ERROR", str(error))


@app.post("/management/resources/{resource_id}/default-api")
async def ensure_resource_api_endpoint(resource_id: int, request: Request):
    auth_error = await _require_management_session(request)
    if auth_error:
        return auth_error
    try:
        return {"data": ensure_resource_api(resource_id)}
    except LookupError as error:
        return _error(404, "NOT_FOUND", str(error))
    except ValueError as error:
        return _error(422, "VALIDATION_ERROR", str(error))


@app.get("/management/resources/{resource_id}/latest-rows")
async def preview_resource_latest_rows_endpoint(resource_id: int, request: Request):
    auth_error = await _require_management_session(request)
    if auth_error:
        return auth_error
    try:
        return {"data": preview_resource_latest_rows(resource_id, 10)}
    except LookupError as error:
        return _error(404, "NOT_FOUND", str(error))
    except ValueError as error:
        return _error(422, "VALIDATION_ERROR", str(error))
    except RuntimeDenied as error:
        return _error(error.status, error.code, error.message, error.request_id)


@app.post("/management/apis/{api_id}/unpublish")
async def unpublish_api_endpoint(api_id: int, request: Request):
    auth_error = await _require_management_session(request)
    if auth_error:
        return auth_error
    try:
        return {"data": unpublish_api(api_id)}
    except LookupError as error:
        return _error(404, "NOT_FOUND", str(error))


@app.post("/management/policies/{policy_id}/publish")
async def publish_policy_endpoint(policy_id: int, request: Request):
    auth_error = await _require_management_session(request)
    if auth_error:
        return auth_error
    try:
        return {"data": publish_policy(policy_id)}
    except LookupError as error:
        return _error(404, "NOT_FOUND", str(error))
    except ValueError as error:
        return _error(422, "VALIDATION_ERROR", str(error))


@app.put("/management/apis/{api_id}/subjects/{subject_id}/behavior-baseline")
async def save_behavior_baseline_endpoint(api_id: int, subject_id: int, request: Request):
    auth_error = await _require_management_session(request)
    if auth_error:
        return auth_error
    try:
        values = await request.json()
        if not isinstance(values, dict):
            raise ValueError("行为基线参数不正确")
        return {"data": upsert_behavior_baseline(subject_id, api_id, values)}
    except LookupError as error:
        return _error(404, "NOT_FOUND", str(error))
    except (ValueError, TypeError) as error:
        return _error(422, "VALIDATION_ERROR", str(error))
