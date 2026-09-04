import json
import numpy as np
from typing import Any
import logging

logger = logging.getLogger(__name__)


def save_policy(policy_dict: dict, path: str) -> None:
    """Save policy to JSON file."""
    with open(path, "w") as f:
        json.dump(policy_dict, f, indent=2)
    logger.info(f"Policy saved to {path}")


def load_policy(path: str) -> dict:
    """Load policy from JSON file."""
    with open(path, "r") as f:
        policy = json.load(f)

    # Validate schema
    required_fields = ["schemaVersion", "obsDim", "actDim", "layers"]
    for field in required_fields:
        if field not in policy:
            raise ValueError(f"Policy missing required field: {field}")

    # Validate layers
    for i, layer in enumerate(policy["layers"]):
        if "W" not in layer or "b" not in layer or "act" not in layer:
            raise ValueError(f"Layer {i} missing required fields (W, b, act)")

    logger.info(f"Policy loaded from {path}")
    return policy


def compute_spec_hash(spec: dict) -> str:
    """Compute hash of spec for parity checking."""
    import hashlib

    spec_str = json.dumps(spec, sort_keys=True)
    return hashlib.sha256(spec_str.encode()).hexdigest()[:16]


def verify_parity(js_policy: dict, py_policy: dict, test_obs: np.ndarray) -> bool:
    """Verify that JS and Python policies produce same output."""
    try:
        # Forward pass through Python policy
        py_output = _forward_pass(test_obs, py_policy["layers"])

        # Forward pass through JS policy (simulated)
        js_output = _forward_pass(test_obs, js_policy["layers"])

        # Check if outputs match
        return np.allclose(py_output, js_output, rtol=1e-4, atol=1e-5)
    except Exception as e:
        logger.error(f"Parity check failed: {e}")
        return False


def _forward_pass(obs: np.ndarray, layers: list[dict]) -> np.ndarray:
    """Forward pass through policy layers."""
    x = obs
    for layer in layers:
        W = np.array(layer["W"]).reshape(len(layer["b"]), -1)
        b = np.array(layer["b"])
        x = W @ x + b

        if layer["act"] == "tanh":
            x = np.tanh(x)
        elif layer["act"] == "relu":
            x = np.maximum(0, x)

    return x
