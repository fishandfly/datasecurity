from __future__ import annotations

from dataclasses import dataclass
from importlib.metadata import version
from math import fsum
from typing import Literal, Sequence

from openfhe import (
    CCParamsBFVRNS,
    CCParamsCKKSRNS,
    GenCryptoContext,
    PKESchemeFeature,
)

OPENFHE_VERSION = version("openfhe")
BFV_PLAINTEXT_MODULUS = 65537


class CryptoValidationError(ValueError):
    pass


@dataclass(frozen=True)
class CryptoResult:
    value: int | float
    expected_value: int | float
    absolute_error: float
    tolerance: float
    verification_passed: bool
    ring_dimension: int
    ciphertext_count: int


def _enable_minimum_features(context) -> None:
    context.Enable(PKESchemeFeature.PKE)
    context.Enable(PKESchemeFeature.KEYSWITCH)
    context.Enable(PKESchemeFeature.LEVELEDSHE)


def _encrypted_sum(context, public_key, plaintexts):
    ciphertexts = [context.Encrypt(public_key, plaintext) for plaintext in plaintexts]
    aggregate = ciphertexts[0]
    for ciphertext in ciphertexts[1:]:
        aggregate = context.EvalAdd(aggregate, ciphertext)
    return aggregate, len(ciphertexts)


def _calculate_bfv(values: Sequence[int], operation: Literal["sum", "mean"]) -> CryptoResult:
    total = sum(values)
    if abs(total) > 30000:
        raise CryptoValidationError("BFV 输入聚合值超出安全明文模数范围")
    if operation == "mean" and total % len(values) != 0:
        raise CryptoValidationError("BFV 均值仅支持可整除的整数输入")

    parameters = CCParamsBFVRNS()
    parameters.SetPlaintextModulus(BFV_PLAINTEXT_MODULUS)
    parameters.SetMultiplicativeDepth(1)
    context = GenCryptoContext(parameters)
    _enable_minimum_features(context)
    keys = context.KeyGen()

    plaintexts = [context.MakePackedPlaintext([value]) for value in values]
    result_ciphertext, ciphertext_count = _encrypted_sum(context, keys.publicKey, plaintexts)
    if operation == "mean":
        modular_inverse = pow(len(values), -1, BFV_PLAINTEXT_MODULUS)
        inverse_plaintext = context.MakePackedPlaintext([modular_inverse])
        result_ciphertext = context.EvalMult(result_ciphertext, inverse_plaintext)

    decrypted = context.Decrypt(result_ciphertext, keys.secretKey)
    decrypted.SetLength(1)
    actual = int(decrypted.GetPackedValue()[0])
    expected = total if operation == "sum" else total // len(values)
    error = float(abs(actual - expected))
    return CryptoResult(
        value=actual,
        expected_value=expected,
        absolute_error=error,
        tolerance=0.0,
        verification_passed=error == 0,
        ring_dimension=int(context.GetRingDimension()),
        ciphertext_count=ciphertext_count,
    )


def _calculate_ckks(values: Sequence[float], operation: Literal["sum", "mean"]) -> CryptoResult:
    parameters = CCParamsCKKSRNS()
    parameters.SetMultiplicativeDepth(1)
    parameters.SetScalingModSize(50)
    parameters.SetBatchSize(8)
    context = GenCryptoContext(parameters)
    _enable_minimum_features(context)
    keys = context.KeyGen()

    plaintexts = [context.MakeCKKSPackedPlaintext([value]) for value in values]
    result_ciphertext, ciphertext_count = _encrypted_sum(context, keys.publicKey, plaintexts)
    if operation == "mean":
        result_ciphertext = context.EvalMult(result_ciphertext, 1.0 / len(values))

    decrypted = context.Decrypt(result_ciphertext, keys.secretKey)
    decrypted.SetLength(1)
    actual = float(decrypted.GetRealPackedValue()[0])
    expected_sum = fsum(values)
    expected = expected_sum if operation == "sum" else expected_sum / len(values)
    error = abs(actual - expected)
    tolerance = max(1e-7, abs(expected) * 1e-6)
    return CryptoResult(
        value=round(actual, 10),
        expected_value=round(expected, 10),
        absolute_error=error,
        tolerance=tolerance,
        verification_passed=error <= tolerance,
        ring_dimension=int(context.GetRingDimension()),
        ciphertext_count=ciphertext_count,
    )


def execute_encrypted_aggregation(
    scheme: Literal["BFV", "CKKS"],
    operation: Literal["sum", "mean"],
    values: Sequence[int | float],
) -> CryptoResult:
    if scheme == "BFV":
        return _calculate_bfv([int(value) for value in values], operation)
    return _calculate_ckks([float(value) for value in values], operation)
