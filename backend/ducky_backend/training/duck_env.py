import numpy as np
from typing import Optional
import json


class DuckEnv:
    """Gym-compatible environment for MicroDuck training."""

    def __init__(self, spec_path: str = "specs/duck_spec.json"):
        with open(spec_path, "r") as f:
            self.spec = json.load(f)

        self.obs_dim = self.spec["obs_dim"]
        self.act_dim = self.spec["act_dim"]
        self.dt = 1.0 / 240.0
        self.max_episode_length = 1000

        self.reset()

    def reset(self, seed: Optional[int] = None) -> np.ndarray:
        """Reset environment and return initial observation."""
        self.step_count = 0
        self.robot_pos = np.array([0.0, 0.5, 0.0])
        self.robot_vel = np.array([0.0, 0.0, 0.0])
        self.robot_ang_vel = np.array([0.0, 0.0, 0.0])
        self.joint_angles = np.zeros(6)
        self.joint_velocities = np.zeros(6)
        self.last_action = np.zeros(self.act_dim)

        return self._get_observation()

    def _get_observation(self) -> np.ndarray:
        """Construct observation vector."""
        obs = np.zeros(self.obs_dim, dtype=np.float32)

        # Angular velocity (3)
        obs[0:3] = self.robot_ang_vel

        # Projected gravity (3) - simplified
        obs[3:6] = np.array([0.0, 0.0, -1.0])

        # Joint positions (6)
        obs[6:12] = self.joint_angles

        # Joint velocities (6)
        obs[12:18] = self.joint_velocities

        # Last action (act_dim)
        obs[18 : 18 + self.act_dim] = self.last_action

        return obs

    def step(self, action: np.ndarray) -> tuple[np.ndarray, float, bool, dict]:
        """Take a step in the environment."""
        action = np.clip(action, -1.0, 1.0)
        self.last_action = action.copy()

        # Simplified dynamics (no full physics simulation)
        # In a real implementation, this would use PyBullet or similar
        self.step_count += 1

        # Update joint angles based on actions (simplified)
        self.joint_velocities = action * 0.1
        self.joint_angles += self.joint_velocities * self.dt

        # Update position (simplified forward motion)
        forward_vel = np.mean(action) * 0.5
        self.robot_pos[0] += forward_vel * self.dt

        # Compute reward
        reward = self._compute_reward()

        # Check if episode is done
        done = self.step_count >= self.max_episode_length or self.robot_pos[1] < 0.1

        info = {
            "position": self.robot_pos.copy(),
            "velocity": self.robot_vel.copy(),
            "step_count": self.step_count,
        }

        obs = self._get_observation()
        return obs, reward, done, info

    def _compute_reward(self) -> float:
        """Compute reward for current state."""
        # Reward for forward motion
        forward_reward = self.robot_pos[0] * 0.1

        # Penalty for falling
        height_penalty = max(0, 0.3 - self.robot_pos[1]) * 2.0

        # Penalty for excessive movement
        action_penalty = np.sum(self.last_action**2) * 0.01

        return forward_reward - height_penalty - action_penalty

    def get_obs_norm_stats(self) -> tuple[np.ndarray, np.ndarray]:
        """Get observation normalization statistics (placeholder)."""
        mean = np.zeros(self.obs_dim, dtype=np.float32)
        std = np.ones(self.obs_dim, dtype=np.float32)
        return mean, std
