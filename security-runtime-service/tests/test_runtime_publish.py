import json
from contextlib import contextmanager
from unittest.mock import patch

import pytest

from app.runtime import (
    build_resource_runtime_config,
    ensure_resource_api,
    ensure_behavior_baseline_unique_index,
    publish_api,
    publish_policy,
    preview_resource_latest_rows,
    unpublish_api,
    upsert_behavior_baseline,
    validate_custom_query_sql,
)


def test_behavior_baseline_unique_index_rejects_existing_duplicates():
    with patch("app.runtime.fetch_one", return_value={"subject_id": 2, "api_resource_id": 9, "duplicate_count": 2}), \
         patch("app.runtime.execute") as execute:
        with pytest.raises(ValueError, match="重复"):
            ensure_behavior_baseline_unique_index()
    execute.assert_not_called()


def test_behavior_baseline_upsert_uses_subject_api_conflict_key():
    saved = {"id": 7, "baseline_code": "BASE-APP-A-API-A", "baseline_version": 2, "baseline_status": "enabled"}
    values = {
        "sample_from": "2026-07-01T00:00:00+08:00",
        "sample_to": "2026-07-15T00:00:00+08:00",
        "sample_count": 120,
        "frequency_avg": 10,
        "frequency_stddev": 2,
        "query_days_avg": 1,
        "query_days_stddev": 0.5,
        "rows_avg": 100,
        "rows_stddev": 20,
        "failure_avg": 0,
        "baseline_status": "enabled",
    }
    with patch("app.runtime.ensure_behavior_baseline_unique_index"), \
         patch("app.runtime.fetch_one", side_effect=[
             {"id": 2, "subject_code": "APP-A"},
             {"id": 9, "api_code": "API-A"},
             saved,
         ]) as fetch_one:
        result = upsert_behavior_baseline(2, 9, values)

    assert result == saved
    statement = fetch_one.call_args_list[2].args[0]
    assert "ON CONFLICT (subject_id, api_resource_id) DO UPDATE" in statement
    assert "baseline_version=security_behavior_baselines.baseline_version + 1" in statement


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


def test_build_resource_runtime_config_reads_resource_query_sql_and_defaults():
    api = {"id": 9, "resource_id": 3, "data_source_id": 7, "runtime_config_json": {}}
    resource = {
        "id": 3,
        "data_source_id": 7,
        "source_table": "measurement.readings",
        "stat_base": {
            "api_query": {
                "query_sql": "SELECT data_time, region_code FROM measurement.readings WHERE region_code = :regionCode",
                "default_params": {"regionCode": "REGION-A"},
            }
        },
    }
    source = {"id": 7, "connection_status": "connected", "connection_options_json": {"dialect": "postgresql"}}
    fields = [
        {"field_code": "data_time", "output_allowed": True, "required_desensitization": False},
        {"field_code": "region_code", "output_allowed": True, "required_desensitization": False},
    ]
    with patch("app.runtime.fetch_one", side_effect=[resource, source]), patch("app.runtime.fetch_all", return_value=fields):
        config, _ = build_resource_runtime_config(api)

    assert config["fieldMap"] == {"DATA_TIME": "data_time", "REGION_CODE": "region_code"}
    assert config["queryParams"] == ["regionCode"]
    assert config["defaultParams"] == {"regionCode": "REGION-A"}


def test_custom_query_sql_only_allows_single_select():
    statement, parameters = validate_custom_query_sql("SELECT value FROM readings WHERE region = :regionCode;")
    assert statement == "SELECT value FROM readings WHERE region = :regionCode"
    assert parameters == ["regionCode"]
    with pytest.raises(ValueError, match="只读 SELECT"):
        validate_custom_query_sql("UPDATE readings SET value = 1")
    with pytest.raises(ValueError, match="单条"):
        validate_custom_query_sql("SELECT * FROM readings; DELETE FROM readings")


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


def test_ensure_resource_api_creates_one_generated_api():
    resource = {"id": 8, "resource_code": "RES-MEASURE-001", "resource_name": "吉林电网量测数据", "data_source_id": 9}
    generated = {"version": 1, "table": "readings", "fieldMap": {"VALUE": "value"}}
    inserted = {"id": 5, "publish_status": "unpublished"}
    with patch("app.runtime.fetch_one", side_effect=[resource, None, inserted]) as fetch_one, \
         patch("app.runtime.build_resource_runtime_config", return_value=(generated, 9)):
        result = ensure_resource_api(8)

    assert result == {"id": 5, "created": True, "publishStatus": "unpublished"}
    insert_sql = fetch_one.call_args_list[2].args[0]
    assert "INSERT INTO security_api_resources" in insert_sql
    assert fetch_one.call_args_list[2].args[1]["api_code"] == "API-RES-MEASURE-001"


def test_unpublish_api_disables_route():
    with patch("app.runtime.fetch_one", return_value={"id": 5}) as fetch_one:
        result = unpublish_api(5)
    assert result["apiStatus"] == "disabled"
    assert "api_status='disabled'" in fetch_one.call_args.args[0]


def test_preview_resource_latest_rows_uses_defined_fields_and_time_descending():
    resource = {"id": 8, "data_source_id": 9, "source_table": "measurement_data", "stat_base": {}}
    source = {
        "id": 9,
        "connection_status": "connected",
        "connection_options_json": {"dialect": "mysql"},
        "security_config_json": {
            "samplingEnabled": True,
            "samplingRate": 50,
            "integrityEnabled": True,
            "checksumAlgorithm": "SM3",
        },
        "validation_rules_json": {
            "required": ["point_id", "data_time"],
            "numericRanges": {"active_power": [0, 1000]},
            "duplicateKeys": ["point_id", "data_time"],
        },
    }
    fields = [
        {"field_code": "point_id", "field_name": "测点标识", "data_type": "varchar(64)"},
        {"field_code": "data_time", "field_name": "量测时间", "data_type": "datetime"},
        {"field_code": "active_power", "field_name": "有功功率", "data_type": "decimal"},
    ]

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, statement, parameters):
            assert "SELECT `point_id`, `data_time`, `active_power` FROM `measurement_data` ORDER BY `data_time` DESC" in statement
            assert parameters == {"preview_limit": 10}

        def fetchall(self):
            return [
                {"point_id": "P-001", "data_time": "2026-07-15T10:00:00", "active_power": 1200},
                {"point_id": "P-002", "data_time": "2026-07-15T09:00:00", "active_power": 800},
                {"point_id": "P-003", "data_time": "2026-07-15T08:00:00", "active_power": 700},
                {"point_id": "P-004", "data_time": "2026-07-15T07:00:00", "active_power": 600},
            ]

    class Current:
        def cursor(self):
            return Cursor()

    @contextmanager
    def preview_connection(_context):
        yield Current()

    with patch("app.runtime.fetch_one", side_effect=[resource, source]), \
         patch("app.runtime.fetch_all", return_value=fields), \
         patch("app.runtime.measurement_connection", preview_connection):
        result = preview_resource_latest_rows(8)

    assert result["tableName"] == "measurement_data"
    assert result["orderField"] == "data_time"
    assert result["limit"] == 10
    assert result["candidateCount"] == 4
    assert result["samplingEnabled"] is True
    assert result["samplingRate"] == 50
    assert result["sampleCount"] == 2
    assert result["passedCount"] == 1
    assert result["rejectedCount"] == 1
    assert result["rows"][0]["point_id"] == "P-001"
    assert result["rows"][1]["point_id"] == "P-003"
    assert result["validationResults"] == [
        {"passed": False, "issues": ["active_power 超出范围 [0, 1000]"]},
        {"passed": True, "issues": []},
    ]


def test_preview_resource_latest_rows_returns_no_samples_when_sampling_disabled():
    resource = {"id": 8, "data_source_id": 9, "source_table": "measurement_data", "stat_base": {}}
    source = {
        "id": 9,
        "connection_status": "connected",
        "connection_options_json": {"dialect": "mysql"},
        "security_config_json": {"samplingEnabled": False, "samplingRate": 100},
    }
    fields = [{"field_code": "point_id", "field_name": "测点标识", "data_type": "varchar(64)"}]

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, _statement, parameters):
            assert parameters == {"preview_limit": 10}

        def fetchall(self):
            return [{"point_id": "P-001"}]

    class Current:
        def cursor(self):
            return Cursor()

    @contextmanager
    def preview_connection(_context):
        yield Current()

    with patch("app.runtime.fetch_one", side_effect=[resource, source]), \
         patch("app.runtime.fetch_all", return_value=fields), \
         patch("app.runtime.measurement_connection", preview_connection):
        result = preview_resource_latest_rows(8)

    assert result["candidateCount"] == 1
    assert result["samplingEnabled"] is False
    assert result["sampleCount"] == 0
    assert result["rows"] == []


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


@pytest.mark.parametrize("risk_score", [-1, 101, "70", True])
def test_publish_policy_rejects_invalid_rule_risk_score(risk_score):
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
        "allowed_api_codes_json": ["API-RESOURCE-9"],
        "max_requests_per_minute": 60,
        "max_query_days": 1,
        "max_rows": 1000,
        "risk_threshold": 70,
        "abnormal_access_rules_json": {
            "queryRangeExceeded": {"enabled": True, "action": "risk", "riskScore": risk_score},
        },
    }
    with patch("app.runtime.fetch_one", return_value=policy), patch("app.runtime.execute"):
        with pytest.raises(ValueError, match="riskScore 必须在 0 到 100 之间"):
            publish_policy(12)


def test_publish_policy_freezes_resource_and_field_labels_in_runtime_snapshot():
    policy = {
        "id": 12,
        "resource_id": 8,
        "policy_code": "POL-12",
        "scenario": "resource-data-query",
        "subject_id": 2,
        "api_resource_id": 9,
        "output_mode": "masked",
        "subject_status": "enabled",
        "api_status": "enabled",
        "api_publish_status": "success",
        "api_code": "API-RESOURCE-9",
        "allowed_api_codes_json": ["API-RESOURCE-9"],
        "max_requests_per_minute": 60,
        "max_query_days": 1,
        "max_rows": 1000,
        "risk_threshold": 70,
        "policy_version": 2,
        "policy_detail_json": {"owner": "security-team"},
    }
    resource = {
        "id": 8,
        "protection_level": "l2",
        "tags": ["页面标签"],
        "resource_tags": ["量测数据", "敏感"],
    }
    profile = {
        "security_tags": ["需审批"],
        "important_data_flag": True,
        "desensitization_required": True,
        "export_allowed": False,
    }
    fields = [{
        "field_code": "POINT_ID",
        "security_level": "important",
        "field_tags": ["直接标识符"],
        "required_desensitization": True,
        "important_field_flag": True,
    }]
    with patch("app.runtime.fetch_one", side_effect=[policy, resource, profile]), \
         patch("app.runtime.fetch_all", return_value=fields), \
         patch("app.runtime.execute") as execute:
        result = publish_policy(12)

    assert result["policyVersion"] == 3
    assert "重要数据" in result["matchedLabels"]
    assert "页面标签" in result["matchedLabels"]
    assert "量测数据" in result["matchedLabels"]
    update_parameters = execute.call_args.args[1]
    detail = json.loads(update_parameters["policy_detail"])
    assert detail["owner"] == "security-team"
    snapshot = detail["runtimeSnapshot"]
    assert snapshot["sensitivity"] == "important"
    assert snapshot["riskMultiplier"] == 1.5
    assert snapshot["hardConstraints"]["maskedFields"] == ["POINT_ID"]
    assert snapshot["hardConstraints"]["exportForbidden"] is True
    assert snapshot["identifierFields"] == ["POINT_ID"]


def test_publish_policy_rejects_output_mode_that_conflicts_with_protection_label():
    policy = {
        "id": 12,
        "resource_id": 8,
        "policy_code": "POL-12",
        "scenario": "resource-data-query",
        "subject_id": 2,
        "api_resource_id": 9,
        "output_mode": "detail",
        "subject_status": "enabled",
        "api_status": "enabled",
        "api_publish_status": "success",
        "api_code": "API-RESOURCE-9",
        "allowed_api_codes_json": ["API-RESOURCE-9"],
        "max_requests_per_minute": 60,
        "max_query_days": 1,
        "max_rows": 1000,
        "risk_threshold": 70,
    }
    resource = {"id": 8, "protection_level": "l3", "resource_tags": []}
    with patch("app.runtime.fetch_one", side_effect=[policy, resource, {}]), \
         patch("app.runtime.fetch_all", return_value=[]), \
         patch("app.runtime.execute") as execute:
        with pytest.raises(ValueError, match="仅输出密态"):
            publish_policy(12)

    assert "publish_status='failed'" in execute.call_args.args[0]


def test_publish_label_group_policy_without_resource_or_api():
    policy = {
        "id": 30,
        "access_scope": "label_group",
        "policy_code": "POL-IMPORTANT-L2",
        "scenario": "resource-data-query",
        "subject_id": 2,
        "api_resource_id": None,
        "resource_id": None,
        "output_mode": "masked",
        "subject_status": "enabled",
        "allowed_api_codes_json": ["*"],
        "security_tags": ["重要数据"],
        "security_profile_json": {
            "match": "all",
            "priority": 200,
            "protectionLevels": ["l2"],
            "fieldTags": ["需脱敏"],
        },
        "max_requests_per_minute": 30,
        "max_query_days": 1,
        "max_rows": 500,
        "risk_threshold": 60,
        "policy_version": 0,
    }
    with patch("app.runtime.fetch_one", return_value=policy), \
         patch("app.runtime.execute") as execute:
        result = publish_policy(30)

    assert result["publishStatus"] == "success"
    parameters = execute.call_args.args[1]
    snapshot = json.loads(parameters["policy_detail"])["runtimeSnapshot"]
    assert snapshot["scope"] == "label_group"
    assert snapshot["selector"]["resourceTags"] == ["重要数据"]
    assert snapshot["selector"]["protectionLevels"] == ["l2"]
    assert snapshot["selector"]["fieldTags"] == ["需脱敏"]


def test_publish_label_group_policy_requires_at_least_one_selector():
    policy = {
        "id": 30,
        "access_scope": "label_group",
        "policy_code": "POL-EMPTY-GROUP",
        "scenario": "resource-data-query",
        "subject_id": 2,
        "output_mode": "detail",
        "subject_status": "enabled",
        "allowed_api_codes_json": ["*"],
        "max_requests_per_minute": 30,
        "max_query_days": 1,
        "max_rows": 500,
        "risk_threshold": 60,
    }
    with patch("app.runtime.fetch_one", return_value=policy), \
         patch("app.runtime.execute") as execute:
        with pytest.raises(ValueError, match="至少需要一个"):
            publish_policy(30)

    assert "publish_status='failed'" in execute.call_args.args[0]
