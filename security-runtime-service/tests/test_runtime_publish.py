import json
import hashlib
from contextlib import contextmanager
from unittest.mock import patch

import pytest

from app.runtime import (
    RuntimeContext,
    RuntimeDenied,
    build_resource_runtime_config,
    ensure_resource_api,
    open_stream_subscription,
    publish_api,
    publish_policy,
    preview_resource_latest_rows,
    resource_query,
    unpublish_api,
    validate_api,
    validate_custom_query_sql,
)


def resource_runtime_context():
    return RuntimeContext(
        request_id="REQ-INGEST-001",
        api={
            "id": 5,
            "resource_id": 8,
            "data_source_id": 9,
            "runtime_config_json": {
                "table": "measurement_data",
                "fieldMap": {
                    "POINT_ID": "point_id",
                    "ACTIVE_POWER": "active_power",
                },
                "defaultFields": ["POINT_ID", "ACTIVE_POWER"],
            },
        },
        subject={"id": 3},
        policy={"id": 10, "output_mode": "detail", "max_rows": 1000},
        risk_score=0,
        client_ip="10.20.10.8",
        query_days=1,
        requested_rows=100,
    )


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


def test_build_resource_runtime_config_preserves_scales():
    api = {"id": 9, "resource_id": 3, "data_source_id": 7, "runtime_config_json": {"scales": {"VOLTAGE": 0.001, "IGNORED": 1}}}
    resource = {"id": 3, "data_source_id": 7, "source_table": "measurement.voltage", "stat_base": {}}
    source = {"id": 7, "connection_status": "connected", "connection_options_json": {"dialect": "postgresql"}}
    fields = [
        {"field_code": "data_time", "output_allowed": True, "required_desensitization": False},
        {"field_code": "voltage", "output_allowed": True, "required_desensitization": False},
    ]
    with patch("app.runtime.fetch_one", side_effect=[resource, source]), patch("app.runtime.fetch_all", return_value=fields):
        config, _ = build_resource_runtime_config(api)
    assert config["scales"] == {"VOLTAGE": 0.001}


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


def test_validate_api_accepts_placeholder_orchestrator_paths():
    for path in ["/internal/push/switch-event", "/internal/model/line-relation"]:
        api = {
            "gateway_path": "/data-api/internal/placeholder",
            "http_method": "POST",
            "access_mode": "orchestrate",
            "orchestrator_path": path,
        }
        assert validate_api(api) == []


def test_validate_api_accepts_complete_stream_subscription_channel():
    api = {
        "channel_type": "stream_subscription",
        "gateway_path": "/data-stream/resources/low-frequency-voltage",
        "http_method": "POST",
        "topic_name": "measurement.low-frequency.voltage",
        "consumer_group": "security-governance-lvf",
        "subscription_mode": "push",
    }
    assert validate_api(api) == []


def test_validate_api_rejects_incomplete_stream_subscription_channel():
    errors = validate_api({
        "channel_type": "stream_subscription",
        "gateway_path": "/data-api/resources/low-frequency-voltage",
        "http_method": "GET",
        "topic_name": "",
        "consumer_group": "",
        "subscription_mode": "invalid",
    })
    assert "流式通道地址必须以 /data-stream/ 开头" in errors
    assert "流式通道的订阅授权方法必须为 POST" in errors
    assert "流式通道必须配置流式主题" in errors


def test_open_stream_subscription_returns_authorized_lease_without_messages():
    context = RuntimeContext(
        request_id="REQ-STREAM-001",
        api={
            "api_code": "CHANNEL-LVF-001",
            "api_name": "低频电压流式订阅通道",
            "channel_type": "stream_subscription",
            "topic_name": "measurement.low-frequency.voltage",
            "consumer_group": "security-governance-lvf",
            "subscription_mode": "push",
        },
        subject={"id": 3},
        policy={"id": 10, "output_mode": "detail"},
        risk_score=0,
        client_ip="10.20.10.8",
        query_days=0,
        requested_rows=0,
    )
    result = open_stream_subscription(context)
    assert result["decision"] == "allow"
    assert result["topicName"] == "measurement.low-frequency.voltage"
    assert result["leaseSeconds"] == 300
    assert "data" not in result


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
         patch("app.runtime.measurement_connection", preview_connection), \
         patch("app.runtime.execute"):
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
         patch("app.runtime.measurement_connection", preview_connection), \
         patch("app.runtime.execute"):
        result = preview_resource_latest_rows(8)

    assert result["candidateCount"] == 1
    assert result["samplingEnabled"] is False
    assert result["sampleCount"] == 0
    assert result["rows"] == []


def test_preview_resource_latest_rows_applies_resource_rules_and_digest_validation():
    canonical = json.dumps(
        {"ACTIVE_POWER": 100, "POINT_ID": "P-001"},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    valid_digest = hashlib.new("sm3", canonical).hexdigest()
    resource = {
        "id": 8,
        "data_source_id": 9,
        "source_table": "measurement_data",
        "stat_base": {
            "ingest_validation": {
                "inheritSourceRules": False,
                "samplingOverride": True,
                "samplingEnabled": True,
                "samplingRate": 100,
                "requiredFields": ["point_id"],
                "integrityMode": "digest_field",
                "checksumAlgorithm": "SM3",
                "digestField": "data_digest",
                "checksumFields": ["point_id", "active_power"],
                "integrityFailureAction": "reject",
            }
        },
    }
    source = {
        "id": 9,
        "connection_status": "connected",
        "connection_options_json": {"dialect": "mysql"},
        "security_config_json": {"samplingEnabled": False, "integrityEnabled": False},
        "validation_rules_json": {"required": ["source_only_field"]},
    }
    fields = [
        {"field_code": "point_id", "field_name": "测点标识", "data_type": "varchar(64)"},
        {"field_code": "active_power", "field_name": "有功功率", "data_type": "decimal"},
        {"field_code": "data_digest", "field_name": "数据摘要", "data_type": "varchar(64)"},
    ]

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, _statement, parameters):
            assert parameters == {"preview_limit": 10}

        def fetchall(self):
            return [
                {"point_id": "P-001", "active_power": 100, "data_digest": valid_digest},
                {"point_id": "P-002", "active_power": 200, "data_digest": valid_digest},
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

    assert result["configSource"] == "resource"
    assert result["inheritSourceRules"] is False
    assert result["validationRule"]["requiredFields"] == ["point_id"]
    assert result["samplingEnabled"] is True
    assert result["integrityExecutable"] is True
    assert result["digestField"] == "data_digest"
    assert result["integrityCheckedCount"] == 2
    assert result["integrityPassedCount"] == 1
    assert result["integrityFailedCount"] == 1
    assert result["passedCount"] == 1
    assert result["rejectedCount"] == 1
    assert result["validationResults"] == [
        {"passed": True, "issues": [], "integrityPassed": True},
        {"passed": False, "issues": ["SM3 完整性校验失败"], "integrityPassed": False},
    ]


@pytest.mark.parametrize("digest_matches", [True, False])
def test_resource_query_executes_resource_validation_before_delivery(digest_matches):
    canonical = json.dumps(
        {"ACTIVE_POWER": 100, "POINT_ID": "P-001"},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    valid_digest = hashlib.new("sm3", canonical).hexdigest()
    resource = {
        "id": 8,
        "stat_base": {
            "ingest_validation": {
                "inheritSourceRules": False,
                "samplingOverride": True,
                "samplingEnabled": True,
                "samplingRate": 100,
                "requiredFields": ["POINT_ID"],
                "integrityMode": "digest_field",
                "checksumAlgorithm": "SM3",
                "digestField": "DATA_DIGEST",
                "checksumFields": ["POINT_ID", "ACTIVE_POWER"],
                "integrityFailureAction": "reject",
            }
        },
    }
    source = {
        "id": 9,
        "connection_options_json": {"dialect": "postgresql"},
        "security_config_json": {},
        "validation_rules_json": {},
    }
    fields = [
        {"field_code": "POINT_ID"},
        {"field_code": "ACTIVE_POWER"},
        {"field_code": "DATA_DIGEST"},
    ]
    captured = {"statement": "", "logs": []}

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, statement, parameters):
            captured["statement"] = statement
            assert parameters == {"limit": 100, "offset": 0}

        def fetchall(self):
            return [{
                "pointId": "P-001",
                "activePower": 100,
                "dataDigest": valid_digest if digest_matches else "0" * 64,
            }]

    class Current:
        def cursor(self):
            return Cursor()

    @contextmanager
    def query_connection(_context):
        yield Current()

    def capture_log(statement, parameters=None):
        captured["logs"].append((statement, parameters or {}))
        return 1

    with patch("app.runtime.fetch_one", side_effect=[resource, source]), \
         patch("app.runtime.fetch_all", return_value=fields), \
         patch("app.runtime.measurement_connection", query_connection), \
         patch("app.runtime.execute", side_effect=capture_log):
        if digest_matches:
            rows, meta = resource_query({}, resource_runtime_context())
        else:
            with pytest.raises(RuntimeDenied) as denied:
                resource_query({}, resource_runtime_context())

    assert '"DATA_DIGEST" AS "dataDigest"' in captured["statement"]
    assert len(captured["logs"]) == 1
    log_parameters = captured["logs"][0][1]
    detail = json.loads(log_parameters["result_detail"])
    assert detail["requestId"] == "REQ-INGEST-001"
    assert detail["checkedCount"] == 1
    assert "P-001" not in log_parameters["result_detail"]
    assert valid_digest not in log_parameters["result_detail"]
    if digest_matches:
        assert rows == [{"pointId": "P-001", "activePower": 100}]
        assert meta["ingestValidation"]["executed"] is True
        assert meta["ingestValidation"]["integrityCheckedCount"] == 1
        assert log_parameters["result_status"] == "success"
        assert log_parameters["rejected_count"] == 0
    else:
        assert denied.value.code == "INGEST_VALIDATION_FAILED"
        assert log_parameters["result_status"] == "failed"
        assert log_parameters["rejected_count"] == 1


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


def test_publish_policy_rejects_region_scope_when_api_has_no_region_field():
    policy = {
        "id": 12,
        "policy_code": "POL-12",
        "scenario": "resource-data-query",
        "resource_id": 8,
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
        "region_scope_json": ["REGION-A"],
        "orchestrator_path": "/internal/resource-query",
        "runtime_config_json": {"fieldMap": {"VALUE": "value"}},
    }
    with patch("app.runtime.fetch_one", return_value=policy), patch("app.runtime.execute"):
        with pytest.raises(ValueError, match="未映射区域字段"):
            publish_policy(12)


@pytest.mark.parametrize("action", ["risk", "record", ""])
def test_publish_policy_rejects_non_binary_rule_action(action):
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
            "queryRangeExceeded": {"enabled": True, "action": action},
        },
    }
    with patch("app.runtime.fetch_one", return_value=policy), patch("app.runtime.execute"):
        with pytest.raises(ValueError, match="action 必须是 deny 或 allow"):
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


def test_publish_policy_requires_resource_and_api():
    policy = {
        "id": 30,
        "policy_code": "POL-IMPORTANT-L2",
        "scenario": "resource-data-query",
        "subject_id": 2,
        "api_resource_id": None,
        "resource_id": None,
        "output_mode": "masked",
        "subject_status": "enabled",
        "allowed_api_codes_json": ["*"],
        "max_requests_per_minute": 30,
        "max_query_days": 1,
        "max_rows": 500,
        "risk_threshold": 60,
        "policy_version": 0,
    }
    with patch("app.runtime.fetch_one", return_value=policy), \
         patch("app.runtime.execute") as execute:
        with pytest.raises(ValueError, match="数据资源不能为空.*API 资源不能为空"):
            publish_policy(30)

    assert "publish_status='failed'" in execute.call_args.args[0]
