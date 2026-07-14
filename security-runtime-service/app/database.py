from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row

from .settings import settings


@contextmanager
def connection(
    database_url: str | None = None,
    parameters: dict[str, Any] | None = None,
) -> Iterator[psycopg.Connection]:
    connect_options = {
        "row_factory": dict_row,
        "connect_timeout": settings.connection_timeout_seconds,
    }
    if parameters:
        current_connection = psycopg.connect(**parameters, **connect_options)
    else:
        current_connection = psycopg.connect(
            database_url or settings.database_url,
            **connect_options,
        )
    with current_connection as current:
        yield current


def fetch_one(sql: str, parameters: dict[str, Any] | None = None) -> dict[str, Any] | None:
    with connection() as current, current.cursor() as cursor:
        cursor.execute(sql, parameters or {})
        row = cursor.fetchone()
        return dict(row) if row else None


def fetch_all(sql: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with connection() as current, current.cursor() as cursor:
        cursor.execute(sql, parameters or {})
        return [dict(row) for row in cursor.fetchall()]


def execute(sql: str, parameters: dict[str, Any] | None = None) -> int:
    with connection() as current, current.cursor() as cursor:
        cursor.execute(sql, parameters or {})
        return cursor.rowcount
