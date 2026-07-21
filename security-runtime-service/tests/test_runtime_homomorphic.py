import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.runtime import (
    RuntimeContext,
    RuntimeDenied,
    _homomorphic_values,
    execute_homomorphic_resource_request,
)


def context(*, supports_homomorphic=True):
    return RuntimeContext(
        request_id="REQ-RESOURCE-HE-001",
        api={
            "id": 5,
            "api_code": "API-RES-MEASURE-001",
            "resource_id": 8,
            "supports_homomorphic": supports_homomorphic,
        },
        subject={"id": 3, "subject_code": "APP-EXTERNAL-C"},
        policy={"id": 10, "scenario": "resource-data-query", "output_mode": "encrypted", "max_rows": 1000},
        risk_score=0,
        client_ip="10.20.10.8",
        query_days=1,
        requested_rows=64,
    )


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.request = httpx.Request("POST", "http://homomorphic/v1/tasks/execute")

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("failed", request=self.request, response=self)

    def json(self):
        return self.payload


class FakeClient:
    def __init__(self, response, captured):
        self.response = response
        self.captured = captured

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, url, json):
        self.captured.update({"url": url, "body": json})
        return self.response


def task_record():
    summary = {
        "trigger": "resource-api-policy",
        "resource": {"id": 8, "code": "RES-MEASURE-001", "name": "吉林电网量测数据"},
        "fieldCode": "ACTIVE_POWER_KW",
        "operation": "mean",
        "events": [],
        "logs": [],
    }
    return {
        "id": 91,
        "task_code": "HE-AUTO-RESOURCE-001",
        "execution_summary_json": summary,
    }


def test_resource_query_values_are_read_from_selected_field_and_limited_in_memory():
    rows = [{"activePowerKw": 10.25}, {"activePowerKw": 20.5}]
    with patch("app.runtime.resource_query", return_value=(rows, {"returnedRows": 2})) as query:
        values = _homomorphic_values(
            {"startAt": "2026-07-01T00:00:00Z", "endAt": "2026-07-01T01:00:00Z"},
            context(),
            "/internal/resource-query",
            "ACTIVE_POWER_KW",
        )

    assert values == [10.25, 20.5]
    assert query.call_args.args[0]["fields"] == "ACTIVE_POWER_KW"
    assert query.call_args.args[0]["pageSize"] == 65


@pytest.mark.parametrize(
    ("rows", "code"),
    [
        ([], "HOMOMORPHIC_NO_DATA"),
        ([{"activePowerKw": "not-a-number"}], "HOMOMORPHIC_FIELD_INVALID"),
        ([{"activePowerKw": index} for index in range(65)], "HOMOMORPHIC_SAMPLE_LIMIT"),
    ],
)
def test_resource_query_rejects_empty_non_numeric_and_oversized_samples(rows, code):
    with patch("app.runtime.resource_query", return_value=(rows, {"returnedRows": len(rows)})):
        with pytest.raises(RuntimeDenied) as denied:
            _homomorphic_values({}, context(), "/internal/resource-query", "ACTIVE_POWER_KW")

    assert denied.value.code == code


def test_encrypted_request_requires_api_homomorphic_capability():
    with pytest.raises(RuntimeDenied) as denied:
        asyncio.run(execute_homomorphic_resource_request(
            {"fieldCode": "ACTIVE_POWER_KW", "operation": "mean"},
            context(supports_homomorphic=False),
            "/internal/resource-query",
        ))

    assert denied.value.code == "HOMOMORPHIC_UNSUPPORTED"


def test_successful_resource_request_completes_task_without_persisting_plaintext_values():
    captured = {}
    updates = []
    response = FakeResponse({
        "requestId": "ENGINE-REQ-001",
        "resultSummary": {
            "value": 15.375,
            "verificationPassed": True,
            "absoluteError": 0.000001,
            "tolerance": 0.00001,
        },
        "durationMs": 8,
        "ciphertextCount": 2,
    })

    def capture_execute(statement, parameters=None):
        updates.append((statement, parameters or {}))
        return 1

    with patch("app.runtime._homomorphic_resource", return_value={"id": 8, "resource_code": "RES-MEASURE-001", "resource_name": "吉林电网量测数据"}), \
         patch("app.runtime._homomorphic_field", return_value={"data_type": "decimal(12,3)"}), \
         patch("app.runtime._homomorphic_key", return_value={"id": 1}), \
         patch("app.runtime._create_homomorphic_task", return_value=(task_record(), [])), \
         patch("app.runtime._homomorphic_values", return_value=[10.25, 20.5]), \
         patch("app.runtime.execute", side_effect=capture_execute), \
         patch("app.runtime.httpx.AsyncClient", return_value=FakeClient(response, captured)), \
         patch("app.runtime.settings", SimpleNamespace(connection_timeout_seconds=5, homomorphic_service_url="http://homomorphic")):
        payload, returned_rows = asyncio.run(execute_homomorphic_resource_request(
            {"fieldCode": "ACTIVE_POWER_KW", "operation": "mean"},
            context(),
            "/internal/resource-query",
        ))

    assert captured["body"]["values"] == [10.25, 20.5]
    assert payload["taskCode"] == "HE-AUTO-RESOURCE-001"
    assert payload["sampleCount"] == 2
    assert payload["resultSummary"]["verificationPassed"] is True
    assert returned_rows == 1
    persisted = " ".join(
        str(value)
        for _statement, parameters in updates
        for key, value in parameters.items()
        if key == "summary"
    )
    assert '"values"' not in persisted
    assert "10.25" not in persisted
    assert "20.5" not in persisted
    assert any("task_status='completed'" in statement for statement, _parameters in updates)


def test_homomorphic_service_failure_marks_automatic_task_failed():
    updates = []
    response = FakeResponse({"detail": "engine failed"}, status_code=503)
    with patch("app.runtime._homomorphic_resource", return_value={"id": 8}), \
         patch("app.runtime._homomorphic_field", return_value={"data_type": "decimal(12,3)"}), \
         patch("app.runtime._homomorphic_key", return_value={"id": 1}), \
         patch("app.runtime._create_homomorphic_task", return_value=(task_record(), [])), \
         patch("app.runtime._homomorphic_values", return_value=[10.25]), \
         patch("app.runtime.execute", side_effect=lambda statement, parameters=None: updates.append((statement, parameters or {})) or 1), \
         patch("app.runtime.httpx.AsyncClient", return_value=FakeClient(response, {})), \
         patch("app.runtime.settings", SimpleNamespace(connection_timeout_seconds=5, homomorphic_service_url="http://homomorphic")):
        with pytest.raises(RuntimeDenied) as denied:
            asyncio.run(execute_homomorphic_resource_request(
                {"fieldCode": "ACTIVE_POWER_KW", "operation": "sum"},
                context(),
                "/internal/resource-query",
            ))

    assert denied.value.code == "HOMOMORPHIC_UNAVAILABLE"
    assert any("task_status='failed'" in statement for statement, _parameters in updates)
    summaries = [parameters["summary"] for _statement, parameters in updates if "summary" in parameters]
    assert all('"values"' not in summary for summary in summaries)
