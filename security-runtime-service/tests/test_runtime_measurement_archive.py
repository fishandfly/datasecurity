from contextlib import contextmanager
import asyncio
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.runtime import (
    RuntimeContext,
    RuntimeDenied,
    _homomorphic_values,
    _measurement_archive,
    aggregate_measurements,
    detail_measurements,
    execute_data_api,
    measurement_connection,
    preview_resource_latest_rows,
)


VOLTAGE_ARCHIVE = {
    "table": "measurement_demo.grid_low_freq_voltage",
    "fieldMap": {
        "DATA_TIME": "data_time",
        "REGION_CODE": "region_code",
        "ORGANIZATION_CODE": "organization_code",
        "POINT_CODE": "pos_code",
        "VOLTAGE": "voltage",
        "QUALITY_FLAG": "quality_code",
    },
    "timeFieldCode": "DATA_TIME",
    "regionFieldCode": "REGION_CODE",
    "organizationFieldCode": "ORGANIZATION_CODE",
    "pointFieldCode": "POINT_CODE",
    "valueFieldCode": "VOLTAGE",
    "defaultFields": ["DATA_TIME", "POINT_CODE", "VOLTAGE"],
    "maskFields": ["POINT_CODE"],
    "scales": {"VOLTAGE": 0.001},
}


def archive_context(runtime_config_json, *, output_mode="detail"):
    return RuntimeContext(
        request_id="REQ-ARCHIVE-001",
        api={
            "id": 5,
            "api_code": "API-LVF-VOLT-001",
            "resource_id": 8,
            "data_source_id": 9,
            "runtime_config_json": runtime_config_json,
        },
        subject={"id": 3, "subject_code": "APP-INTERNAL-A"},
        policy={"id": 10, "scenario": "resource-data-query", "output_mode": output_mode, "max_rows": 1000},
        risk_score=0,
        client_ip="10.20.10.8",
        query_days=1,
        requested_rows=100,
    )


class Cursor:
    def __init__(self, rows, on_execute=None):
        self.rows = rows
        self.on_execute = on_execute

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, statement, parameters):
        if self.on_execute:
            self.on_execute(statement, parameters)

    def fetchall(self):
        return self.rows


class Current:
    def __init__(self, cursor):
        self.cursor_value = cursor

    def cursor(self):
        return self.cursor_value


def archive_connection(rows, on_execute=None):
    @contextmanager
    def connection_factory(_context):
        yield Current(Cursor(rows, on_execute))

    return connection_factory


def test_measurement_archive_parses_3_1_and_3_0_naming_and_scales():
    config = {
        "table": "measurement_demo.cust_measurement_curve",
        "fieldMap": {"DATA_TIME": "data_time", "VALUE": "value"},
        "timeColumn": "DATA_TIME",
        "regionColumn": "REGION_CODE",
        "valueColumn": "VALUE",
        "scales": {"VALUE": 0.001, "IGNORED": 1},
    }
    archive = _measurement_archive(archive_context(config))

    assert archive is not None
    assert archive["table"] == "measurement_demo.cust_measurement_curve"
    assert archive["timeFieldCode"] == "DATA_TIME"
    assert archive["valueFieldCode"] == "VALUE"
    assert archive["scales"] == {"VALUE": 0.001}


def test_measurement_archive_returns_none_without_config():
    assert _measurement_archive(archive_context({})) is None
    assert _measurement_archive(archive_context(None)) is None


def test_detail_measurements_dispatch_and_sql_with_archive():
    context = archive_context(VOLTAGE_ARCHIVE, output_mode="masked")
    captured = {}

    def on_execute(statement, parameters):
        captured["statement"] = statement
        captured["parameters"] = parameters

    rows = [
        {"data_time": "2026-07-01T00:05:00+08:00", "pos_code": "PSR-220-TRA-01", "voltage": 220.1234},
        {"data_time": "2026-07-01T00:10:00+08:00", "pos_code": "PSR-220-BUS-01", "voltage": 221.0000},
    ]
    params = {
        "regionCode": "REGION-A",
        "startAt": "2026-07-01T00:00:00+08:00",
        "endAt": "2026-07-01T01:00:00+08:00",
    }
    with patch("app.runtime.fetch_one", return_value={"connection_options_json": {"dialect": "postgresql"}}), \
         patch("app.runtime.measurement_connection", archive_connection(rows, on_execute)):
        result, meta = detail_measurements(params, context)

    statement = captured["statement"]
    assert 'FROM "measurement_demo"."grid_low_freq_voltage"' in statement
    assert '"data_time"' in statement and '"voltage"' in statement
    assert '"pos_code"' in statement
    assert captured["parameters"]["region"] == "REGION-A"
    assert result[0]["pointCode"] == "PSR***01"
    assert result[0]["voltage"] == 220.1234
    assert result[0]["dataTime"] == "2026-07-01T00:05:00+08:00"
    assert meta["returnedRows"] == 2


def test_detail_measurements_uses_legacy_path_without_archive():
    context = archive_context({})
    with patch("app.runtime._legacy_detail_measurements", return_value=([], {"returnedRows": 0})) as legacy:
        detail_measurements({}, context)
    legacy.assert_called_once()


def test_archive_detail_rejects_archive_without_time_or_region_field():
    broken = {
        **VOLTAGE_ARCHIVE,
        "fieldMap": {"DATA_TIME": "data_time", "VOLTAGE": "voltage"},
        "regionFieldCode": "",
    }
    with pytest.raises(ValueError, match="VALIDATION_ERROR"):
        detail_measurements({}, archive_context(broken))


def test_archive_aggregate_uses_configured_table_value_and_metric():
    context = archive_context(VOLTAGE_ARCHIVE, output_mode="aggregate")
    captured = {}

    def on_execute(statement, parameters):
        captured["statement"] = statement
        captured["parameters"] = parameters

    rows = [{"region_code": "REGION-A", "hour": "2026-07-01T00:00:00+08:00", "power_sum": 882.0, "power_average": 220.5, "sample_count": 4}]
    params = {
        "regionCode": "REGION-A",
        "startAt": "2026-07-01T00:00:00+08:00",
        "endAt": "2026-07-01T01:00:00+08:00",
        "metric": "VOLTAGE",
    }
    with patch("app.runtime.fetch_one", return_value={"connection_options_json": {"dialect": "postgresql"}}), \
         patch("app.runtime.measurement_connection", archive_connection(rows, on_execute)):
        result = aggregate_measurements(params, context)

    statement = captured["statement"]
    assert 'FROM "measurement_demo"."grid_low_freq_voltage"' in statement
    assert 'sum("voltage")' in statement
    assert "date_trunc('hour'" in statement
    assert result[0]["regionCode"] == "REGION-A"
    assert result[0]["sum"] == 882.0
    assert result[0]["sampleCount"] == 4


def test_legacy_aggregate_rejects_unknown_metric_with_context():
    with pytest.raises(RuntimeDenied) as caught:
        aggregate_measurements({"metric": "other"}, archive_context({}, output_mode="aggregate"))
    assert caught.value.code == "VALIDATION_ERROR"


def test_legacy_aggregate_without_context_skips_metric_check():
    with patch("app.runtime._legacy_aggregate_measurements", return_value=[]) as legacy:
        aggregate_measurements({"metric": "other"}, None)
    legacy.assert_called_once()


def test_homomorphic_region_hourly_archive_reads_configured_column_with_scale():
    context = archive_context(VOLTAGE_ARCHIVE, output_mode="encrypted")
    captured = {}

    def on_execute(statement, parameters):
        captured["statement"] = statement
        captured["parameters"] = parameters

    rows = [{"value": 220.5}, {"value": 221.0}]
    params = {
        "regionCode": "REGION-A",
        "startAt": "2026-07-01T00:00:00+08:00",
        "endAt": "2026-07-01T00:30:00+08:00",
    }
    with patch("app.runtime.fetch_one", return_value={"connection_options_json": {"dialect": "postgresql"}}), \
         patch("app.runtime.measurement_connection", archive_connection(rows, on_execute)):
        values = _homomorphic_values(params, context, "/internal/region-hourly", "VOLTAGE")

    assert 'SELECT "voltage" AS value FROM "measurement_demo"."grid_low_freq_voltage"' in captured["statement"]
    assert values == [0.2205, 0.221]


def test_measurement_connection_rejects_file_e_channel_source():
    context = archive_context({})
    source = {
        "id": 9,
        "source_type": "file_e",
        "connection_status": "connected",
        "secret_ref": "secret://security/source/src-ems-001",
        "connection_options_json": {"file_pattern": "EMS_ELEC_ANALOG_*.e"},
    }
    with patch("app.runtime.fetch_one", return_value=source), \
         patch(
             "app.runtime.settings",
             SimpleNamespace(source_secrets={"secret://security/source/src-ems-001": "demo-secret"}),
         ):
        with pytest.raises(RuntimeDenied) as caught:
            with measurement_connection(context):
                pass
    assert caught.value.code == "UPSTREAM_UNAVAILABLE"


def test_preview_resource_latest_rows_maps_field_codes_to_physical_columns():
    resource = {
        "id": 8,
        "data_source_id": 9,
        "source_table": "measurement_demo.grid_low_freq_voltage",
        "stat_base": {
            "business_time_field": "DATA_TIME",
            "field_map": {"DATA_TIME": "data_time", "PSR_ID": "psr_id", "VOLTAGE": "voltage"},
        },
    }
    source = {
        "id": 9,
        "connection_status": "connected",
        "connection_options_json": {"dialect": "postgresql"},
        "security_config_json": {
            "samplingEnabled": True,
            "samplingRate": 100,
            "integrityEnabled": False,
        },
        "validation_rules_json": {},
    }
    fields = [
        {"field_code": "DATA_TIME", "field_name": "采集时间", "data_type": "datetime"},
        {"field_code": "PSR_ID", "field_name": "设备档案标识", "data_type": "varchar(64)"},
        {"field_code": "VOLTAGE", "field_name": "电压", "data_type": "decimal"},
    ]
    captured = {}

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, statement, parameters):
            captured["statement"] = statement
            captured["parameters"] = parameters

        def fetchall(self):
            return [
                {"data_time": "2026-07-01T00:05:00+08:00", "psr_id": "PSR-220-TRA-01", "voltage": 220.67},
            ]

    class Current:
        def cursor(self):
            return Cursor()

    @contextmanager
    def preview_connection(_context):
        yield Current()

    with patch("app.runtime.fetch_one", side_effect=[resource, source]), \
         patch("app.runtime.fetch_all", return_value=fields), \
         patch("app.runtime.measurement_connection", preview_connection), \
         patch("app.runtime.execute"):
        result = preview_resource_latest_rows(8)

    assert '"data_time"' in captured["statement"]
    assert '"voltage"' in captured["statement"]
    assert 'ORDER BY "data_time" DESC' in captured["statement"]
    assert result["rows"][0]["DATA_TIME"] == "2026-07-01T00:05:00+08:00"
    assert result["rows"][0]["VOLTAGE"] == 220.67


class _FakeRequest:
    class QueryParams(dict):
        def __init__(self, values=None):
            super().__init__(values or {})
            self._values = dict(values or {})

        def multi_items(self):
            return list(self._values.items())

    def __init__(self, query=None):
        self.query_params = _FakeRequest.QueryParams(query)
        self.method = "GET"

    async def json(self):
        return {}

    async def body(self):
        return b""


def test_execute_data_api_returns_placeholder_for_push_and_model_paths():
    for path, expected_service, expected_key in [
        ("/internal/push/switch-event", "message_push", "topic"),
        ("/internal/model/line-relation", "model_service", "model"),
    ]:
        context = archive_context(
            {"topic": "switch-event", "model": "line-relation", "placeholder": True},
            output_mode="detail",
        )
        context = RuntimeContext(
            **{
                **context.__dict__,
                "api": {
                    **context.api,
                    "access_mode": "orchestrate",
                    "orchestrator_path": path,
                },
            }
        )
        result, count = asyncio.run(execute_data_api(_FakeRequest(), context))
        assert result["status"] == "placeholder"
        assert result["serviceType"] == expected_service
        assert expected_key in result
        assert count == 0


def test_execute_data_api_resource_query_supports_aggregate_output():
    context = archive_context(VOLTAGE_ARCHIVE, output_mode="aggregate")
    context = RuntimeContext(
        **{
            **context.__dict__,
            "api": {
                **context.api,
                "access_mode": "develop",
                "orchestrator_path": "/internal/resource-query",
            },
        }
    )
    rows = [
        {
            "regionCode": "REGION-A",
            "hour": "2026-07-01T00:00:00+08:00",
            "sum": 882.0,
            "average": 220.5,
            "sampleCount": 4,
        }
    ]
    request = _FakeRequest(
        query={
            "regionCode": "REGION-A",
            "startAt": "2026-07-01T00:00:00+08:00",
            "endAt": "2026-07-01T01:00:00+08:00",
            "metric": "VOLTAGE",
        }
    )
    with patch("app.runtime.aggregate_measurements", return_value=rows) as aggregate:
        result, count = asyncio.run(execute_data_api(request, context))

    aggregate.assert_called_once()
    assert result["meta"]["outputMode"] == "aggregate"
    assert result["meta"]["decision"] == "allow"
    assert result["data"] == rows
    assert count == 1
