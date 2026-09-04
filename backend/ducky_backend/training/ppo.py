import numpy as np
from typing import Callable
import logging

logger = logging.getLogger(__name__)


class PPO:
    """Minimal PPO implementation for policy training."""

    def __init__(
        self,
        obs_dim: int,
        act_dim: int,
        hidden_dim: int = 64,
        lr: float = 3e-4,
        gamma: float = 0.99,
        gae_lambda: float = 0.95,
        clip_ratio: float = 0.2,
        train_pi_iters: int = 80,
        train_v_iters: int = 80,
        target_kl: float = 0.01,
    ):
        self.obs_dim = obs_dim
        self.act_dim = act_dim
        self.hidden_dim = hidden_dim
        self.lr = lr
        self.gamma = gamma
        self.gae_lambda = gae_lambda
        self.clip_ratio = clip_ratio
        self.train_pi_iters = train_pi_iters
        self.train_v_iters = train_v_iters
        self.target_kl = target_kl

        # Initialize policy network (MLP)
        self.policy_layers = [
            {"W": self._init_weights(obs_dim, hidden_dim), "b": np.zeros(hidden_dim), "act": "tanh"},
            {"W": self._init_weights(hidden_dim, hidden_dim), "b": np.zeros(hidden_dim), "act": "tanh"},
            {"W": self._init_weights(hidden_dim, act_dim), "b": np.zeros(act_dim), "act": "linear"},
        ]

        # Initialize value network (MLP)
        self.value_layers = [
            {"W": self._init_weights(obs_dim, hidden_dim), "b": np.zeros(hidden_dim), "act": "tanh"},
            {"W": self._init_weights(hidden_dim, 1), "b": np.zeros(1), "act": "linear"},
        ]

    def _init_weights(self, fan_in: int, fan_out: int) -> np.ndarray:
        """Initialize weights with Xavier initialization."""
        scale = np.sqrt(2.0 / (fan_in + fan_out))
        return np.random.randn(fan_out, fan_in).astype(np.float32) * scale

    def _forward(self, x: np.ndarray, layers: list) -> np.ndarray:
        """Forward pass through network."""
        for layer in layers:
            W = layer["W"]
            b = layer["b"]
            x = W @ x + b

            if layer["act"] == "tanh":
                x = np.tanh(x)
            elif layer["act"] == "relu":
                x = np.maximum(0, x)
            # linear: no activation

        return x

    def act(self, obs: np.ndarray) -> tuple[np.ndarray, float]:
        """Sample action from policy."""
        logits = self._forward(obs, self.policy_layers)
        # Use tanh squashing for continuous actions
        action = np.tanh(logits)

        # Compute log probability (simplified)
        log_prob = -0.5 * np.sum(logits**2) - 0.5 * logits.shape[0] * np.log(2 * np.pi)

        return action.astype(np.float32), float(log_prob)

    def get_value(self, obs: np.ndarray) -> float:
        """Get value estimate for observation."""
        value = self._forward(obs, self.value_layers)
        return float(value[0])

    def compute_gae(
        self, rewards: list[float], values: list[float], dones: list[bool], last_value: float
    ) -> tuple[np.ndarray, np.ndarray]:
        """Compute GAE advantages and returns."""
        T = len(rewards)
        advantages = np.zeros(T, dtype=np.float32)
        last_gae_lam = 0

        for t in reversed(range(T)):
            if t == T - 1:
                next_value = last_value
            else:
                next_value = values[t + 1]

            next_non_terminal = 1.0 - float(dones[t])
            delta = rewards[t] + self.gamma * next_value * next_non_terminal - values[t]
            advantages[t] = last_gae_lam = delta + self.gamma * self.gae_lambda * next_non_terminal * last_gae_lam

        returns = advantages + np.array(values, dtype=np.float32)
        return advantages, returns

    def update(
        self,
        obs_batch: np.ndarray,
        act_batch: np.ndarray,
        adv_batch: np.ndarray,
        ret_batch: np.ndarray,
        logp_batch: np.ndarray,
        progress_callback: Callable[[dict], None] | None = None,
    ) -> dict:
        """Update policy and value networks."""
        # Simplified PPO update (no actual gradient computation)
        # In a real implementation, this would use PyTorch or TensorFlow

        # For now, just return placeholder metrics
        kl = 0.0
        entropy = np.log(2 * np.pi * np.e) * self.act_dim / 2

        if progress_callback:
            progress_callback({"kl": kl, "entropy": entropy})

        return {
            "kl": kl,
            "entropy": entropy,
            "policy_loss": 0.0,
            "value_loss": 0.0,
        }

    def get_policy_dict(self, obs_mean: np.ndarray, obs_std: np.ndarray) -> dict:
        """Export policy as JSON-serializable dict."""
        return {
            "schemaVersion": 1,
            "specHash": "placeholder",
            "obsDim": self.obs_dim,
            "actDim": self.act_dim,
            "obsNorm": {"mean": obs_mean.tolist(), "std": obs_std.tolist()},
            "actScale": [1.0] * self.act_dim,
            "layers": [
                {"W": layer["W"].flatten().tolist(), "b": layer["b"].tolist(), "act": layer["act"]}
                for layer in self.policy_layers
            ],
            "metadata": {"trained_with": "ppo_numpy", "version": "0.1.0"},
        }
