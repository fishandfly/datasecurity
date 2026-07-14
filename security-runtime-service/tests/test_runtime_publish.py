import json
from unittest.mock import patch

import pytest

from app.runtime import build_resource_runtime_config, publish_api, publish_policy


def test_build_resource_runtime_config_uses_resource_table_and_output_fields():
    api = {"id": 9, "resource_id": 3, "data_source_id": 7, "runtime_config_json": {}}
    resource = {
        "id": 3,
        "data_source_id": 7,
        "source_table": "measurement.readings",
        "source_tablelist": {"baseline_table": "measurement.readings"},
    }
    source = {"id": 7, "connection_status": "connected", "connection_options_json": {"dialect": "postgresql"}}
    fields = [
        {"field_code": "DATA_TIME", "output_allowed": True, "required_desensitization": False},
        {"field_code": "POINT_CODE", "output_allowed": True, "required_desensitization": True},
        {"field_code": "SECRET_VALUE", "output_allowed": False, "required_desensitization": False},
    ]
    with patch("app.runtime.fetch_one", side_effect=[resource, source]), patch("app.runtime.fetch_all", return_value=fields):
        config, source_id = build_resource_runtime_config(api)

    assert source_id == 7
    assert config["table"] == "measurement.readings"
    assert config["fieldMap"] == {"DATA_TIME": "DATA_TIME", "POINT_CODE": "POINT_CODE"}
    assert config["defaultFields"] == ["DATA_TIME", "POINT_CODE"]
    assert config["maskFields"] == ["POINT_CODE"]
    assert config["timeFieldCode"] == "DATA_TIME"


def test_build_resource_runtime_config_rejects_unknown_field_mapping():
    api = {
        "resource_id": 3,
        "data_source_id": 7,
        "runtime_config_json": {"fieldMap": {"UNKNOWN": "unknown_column"}},
    }
    resource = {"id": 3, "data_source_id": 7, "source_table": "readings"}
    source = {"id": 7, "connection_status": "connected", "connection_options_json": {"dialect": "mysql"}}
    fields = [{"field_code": "DATA_TIME", "output_allowed": True, "required_desensitization": False}]
    with patch("app.runtime.fetch_one", side_effect=[resource, source]), patch("app.runtime.fetch_all", return_value=fields):
        with pytest.raises(ValueError, match="不属于当前资源"):
            build_resource_runtime_config(api)


def test_publish_api_persists_python_runtime_route_and_config():
    api = {
        "id": 9,
        "resource_id": 3,
        "data_source_id": 7,
        "access_mode": "develop",
        "http_method": "GET",
        "gateway_path": "/data-api/resources/meter",
        "orchestrator_path": "/internal/resource-query",
        "publish_version": 2,
        "runtime_config_json": {},
    }
    config = {"version": 1, "table": "readings", "fieldMap": {"DATA_TIME": "data_time"}, "defaultFields": ["DATA_TIME"]}
    with patch("app.runtime.fetch_one", return_value=api), \
         patch("app.runtime.build_resource_runtime_config", return_value=(config, 7)), \
         patch("app.runtime.verify_resource_runtime_config"), \
         patch("app.runtime.execute") as execute:
        result = publish_api(9)

    assert result["publishVersion"] == 3
    parameters = execute.call_args.args[1]
    assert parameters["orchestrator_path"] == "/internal/resource-query"
    assert json.loads(parameters["runtime_config"])["fieldMap"] == {"DATA_TIME": "data_time"}


def test_publish_policy_requires_subject_api_authorization():
    policy = {
        "id": 12,
        "policy_code": "POL-12",
        "scenario": "resource-data-query",
        "subject_id": 2,
        "api_resource_id": 9,
        "output_mode": "detail",
        "subject_status": "enabled",
        "api_status": "enabled",
        "api_publish_status": "success",
        "api_code": "API-RESOURCE-9",
        "allowed_api_codes_json": [],
        "max_requests_per_minute": 60,
        "max_query_days": 1,
        "max_rows": 1000,
        "risk_threshold": 70,
    }
    with patch("app.runtime.fetch_one", return_value=policy), patch("app.runtime.execute"):
        with pytest.raises(ValueError, match="API 授权清单"):
            publish_policy(12)
