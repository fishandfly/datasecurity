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


def test_validation_response_does_not_echo_plaintext_values():
    response = client.post(
        "/v1/tasks/execute",
        json={"taskCode": "HE-BFV-INVALID", "scheme": "BFV", "operation": "sum", "values": [12.5]},
    )
    assert response.status_code == 422
    assert "12.5" not in response.text
