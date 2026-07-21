import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_declares_only_supported_schemes():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["algorithms"] == ["BFV", "CKKS"]
    assert response.json()["operations"] == ["sum", "mean"]


def test_bfv_sum_executes_on_ciphertexts():
    response = client.post(
        "/v1/tasks/execute",
        json={"taskCode": "HE-BFV-TEST", "scheme": "BFV", "operation": "sum", "values": [128, 256, 384]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["resultSummary"]["value"] == 768
    assert payload["resultSummary"]["verificationPassed"] is True
    assert payload["ciphertextCount"] == 3
    assert "values" not in payload


def test_bfv_mean_is_exact_for_divisible_integers():
    response = client.post(
        "/v1/tasks/execute",
        json={"taskCode": "HE-BFV-MEAN", "scheme": "BFV", "operation": "mean", "values": [12, 24, 36]},
    )
    assert response.status_code == 200
    assert response.json()["resultSummary"]["value"] == 24


def test_bfv_sum_preserves_negative_values_exactly():
    response = client.post(
        "/v1/tasks/execute",
        json={"taskCode": "HE-BFV-NEGATIVE", "scheme": "BFV", "operation": "sum", "values": [-300, 125, 75]},
    )
    assert response.status_code == 200
    summary = response.json()["resultSummary"]
    assert summary["value"] == -100
    assert summary["absoluteError"] == 0
    assert summary["verificationPassed"] is True


def test_ckks_mean_returns_verified_approximation():
    response = client.post(
        "/v1/tasks/execute",
        json={"taskCode": "HE-CKKS-TEST", "scheme": "CKKS", "operation": "mean", "values": [31.25, 32.5, 33.75, 34.0]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert abs(payload["resultSummary"]["value"] - 32.875) < 0.0001
    assert payload["resultSummary"]["verificationPassed"] is True
    assert "values" not in payload


def test_ckks_sum_supports_mixed_sign_decimal_values():
    response = client.post(
        "/v1/tasks/execute",
        json={"taskCode": "HE-CKKS-MIXED", "scheme": "CKKS", "operation": "sum", "values": [-12.75, 4.5, 20.125]},
    )
    assert response.status_code == 200
    summary = response.json()["resultSummary"]
    assert abs(summary["value"] - 11.875) <= summary["tolerance"]
    assert summary["absoluteError"] <= summary["tolerance"]
    assert summary["verificationPassed"] is True


def test_maximum_sample_count_is_accepted():
    values = [1] * 64
    response = client.post(
        "/v1/tasks/execute",
        json={"taskCode": "HE-BFV-MAX-SAMPLES", "scheme": "BFV", "operation": "sum", "values": values},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["resultSummary"]["value"] == 64
    assert payload["ciphertextCount"] == 64
    assert "values" not in payload


@pytest.mark.parametrize(
    ("task_code", "values"),
    [
        ("HE-BFV-EMPTY", []),
        ("HE-BFV-TOO-MANY", [1] * 65),
        ("HE-BFV-BOOLEAN", [True, 2]),
        ("HE-BFV-FRACTION", [1.25, 2]),
        ("HE-BFV-SINGLE-LIMIT", [10001]),
        ("HE-BFV-TOTAL-LIMIT", [10000, 10000, 10000, 1]),
    ],
)
def test_bfv_rejects_invalid_value_boundaries(task_code, values):
    response = client.post(
        "/v1/tasks/execute",
        json={"taskCode": task_code, "scheme": "BFV", "operation": "sum", "values": values},
    )
    assert response.status_code == 422
    assert response.json()["message"] == "执行参数校验失败"


def test_bfv_rejects_non_divisible_integer_mean():
    response = client.post(
        "/v1/tasks/execute",
        json={"taskCode": "HE-BFV-NON-DIVISIBLE", "scheme": "BFV", "operation": "mean", "values": [1, 2]},
    )
    assert response.status_code == 422
    assert "1, 2" not in response.text


@pytest.mark.parametrize(
    "request_body",
    [
        {"taskCode": "invalid code", "scheme": "BFV", "operation": "sum", "values": [1]},
        {"taskCode": "HE-UNKNOWN-SCHEME", "scheme": "UNKNOWN", "operation": "sum", "values": [1]},
        {"taskCode": "HE-UNKNOWN-OP", "scheme": "CKKS", "operation": "median", "values": [1.0]},
        {"taskCode": "HE-EXTRA-FIELD", "scheme": "BFV", "operation": "sum", "values": [1], "privateKey": "forbidden"},
    ],
)
def test_request_contract_rejects_invalid_identifiers_and_unknown_fields(request_body):
    response = client.post("/v1/tasks/execute", json=request_body)
    assert response.status_code == 422
    assert response.json()["message"] == "执行参数校验失败"


def test_validation_response_does_not_echo_plaintext_values():
    response = client.post(
        "/v1/tasks/execute",
        json={"taskCode": "HE-BFV-INVALID", "scheme": "BFV", "operation": "sum", "values": [12.5]},
    )
    assert response.status_code == 422
    assert "12.5" not in response.text


def test_validation_response_does_not_echo_sensitive_extra_field_value():
    response = client.post(
        "/v1/tasks/execute",
        json={
            "taskCode": "HE-BFV-EXTRA-SECRET",
            "scheme": "BFV",
            "operation": "sum",
            "values": [1],
            "privateKey": "sensitive-key-material",
        },
    )
    assert response.status_code == 422
    assert "sensitive-key-material" not in response.text
