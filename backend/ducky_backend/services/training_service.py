import asyncio
import os
import json
from typing import Callable, Any
import logging

logger = logging.getLogger(__name__)


class TrainingService:
    """Service for managing PPO training runs."""

    def __init__(self, notify: Callable[[str, dict], None] | None = None):
        self.current_run: asyncio.Task | None = None
        self.cancel_requested = False
        self.notify = notify

    async def start(self, config: dict) -> dict:
        """Start a new training run."""
        if self.current_run and not self.current_run.done():
            raise RuntimeError("Training already in progress")

        self.cancel_requested = False

        # Start training in background task
        self.current_run = asyncio.create_task(self._train(config))

        return {"status": "started"}

    async def cancel(self) -> dict:
        """Cancel the current training run."""
        if not self.current_run or self.current_run.done():
            return {"status": "no_active_run"}

        self.cancel_requested = True
        self.current_run.cancel()

        try:
            await self.current_run
        except asyncio.CancelledError:
            pass

        return {"status": "cancelled"}

    def status(self) -> dict:
        """Get current training status."""
        if self.current_run and not self.current_run.done():
            return {"running": True}
        return {"running": False}

    async def _train(self, config: dict) -> dict:
        """Run PPO training loop."""
        try:
            import numpy as np
            from ..training.duck_env import DuckEnv
            from ..training.ppo import PPO
            from ..training.policy_io import save_policy, compute_spec_hash

            # Extract config
            iterations = config.get("iterations", 100)
            steps_per_iter = config.get("steps_per_iter", 1000)
            output_path = config.get("output_path", "trained_policy.json")
            spec_path = config.get("spec_path", "specs/duck_spec.json")

            # Initialize environment and agent
            env = DuckEnv(spec_path)
            agent = PPO(obs_dim=env.obs_dim, act_dim=env.act_dim)

            # Get observation normalization stats
            obs_mean, obs_std = env.get_obs_norm_stats()

            best_reward = float("-inf")
            final_reward = 0.0

            for iteration in range(iterations):
                if self.cancel_requested:
                    logger.info("Training cancelled")
                    break

                # Collect rollout
                obs_buf = []
                act_buf = []
                rew_buf = []
                val_buf = []
                done_buf = []
                logp_buf = []

                obs = env.reset()
                episode_reward = 0.0

                for step in range(steps_per_iter):
                    action, logp = agent.act(obs)
                    value = agent.get_value(obs)

                    obs_buf.append(obs)
                    act_buf.append(action)
                    val_buf.append(value)
                    logp_buf.append(logp)

                    obs, reward, done, info = env.step(action)
                    rew_buf.append(reward)
                    done_buf.append(done)

                    episode_reward += reward

                    if done:
                        obs = env.reset()

                # Compute advantages
                last_value = agent.get_value(obs)
                advantages, returns = agent.compute_gae(rew_buf, val_buf, done_buf, last_value)

                # Normalize advantages
                advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

                # Update policy
                obs_batch = np.array(obs_buf)
                act_batch = np.array(act_buf)
                adv_batch = advantages
                ret_batch = returns
                logp_batch = np.array(logp_buf)

                update_info = agent.update(obs_batch, act_buf, adv_batch, ret_batch, logp_batch)

                # Track best policy
                if episode_reward > best_reward:
                    best_reward = episode_reward
                    policy_dict = agent.get_policy_dict(obs_mean, obs_std)
                    policy_dict["specHash"] = compute_spec_hash(env.spec)
                    save_policy(policy_dict, output_path)

                final_reward = episode_reward

                # Send progress notification
                if self.notify:
                    self.notify(
                        "train.progress",
                        {
                            "iteration": iteration + 1,
                            "totalIterations": iterations,
                            "meanReward": episode_reward,
                            "kl": update_info.get("kl", 0.0),
                            "entropy": update_info.get("entropy", 0.0),
                            "episodeLength": env.step_count,
                        },
                    )

                # Yield control to event loop
                await asyncio.sleep(0)

            result = {
                "policyPath": output_path,
                "finalReward": final_reward,
                "iterations": iteration + 1,
                "success": True,
            }

            # Send done notification
            if self.notify:
                self.notify("train.done", result)

            return result

        except asyncio.CancelledError:
            logger.info("Training task cancelled")
            raise
        except Exception as e:
            logger.error(f"Training failed: {e}", exc_info=True)
            if self.notify:
                self.notify("train.done", {"success": False, "error": str(e)})
            raise
