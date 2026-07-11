from __future__ import annotations

import logging
from math import isfinite
from threading import Lock
from time import perf_counter
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, model_validator

from .crypto import (
    OPENFHE_VERSION,
    CryptoValidationError,
    execute_encrypted_aggregation,
)

logger = logging.getLogger("openfhe-adapter")
execution_lock = Lock()

NumericValue = StrictInt | StrictFloat


class ExecuteTaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    taskCode: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]+$")
    scheme: Literal["BFV", "CKKS"]
    operation: Literal["sum", "mean"]
    values: list[NumericValue] = Field(min_length=1, max_length=64)

    @model_validator(mode="after")
    def validate_compute_values(self):
        if any(isinstance(value, bool) or not isfinite(float(value)) for value in self.values):
            raise ValueError("计算值必须是有限数值")
        if self.scheme == "BFV":
            if any(not isinstance(value, int) for value in self.values):
                raise ValueError("BFV 仅支持整数输入")
            if any(abs(value) > 10000 for value in self.values):
                raise ValueError("BFV 单个输入值不能超过 10000")
            if abs(sum(self.values)) > 30000:
                raise ValueError("BFV 输入聚合值不能超过 30000")
            if self.operation == "mean" and sum(self.values) % len(self.values) != 0:
                raise ValueError("BFV 均值仅支持可整除的整数输入")
        elif any(abs(float(value)) > 1_000_000 for value in self.values):
            raise ValueError("CKKS 单个输入值不能超过 1000000")
        return self


app = FastAPI(
    title="OpenFHE 量测数据同态加密适配服务",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, error: RequestValidationError):
    details = []
    for item in error.errors():
        location = ".".join(str(part) for part in item.get("loc", ()) if part != "body")
        details.append({"field": location or "request", "message": item.get("msg", "参数无效")})
    return JSONResponse(
        status_code=422,
        content={"message": "执行参数校验失败", "errors": details},
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": OPENFHE_VERSION,
        "algorithms": ["BFV", "CKKS"],
        "operations": ["sum", "mean"],
    }


@app.post("/v1/tasks/execute")
def execute_task(request: ExecuteTaskRequest):
    request_id = str(uuid4())
    if not execution_lock.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="OpenFHE 引擎正在执行其他任务")

    started_at = perf_counter()
    try:
        result = execute_encrypted_aggregation(request.scheme, request.operation, request.values)
        duration_ms = round((perf_counter() - started_at) * 1000)
        logger.info(
            "OpenFHE task completed request_id=%s task_code=%s scheme=%s operation=%s duration_ms=%s",
            request_id,
            request.taskCode,
            request.scheme,
            request.operation,
            duration_ms,
        )
        return {
            "requestId": request_id,
            "status": "completed",
            "taskCode": request.taskCode,
            "scheme": request.scheme,
            "operation": request.operation,
            "resultSummary": {
                "value": result.value,
                "verificationPassed": result.verification_passed,
                "absoluteError": result.absolute_error,
                "tolerance": result.tolerance,
            },
            "engineVersion": OPENFHE_VERSION,
            "durationMs": duration_ms,
            "ringDimension": result.ring_dimension,
            "ciphertextCount": result.ciphertext_count,
        }
    except CryptoValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("OpenFHE task failed request_id=%s task_code=%s", request_id, request.taskCode)
        raise HTTPException(status_code=500, detail="OpenFHE 密文计算失败") from error
    finally:
        execution_lock.release()
