#!/usr/bin/env python3
"""Regression tests for the explicit recovery-only activation guard."""

import json
import subprocess
import unittest
from pathlib import Path


VALIDATOR = Path(__file__).with_name("validate-staging-recovery-activation.py")
SAFE_OPERATIONS = {
    "pendingRegistrations": 1,
    "reconciliationRequired": 0,
    "activeProvisioningLocks": 0,
    "activeFinalizationLocks": 0,
}
SAFE_RECOVERY = {
    "pendingRegistrations": 1,
    "recoverablePendingRegistrations": 1,
    "unsafePendingRegistrations": 0,
}


def run_validator(operations: object, recovery: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(VALIDATOR), json.dumps(operations), json.dumps(recovery)],
        check=False,
        capture_output=True,
        text=True,
    )


class RecoveryActivationValidatorTests(unittest.TestCase):
    def test_accepts_exactly_one_recoverable_record(self) -> None:
        result = run_validator(SAFE_OPERATIONS, SAFE_RECOVERY)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_missing_zero_or_multiple_pending_records(self) -> None:
        for value in (None, 0, 2, "1", True):
            with self.subTest(value=value):
                operations = {**SAFE_OPERATIONS, "pendingRegistrations": value}
                self.assertNotEqual(run_validator(operations, SAFE_RECOVERY).returncode, 0)

    def test_rejects_any_operation_safety_condition(self) -> None:
        for key in ("reconciliationRequired", "activeProvisioningLocks", "activeFinalizationLocks"):
            with self.subTest(key=key):
                operations = {**SAFE_OPERATIONS, key: 1}
                self.assertNotEqual(run_validator(operations, SAFE_RECOVERY).returncode, 0)

    def test_rejects_unsafe_or_inconsistent_recovery_classification(self) -> None:
        cases = [
            {**SAFE_RECOVERY, "pendingRegistrations": 0},
            {**SAFE_RECOVERY, "pendingRegistrations": 2},
            {**SAFE_RECOVERY, "recoverablePendingRegistrations": 0},
            {**SAFE_RECOVERY, "recoverablePendingRegistrations": 2},
            {**SAFE_RECOVERY, "unsafePendingRegistrations": 1},
        ]
        for recovery in cases:
            with self.subTest(recovery=recovery):
                self.assertNotEqual(run_validator(SAFE_OPERATIONS, recovery).returncode, 0)

    def test_rejects_malformed_payloads(self) -> None:
        result = subprocess.run(
            ["python3", str(VALIDATOR), "not-json", json.dumps(SAFE_RECOVERY)],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertNotEqual(run_validator([], SAFE_RECOVERY).returncode, 0)


if __name__ == "__main__":
    unittest.main()
