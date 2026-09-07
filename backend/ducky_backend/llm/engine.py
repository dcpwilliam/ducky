"""Inference engine abstraction.

Ducky runs small language models locally. Different platforms have a clearly
best-performing backend, so the engine layer hides that behind one interface:

  * Apple Silicon (M-series) -> MLX. Unified memory means weights live once and
    the GPU reads them with zero copy, which is why MLX beats llama.cpp here.
  * Everything else          -> llama.cpp with a GGUF file, using Metal/CUDA
    when available and falling back to CPU layers.

Engines are synchronous by design: model code must not touch the asyncio event
loop. The service layer is responsible for pushing engine work onto a worker
thread so the JSON-RPC loop never blocks.
"""

from __future__ import annotations

import platform
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Iterator


@dataclass
class BackendInfo:
    """Describes which concrete engine will be used and why."""

    name: str                      # 'mlx' | 'llamacpp' | 'none'
    device: str                    # 'apple-silicon-gpu' | 'metal' | 'cuda' | 'cpu'
    available: bool
    reason: str = ''
    detail: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            'name': self.name,
            'device': self.device,
            'available': self.available,
            'reason': self.reason,
            'detail': self.detail
        }


@dataclass
class GenerateParams:
    """Sampling parameters shared by every engine."""

    max_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 0.9
    repetition_penalty: float = 1.0
    seed: int | None = None
    stop: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> 'GenerateParams':
        if not data:
            return cls()
        known = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
        return cls(**known)


@dataclass
class ModelStatus:
    """Runtime state of a loaded model."""

    model_id: str
    backend: str
    device: str
    loaded: bool = True
    params_b: float | None = None      # billions of parameters
    quant: str | None = None
    memory_gb: float | None = None
    context_tokens: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            'modelId': self.model_id,
            'backend': self.backend,
            'device': self.device,
            'loaded': self.loaded,
            'paramsB': self.params_b,
            'quant': self.quant,
            'memoryGb': self.memory_gb,
            'contextTokens': self.context_tokens
        }


class EngineError(RuntimeError):
    """Raised when an engine cannot satisfy a request."""


class BaseEngine(ABC):
    """Contract every inference backend must implement."""

    #: identifier reported to the frontend
    name: str = 'base'

    @abstractmethod
    def load(self, model_id: str, **opts: Any) -> ModelStatus:
        """Load weights and return runtime info. Idempotent for same model."""

    @abstractmethod
    def unload(self) -> None:
        """Release weights and any accelerator memory."""

    @abstractmethod
    def generate(self, prompt: str, params: GenerateParams) -> Iterator[str]:
        """Yield text chunks. Must be safe to call from a worker thread."""

    @abstractmethod
    def tokenize(self, text: str) -> list[int]:
        """Return token ids, used for context-size accounting."""

    @abstractmethod
    def status(self) -> ModelStatus | None:
        """Current loaded model, or None."""

    # -- shared helpers -------------------------------------------------

    def count_tokens(self, text: str) -> int:
        try:
            return len(self.tokenize(text))
        except Exception:
            # Rough fallback: ~4 chars per token for English, ~1.5 for CJK.
            return max(1, len(text) // 3)

    @staticmethod
    def apply_stop(text: str, stops: list[str]) -> tuple[str, bool]:
        """Trim at the first stop sequence. Returns (text, stopped)."""
        if not stops:
            return text, False
        cut = -1
        for s in stops:
            idx = text.find(s)
            if idx != -1 and (cut == -1 or idx < cut):
                cut = idx
        if cut != -1:
            return text[:cut], True
        return text, False


def is_apple_silicon() -> bool:
    """True only for arm64 macOS, where MLX is applicable."""
    return platform.system() == 'Darwin' and platform.machine() == 'arm64'


def detect_backend() -> BackendInfo:
    """Probe the machine and report the best available engine."""
    if is_apple_silicon():
        try:
            import mlx.core as mx  # noqa: F401
        except ImportError:
            return BackendInfo(
                name='none',
                device='cpu',
                available=False,
                reason='Apple Silicon detected but MLX is not installed '
                       '(pip install mlx-lm)'
            )
        return BackendInfo(
            name='mlx',
            device='apple-silicon-gpu',
            available=True,
            reason='Apple Silicon with MLX: unified memory, GPU-accelerated',
            detail={'platform': platform.machine()}
        )

    try:
        from llama_cpp import Llama  # noqa: F401
        device = 'cuda' if _has_cuda() else 'cpu'
        return BackendInfo(
            name='llamacpp',
            device=device,
            available=True,
            reason='llama.cpp available (GGUF models)'
        )
    except ImportError:
        return BackendInfo(
            name='none',
            device='cpu',
            available=False,
            reason='No inference backend installed '
                   '(pip install mlx-lm on Apple Silicon, or llama-cpp-python elsewhere)'
        )


def _has_cuda() -> bool:
    try:
        import subprocess
        out = subprocess.run(['nvidia-smi', '-L'], capture_output=True, timeout=5)
        return out.returncode == 0
    except Exception:
        return False


def create_engine(preferred: str | None = None) -> BaseEngine:
    """Instantiate the best engine, or the one explicitly requested."""
    from ducky_backend.llm.mlx_engine import MLXEngine
    from ducky_backend.llm.gguf_engine import GGUFEngine

    info = detect_backend()
    choice = preferred or info.name

    if choice == 'mlx':
        engine = MLXEngine()
        if not engine.available:
            if info.name == 'llamacpp':
                return GGUFEngine()
            raise EngineError(info.reason or 'MLX unavailable')
        return engine

    if choice == 'llamacpp':
        engine = GGUFEngine()
        if not engine.available:
            raise EngineError('llama-cpp-python is not installed '
                              '(pip install llama-cpp-python)')
        return engine

    raise EngineError(info.reason or 'No inference backend available')
