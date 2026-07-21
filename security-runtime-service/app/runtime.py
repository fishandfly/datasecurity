from __future__ import annotations

import json
import hashlib
import math
import re
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import uuid4

import httpx
import psycopg
import pymysql
from psycopg import sql

from .database import connection, execute, fetch_all, fetch_one
from .security import (
    NONCE_PATTERN,
    api_key_matches,
    calculate_risk,
    canonical_request,
    in_time_ranges,
    ip_allowed,
    request_memory,
    risk_level,
    signature_matches,
)
from .settings import settings


FIELD_COLUMNS = {
    "measurement_time": "measurement_time",
    "region_code": "region_code",
    "organization_code": "organization_code",
    "point_code": "point_code",
    "active_power": "active_power",
    "quality_code": "quality_code",
}
FIELD_CODES = {
    "measurement_time": "DATA_TIME",
    "region_code": "REGION_CODE",
    "organization_code": "ORGANIZATION_CODE",
    "point_code": "POINT_CODE",
    "active_power": "ACTIVE_POWER",
    "quality_code": "QUALITY_FLAG",
}
DEFAULT_FIELDS = [
    "measurement_time",
    "region_code",
    "organization_code",
    "point_code",
    "active_power",
]
IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")
CUSTOM_SQL_PARAM_PATTERN = re.compile(r"(?<!:):([A-Za-z_][A-Za-z0-9_]{0,63})")
FORBIDDEN_SQL_PATTERN = re.compile(
    r"\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|EXECUTE|MERGE)\b",
    re.IGNORECASE,
)
DENIALS = {
    "AUTH_MISSING": (401, "缺少访问凭据", 100),
    "API_KEY_INVALID": (401, "API Key 校验失败", 100),
    "SIGNATURE_INVALID": (401, "访问凭据校验失败", 100),
    "REQUEST_EXPIRED": (401, "请求已过期", 100),
    "REPLAY_DETECTED": (409, "请求已处理，请勿重复提交", 100),
    "SUBJECT_DISABLED": (403, "访问主体不可用", 95),
    "API_NOT_AUTHORIZED": (403, "当前访问主体未获准访问该 API", 95),
    "POLICY_NOT_FOUND": (403, "当前请求未匹配到适用的已发布访问策略", 90),
    "POLICY_EXPIRED": (403, "访问授权不在有效期内", 90),
    "IP_NOT_ALLOWED": (403, "当前网络来源不允许访问", 80),
    "FIELD_NOT_ALLOWED": (403, "请求包含未授权字段", 80),
    "TAG_CONSTRAINT_VIOLATION": (403, "请求方式不符合数据标签安全约束", 90),
    "RISK_REJECTED": (403, "当前请求因安全风险被拒绝", 70),
    "QUERY_RANGE_EXCEEDED": (422, "查询范围超过授权限制", 60),
    "ROW_LIMIT_EXCEEDED": (422, "请求数据量超过授权限制", 70),
    "OFF_HOURS": (403, "当前时间不在允许访问时段内", 70),
    "SCOPE_VIOLATION": (403, "请求的数据范围不在授权范围内", 80),
    "RATE_LIMITED": (429, "调用频率超过授权限制", 70),
    "VALIDATION_ERROR": (400, "请求参数不符合要求", 60),
    "ROUTE_NOT_FOUND": (404, "数据服务未发布或已停用", 40),
    "UPSTREAM_UNAVAILABLE": (502, "上游数据服务暂不可用", 50),
    "HOMOMORPHIC_UNSUPPORTED": (422, "当前数据 API 未声明同态计算能力", 60),
    "HOMOMORPHIC_FIELD_INVALID": (422, "同态计算字段必须是数值类型", 60),
    "HOMOMORPHIC_NO_DATA": (422, "授权范围内没有可用的数值数据", 40),
    "HOMOMORPHIC_SAMPLE_LIMIT": (422, "授权范围内的样本数超过单次密态计算上限", 60),
    "HOMOMORPHIC_UNAVAILABLE": (502, "同态计算服务暂不可用", 50),
}

DEFAULT_ABNORMAL_ACCESS_RULES = {
    "offHours": {"enabled": True, "action": "deny", "riskScore": 70},
    "highFrequency": {"enabled": True, "action": "deny", "riskScore": 70},
    "queryRangeExceeded": {"enabled": True, "action": "deny", "riskScore": 60},
    "rowLimitExceeded": {"enabled": True, "action": "deny", "riskScore": 70},
    "scopeViolation": {"enabled": True, "action": "deny", "riskScore": 80},
    "behaviorAnomaly": {"enabled": True, "action": "risk", "riskScore": 20},
}


class RuntimeDenied(Exception):
    def __init__(
        self,
        code: str,
        *,
        request_id: str,
        api: dict[str, Any] | None = None,
        subject: dict[str, Any] | None = None,
        policy: dict[str, Any] | None = None,
        client_ip: str = "gateway",
        query_days: float = 0,
        requested_rows: int = 0,
        risk_score: int | None = None,
        matched_labels: list[str] | tuple[str, ...] = (),
        risk_factors: list[dict[str, Any]] | tuple[dict[str, Any], ...] = (),
        label_snapshot_version: str = "",
    ) -> None:
        status, message, default_risk = DENIALS[code]
        super().__init__(message)
        self.code = code
        self.status = status
        self.message = message
        self.request_id = request_id
        self.api = api
        self.subject = subject
        self.policy = policy
        self.client_ip = client_ip
        self.query_days = max(0, query_days)
        self.requested_rows = max(0, requested_rows)
        self.risk_score = max(0, min(100, risk_score if risk_score is not None else default_risk))
        self.matched_labels = list(matched_labels)
        self.risk_factors = list(risk_factors)
        self.label_snapshot_version = label_snapshot_version


@dataclass(frozen=True)
class RuntimeContext:
    request_id: str
    api: dict[str, Any]
    subject: dict[str, Any]
    policy: dict[str, Any]
    risk_score: int
    client_ip: str
    query_days: float
    requested_rows: int
    matched_labels: tuple[str, ...] = ()
    risk_factors: tuple[dict[str, Any], ...] = ()
    label_snapshot_version: str = ""

    @property
    def output_mode(self) -> str:
        return str(self.policy.get("output_mode") or "detail")

    @property
    def level(self) -> str:
        return risk_level(self.risk_score)


def _json_list(value: object) -> list:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _camel_case(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


def _json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def _json_object(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _normalized_tags(*values: object) -> list[str]:
    tags: list[str] = []
    for value in values:
        candidates = _json_list(value)
        if not candidates and isinstance(value, str) and value.strip() and not value.lstrip().startswith("["):
            candidates = [item for item in re.split(r"[,，]", value) if item.strip()]
        for candidate in candidates:
            tag = str(candidate or "").strip()
            if tag and tag not in tags:
                tags.append(tag)
    return tags


def _policy_runtime_snapshot(policy: dict[str, Any]) -> dict[str, Any]:
    return _json_object(_json_object(policy.get("policy_detail_json")).get("runtimeSnapshot"))


def build_resource_label_snapshot(resource_id: object, snapshot_version: str) -> dict[str, Any]:
    resource = fetch_one(
        "SELECT * FROM eco_data_resources WHERE id=%(id)s LIMIT 1",
        {"id": resource_id},
    ) or {}
    profile = fetch_one(
        """
        SELECT * FROM eco_resource_security_policies
        WHERE resource_id=%(resource_id)s AND policy_kind='resource_profile'
        ORDER BY "updatedAt" DESC NULLS LAST, id DESC
        LIMIT 1
        """,
        {"resource_id": resource_id},
    ) or {}
    fields = fetch_all(
        """
        SELECT field_code, security_level, field_tags, required_desensitization,
               important_field_flag
        FROM eco_resource_security_fields
        WHERE resource_id=%(resource_id)s
        ORDER BY seq ASC NULLS LAST, id ASC
        """,
        {"resource_id": resource_id},
    )

    tags = _normalized_tags(resource.get("tags"), resource.get("resource_tags"), profile.get("security_tags"))
    derived_tags = []
    flag_tags = (
        ("important_data_flag", "重要数据"),
        ("core_control_flag", "核心管控"),
        ("desensitization_required", "需脱敏"),
        ("approval_required", "需审批"),
    )
    for field_name, label in flag_tags:
        if profile.get(field_name) is True:
            derived_tags.append(label)
    if profile.get("export_allowed") is False:
        derived_tags.append("禁止导出")
    protection_level = str(resource.get("protection_level") or "l2").lower()
    protection_tag = {"l1": "仅聚合", "l2": "明细受控", "l3": "仅密态"}.get(protection_level)
    if protection_tag:
        derived_tags.append(protection_tag)
    tags = _normalized_tags(tags, derived_tags)

    field_tags: dict[str, list[str]] = {}
    masked_fields: list[str] = []
    identifier_fields: list[str] = []
    levels: list[str] = []
    for field in fields:
        code = str(field.get("field_code") or "").strip().upper()
        if not code:
            continue
        current_tags = _normalized_tags(field.get("field_tags"))
        level = str(field.get("security_level") or "").strip().lower()
        if level:
            levels.append(level)
        if field.get("important_field_flag") is True and "重要字段" not in current_tags:
            current_tags.append("重要字段")
        field_tags[code] = current_tags
        if field.get("required_desensitization") is True or any("脱敏" in tag for tag in current_tags):
            masked_fields.append(code)
        if any(marker in tag for tag in current_tags for marker in ("标识符", "身份标识", "直接标识")):
            identifier_fields.append(code)

    all_markers = " ".join(tags + levels).lower()
    if profile.get("core_control_flag") is True or any(marker in all_markers for marker in ("核心", "core")):
        sensitivity = "core"
    elif profile.get("important_data_flag") is True or any(marker in all_markers for marker in ("重要", "important")):
        sensitivity = "important"
    elif any(marker in all_markers for marker in ("敏感", "sensitive")):
        sensitivity = "sensitive"
    elif protection_level == "l2" or any(marker in all_markers for marker in ("内部", "internal")):
        sensitivity = "internal"
    else:
        sensitivity = "public"
    multiplier = {"public": 1.0, "internal": 1.1, "sensitive": 1.25, "important": 1.5, "core": 1.8}[sensitivity]

    return {
        "version": snapshot_version,
        "resourceId": resource_id,
        "protectionLevel": protection_level,
        "sensitivity": sensitivity,
        "riskMultiplier": multiplier,
        "matchedLabels": tags,
        "fieldTags": field_tags,
        "identifierFields": identifier_fields,
        "hardConstraints": {
            "aggregateOnly": protection_level == "l1" or "仅聚合" in tags,
            "encryptedOnly": protection_level == "l3" or "仅密态" in tags,
            "exportForbidden": "禁止导出" in tags,
            "maskedFields": masked_fields,
        },
        "classification": {
            "securityCategoryId": profile.get("security_category_id"),
            "securityLevelId": profile.get("security_level_id"),
            "dataSubjectTypeId": profile.get("data_subject_type_id"),
        },
    }


def build_policy_runtime_snapshot(policy: dict[str, Any], snapshot_version: str) -> dict[str, Any]:
    return build_resource_label_snapshot(policy.get("resource_id"), snapshot_version)


def policy_label_selector(policy: dict[str, Any]) -> dict[str, Any]:
    configured = _json_object(policy.get("security_profile_json"))
    try:
        priority = int(configured.get("priority") or 100)
    except (TypeError, ValueError):
        priority = 100
    return {
        "match": "any" if str(configured.get("match") or "all").lower() == "any" else "all",
        "priority": max(0, min(1000, priority)),
        "resourceTags": _normalized_tags(policy.get("security_tags"), configured.get("resourceTags")),
        "protectionLevels": [str(item).strip().lower() for item in _json_list(configured.get("protectionLevels")) if str(item).strip()],
        "fieldTags": _normalized_tags(configured.get("fieldTags")),
        "securityCategoryId": policy.get("security_category_id") or configured.get("securityCategoryId"),
        "securityLevelId": policy.get("security_level_id") or configured.get("securityLevelId"),
        "dataSubjectTypeId": policy.get("data_subject_type_id") or configured.get("dataSubjectTypeId"),
    }


def policy_selector_conditions(selector: dict[str, Any]) -> list[bool]:
    return [
        bool(selector.get("resourceTags")),
        bool(selector.get("protectionLevels")),
        bool(selector.get("fieldTags")),
        selector.get("securityCategoryId") not in {None, ""},
        selector.get("securityLevelId") not in {None, ""},
        selector.get("dataSubjectTypeId") not in {None, ""},
    ]


def resource_matches_policy_selector(snapshot: dict[str, Any], selector: dict[str, Any]) -> bool:
    checks: list[bool] = []
    resource_tags = set(_normalized_tags(snapshot.get("matchedLabels")))
    selected_resource_tags = set(_normalized_tags(selector.get("resourceTags")))
    if selected_resource_tags:
        checks.append(selected_resource_tags.issubset(resource_tags))
    selected_levels = {str(item).lower() for item in _json_list(selector.get("protectionLevels"))}
    if selected_levels:
        checks.append(str(snapshot.get("protectionLevel") or "").lower() in selected_levels)
    selected_field_tags = set(_normalized_tags(selector.get("fieldTags")))
    if selected_field_tags:
        current_field_tags = {
            tag
            for tags in _json_object(snapshot.get("fieldTags")).values()
            for tag in _normalized_tags(tags)
        }
        checks.append(selected_field_tags.issubset(current_field_tags))
    classification = _json_object(snapshot.get("classification"))
    for selector_key, snapshot_key in (
        ("securityCategoryId", "securityCategoryId"),
        ("securityLevelId", "securityLevelId"),
        ("dataSubjectTypeId", "dataSubjectTypeId"),
    ):
        selected = selector.get(selector_key)
        if selected not in {None, ""}:
            checks.append(str(classification.get(snapshot_key) or "") == str(selected))
    if not checks:
        return False
    return any(checks) if selector.get("match") == "any" else all(checks)


def abnormal_access_rule(policy: dict[str, Any], key: str) -> dict[str, Any]:
    default = DEFAULT_ABNORMAL_ACCESS_RULES[key]
    configured = _json_object(policy.get("abnormal_access_rules_json")).get(key)
    configured = configured if isinstance(configured, dict) else {}
    action = str(configured.get("action") or default["action"]).strip()
    if action not in {"deny", "risk", "allow"}:
        action = str(default["action"])
    return {
        "enabled": bool(configured.get("enabled", default["enabled"])),
        "action": action,
        "riskScore": max(0, min(100, int(configured.get("riskScore", default["riskScore"]) or 0))),
    }


def violation_risk(policy: dict[str, Any], key: str, violated: bool) -> tuple[bool, int]:
    if not violated:
        return False, 0
    rule = abnormal_access_rule(policy, key)
    if not rule["enabled"] or rule["action"] == "allow":
        return False, 0
    return rule["action"] == "deny", int(rule["riskScore"])


def _identifier_parts(value: object) -> list[str]:
    parts = [part.strip() for part in str(value or "").split(".") if part.strip()]
    if not 1 <= len(parts) <= 2 or any(not IDENTIFIER_PATTERN.fullmatch(part) for part in parts):
        raise ValueError("运行表或字段映射包含非法标识符")
    return parts


def _quote_identifier(value: object, dialect: str) -> str:
    quote = "`" if dialect == "mysql" else '"'
    return ".".join(f"{quote}{part}{quote}" for part in _identifier_parts(value))


def _resource_table(resource: dict[str, Any], configured_table: object = "") -> str:
    if str(configured_table or "").strip():
        return str(configured_table).strip()
    table_profile = _json_object(resource.get("source_tablelist"))
    return str(
        table_profile.get("baseline_table")
        or table_profile.get("baselineTable")
        or resource.get("source_table")
        or ""
    ).strip()


def validate_custom_query_sql(value: object) -> tuple[str, list[str]]:
    statement = str(value or "").strip()
    if not statement:
        return "", []
    if statement.endswith(";"):
        statement = statement[:-1].rstrip()
    if not statement or ";" in statement or "--" in statement or "/*" in statement or "*/" in statement:
        raise ValueError("自定义 SQL 只允许单条无注释的 SELECT 语句")
    if not re.match(r"^SELECT\b", statement, re.IGNORECASE) or FORBIDDEN_SQL_PATTERN.search(statement):
        raise ValueError("自定义 SQL 只允许只读 SELECT 查询")
    parameters = list(dict.fromkeys(CUSTOM_SQL_PARAM_PATTERN.findall(statement)))
    if any(name.startswith("__api_") for name in parameters):
        raise ValueError("API 参数名不能使用 __api_ 前缀")
    return statement, parameters


def parameterize_custom_query_sql(statement: str) -> str:
    return CUSTOM_SQL_PARAM_PATTERN.sub(lambda match: f"%({match.group(1)})s", statement)


def build_resource_runtime_config(api: dict[str, Any]) -> tuple[dict[str, Any], int]:
    resource_id = api.get("resource_id")
    if not resource_id:
        raise ValueError("必须关联数据资源")
    resource = fetch_one(
        "SELECT * FROM eco_data_resources WHERE id=%(id)s LIMIT 1",
        {"id": resource_id},
    )
    if not resource:
        raise ValueError("关联的数据资源不存在")
    source_id = resource.get("data_source_id") or api.get("data_source_id")
    if not source_id:
        raise ValueError("数据资源必须关联数据源")
    if api.get("data_source_id") and int(api["data_source_id"]) != int(source_id):
        raise ValueError("API 数据源必须与数据资源的数据源一致")
    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": source_id},
    )
    if not source or source.get("connection_status") != "connected":
        raise ValueError("关联数据源尚未通过连接检查")
    options = _json_object(source.get("connection_options_json"))
    dialect = str(options.get("dialect") or "postgresql").lower()
    if dialect not in {"postgresql", "mysql"}:
        raise ValueError("数据库服务化仅支持 PostgreSQL 或 MySQL 数据源")

    fields = fetch_all(
        """
        SELECT field_code, output_allowed, required_desensitization
        FROM eco_resource_security_fields
        WHERE resource_id=%(resource_id)s
        ORDER BY seq ASC NULLS LAST, id ASC
        """,
        {"resource_id": resource_id},
    )
    resource_field_columns = {
        str(item.get("field_code") or "").strip().upper(): str(item.get("field_code") or "").strip()
        for item in fields
        if str(item.get("field_code") or "").strip()
    }
    resource_codes = list(resource_field_columns)
    if not resource_codes:
        raise ValueError("数据资源尚未维护字段，无法发布 API")

    configured = _json_object(api.get("runtime_config_json"))
    stat_base = _json_object(resource.get("stat_base"))
    resource_query = _json_object(stat_base.get("api_query") or stat_base.get("apiQuery"))
    configured_map = _json_object(configured.get("fieldMap") or configured.get("field_map"))
    output_codes = {
        str(item.get("field_code") or "").strip().upper()
        for item in fields
        if item.get("output_allowed") is not False
    }
    field_map = {
        str(code).strip().upper(): str(column).strip()
        for code, column in configured_map.items()
        if str(code).strip() and str(column).strip()
    } or {code: resource_field_columns[code] for code in resource_codes if code in output_codes}
    unknown_codes = sorted(set(field_map) - set(resource_codes))
    if unknown_codes:
        raise ValueError(f"字段映射包含不属于当前资源的字段：{', '.join(unknown_codes)}")
    blocked_codes = sorted(set(field_map) - output_codes)
    if blocked_codes:
        raise ValueError(f"字段映射包含禁止 API 输出的字段：{', '.join(blocked_codes)}")
    table_name = _resource_table(resource, configured.get("table"))
    if not table_name:
        raise ValueError("数据资源尚未维护基准物理表")
    _quote_identifier(table_name, dialect)
    for column in field_map.values():
        _quote_identifier(column, dialect)

    requested_defaults = [
        str(item).strip().upper()
        for item in _json_list(configured.get("defaultFields") or configured.get("default_fields"))
        if str(item).strip()
    ]
    default_fields = requested_defaults or [code for code in field_map if code in output_codes]
    if not default_fields or any(code not in field_map or code not in output_codes for code in default_fields):
        raise ValueError("默认输出字段必须是当前资源允许输出的字段")
    mask_fields = [
        str(item.get("field_code") or "").strip().upper()
        for item in fields
        if item.get("required_desensitization") and str(item.get("field_code") or "").strip().upper() in field_map
    ]
    query_sql, query_parameters = validate_custom_query_sql(
        configured.get("querySql")
        or configured.get("query_sql")
        or resource_query.get("query_sql")
        or resource_query.get("querySql")
    )
    default_params = _json_object(
        configured.get("defaultParams")
        or configured.get("default_params")
        or resource_query.get("default_params")
        or resource_query.get("defaultParams")
    )
    unknown_default_params = sorted(set(default_params) - set(query_parameters)) if query_sql else []
    if default_params and not query_sql:
        raise ValueError("配置 API 默认参数时必须同时编写引用该参数的自定义 SQL")
    if unknown_default_params:
        raise ValueError(f"API 默认参数未在 SQL 中引用：{', '.join(unknown_default_params)}")

    def configured_or_detect(camel_name: str, snake_name: str, markers: tuple[str, ...]) -> str:
        configured_code = str(configured.get(camel_name) or configured.get(snake_name) or "").strip().upper()
        if configured_code:
            if configured_code not in field_map:
                raise ValueError(f"{camel_name} 未包含在字段映射中")
            return configured_code
        return next((code for code in field_map if any(marker in code for marker in markers)), "")

    return {
        "version": 1,
        "dialect": dialect,
        "table": table_name,
        "fieldMap": field_map,
        "defaultFields": default_fields,
        "maskFields": mask_fields,
        "timeFieldCode": configured_or_detect("timeFieldCode", "time_field_code", ("TIME", "DATE")),
        "regionFieldCode": configured_or_detect("regionFieldCode", "region_field_code", ("REGION",)),
        "organizationFieldCode": configured_or_detect("organizationFieldCode", "organization_field_code", ("ORGANIZATION", "ORG_CODE")),
        "querySql": query_sql,
        "queryParams": query_parameters,
        "defaultParams": default_params,
    }, int(source_id)


def verify_resource_runtime_config(api: dict[str, Any]) -> None:
    config = _json_object(api.get("runtime_config_json"))
    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": api.get("data_source_id")},
    ) or {}
    dialect = str(_json_object(source.get("connection_options_json")).get("dialect") or "postgresql").lower()
    query_sql, query_parameters = validate_custom_query_sql(config.get("querySql") or config.get("query_sql"))
    table_name = _quote_identifier(config.get("table"), dialect)
    columns = ", ".join(_quote_identifier(column, dialect) for column in _json_object(config.get("fieldMap")).values())
    if not columns:
        raise ValueError("运行字段映射不能为空")
    context = RuntimeContext("publish-check", api, {}, {}, 0, "management", 0, 0)
    with measurement_connection(context) as current, current.cursor() as cursor:
        if query_sql:
            defaults = _json_object(config.get("defaultParams") or config.get("default_params"))
            parameters = {name: defaults.get(name) for name in query_parameters}
            cursor.execute(
                f"SELECT * FROM ({parameterize_custom_query_sql(query_sql)}) AS api_query LIMIT 0",
                parameters,
            )
            returned_columns = {
                str(item.name if hasattr(item, "name") else item[0]).lower()
                for item in cursor.description or []
            }
            expected_columns = {str(item).lower() for item in _json_object(config.get("fieldMap")).values()}
            missing_columns = sorted(expected_columns - returned_columns)
            if missing_columns:
                raise ValueError(f"自定义 SQL 未返回已定义字段：{', '.join(missing_columns)}")
        else:
            cursor.execute(f"SELECT {columns} FROM {table_name} LIMIT 0")


def preview_resource_latest_rows(resource_id: int, limit: int = 10) -> dict[str, Any]:
    resource = fetch_one(
        "SELECT * FROM eco_data_resources WHERE id=%(id)s LIMIT 1",
        {"id": resource_id},
    )
    if not resource:
        raise LookupError("数据资源不存在")
    source_id = resource.get("data_source_id")
    if not source_id:
        raise ValueError("数据资源尚未关联数据源")
    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": source_id},
    )
    if not source or source.get("connection_status") != "connected":
        raise ValueError("关联数据源尚未通过连接检查")

    dialect = str(_json_object(source.get("connection_options_json")).get("dialect") or "postgresql").lower()
    if dialect not in {"postgresql", "mysql"}:
        raise ValueError("物理表预览仅支持 PostgreSQL 或 MySQL 数据源")
    table_name = _resource_table(resource)
    if not table_name:
        raise ValueError("数据资源尚未维护基准物理表")
    quoted_table = _quote_identifier(table_name, dialect)
    fields = fetch_all(
        """
        SELECT field_code, field_name, data_type
        FROM eco_resource_security_fields
        WHERE resource_id=%(resource_id)s
        ORDER BY seq ASC NULLS LAST, id ASC
        """,
        {"resource_id": resource_id},
    )
    columns = [str(field.get("field_code") or "").strip() for field in fields]
    columns = list(dict.fromkeys(column for column in columns if column))
    if not columns:
        raise ValueError("数据资源尚未维护字段，无法预览物理表")
    quoted_columns = [_quote_identifier(column, dialect) for column in columns]

    stat_base = _json_object(resource.get("stat_base"))
    configured_time_field = str(
        stat_base.get("business_time_field")
        or stat_base.get("businessTimeField")
        or stat_base.get("fresh_field_name")
        or stat_base.get("freshFieldName")
        or ""
    ).strip()
    column_lookup = {column.upper(): column for column in columns}
    order_field = column_lookup.get(configured_time_field.upper(), "") if configured_time_field else ""
    if not order_field:
        order_field = next(
            (column for column in columns if any(marker in column.upper() for marker in ("TIME", "DATE", "TIMESTAMP"))),
            "",
        )

    safe_limit = min(max(int(limit), 1), 10)
    order_clause = f" ORDER BY {_quote_identifier(order_field, dialect)} DESC" if order_field else ""
    statement = f"SELECT {', '.join(quoted_columns)} FROM {quoted_table}{order_clause} LIMIT %(preview_limit)s"
    context = RuntimeContext(
        request_id=f"resource-preview-{uuid4()}",
        api={"resource_id": resource_id, "data_source_id": int(source_id)},
        subject={},
        policy={},
        risk_score=0,
        client_ip="management",
        query_days=0,
        requested_rows=safe_limit,
    )
    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(statement, {"preview_limit": safe_limit})
        candidate_rows = [dict(row) for row in cursor.fetchall()]

    security_config = _json_object(source.get("security_config_json"))
    validation_rules = _json_object(source.get("validation_rules_json"))

    def config_enabled(camel_name: str, snake_name: str) -> bool:
        value = security_config.get(camel_name) if camel_name in security_config else security_config.get(snake_name, False)
        return value is True or str(value).strip().lower() in {"1", "true", "yes", "on"}

    sampling_enabled = config_enabled("samplingEnabled", "sampling_enabled")
    try:
        sampling_rate = float(
            security_config.get("samplingRate")
            or security_config.get("sampling_rate")
            or 100
        )
    except (TypeError, ValueError):
        sampling_rate = 100
    sampling_rate = min(max(sampling_rate, 1), 100)

    sample_size = math.ceil(len(candidate_rows) * sampling_rate / 100) if sampling_enabled else 0
    if sample_size >= len(candidate_rows):
        sampled_rows = candidate_rows
    elif sample_size > 0:
        sampled_indexes = [math.floor(index * len(candidate_rows) / sample_size) for index in range(sample_size)]
        sampled_rows = [candidate_rows[index] for index in sampled_indexes]
    else:
        sampled_rows = []

    required_fields = [str(item).strip() for item in _json_list(validation_rules.get("required")) if str(item).strip()]
    duplicate_keys = [
        str(item).strip()
        for item in _json_list(validation_rules.get("duplicateKeys") or validation_rules.get("duplicate_keys"))
        if str(item).strip()
    ]
    numeric_ranges = _json_object(validation_rules.get("numericRanges") or validation_rules.get("numeric_ranges"))

    def row_lookup(row: dict[str, Any]) -> dict[str, Any]:
        return {str(key).strip().upper(): value for key, value in row.items()}

    issues_by_row: list[list[str]] = [[] for _ in sampled_rows]
    duplicate_groups: dict[tuple[Any, ...], list[int]] = {}
    for row_index, row in enumerate(sampled_rows):
        lookup = row_lookup(row)
        for field_name in required_fields:
            value = lookup.get(field_name.upper())
            if value is None or (isinstance(value, str) and not value.strip()):
                issues_by_row[row_index].append(f"必填字段 {field_name} 为空或不存在")
        for field_name, configured_range in numeric_ranges.items():
            range_values = _json_list(configured_range)
            value = lookup.get(str(field_name).upper())
            if value in {None, ""} or len(range_values) < 2:
                continue
            try:
                numeric_value = float(value)
                minimum, maximum = float(range_values[0]), float(range_values[1])
                if numeric_value < minimum or numeric_value > maximum:
                    issues_by_row[row_index].append(f"{field_name} 超出范围 [{minimum:g}, {maximum:g}]")
            except (TypeError, ValueError):
                issues_by_row[row_index].append(f"{field_name} 不是有效数值")
        if duplicate_keys:
            duplicate_value = tuple(lookup.get(field_name.upper()) for field_name in duplicate_keys)
            if all(value is not None and value != "" for value in duplicate_value):
                duplicate_groups.setdefault(duplicate_value, []).append(row_index)

    for duplicate_indexes in duplicate_groups.values():
        if len(duplicate_indexes) <= 1:
            continue
        for row_index in duplicate_indexes:
            issues_by_row[row_index].append(f"重复键 {', '.join(duplicate_keys)} 在本次样本中重复")

    validation_results = [
        {"passed": not issues, "issues": issues}
        for issues in issues_by_row
    ]
    passed_count = sum(1 for result in validation_results if result["passed"])
    rejected_count = len(validation_results) - passed_count

    return {
        "resourceId": resource_id,
        "tableName": table_name,
        "orderField": order_field,
        "limit": safe_limit,
        "candidateCount": len(candidate_rows),
        "sampleCount": len(sampled_rows),
        "passedCount": passed_count,
        "rejectedCount": rejected_count,
        "samplingEnabled": sampling_enabled,
        "samplingRate": sampling_rate,
        "integrityEnabled": config_enabled("integrityEnabled", "integrity_enabled"),
        "checksumAlgorithm": str(
            security_config.get("checksumAlgorithm")
            or security_config.get("checksum_algorithm")
            or ""
        ),
        "validationRule": {
            "requiredFields": required_fields,
            "numericRanges": numeric_ranges,
            "duplicateKeys": duplicate_keys,
        },
        "columns": [
            {
                "code": str(field.get("field_code") or ""),
                "name": str(field.get("field_name") or field.get("field_code") or ""),
                "dataType": str(field.get("data_type") or ""),
            }
            for field in fields
            if str(field.get("field_code") or "").strip() in columns
        ],
        "rows": [
            {str(key): _json_value(value) for key, value in row.items()}
            for row in sampled_rows
        ],
        "validationResults": validation_results,
    }


def load_api(path: str, method: str) -> dict[str, Any] | None:
    return fetch_one(
        """
        SELECT * FROM security_api_resources
        WHERE gateway_path = %(path)s AND upper(http_method) = %(method)s
          AND api_status = 'enabled' AND publish_status = 'success'
        LIMIT 1
        """,
        {"path": path, "method": method.upper()},
    )


def load_subject(access_key: str) -> dict[str, Any] | None:
    return fetch_one(
        "SELECT * FROM security_access_subjects WHERE subject_code = %(code)s LIMIT 1",
        {"code": access_key},
    )


def load_subject_by_api_key(api_key: str) -> dict[str, Any] | None:
    if len(api_key) < 32:
        return None
    # 先识别凭据归属，再由 authorize 判断主体状态。若只扫描启用主体，
    # 合法密钥在主体停用后会被误报为 API_KEY_INVALID。
    for subject in fetch_all("SELECT * FROM security_access_subjects"):
        expected = settings.subject_secrets.get(str(subject.get("credential_ref") or ""), "")
        if api_key_matches(expected, api_key):
            return subject
    return None


def load_policy(subject_id: int, api_id: int, scenario: str) -> dict[str, Any] | None:
    candidates = fetch_all(
        """
        SELECT policy.*, baseline.frequency_avg, baseline.frequency_stddev,
               baseline.query_days_avg, baseline.query_days_stddev,
               baseline.rows_avg, baseline.rows_stddev,
               baseline.normal_time_ranges_json AS baseline_time_ranges,
               current_api.resource_id AS requested_resource_id
        FROM eco_resource_security_policies policy
        JOIN security_api_resources current_api ON current_api.id = %(api_id)s
        LEFT JOIN security_behavior_baselines baseline
          ON baseline.subject_id = policy.subject_id
         AND baseline.api_resource_id = current_api.id
         AND baseline.baseline_status = 'enabled'
        WHERE policy.policy_kind = 'access_policy'
          AND policy.policy_status = 'enabled'
          AND policy.publish_status = 'success'
          AND policy.subject_id = %(subject_id)s
          AND policy.scenario = %(scenario)s
          AND (
            policy.api_resource_id = current_api.id
            OR (policy.access_scope = 'label_group' AND policy.api_resource_id IS NULL)
          )
        ORDER BY CASE WHEN policy.api_resource_id = current_api.id THEN 0 ELSE 1 END,
                 policy.policy_version DESC, policy.id DESC
        """,
        {"subject_id": subject_id, "api_id": api_id, "scenario": scenario},
    )
    exact = next((candidate for candidate in candidates if candidate.get("api_resource_id") is not None), None)
    if exact:
        return exact
    grouped = [candidate for candidate in candidates if candidate.get("access_scope") == "label_group"]
    if not grouped:
        return None
    resource_id = grouped[0].get("requested_resource_id")
    snapshot_version = str(grouped[0].get("gateway_config_version") or "runtime-live")
    resource_snapshot = build_resource_label_snapshot(resource_id, snapshot_version)
    matches = []
    for candidate in grouped:
        selector = policy_label_selector(candidate)
        if resource_matches_policy_selector(resource_snapshot, selector):
            specificity = sum(policy_selector_conditions(selector))
            matches.append((int(selector["priority"]), specificity, int(candidate.get("policy_version") or 0), candidate))
    if not matches:
        return None
    selected = max(matches, key=lambda item: (item[0], item[1], item[2]))[3]
    selected = dict(selected)
    detail = _json_object(selected.get("policy_detail_json"))
    detail["runtimeSnapshot"] = {
        **resource_snapshot,
        "version": str(selected.get("gateway_config_version") or resource_snapshot.get("version") or ""),
        "matchedPolicySelector": policy_label_selector(selected),
    }
    selected["policy_detail_json"] = detail
    return selected


def client_ip(request) -> str:
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded[:64]
    return (request.client.host if request.client else "gateway")[:64]


def authorize(request, body: bytes) -> RuntimeContext:
    request_id = str(uuid4())
    api = load_api(request.url.path, request.method)
    address = client_ip(request)
    if not api:
        raise RuntimeDenied("ROUTE_NOT_FOUND", request_id=request_id, client_ip=address)

    api_key = request.headers.get("x-api-key", "").strip()
    access_key = request.headers.get("x-access-key", "").strip()
    timestamp = request.headers.get("x-timestamp", "").strip()
    nonce = request.headers.get("x-nonce", "").strip()
    supplied_signature = request.headers.get("x-signature", "").strip()
    scenario = request.headers.get("x-scenario", "").strip()
    if not scenario or (not api_key and not all([access_key, timestamp, nonce, supplied_signature])):
        raise RuntimeDenied("AUTH_MISSING", request_id=request_id, api=api, client_ip=address)

    subject = load_subject_by_api_key(api_key) if api_key else load_subject(access_key)
    if api_key and not subject:
        raise RuntimeDenied("API_KEY_INVALID", request_id=request_id, api=api, client_ip=address)
    if not subject or subject.get("subject_status") != "enabled":
        raise RuntimeDenied(
            "SUBJECT_DISABLED",
            request_id=request_id,
            api=api,
            subject=subject,
            client_ip=address,
        )
    now = datetime.now(timezone.utc)
    valid_from = subject.get("valid_from")
    valid_to = subject.get("valid_to")
    if (valid_from and now < valid_from) or (valid_to and now > valid_to):
        raise RuntimeDenied(
            "POLICY_EXPIRED",
            request_id=request_id,
            api=api,
            subject=subject,
            client_ip=address,
        )

    if not api_key:
        try:
            timestamp_ms = int(timestamp)
        except ValueError as error:
            raise RuntimeDenied(
                "REQUEST_EXPIRED", request_id=request_id, api=api, subject=subject, client_ip=address
            ) from error
        if len(timestamp) != 13 or abs(time.time() * 1000 - timestamp_ms) > settings.request_clock_skew_seconds * 1000:
            raise RuntimeDenied(
                "REQUEST_EXPIRED", request_id=request_id, api=api, subject=subject, client_ip=address
            )
        if not NONCE_PATTERN.fullmatch(nonce):
            raise RuntimeDenied(
                "VALIDATION_ERROR", request_id=request_id, api=api, subject=subject, client_ip=address
            )

        secret_ref = str(subject.get("credential_ref") or "")
        secret = settings.subject_secrets.get(secret_ref, "")
        canonical = canonical_request(
            request.method,
            request.url.path,
            request.query_params.multi_items(),
            body,
            timestamp,
            nonce,
        )
        if len(secret) < 32 or not signature_matches(secret, canonical, supplied_signature):
            raise RuntimeDenied(
                "SIGNATURE_INVALID", request_id=request_id, api=api, subject=subject, client_ip=address
            )
        if not request_memory.remember_nonce(
            f"{subject['subject_code']}:{nonce}", settings.nonce_ttl_seconds
        ):
            raise RuntimeDenied(
                "REPLAY_DETECTED", request_id=request_id, api=api, subject=subject, client_ip=address
            )

    if settings.enforce_source_ip and not ip_allowed(address, _json_list(subject.get("ip_whitelist_json"))):
        raise RuntimeDenied(
            "IP_NOT_ALLOWED", request_id=request_id, api=api, subject=subject, client_ip=address
        )

    allowed_api_codes = {str(item).strip().upper() for item in _json_list(subject.get("allowed_api_codes_json"))}
    if "*" not in allowed_api_codes and str(api.get("api_code") or "").strip().upper() not in allowed_api_codes:
        raise RuntimeDenied(
            "API_NOT_AUTHORIZED", request_id=request_id, api=api, subject=subject, client_ip=address
        )

    policy = load_policy(int(subject["id"]), int(api["id"]), scenario)
    if not policy:
        raise RuntimeDenied(
            "POLICY_NOT_FOUND", request_id=request_id, api=api, subject=subject, client_ip=address
        )
    snapshot = _policy_runtime_snapshot(policy)
    matched_labels = tuple(_normalized_tags(snapshot.get("matchedLabels")))
    label_snapshot_version = str(snapshot.get("version") or "")
    hard_constraints = _json_object(snapshot.get("hardConstraints"))
    risk_factors: list[dict[str, Any]] = []
    query_days = 0.0
    requested_rows = 0

    def add_risk_factor(code: str, label: str, score: int, detail: str) -> None:
        if score <= 0:
            return
        risk_factors.append({"code": code, "label": label, "score": score, "detail": detail})

    def policy_denied(code: str, risk_score: int | None = None) -> RuntimeDenied:
        return RuntimeDenied(
            code,
            request_id=request_id,
            api=api,
            subject=subject,
            policy=policy,
            client_ip=address,
            query_days=query_days,
            requested_rows=requested_rows,
            risk_score=risk_score,
            matched_labels=matched_labels,
            risk_factors=risk_factors,
            label_snapshot_version=label_snapshot_version,
        )

    if hard_constraints.get("aggregateOnly") and str(policy.get("output_mode") or "detail") != "aggregate":
        add_risk_factor("aggregateOnly", "仅允许聚合", 90, "资源标签要求仅输出聚合结果")
        raise policy_denied("TAG_CONSTRAINT_VIOLATION", 90)
    if hard_constraints.get("encryptedOnly") and str(policy.get("output_mode") or "detail") != "encrypted":
        add_risk_factor("encryptedOnly", "仅允许密态", 95, "资源标签要求仅输出密态结果")
        raise policy_denied("TAG_CONSTRAINT_VIOLATION", 95)
    if settings.enforce_source_ip and not ip_allowed(address, _json_list(policy.get("source_ips_json"))):
        raise RuntimeDenied(
            "IP_NOT_ALLOWED",
            request_id=request_id,
            api=api,
            subject=subject,
            policy=policy,
            client_ip=address,
        )

    api_default_params = _json_object(_json_object(api.get("runtime_config_json")).get("defaultParams"))

    def effective_param(name: str):
        requested = request.query_params.get(name)
        return requested if requested not in {None, ""} else api_default_params.get(name)

    start_at = _parse_time(str(effective_param("startAt") or ""))
    end_at = _parse_time(str(effective_param("endAt") or ""))
    if start_at and end_at and end_at > start_at:
        query_days = (end_at - start_at).total_seconds() / 86400
    else:
        query_days = 0
    requested_rows = max(
        [
            int(effective_param(name) or 0)
            for name in ("pageSize", "limit", "maxRows")
            if str(effective_param(name) or "0").isdigit()
        ]
        or [0]
    )
    extra_risk = 0
    should_deny, risk_points = violation_risk(
        policy, "queryRangeExceeded", query_days > int(policy.get("max_query_days") or 1)
    )
    extra_risk += risk_points
    if risk_points:
        add_risk_factor("queryRangeExceeded", "查询时间范围", risk_points, f"请求 {query_days:g} 天，策略上限 {int(policy.get('max_query_days') or 1)} 天")
    if should_deny:
        raise policy_denied("QUERY_RANGE_EXCEEDED", risk_points)

    region = effective_param("regionCode")
    organization = effective_param("organizationCode")
    scope_violation = bool(
        region and _json_list(policy.get("region_scope_json"))
        and region not in _json_list(policy.get("region_scope_json"))
    ) or bool(
        organization and _json_list(policy.get("organization_scope_json"))
        and organization not in _json_list(policy.get("organization_scope_json"))
    )
    should_deny, risk_points = violation_risk(policy, "scopeViolation", scope_violation)
    extra_risk += risk_points
    if risk_points:
        add_risk_factor("scopeViolation", "数据范围越界", risk_points, "请求的区域或组织不在授权范围内")
    if should_deny:
        raise policy_denied("SCOPE_VIOLATION", risk_points)
    fields = effective_param("fields")
    requested_codes: list[str] = []
    if fields:
        requested_fields = [item.strip() for item in str(fields).split(",") if item.strip()]
        runtime_field_map = _json_object(_json_object(api.get("runtime_config_json")).get("fieldMap"))
        if runtime_field_map:
            known_codes = {str(code).upper() for code in runtime_field_map}
            requested_codes = [item.upper() for item in requested_fields]
        else:
            known_codes = set(FIELD_CODES)
            requested_codes = [FIELD_CODES.get(item.lower(), "") for item in requested_fields]
        if any(not code or code not in known_codes for code in requested_codes):
            raise RuntimeDenied(
                "FIELD_NOT_ALLOWED", request_id=request_id, api=api, subject=subject, policy=policy,
                client_ip=address, query_days=query_days, requested_rows=requested_rows,
            )
        masked_fields = {str(code).upper() for code in _json_list(hard_constraints.get("maskedFields"))}
        if str(policy.get("output_mode") or "detail") == "detail" and masked_fields.intersection(requested_codes):
            add_risk_factor("maskedFieldDetail", "脱敏字段明文请求", 90, "请求包含必须脱敏的字段")
            raise policy_denied("TAG_CONSTRAINT_VIOLATION", 90)

    rate_key = f"{subject['subject_code']}:{api['api_code']}:{datetime.now().strftime('%Y%m%d%H%M')}"
    frequency = request_memory.increment_rate(rate_key)
    should_deny, risk_points = violation_risk(
        policy, "highFrequency", frequency > int(policy.get("max_requests_per_minute") or 60)
    )
    extra_risk += risk_points
    if risk_points:
        add_risk_factor("highFrequency", "高频调用", risk_points, f"当前分钟已调用 {frequency} 次")
    if should_deny:
        raise policy_denied("RATE_LIMITED", risk_points)
    allowed_time_ranges = _json_list(policy.get("allowed_time_ranges_json"))
    should_deny, risk_points = violation_risk(
        policy,
        "offHours",
        bool(allowed_time_ranges) and not in_time_ranges(datetime.now().astimezone(), allowed_time_ranges),
    )
    extra_risk += risk_points
    if risk_points:
        add_risk_factor("offHours", "非允许时段", risk_points, "当前时间不在策略允许时段内")
    if should_deny:
        raise policy_denied("OFF_HOURS", risk_points)
    should_deny, risk_points = violation_risk(
        policy, "rowLimitExceeded", requested_rows > int(policy.get("max_rows") or 1000)
    )
    extra_risk += risk_points
    if risk_points:
        add_risk_factor("rowLimitExceeded", "返回行数超限", risk_points, f"请求 {requested_rows} 行，策略上限 {int(policy.get('max_rows') or 1000)} 行")
    if should_deny:
        raise policy_denied("ROW_LIMIT_EXCEEDED", risk_points)
    behavior_rule = abnormal_access_rule(policy, "behaviorAnomaly")
    baseline = policy if policy.get("frequency_avg") is not None else None
    behavior_score = calculate_risk(
        now=datetime.now().astimezone(),
        allowed_time_ranges=[],
        frequency=frequency,
        query_days=query_days,
        requested_rows=requested_rows,
        max_rows=2**31,
        baseline=baseline if behavior_rule["enabled"] else None,
    )
    should_deny, risk_points = violation_risk(
        policy, "behaviorAnomaly", behavior_score > 0
    )
    if risk_points and snapshot:
        risk_points = min(100, round(risk_points * float(snapshot.get("riskMultiplier") or 1)))
    extra_risk += risk_points
    if risk_points:
        multiplier = float(snapshot.get("riskMultiplier") or 1)
        detail = "行为偏离已学习基线"
        if multiplier > 1:
            detail += f"，按 {snapshot.get('sensitivity') or '敏感'} 级数据放大 {multiplier:g} 倍"
        add_risk_factor("behaviorAnomaly", "行为基线偏离", risk_points, detail)
    if should_deny:
        raise policy_denied("RISK_REJECTED", risk_points)

    if snapshot and str(subject.get("subject_type") or "") == "external_party":
        extra_risk += 10
        add_risk_factor("externalSubject", "外部访问主体", 10, "外部访问方请求受控数据")
    identifier_fields = {str(code).upper() for code in _json_list(snapshot.get("identifierFields"))}
    if fields and identifier_fields.intersection(requested_codes):
        extra_risk += 15
        add_risk_factor("identifierField", "直接标识符", 15, "请求包含可直接识别对象的字段")
    score = min(100, extra_risk)
    threshold = int(policy.get("risk_threshold") or 70)
    if score >= threshold:
        raise policy_denied("RISK_REJECTED", score)
    return RuntimeContext(
        request_id=request_id,
        api=api,
        subject=subject,
        policy=policy,
        risk_score=score,
        client_ip=address,
        query_days=query_days,
        requested_rows=requested_rows,
        matched_labels=matched_labels,
        risk_factors=tuple(risk_factors),
        label_snapshot_version=label_snapshot_version,
    )


def _validate_range(params, context: RuntimeContext | None = None) -> tuple[str, datetime, datetime]:
    region = str(params.get("regionCode") or "")
    start_at = _parse_time(params.get("startAt"))
    end_at = _parse_time(params.get("endAt"))
    if not region or not start_at or not end_at or end_at <= start_at:
        raise ValueError("VALIDATION_ERROR")
    if context:
        regions = _json_list(context.policy.get("region_scope_json"))
        if regions and region not in regions:
            raise PermissionError("POLICY_NOT_FOUND")
    return region, start_at, end_at


@contextmanager
def measurement_connection(context: RuntimeContext | None = None):
    if context is None:
        with connection() as current:
            yield current
        return

    source_id = context.api.get("data_source_id")
    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": source_id},
    ) if source_id else None
    secret_ref = str(source.get("secret_ref") or "") if source else ""
    secret = settings.source_secrets.get(secret_ref, "")
    if not source or source.get("connection_status") != "connected" or not secret:
        raise RuntimeDenied(
            "UPSTREAM_UNAVAILABLE", request_id=context.request_id, api=context.api,
            subject=context.subject, policy=context.policy, client_ip=context.client_ip,
            query_days=context.query_days, requested_rows=context.requested_rows,
        )
    options = _json_object(source.get("connection_options_json"))
    dialect = str(options.get("dialect") or "postgresql").lower()
    security_config = _json_object(source.get("security_config_json"))
    encrypted = bool(security_config.get("encryptionEnabled") or security_config.get("encryption_enabled"))
    if dialect not in {"postgresql", "mysql"}:
        raise RuntimeDenied(
            "UPSTREAM_UNAVAILABLE", request_id=context.request_id, api=context.api,
            subject=context.subject, policy=context.policy, client_ip=context.client_ip,
            query_days=context.query_days, requested_rows=context.requested_rows,
        )
    try:
        if dialect == "mysql":
            current = pymysql.connect(
                host=str(source.get("host") or ""),
                port=int(source.get("port") or 3306),
                database=str(source.get("database_name") or ""),
                user=str(source.get("username") or ""),
                password=secret,
                connect_timeout=settings.connection_timeout_seconds,
                read_timeout=settings.connection_timeout_seconds,
                write_timeout=settings.connection_timeout_seconds,
                charset="utf8mb4",
                autocommit=True,
                cursorclass=pymysql.cursors.DictCursor,
                **({"ssl": {"check_hostname": False}} if encrypted else {}),
            )
            try:
                yield current
            finally:
                current.close()
            return
        with connection(parameters={
            "host": source.get("host"),
            "port": int(source.get("port") or 5432),
            "dbname": source.get("database_name"),
            "user": source.get("username"),
            "password": secret,
            "sslmode": "require" if encrypted else "prefer",
        }) as current:
            yield current
    except (psycopg.Error, pymysql.MySQLError, OSError) as error:
        raise RuntimeDenied(
            "UPSTREAM_UNAVAILABLE", request_id=context.request_id, api=context.api,
            subject=context.subject, policy=context.policy, client_ip=context.client_ip,
            query_days=context.query_days, requested_rows=context.requested_rows,
        ) from error


def resource_query(params, context: RuntimeContext) -> tuple[list[dict[str, Any]], dict[str, int]]:
    config = _json_object(context.api.get("runtime_config_json"))
    field_map = {
        str(code).strip().upper(): str(column).strip()
        for code, column in _json_object(config.get("fieldMap") or config.get("field_map")).items()
        if str(code).strip() and str(column).strip()
    }
    table_name = str(config.get("table") or "").strip()
    if not table_name or not field_map:
        raise RuntimeDenied(
            "ROUTE_NOT_FOUND", request_id=context.request_id, api=context.api,
            subject=context.subject, policy=context.policy, client_ip=context.client_ip,
            query_days=context.query_days, requested_rows=context.requested_rows,
        )

    source = fetch_one(
        "SELECT * FROM security_data_sources WHERE id=%(id)s LIMIT 1",
        {"id": context.api.get("data_source_id")},
    ) or {}
    options = _json_object(source.get("connection_options_json"))
    dialect = str(options.get("dialect") or "postgresql").lower()
    quoted_table = _quote_identifier(table_name, dialect)
    for column in field_map.values():
        _quote_identifier(column, dialect)

    requested = [item.strip().upper() for item in str(params.get("fields") or "").split(",") if item.strip()]
    default_fields = [str(item).upper() for item in _json_list(config.get("defaultFields") or config.get("default_fields"))]
    selected_codes = list(dict.fromkeys(requested or default_fields or list(field_map)))
    if not selected_codes or any(code not in field_map for code in selected_codes):
        raise PermissionError("FIELD_NOT_ALLOWED")

    select_columns = ", ".join(
        f"{_quote_identifier(field_map[code], dialect)} AS {_quote_identifier(_camel_case(code.lower()), dialect)}"
        for code in selected_codes
    )
    query_sql, query_parameters = validate_custom_query_sql(config.get("querySql") or config.get("query_sql"))
    conditions: list[str] = []
    parameters: dict[str, Any] = {}
    time_code = str(config.get("timeFieldCode") or config.get("time_field_code") or "").upper()
    region_code = str(config.get("regionFieldCode") or config.get("region_field_code") or "").upper()
    organization_code = str(config.get("organizationFieldCode") or config.get("organization_field_code") or "").upper()
    start_at = _parse_time(str(params.get("startAt") or ""))
    end_at = _parse_time(str(params.get("endAt") or ""))
    if time_code:
        if time_code not in field_map:
            raise ValueError("VALIDATION_ERROR")
        if start_at or end_at:
            if not start_at or not end_at or end_at <= start_at:
                raise ValueError("VALIDATION_ERROR")
            time_column = _quote_identifier(field_map[time_code], dialect)
            conditions.extend([f"{time_column} >= %(start_at)s", f"{time_column} < %(end_at)s"])
            parameters.update({"start_at": start_at, "end_at": end_at})
    region = str(params.get("regionCode") or "").strip()
    if region and region_code:
        if region_code not in field_map:
            raise ValueError("VALIDATION_ERROR")
        conditions.append(f"{_quote_identifier(field_map[region_code], dialect)} = %(region)s")
        parameters["region"] = region
    organization = str(params.get("organizationCode") or "").strip()
    if organization and organization_code:
        if organization_code not in field_map:
            raise ValueError("VALIDATION_ERROR")
        conditions.append(f"{_quote_identifier(field_map[organization_code], dialect)} = %(organization)s")
        parameters["organization"] = organization

    page = max(1, int(params.get("page") or 1))
    page_size = min(max(1, int(params.get("pageSize") or 100)), int(context.policy.get("max_rows") or 1000), 1000)
    if query_sql:
        default_params = _json_object(config.get("defaultParams") or config.get("default_params"))
        parameters = {
            name: params.get(name) if params.get(name) not in {None, ""} else default_params.get(name)
            for name in query_parameters
        }
        missing_params = [name for name, value in parameters.items() if value is None]
        if missing_params:
            raise ValueError(f"API 缺少查询参数：{', '.join(missing_params)}")
        parameters.update({"__api_limit": page_size, "__api_offset": (page - 1) * page_size})
        statement = (
            f"SELECT * FROM ({parameterize_custom_query_sql(query_sql)}) AS api_query "
            "LIMIT %(__api_limit)s OFFSET %(__api_offset)s"
        )
        with measurement_connection(context) as current, current.cursor() as cursor:
            cursor.execute(statement, parameters)
            raw_rows = cursor.fetchall()
        mask_codes = {str(item).upper() for item in _json_list(config.get("maskFields") or config.get("mask_fields"))}
        rows = []
        for raw in raw_rows:
            source_row = dict(raw)
            source_lookup = {str(key).lower(): value for key, value in source_row.items()}
            row = {
                _camel_case(code.lower()): source_lookup.get(str(field_map[code]).lower())
                for code in selected_codes
            }
            if context.output_mode == "masked":
                for code in mask_codes:
                    key = _camel_case(code.lower())
                    if row.get(key) not in {None, ""}:
                        text = str(row[key])
                        row[key] = f"{text[:3]}***{text[-2:]}" if len(text) > 5 else "***"
            rows.append({key: _json_value(value) for key, value in row.items()})
        return rows, {"page": page, "pageSize": page_size, "returnedRows": len(rows)}

    parameters.update({"limit": page_size, "offset": (page - 1) * page_size})
    where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    order_clause = f" ORDER BY {_quote_identifier(field_map[time_code], dialect)}" if time_code else ""
    statement = f"SELECT {select_columns} FROM {quoted_table}{where_clause}{order_clause} LIMIT %(limit)s OFFSET %(offset)s"

    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(statement, parameters)
        raw_rows = cursor.fetchall()
    mask_codes = {str(item).upper() for item in _json_list(config.get("maskFields") or config.get("mask_fields"))}
    rows = []
    for raw in raw_rows:
        row = dict(raw)
        if context.output_mode == "masked":
            for code in mask_codes:
                key = _camel_case(code.lower())
                if row.get(key) not in {None, ""}:
                    text = str(row[key])
                    row[key] = f"{text[:3]}***{text[-2:]}" if len(text) > 5 else "***"
        rows.append({key: _json_value(value) for key, value in row.items()})
    return rows, {"page": page, "pageSize": page_size, "returnedRows": len(rows)}


def aggregate_measurements(params, context: RuntimeContext | None = None) -> list[dict[str, Any]]:
    region, start_at, end_at = _validate_range(params, context)
    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(
            """
            SELECT region_code, date_trunc('hour', measurement_time) AS hour,
                   sum(active_power) AS power_sum, avg(active_power) AS power_average,
                   count(*) AS sample_count
            FROM measurement_demo.active_power_measurements
            WHERE region_code = %(region)s
              AND measurement_time >= %(start_at)s AND measurement_time < %(end_at)s
            GROUP BY region_code, date_trunc('hour', measurement_time)
            ORDER BY hour
            """,
            {"region": region, "start_at": start_at, "end_at": end_at},
        )
        rows = cursor.fetchall()
    return [
        {
            "regionCode": row["region_code"],
            "hour": _json_value(row["hour"]),
            "sum": _json_value(row["power_sum"]),
            "average": _json_value(row["power_average"]),
            "sampleCount": row["sample_count"],
        }
        for row in rows
    ]


def detail_measurements(params, context: RuntimeContext) -> tuple[list[dict[str, Any]], dict[str, int]]:
    region, start_at, end_at = _validate_range(params, context)
    organization = str(params.get("organizationCode") or "").strip()
    mode = context.output_mode
    if mode not in {"detail", "masked"}:
        raise PermissionError("POLICY_NOT_FOUND")
    raw_fields = str(params.get("fields") or "").strip()
    if raw_fields:
        selected = list(dict.fromkeys(item.strip().lower() for item in raw_fields.split(",") if item.strip()))
    else:
        selected = DEFAULT_FIELDS
    if not selected or any(field not in FIELD_COLUMNS for field in selected):
        raise PermissionError("FIELD_NOT_ALLOWED")
    page = max(1, int(params.get("page") or 1))
    page_size = min(
        max(1, int(params.get("pageSize") or 100)),
        int(context.policy.get("max_rows") or 1000),
        1000,
    )
    offset = (page - 1) * page_size
    columns = sql.SQL(", ").join(sql.Identifier(FIELD_COLUMNS[field]) for field in selected)
    statement = sql.SQL(
        "SELECT {columns} FROM measurement_demo.active_power_measurements "
        "WHERE region_code = %(region)s "
        "{organization_filter} "
        "AND measurement_time >= %(start_at)s AND measurement_time < %(end_at)s "
        "ORDER BY measurement_time, point_code LIMIT %(limit)s OFFSET %(offset)s"
    ).format(
        columns=columns,
        organization_filter=sql.SQL("AND organization_code = %(organization)s")
        if organization
        else sql.SQL(""),
    )
    with measurement_connection(context) as current, current.cursor() as cursor:
        cursor.execute(
            statement,
            {
                "region": region,
                "organization": organization,
                "start_at": start_at,
                "end_at": end_at,
                "limit": page_size,
                "offset": offset,
            },
        )
        raw_rows = cursor.fetchall()
    rows = []
    for raw_row in raw_rows:
        row = {}
        for field in selected:
            value = _json_value(raw_row[field])
            if field == "point_code" and mode == "masked" and value:
                value = str(value)[:6] + "***"
            row[_camel_case(field)] = value
        rows.append(row)
    return rows, {"page": page, "pageSize": page_size, "returnedRows": len(rows)}


def _homomorphic_denied(code: str, context: RuntimeContext) -> RuntimeDenied:
    return RuntimeDenied(
        code,
        request_id=context.request_id,
        api=context.api,
        subject=context.subject,
        policy=context.policy,
        client_ip=context.client_ip,
        query_days=context.query_days,
        requested_rows=context.requested_rows,
    )


def _homomorphic_event(
    stage: str,
    result: str,
    message: str,
    *,
    request_id: str = "",
    duration_ms: int | None = None,
) -> dict[str, Any]:
    return {
        "id": f"{stage}-{uuid4()}",
        "time": datetime.now(timezone.utc).isoformat(),
        "stage": stage,
        "result": result,
        "message": message,
        "requestId": request_id,
        "durationMs": duration_ms,
    }


def _homomorphic_resource(context: RuntimeContext) -> dict[str, Any]:
    resource = fetch_one(
        "SELECT * FROM eco_data_resources WHERE id=%(id)s LIMIT 1",
        {"id": context.api.get("resource_id")},
    )
    if not resource or str(resource.get("resource_status") or "") != "enabled":
        raise _homomorphic_denied("ROUTE_NOT_FOUND", context)
    return resource


def _homomorphic_field(context: RuntimeContext, resource: dict[str, Any], field_code: str) -> dict[str, Any]:
    field = fetch_one(
        """
        SELECT * FROM eco_resource_security_fields
        WHERE resource_id=%(resource_id)s AND upper(field_code)=upper(%(field_code)s)
        LIMIT 1
        """,
        {"resource_id": resource.get("id"), "field_code": field_code},
    )
    if not field:
        raise _homomorphic_denied("FIELD_NOT_ALLOWED", context)
    data_type = str(field.get("data_type") or "").strip().lower()
    numeric_markers = ("int", "decimal", "numeric", "float", "double", "real", "number")
    if not any(marker in data_type for marker in numeric_markers):
        raise _homomorphic_denied("HOMOMORPHIC_FIELD_INVALID", context)
    return field


def _homomorphic_key(context: RuntimeContext, algorithm: str) -> dict[str, Any]:
    key = fetch_one(
        """
        SELECT * FROM security_crypto_keys
        WHERE subject_id=%(subject_id)s AND lower(algorithm_code)=%(algorithm)s
          AND key_status='enabled' AND valid_from <= %(now)s
          AND (valid_to IS NULL OR valid_to > %(now)s)
        ORDER BY valid_from DESC, id DESC
        LIMIT 1
        """,
        {
            "subject_id": context.subject.get("id"),
            "algorithm": algorithm.lower(),
            "now": datetime.now(timezone.utc),
        },
    )
    if not key:
        raise _homomorphic_denied("HOMOMORPHIC_UNAVAILABLE", context)
    return key


def _homomorphic_values(
    params: dict[str, Any],
    context: RuntimeContext,
    processing_path: str,
    field_code: str,
) -> list[int | float]:
    if processing_path == "/internal/region-hourly":
        region, start_at, end_at = _validate_range(params, context)
        organization = str(params.get("organizationCode") or "").strip()
        statement = sql.SQL(
            "SELECT active_power FROM measurement_demo.active_power_measurements "
            "WHERE region_code=%(region)s {organization_filter} "
            "AND measurement_time >= %(start_at)s AND measurement_time < %(end_at)s "
            "ORDER BY measurement_time, point_code LIMIT 65"
        ).format(
            organization_filter=sql.SQL("AND organization_code=%(organization)s")
            if organization
            else sql.SQL(""),
        )
        with measurement_connection(context) as current, current.cursor() as cursor:
            cursor.execute(
                statement,
                {
                    "region": region,
                    "organization": organization,
                    "start_at": start_at,
                    "end_at": end_at,
                },
            )
            raw_values = [row["active_power"] for row in cursor.fetchall()]
    else:
        query_params = {
            **params,
            "fields": field_code,
            "page": 1,
            "pageSize": 65,
        }
        rows, _ = resource_query(query_params, context)
        result_key = _camel_case(field_code.lower())
        raw_values = [row.get(result_key) for row in rows]

    values: list[int | float] = []
    for value in raw_values:
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
            raise _homomorphic_denied("HOMOMORPHIC_FIELD_INVALID", context)
        number = float(value)
        if not math.isfinite(number):
            raise _homomorphic_denied("HOMOMORPHIC_FIELD_INVALID", context)
        values.append(int(value) if isinstance(value, int) and not isinstance(value, bool) else number)
    if not values:
        raise _homomorphic_denied("HOMOMORPHIC_NO_DATA", context)
    if len(values) > 64:
        raise _homomorphic_denied("HOMOMORPHIC_SAMPLE_LIMIT", context)
    return values


def _create_homomorphic_task(
    context: RuntimeContext,
    resource: dict[str, Any],
    field_code: str,
    operation: str,
    algorithm: str,
    crypto_key: dict[str, Any],
    params: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    now = datetime.now(timezone.utc)
    task_code = f"HE-AUTO-{uuid4().hex[:20].upper()}"
    events = [
        _homomorphic_event("created", "success", "资源 API 请求命中密态策略，已自动创建任务。", request_id=context.request_id),
        _homomorphic_event("validation", "success", "访问主体、数据范围与数值字段校验通过。", request_id=context.request_id),
    ]
    summary = {
        "trigger": "resource-api-policy",
        "outputMode": "encrypted",
        "requestId": context.request_id,
        "resource": {
            "id": resource.get("id"),
            "code": resource.get("resource_code"),
            "name": resource.get("resource_name"),
        },
        "fieldCode": field_code,
        "operation": operation,
        "scope": {
            "startAt": params.get("startAt"),
            "endAt": params.get("endAt"),
            "regionCode": params.get("regionCode"),
            "organizationCode": params.get("organizationCode"),
        },
        "events": events,
        "logs": events,
    }
    task = fetch_one(
        """
        INSERT INTO security_confidential_tasks (
          task_code, task_name, scenario, task_status, risk_level, algorithm,
          source_domain, target_domain, progress, execution_summary_json, task_tags,
          operation, region_scope_json, organization_scope_json, measure_field_code,
          data_start_at, data_end_at, sample_count, idempotency_key, started_at,
          subject_id, api_resource_id, crypto_key_id, "createdAt", "updatedAt"
        ) VALUES (
          %(task_code)s, %(task_name)s, %(scenario)s, 'running', %(risk_level)s, %(algorithm)s,
          'data-resource', 'authorized-consumer', 10, %(summary)s::jsonb, %(tags)s::json,
          %(operation)s, %(regions)s::jsonb, %(organizations)s::jsonb, %(field_code)s,
          %(start_at)s, %(end_at)s, 0, %(idempotency_key)s, %(now)s,
          %(subject_id)s, %(api_id)s, %(key_id)s, %(now)s, %(now)s
        ) RETURNING *
        """,
        {
            "task_code": task_code,
            "task_name": f"{resource.get('resource_name') or '数据资源'}{field_code}{'平均值' if operation == 'mean' else '求和'}密态计算",
            "scenario": str(context.policy.get("scenario") or "resource-data-query"),
            "risk_level": context.level,
            "algorithm": algorithm.lower(),
            "summary": json.dumps(summary, ensure_ascii=False),
            "tags": json.dumps(["资源 API 触发", "自动密态计算", algorithm.upper()], ensure_ascii=False),
            "operation": operation,
            "regions": json.dumps([params.get("regionCode")] if params.get("regionCode") else [], ensure_ascii=False),
            "organizations": json.dumps([params.get("organizationCode")] if params.get("organizationCode") else [], ensure_ascii=False),
            "field_code": field_code,
            "start_at": _parse_time(str(params.get("startAt") or "")),
            "end_at": _parse_time(str(params.get("endAt") or "")),
            "idempotency_key": f"resource-api:{context.request_id}",
            "subject_id": context.subject.get("id"),
            "api_id": context.api.get("id"),
            "key_id": crypto_key.get("id"),
            "now": now,
        },
    ) or {}
    execute(
        """
        INSERT INTO security_confidential_task_resources (
          task_id, resource_id, resource_role, field_scope_json, relation_tags, "createdAt", "updatedAt"
        ) VALUES (
          %(task_id)s, %(resource_id)s, 'primary', %(field_scope)s::jsonb, %(tags)s::json, %(now)s, %(now)s
        )
        """,
        {
            "task_id": task.get("id"),
            "resource_id": resource.get("id"),
            "field_scope": json.dumps({"fields": [field_code]}, ensure_ascii=False),
            "tags": json.dumps(["服务端取数", "密态计算"], ensure_ascii=False),
            "now": now,
        },
    )
    return task, events


def _fail_homomorphic_task(
    task_id: int,
    summary: dict[str, Any],
    events: list[dict[str, Any]],
    message: str,
    started_timer: float,
) -> None:
    duration_ms = round((time.perf_counter() - started_timer) * 1000)
    failed_event = _homomorphic_event("failed", "failed", message, duration_ms=duration_ms)
    failed_events = [*events, failed_event]
    execute(
        """
        UPDATE security_confidential_tasks
        SET task_status='failed', progress=0, duration_ms=%(duration_ms)s,
            error_summary=%(message)s,
            execution_summary_json=%(summary)s::jsonb, "updatedAt"=%(now)s
        WHERE id=%(id)s
        """,
        {
            "id": task_id,
            "duration_ms": duration_ms,
            "message": message,
            "summary": json.dumps({**summary, "events": failed_events, "logs": failed_events}, ensure_ascii=False),
            "now": datetime.now(timezone.utc),
        },
    )


async def execute_homomorphic_resource_request(
    params: dict[str, Any],
    context: RuntimeContext,
    processing_path: str,
) -> tuple[dict[str, Any], int]:
    if context.api.get("supports_homomorphic") is not True:
        raise _homomorphic_denied("HOMOMORPHIC_UNSUPPORTED", context)
    operation = str(params.get("operation") or "").strip().lower()
    if operation not in {"sum", "mean"}:
        raise _homomorphic_denied("VALIDATION_ERROR", context)
    default_field = "P_ACTIVE" if processing_path == "/internal/region-hourly" else ""
    field_code = str(params.get("fieldCode") or default_field).strip().upper()
    if not field_code:
        raise _homomorphic_denied("VALIDATION_ERROR", context)

    resource = _homomorphic_resource(context)
    field = _homomorphic_field(context, resource, field_code)
    data_type = str(field.get("data_type") or "").lower()
    algorithm = "BFV" if "int" in data_type and not any(marker in data_type for marker in ("point", "decimal")) else "CKKS"
    crypto_key = _homomorphic_key(context, algorithm)
    task, events = _create_homomorphic_task(
        context, resource, field_code, operation, algorithm, crypto_key, params,
    )
    task_id = int(task["id"])
    summary = _json_object(task.get("execution_summary_json"))
    started_timer = time.perf_counter()
    try:
        values = _homomorphic_values(params, context, processing_path, field_code)
        read_event = _homomorphic_event(
            "resource_read", "success", f"已在服务端按授权范围读取 {len(values)} 条数值样本。",
            request_id=context.request_id,
        )
        compute_event = _homomorphic_event(
            "compute", "pending", "原始数值已在内存中提交密态计算，不写入任务记录。",
            request_id=context.request_id,
        )
        events.extend([read_event, compute_event])
        execute(
            """
            UPDATE security_confidential_tasks
            SET progress=45, sample_count=%(sample_count)s,
                execution_summary_json=%(summary)s::jsonb, "updatedAt"=%(now)s
            WHERE id=%(id)s
            """,
            {
                "id": task_id,
                "sample_count": len(values),
                "summary": json.dumps({**summary, "sampleCount": len(values), "events": events, "logs": events}, ensure_ascii=False),
                "now": datetime.now(timezone.utc),
            },
        )
        async with httpx.AsyncClient(timeout=settings.connection_timeout_seconds) as client:
            response = await client.post(
                f"{settings.homomorphic_service_url.rstrip('/')}/v1/tasks/execute",
                json={
                    "taskCode": task.get("task_code"),
                    "scheme": algorithm,
                    "operation": operation,
                    "values": values,
                },
            )
            response.raise_for_status()
            payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("resultSummary"), dict):
            raise ValueError("invalid homomorphic response")
    except RuntimeDenied as error:
        _fail_homomorphic_task(task_id, summary, events, error.message, started_timer)
        raise
    except (httpx.HTTPError, ValueError) as error:
        denied = _homomorphic_denied("HOMOMORPHIC_UNAVAILABLE", context)
        _fail_homomorphic_task(task_id, summary, events, denied.message, started_timer)
        raise denied from error

    duration_ms = round((time.perf_counter() - started_timer) * 1000)
    engine_request_id = str(payload.get("requestId") or "")
    result_summary = {
        "value": payload["resultSummary"].get("value"),
        "verificationPassed": payload["resultSummary"].get("verificationPassed") is True,
        "absoluteError": payload["resultSummary"].get("absoluteError"),
        "tolerance": payload["resultSummary"].get("tolerance"),
    }
    safe_result = {
        "requestId": engine_request_id,
        "status": "completed",
        "scheme": algorithm,
        "operation": operation,
        "resultSummary": result_summary,
        "durationMs": payload.get("durationMs"),
        "ciphertextCount": payload.get("ciphertextCount"),
    }
    result_hash = hashlib.sha256(
        json.dumps(safe_result, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    result_event = _homomorphic_event(
        "result", "success", "密态计算已完成，结果摘要已回传。",
        request_id=engine_request_id,
        duration_ms=duration_ms,
    )
    completed_events = [*events, result_event]
    completed_summary = {
        **summary,
        "sampleCount": len(values),
        "result": safe_result,
        "events": completed_events,
        "logs": completed_events,
    }
    now = datetime.now(timezone.utc)
    execute(
        """
        UPDATE security_confidential_tasks
        SET task_status='completed', progress=100, sample_count=%(sample_count)s,
            completed_at=%(now)s, duration_ms=%(duration_ms)s, error_summary=NULL,
            ciphertext_result_ref=%(result_ref)s, result_hash=%(result_hash)s,
            execution_summary_json=%(summary)s::jsonb, "updatedAt"=%(now)s
        WHERE id=%(id)s
        """,
        {
            "id": task_id,
            "sample_count": len(values),
            "now": now,
            "duration_ms": duration_ms,
            "result_ref": f"homomorphic-result:{task.get('task_code')}:{engine_request_id}",
            "result_hash": result_hash,
            "summary": json.dumps(completed_summary, ensure_ascii=False),
        },
    )
    return {
        "requestId": context.request_id,
        "taskCode": task.get("task_code"),
        "outputMode": "encrypted",
        "resource": completed_summary["resource"],
        "fieldCode": field_code,
        "operation": operation,
        "algorithm": algorithm,
        "sampleCount": len(values),
        "resultSummary": result_summary,
        "engineRequestId": engine_request_id,
        "durationMs": duration_ms,
    }, 1


async def execute_data_api(request, context: RuntimeContext) -> tuple[Any, int]:
    mode = str(context.api.get("access_mode") or "")
    processing_path = str(context.api.get("orchestrator_path") or "")
    if mode == "direct":
        upstream = str(context.api.get("upstream_url") or "")
        if not upstream.startswith(("http://", "https://")):
            raise RuntimeDenied(
                "UPSTREAM_UNAVAILABLE", request_id=context.request_id, api=context.api,
                subject=context.subject, policy=context.policy, client_ip=context.client_ip,
                query_days=context.query_days, requested_rows=context.requested_rows,
            )
        try:
            forwarded_headers = {"accept": "application/json"}
            content_type = request.headers.get("content-type")
            if content_type:
                forwarded_headers["content-type"] = content_type
            async with httpx.AsyncClient(timeout=settings.connection_timeout_seconds) as client:
                response = await client.request(
                    request.method,
                    upstream,
                    params=list(request.query_params.multi_items()),
                    headers=forwarded_headers,
                    content=await request.body() if request.method == "POST" else None,
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise RuntimeDenied(
                "UPSTREAM_UNAVAILABLE", request_id=context.request_id, api=context.api,
                subject=context.subject, policy=context.policy, client_ip=context.client_ip,
                query_days=context.query_days, requested_rows=context.requested_rows,
            ) from error
        return payload, len(payload) if isinstance(payload, list) else 1
    params: dict[str, Any] = dict(request.query_params)
    if request.method == "POST":
        try:
            body_params = await request.json()
        except ValueError as error:
            raise ValueError("VALIDATION_ERROR") from error
        if not isinstance(body_params, dict):
            raise ValueError("VALIDATION_ERROR")
        params.update(body_params)
    if context.output_mode == "encrypted":
        if processing_path not in {"/internal/region-hourly", "/internal/resource-query"}:
            raise _homomorphic_denied("HOMOMORPHIC_UNSUPPORTED", context)
        return await execute_homomorphic_resource_request(params, context, processing_path)
    if processing_path == "/internal/active-power":
        rows, meta = detail_measurements(params, context)
        meta.update(
            {"decision": "allow", "outputMode": context.output_mode, "riskLevel": context.level}
        )
        return {"requestId": context.request_id, "data": rows, "meta": meta}, len(rows)
    if processing_path == "/internal/region-hourly":
        if context.output_mode != "aggregate" or params.get("metric", "active_power") != "active_power":
            raise RuntimeDenied(
                "VALIDATION_ERROR", request_id=context.request_id, api=context.api,
                subject=context.subject, policy=context.policy, client_ip=context.client_ip,
                query_days=context.query_days, requested_rows=context.requested_rows,
            )
        rows = aggregate_measurements(params, context)
        return {
            "requestId": context.request_id,
            "data": rows,
            "meta": {
                "decision": "allow",
                "outputMode": context.output_mode,
                "riskLevel": context.level,
            },
        }, len(rows)
    if processing_path == "/internal/resource-query":
        if context.output_mode not in {"detail", "masked"}:
            raise RuntimeDenied(
                "POLICY_NOT_FOUND", request_id=context.request_id, api=context.api,
                subject=context.subject, policy=context.policy, client_ip=context.client_ip,
                query_days=context.query_days, requested_rows=context.requested_rows,
            )
        rows, meta = resource_query(params, context)
        meta.update({"decision": "allow", "outputMode": context.output_mode, "riskLevel": context.level})
        return {"requestId": context.request_id, "data": rows, "meta": meta}, len(rows)
    raise RuntimeDenied(
        "ROUTE_NOT_FOUND", request_id=context.request_id, api=context.api, subject=context.subject,
        policy=context.policy, client_ip=context.client_ip, query_days=context.query_days,
        requested_rows=context.requested_rows,
    )


def record_allowed(context: RuntimeContext, returned_rows: int, duration_ms: int) -> None:
    now = datetime.now(timezone.utc)
    snapshot = _policy_runtime_snapshot(context.policy)
    evidence = {
        "matchedLabels": list(context.matched_labels),
        "riskFactors": list(context.risk_factors),
        "runtimeConfigVersion": context.policy.get("gateway_config_version"),
        "labelSnapshotVersion": context.label_snapshot_version,
        "hardConstraints": _json_object(snapshot.get("hardConstraints")),
    }
    execute(
        """
        INSERT INTO security_policy_decision_logs (
          request_id, subject_id, api_resource_id, policy_id,
          requested_output_mode, effective_output_mode, decision_result,
          decision_reason_code, decision_reason, risk_score, risk_level,
          client_ip, query_days, requested_rows, returned_rows, response_status,
          response_bytes, duration_ms, applied_limits_json, requested_at, "createdAt", "updatedAt"
        ) VALUES (
          %(request_id)s, %(subject_id)s, %(api_id)s, %(policy_id)s,
          %(output_mode)s, %(output_mode)s, 'allow', 'POLICY_ALLOW',
          '请求通过已发布访问策略校验', %(risk_score)s, %(risk_level)s,
          %(client_ip)s, %(query_days)s, %(requested_rows)s, %(returned_rows)s,
          200, 0, %(duration_ms)s, %(evidence)s::jsonb, %(now)s, %(now)s, %(now)s
        ) ON CONFLICT (request_id) DO NOTHING
        """,
        {
            "request_id": context.request_id,
            "subject_id": context.subject["id"],
            "api_id": context.api["id"],
            "policy_id": context.policy["id"],
            "output_mode": context.output_mode,
            "risk_score": context.risk_score,
            "risk_level": context.level,
            "client_ip": context.client_ip,
            "query_days": context.query_days,
            "requested_rows": context.requested_rows,
            "returned_rows": returned_rows,
            "duration_ms": max(0, duration_ms),
            "evidence": json.dumps(evidence, ensure_ascii=False),
            "now": now,
        },
    )


def record_denied(error: RuntimeDenied, duration_ms: int) -> None:
    now = datetime.now(timezone.utc)
    snapshot = _policy_runtime_snapshot(error.policy or {})
    evidence = {
        "matchedLabels": error.matched_labels,
        "riskFactors": error.risk_factors,
        "runtimeConfigVersion": error.policy.get("gateway_config_version") if error.policy else None,
        "labelSnapshotVersion": error.label_snapshot_version,
        "hardConstraints": _json_object(snapshot.get("hardConstraints")),
    }
    with connection() as current, current.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO security_policy_decision_logs (
              request_id, subject_id, api_resource_id, policy_id,
              requested_output_mode, effective_output_mode, decision_result,
              decision_reason_code, decision_reason, risk_score, risk_level,
              client_ip, query_days, requested_rows, returned_rows, response_status,
              response_bytes, duration_ms, applied_limits_json, requested_at, "createdAt", "updatedAt"
            ) VALUES (
              %(request_id)s, %(subject_id)s, %(api_id)s, %(policy_id)s,
              %(output_mode)s, %(output_mode)s, 'deny', %(reason_code)s,
              %(reason)s, %(risk_score)s, %(risk_level)s, %(client_ip)s,
              %(query_days)s, %(requested_rows)s, 0, %(response_status)s,
              0, %(duration_ms)s, %(evidence)s::jsonb, %(now)s, %(now)s, %(now)s
            ) ON CONFLICT (request_id) DO NOTHING RETURNING id
            """,
            {
                "request_id": error.request_id,
                "subject_id": error.subject.get("id") if error.subject else None,
                "api_id": error.api.get("id") if error.api else None,
                "policy_id": error.policy.get("id") if error.policy else None,
                "output_mode": error.policy.get("output_mode") if error.policy else None,
                "reason_code": error.code,
                "reason": error.message,
                "risk_score": error.risk_score,
                "risk_level": risk_level(error.risk_score),
                "client_ip": error.client_ip,
                "query_days": error.query_days,
                "requested_rows": error.requested_rows,
                "response_status": error.status,
                "duration_ms": max(0, duration_ms),
                "evidence": json.dumps(evidence, ensure_ascii=False),
                "now": now,
            },
        )
        row = cursor.fetchone()
        if row and error.risk_score >= 70:
            cursor.execute(
                """
                INSERT INTO security_risk_events (
                  event_code, risk_type, risk_score, risk_level, risk_reason,
                  action_taken, event_status, decision_log_id, "createdAt", "updatedAt"
                ) VALUES (
                  %(event_code)s, %(risk_type)s, %(risk_score)s, %(risk_level)s,
                  %(reason)s, 'deny', 'pending', %(decision_id)s, %(now)s, %(now)s
                ) ON CONFLICT (event_code) DO NOTHING
                """,
                {
                    "event_code": f"RISK-{error.request_id}",
                    "risk_type": error.code.lower(),
                    "risk_score": error.risk_score,
                    "risk_level": risk_level(error.risk_score),
                    "reason": error.message,
                    "decision_id": row["id"],
                    "now": now,
                },
            )


def runtime_summary() -> dict[str, Any]:
    row = fetch_one(
        """
        SELECT
          (SELECT count(*) FROM security_data_sources WHERE connection_status <> 'disabled') AS sources,
          (SELECT count(*) FROM security_api_resources WHERE api_status = 'enabled' AND publish_status = 'success') AS apis,
          (SELECT count(*) FROM eco_resource_security_policies WHERE policy_kind = 'access_policy' AND policy_status = 'enabled' AND publish_status = 'success') AS policies,
          (SELECT count(*) FROM security_access_subjects WHERE subject_status = 'enabled') AS subjects,
          (SELECT count(*) FROM security_policy_decision_logs) AS calls,
          (SELECT count(*) FROM security_risk_events WHERE event_status <> 'closed') AS risks
        """
    ) or {}
    return {key: int(value or 0) for key, value in row.items()}


def ensure_behavior_baseline_unique_index() -> None:
    duplicate = fetch_one(
        """
        SELECT subject_id, api_resource_id, count(*) AS duplicate_count
        FROM security_behavior_baselines
        GROUP BY subject_id, api_resource_id
        HAVING count(*) > 1
        LIMIT 1
        """
    )
    if duplicate:
        raise ValueError("存在重复的主体 + API 行为基线，请先合并历史数据")
    execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS security_behavior_baselines_subject_api_unique
        ON security_behavior_baselines (subject_id, api_resource_id)
        """
    )


def upsert_behavior_baseline(subject_id: int, api_id: int, values: dict[str, Any]) -> dict[str, Any]:
    ensure_behavior_baseline_unique_index()
    subject = fetch_one(
        "SELECT id, subject_code FROM security_access_subjects WHERE id=%(id)s LIMIT 1",
        {"id": subject_id},
    )
    api = fetch_one(
        "SELECT id, api_code FROM security_api_resources WHERE id=%(id)s LIMIT 1",
        {"id": api_id},
    )
    if not subject or not api:
        raise LookupError("访问主体或 API 不存在")

    def non_negative_number(name: str) -> float:
        value = values.get(name, 0)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)) or float(value) < 0:
            raise ValueError(f"{name} 必须是大于等于 0 的数值")
        return float(value)

    def required_time(name: str) -> datetime:
        value = str(values.get(name) or "").strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError as error:
            raise ValueError(f"{name} 格式不正确") from error
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

    sample_from = required_time("sample_from")
    sample_to = required_time("sample_to")
    if sample_to <= sample_from:
        raise ValueError("样本结束时间必须晚于开始时间")
    sample_count = values.get("sample_count", 0)
    if isinstance(sample_count, bool) or not isinstance(sample_count, int) or sample_count < 0:
        raise ValueError("sample_count 必须是大于等于 0 的整数")
    baseline_status = str(values.get("baseline_status") or "draft")
    if baseline_status not in {"draft", "enabled", "disabled"}:
        raise ValueError("行为基线状态不正确")

    now = datetime.now(timezone.utc)
    subject_token = re.sub(r"[^A-Za-z0-9_-]+", "-", str(subject["subject_code"])).strip("-")
    api_token = re.sub(r"[^A-Za-z0-9_-]+", "-", str(api["api_code"])).strip("-")
    baseline_code = f"BASE-{subject_token}-{api_token}"[:200]
    row = fetch_one(
        """
        INSERT INTO security_behavior_baselines (
          baseline_code, subject_id, api_resource_id, sample_from, sample_to,
          sample_count, frequency_avg, frequency_stddev, query_days_avg,
          query_days_stddev, rows_avg, rows_stddev, normal_time_ranges_json,
          failure_avg, baseline_version, baseline_status, generated_at,
          "createdAt", "updatedAt"
        ) VALUES (
          %(baseline_code)s, %(subject_id)s, %(api_id)s, %(sample_from)s, %(sample_to)s,
          %(sample_count)s, %(frequency_avg)s, %(frequency_stddev)s, %(query_days_avg)s,
          %(query_days_stddev)s, %(rows_avg)s, %(rows_stddev)s, '[]'::jsonb,
          %(failure_avg)s, 1, %(baseline_status)s, %(now)s, %(now)s, %(now)s
        )
        ON CONFLICT (subject_id, api_resource_id) DO UPDATE SET
          sample_from=EXCLUDED.sample_from, sample_to=EXCLUDED.sample_to,
          sample_count=EXCLUDED.sample_count, frequency_avg=EXCLUDED.frequency_avg,
          frequency_stddev=EXCLUDED.frequency_stddev, query_days_avg=EXCLUDED.query_days_avg,
          query_days_stddev=EXCLUDED.query_days_stddev, rows_avg=EXCLUDED.rows_avg,
          rows_stddev=EXCLUDED.rows_stddev, failure_avg=EXCLUDED.failure_avg,
          baseline_version=security_behavior_baselines.baseline_version + 1,
          baseline_status=EXCLUDED.baseline_status, generated_at=EXCLUDED.generated_at,
          "updatedAt"=EXCLUDED."updatedAt"
        RETURNING id, baseline_code, baseline_version, baseline_status, generated_at
        """,
        {
            "baseline_code": baseline_code,
            "subject_id": subject_id,
            "api_id": api_id,
            "sample_from": sample_from,
            "sample_to": sample_to,
            "sample_count": sample_count,
            "frequency_avg": non_negative_number("frequency_avg"),
            "frequency_stddev": non_negative_number("frequency_stddev"),
            "query_days_avg": non_negative_number("query_days_avg"),
            "query_days_stddev": non_negative_number("query_days_stddev"),
            "rows_avg": non_negative_number("rows_avg"),
            "rows_stddev": non_negative_number("rows_stddev"),
            "failure_avg": non_negative_number("failure_avg"),
            "baseline_status": baseline_status,
            "now": now,
        },
    )
    return row or {}


def validate_api(api: dict[str, Any]) -> list[str]:
    errors = []
    if not str(api.get("gateway_path") or "").startswith("/data-api/"):
        errors.append("发布路径必须以 /data-api/ 开头")
    if str(api.get("http_method") or "").upper() not in {"GET", "POST"}:
        errors.append("请求方法只支持 GET 或 POST")
    mode = str(api.get("access_mode") or "")
    if mode == "direct" and not str(api.get("upstream_url") or "").startswith(("http://", "https://")):
        errors.append("直接纳管模式必须配置有效上游地址")
    if mode in {"develop", "orchestrate"} and str(api.get("orchestrator_path") or "") not in {
        "",
        "/internal/active-power",
        "/internal/region-hourly",
        "/internal/resource-query",
    }:
        errors.append("处理路径未绑定可用的数据处理能力")
    if mode not in {"direct", "develop", "orchestrate"}:
        errors.append("接入模式不受支持")
    return errors


def publish_api(api_id: int) -> dict[str, Any]:
    api = fetch_one("SELECT * FROM security_api_resources WHERE id = %(id)s", {"id": api_id})
    if not api:
        raise LookupError("API 资源不存在")
    errors = validate_api(api)
    runtime_config = _json_object(api.get("runtime_config_json"))
    source_id = api.get("data_source_id")
    if str(api.get("access_mode") or "") in {"develop", "orchestrate"} and str(api.get("orchestrator_path") or "") not in {
        "/internal/active-power", "/internal/region-hourly",
    }:
        try:
            runtime_config, source_id = build_resource_runtime_config(api)
            api = {
                **api,
                "data_source_id": source_id,
                "orchestrator_path": "/internal/resource-query",
                "runtime_config_json": runtime_config,
            }
            verify_resource_runtime_config(api)
        except (ValueError, RuntimeDenied) as error:
            errors.append(str(error))
    now = datetime.now(timezone.utc)
    if errors:
        execute(
            "UPDATE security_api_resources SET publish_status='failed', publish_error=%(error)s, \"updatedAt\"=%(now)s WHERE id=%(id)s",
            {"id": api_id, "error": "；".join(errors), "now": now},
        )
        raise ValueError("；".join(errors))
    version = int(api.get("publish_version") or 0) + 1
    execute(
        """
        UPDATE security_api_resources
        SET api_status='enabled', publish_status='success', publish_version=%(version)s,
            published_at=%(now)s, publish_error=NULL, data_source_id=%(source_id)s,
            orchestrator_path=%(orchestrator_path)s, runtime_config_json=%(runtime_config)s::jsonb,
            "updatedAt"=%(now)s
        WHERE id=%(id)s
        """,
        {
            "id": api_id, "version": version, "now": now, "source_id": source_id,
            "orchestrator_path": api.get("orchestrator_path"),
            "runtime_config": json.dumps(runtime_config, ensure_ascii=False),
        },
    )
    return {"id": api_id, "publishStatus": "success", "publishVersion": version, "publishedAt": now.isoformat()}


def ensure_resource_api(resource_id: int) -> dict[str, Any]:
    resource = fetch_one("SELECT * FROM eco_data_resources WHERE id=%(id)s", {"id": resource_id})
    if not resource:
        raise LookupError("数据资源不存在")
    resource_code = str(resource.get("resource_code") or "").strip()
    resource_name = str(resource.get("resource_name") or "").strip()
    if not resource_code or not resource_name or not resource.get("data_source_id"):
        raise ValueError("请先完整维护资源编码、名称和数据源")
    token = re.sub(r"[^A-Za-z0-9_-]+", "-", resource_code).strip("-") or f"resource-{resource_id}"
    existing = fetch_one(
        "SELECT * FROM security_api_resources WHERE resource_id=%(resource_id)s ORDER BY id ASC LIMIT 1",
        {"resource_id": resource_id},
    )
    draft_api = {
        **(existing or {}),
        "resource_id": resource_id,
        "data_source_id": resource.get("data_source_id"),
        "runtime_config_json": {},
    }
    runtime_config, source_id = build_resource_runtime_config(draft_api)
    desired = {
        "api_code": f"API-{token}",
        "api_name": f"{resource_name}查询 API",
        "gateway_path": f"/data-api/resources/{token.lower()}",
        "data_source_id": source_id,
        "runtime_config_json": runtime_config,
        "protection_level": str(resource.get("protection_level") or "l2"),
        "supports_homomorphic": bool(existing and existing.get("supports_homomorphic"))
        or str(resource.get("protection_level") or "").lower() == "l3",
    }
    now = datetime.now(timezone.utc)
    if not existing:
        row = fetch_one(
            """
            INSERT INTO security_api_resources (
              api_code, api_name, access_mode, http_method, upstream_url, orchestrator_path,
              gateway_path, protection_level, supports_row_filter, supports_field_filter,
              supports_aggregate, supports_homomorphic, api_status, publish_version,
              publish_status, publish_error, resource_id, data_source_id, runtime_config_json,
              "createdAt", "updatedAt"
            ) VALUES (
              %(api_code)s, %(api_name)s, 'develop', 'GET', NULL, '/internal/resource-query',
              %(gateway_path)s, %(protection_level)s, true, true, false, %(supports_homomorphic)s, 'draft', 0,
              'unpublished', NULL, %(resource_id)s, %(data_source_id)s, %(runtime_config)s::jsonb,
              %(now)s, %(now)s
            ) RETURNING *
            """,
            {
                **desired,
                "resource_id": resource_id,
                "runtime_config": json.dumps(runtime_config, ensure_ascii=False),
                "now": now,
            },
        ) or {}
        return {"id": int(row["id"]), "created": True, "publishStatus": row.get("publish_status")}

    config_changed = _json_object(existing.get("runtime_config_json")) != runtime_config
    identity_changed = any(str(existing.get(key) or "") != str(desired[key]) for key in ("api_code", "api_name", "gateway_path", "data_source_id", "protection_level", "supports_homomorphic"))
    if config_changed or identity_changed:
        fetch_one(
            """
            UPDATE security_api_resources
            SET api_code=%(api_code)s, api_name=%(api_name)s, access_mode='develop', http_method='GET',
                upstream_url=NULL, orchestrator_path='/internal/resource-query', gateway_path=%(gateway_path)s,
                data_source_id=%(data_source_id)s, runtime_config_json=%(runtime_config)s::jsonb,
                protection_level=%(protection_level)s, supports_homomorphic=%(supports_homomorphic)s,
                api_status='draft', publish_status='unpublished', publish_error=NULL, "updatedAt"=%(now)s
            WHERE id=%(id)s
            RETURNING *
            """,
            {
                **desired,
                "id": existing["id"],
                "runtime_config": json.dumps(runtime_config, ensure_ascii=False),
                "now": now,
            },
        )
    return {
        "id": int(existing["id"]),
        "created": False,
        "publishStatus": "unpublished" if config_changed or identity_changed else existing.get("publish_status"),
    }


def unpublish_api(api_id: int) -> dict[str, Any]:
    row = fetch_one(
        """
        UPDATE security_api_resources
        SET api_status='disabled', publish_status='unpublished', publish_error=NULL, "updatedAt"=%(now)s
        WHERE id=%(id)s
        RETURNING id
        """,
        {"id": api_id, "now": datetime.now(timezone.utc)},
    )
    if not row:
        raise LookupError("API 资源不存在")
    return {"id": api_id, "publishStatus": "unpublished", "apiStatus": "disabled"}


def publish_policy(policy_id: int) -> dict[str, Any]:
    policy = fetch_one(
        """
        SELECT policy.*, subject.subject_status, subject.allowed_api_codes_json,
               api.api_code, api.api_status, api.publish_status AS api_publish_status
        FROM eco_resource_security_policies policy
        LEFT JOIN security_access_subjects subject ON subject.id = policy.subject_id
        LEFT JOIN security_api_resources api ON api.id = policy.api_resource_id
        WHERE policy.id = %(id)s AND policy.policy_kind = 'access_policy'
        """,
        {"id": policy_id},
    )
    if not policy:
        raise LookupError("访问策略不存在")
    grouped_scope = str(policy.get("access_scope") or "resource") == "label_group"
    errors = []
    for field, label in [
        ("policy_code", "策略编码"),
        ("scenario", "使用场景"),
        ("subject_id", "访问主体"),
        ("output_mode", "输出模式"),
    ]:
        if not policy.get(field):
            errors.append(f"{label}不能为空")
    if not grouped_scope:
        if not policy.get("resource_id"):
            errors.append("数据资源不能为空")
        if not policy.get("api_resource_id"):
            errors.append("API 资源不能为空")
    if policy.get("subject_status") != "enabled":
        errors.append("访问主体未启用")
    if not grouped_scope and (policy.get("api_status") != "enabled" or policy.get("api_publish_status") != "success"):
        errors.append("API 资源尚未发布")
    allowed_api_codes = {str(item).strip().upper() for item in _json_list(policy.get("allowed_api_codes_json"))}
    if not allowed_api_codes:
        errors.append("访问主体的 API 授权清单不能为空")
    elif not grouped_scope and "*" not in allowed_api_codes and str(policy.get("api_code") or "").strip().upper() not in allowed_api_codes:
        errors.append("访问主体尚未在 API 授权清单中包含当前 API")
    selector = policy_label_selector(policy) if grouped_scope else {}
    if grouped_scope and not any(policy_selector_conditions(selector)):
        errors.append("标签组合策略至少需要一个分类、分级、防护层或标签条件")
    if int(policy.get("max_requests_per_minute") or 0) <= 0:
        errors.append("每分钟请求上限必须大于 0")
    if not 1 <= int(policy.get("max_query_days") or 0) <= 31:
        errors.append("最大查询天数必须在 1 到 31 之间")
    if not 1 <= int(policy.get("max_rows") or 0) <= 100000:
        errors.append("最大返回行数必须在 1 到 100000 之间")
    if not 1 <= int(policy.get("risk_threshold") or 0) <= 100:
        errors.append("风险阈值必须在 1 到 100 之间")
    rules = _json_object(policy.get("abnormal_access_rules_json"))
    for rule_name in DEFAULT_ABNORMAL_ACCESS_RULES:
        rule = rules.get(rule_name)
        if rule is None:
            continue
        if not isinstance(rule, dict) or str(rule.get("action") or "") not in {"deny", "risk", "allow"}:
            errors.append(f"异常访问规则 {rule_name} 的 action 必须是 deny、risk 或 allow")
            continue
        if "enabled" in rule and not isinstance(rule.get("enabled"), bool):
            errors.append(f"异常访问规则 {rule_name} 的 enabled 必须是布尔值")
        if "riskScore" in rule:
            risk_score = rule.get("riskScore")
            if (
                isinstance(risk_score, bool)
                or not isinstance(risk_score, (int, float))
                or not math.isfinite(float(risk_score))
                or not 0 <= float(risk_score) <= 100
            ):
                errors.append(f"异常访问规则 {rule_name} 的 riskScore 必须在 0 到 100 之间")
    now = datetime.now(timezone.utc)
    if errors:
        execute(
            "UPDATE eco_resource_security_policies SET publish_status='failed', publish_error=%(error)s, \"updatedAt\"=%(now)s WHERE id=%(id)s",
            {"id": policy_id, "error": "；".join(errors), "now": now},
        )
        raise ValueError("；".join(errors))
    version = int(policy.get("policy_version") or 0) + 1
    config_version = f"runtime-v{version}-{now.strftime('%Y%m%d%H%M%S')}"
    if grouped_scope:
        selected_tags = set(_normalized_tags(selector.get("resourceTags")))
        selected_levels = {str(item).lower() for item in _json_list(selector.get("protectionLevels"))}
        constraints = {
            "aggregateOnly": "l1" in selected_levels or "仅聚合" in selected_tags,
            "encryptedOnly": "l3" in selected_levels or "仅密态" in selected_tags,
            "exportForbidden": "禁止导出" in selected_tags,
            "maskedFields": [],
        }
        snapshot = {
            "version": config_version,
            "scope": "label_group",
            "selector": selector,
            "matchedLabels": list(selector.get("resourceTags") or []),
            "hardConstraints": constraints,
        }
    else:
        snapshot = build_policy_runtime_snapshot(policy, config_version)
        constraints = _json_object(snapshot.get("hardConstraints"))
    output_mode = str(policy.get("output_mode") or "detail")
    if constraints.get("aggregateOnly") and output_mode != "aggregate":
        errors.append("当前数据资源标签要求访问策略仅输出聚合结果")
    if constraints.get("encryptedOnly") and output_mode != "encrypted":
        errors.append("当前数据资源标签要求访问策略仅输出密态结果")
    if errors:
        execute(
            "UPDATE eco_resource_security_policies SET publish_status='failed', publish_error=%(error)s, \"updatedAt\"=%(now)s WHERE id=%(id)s",
            {"id": policy_id, "error": "；".join(errors), "now": now},
        )
        raise ValueError("；".join(errors))
    policy_detail = _json_object(policy.get("policy_detail_json"))
    policy_detail["runtimeSnapshot"] = snapshot
    execute(
        """
        UPDATE eco_resource_security_policies
        SET policy_status='enabled', publish_status='success', policy_version=%(version)s,
            gateway_config_version=%(config_version)s, published_at=%(now)s,
            policy_detail_json=%(policy_detail)s::jsonb,
            publish_error=NULL, "updatedAt"=%(now)s
        WHERE id=%(id)s
        """,
        {
            "id": policy_id,
            "version": version,
            "config_version": config_version,
            "policy_detail": json.dumps(policy_detail, ensure_ascii=False),
            "now": now,
        },
    )
    return {
        "id": policy_id,
        "publishStatus": "success",
        "policyVersion": version,
        "runtimeConfigVersion": config_version,
        "labelSnapshotVersion": config_version,
        "matchedLabels": snapshot.get("matchedLabels", []),
        "publishedAt": now.isoformat(),
    }
