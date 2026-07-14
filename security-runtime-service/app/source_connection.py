from __future__ import annotations

from typing import Any

import psycopg
import pymysql


def _dialect(source: dict[str, Any]) -> str:
    options = source.get("connection_options_json") or {}
    if not isinstance(options, dict):
        options = {}
    dialect = str(options.get("dialect") or "postgresql").strip().lower()
    if dialect not in {"postgresql", "mysql"}:
        raise ValueError("不支持的数据库类型")
    return dialect


def check_database_connection(
    source: dict[str, Any],
    password: str,
    timeout_seconds: int,
) -> None:
    dialect = _dialect(source)
    security_config = source.get("security_config_json") or {}
    encryption_required = bool(
        security_config.get("encryptionEnabled", False)
        if isinstance(security_config, dict)
        else False
    )
    parameters = {
        "host": str(source.get("host") or "").strip(),
        "port": int(source.get("port") or (3306 if dialect == "mysql" else 5432)),
        "user": str(source.get("username") or "").strip(),
        "password": password,
    }
    database_name = str(source.get("database_name") or "").strip()
    if not parameters["host"] or not parameters["user"] or not database_name:
        raise ValueError("数据库连接信息不完整")

    try:
        if dialect == "mysql":
            mysql_options: dict[str, Any] = {}
            if encryption_required:
                mysql_options["ssl"] = {"check_hostname": False}
            current = pymysql.connect(
                **parameters,
                database=database_name,
                connect_timeout=timeout_seconds,
                read_timeout=timeout_seconds,
                write_timeout=timeout_seconds,
                charset="utf8mb4",
                autocommit=True,
                **mysql_options,
            )
            try:
                with current.cursor() as cursor:
                    cursor.execute("SELECT 1")
                    cursor.fetchone()
                    if encryption_required:
                        cursor.execute("SHOW STATUS LIKE 'Ssl_cipher'")
                        ssl_status = cursor.fetchone()
                        if not ssl_status or not ssl_status[1]:
                            raise ValueError("数据库未建立加密传输连接")
            finally:
                current.close()
            return

        with psycopg.connect(
            **parameters,
            dbname=database_name,
            connect_timeout=timeout_seconds,
            sslmode="require" if encryption_required else "prefer",
        ) as current, current.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except (psycopg.Error, pymysql.MySQLError, OSError) as error:
        message = str(error).splitlines()[0][:180]
        raise ValueError(message or "数据库连接检查失败") from error
