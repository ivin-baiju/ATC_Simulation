"""Deterministic simulation clock, event queue and seeded RNG streams.

Design rules (these are what make runs reproducible):

* Simulation time is an **integer number of milliseconds**, advanced in fixed
  ticks. There is no floating-point accumulation, so tick 1_000_000 lands on
  exactly the same timestamp on every machine.
* The clock never reads wall-clock time. Pacing a run against real time (for
  live playback) is the job of a separate driver; the sim itself only sees ticks.
* Events scheduled for the same instant fire in a total order:
  ``(time_ms, priority, insertion sequence)``. No ordering is left to dict or
  heap tie-breaking.
* Randomness comes from named, independent streams derived from one run seed
  with SHA-256, not Python's salted ``hash()``. Adding a new stream does not
  change the numbers drawn by existing streams.
"""

from __future__ import annotations

import hashlib
import heapq
import random
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

EventCallback = Callable[["SimClock"], None]


class ClockError(RuntimeError):
    """Raised on invalid clock operations (e.g. scheduling in the past)."""


@dataclass(order=True, frozen=True)
class _QueuedEvent:
    time_ms: int
    priority: int
    seq: int
    name: str = field(compare=False)
    callback: EventCallback = field(compare=False, repr=False)


@dataclass(frozen=True)
class FiredEvent:
    """Record of an event that has fired, used for replay and determinism checks."""

    tick: int
    time_ms: int
    priority: int
    seq: int
    name: str


@dataclass(frozen=True)
class ClockSnapshot:
    """Serializable clock state (excludes callbacks, which are not data)."""

    tick: int
    dt_ms: int
    start_ms: int
    now_ms: int
    pending_events: int


class SimClock:
    """Fixed-step, integer-millisecond simulation clock with an event queue."""

    def __init__(self, dt_ms: int = 100, start_ms: int = 0) -> None:
        if not isinstance(dt_ms, int) or isinstance(dt_ms, bool) or dt_ms <= 0:
            raise ClockError(f"dt_ms must be a positive int, got {dt_ms!r}")
        if not isinstance(start_ms, int) or isinstance(start_ms, bool) or start_ms < 0:
            raise ClockError(f"start_ms must be a non-negative int, got {start_ms!r}")
        self._dt_ms = dt_ms
        self._start_ms = start_ms
        self._tick = 0
        self._seq = 0
        self._queue: list[_QueuedEvent] = []
        self._log: list[FiredEvent] = []

    # ------------------------------------------------------------------ time
    @property
    def dt_ms(self) -> int:
        return self._dt_ms

    @property
    def tick(self) -> int:
        return self._tick

    @property
    def now_ms(self) -> int:
        return self._start_ms + self._tick * self._dt_ms

    @property
    def now_s(self) -> float:
        """Convenience for physics code. Derived from integer ms, so it never drifts."""
        return self.now_ms / 1000.0

    # ---------------------------------------------------------------- events
    def schedule_at(
        self, time_ms: int, callback: EventCallback, *, name: str = "", priority: int = 0
    ) -> int:
        """Schedule ``callback`` to fire at absolute sim time ``time_ms``.

        Events fire on the first tick whose time is >= ``time_ms``. Lower
        ``priority`` fires first at the same instant. Returns the event's sequence id.
        """
        if not isinstance(time_ms, int) or isinstance(time_ms, bool):
            raise ClockError(f"time_ms must be an int, got {time_ms!r}")
        if time_ms < self.now_ms:
            raise ClockError(
                f"cannot schedule {name or 'event'} at {time_ms} ms < now {self.now_ms} ms"
            )
        seq = self._seq
        self._seq += 1
        heapq.heappush(self._queue, _QueuedEvent(time_ms, priority, seq, name, callback))
        return seq

    def schedule_in(
        self, delay_ms: int, callback: EventCallback, *, name: str = "", priority: int = 0
    ) -> int:
        if delay_ms < 0:
            raise ClockError(f"delay_ms must be >= 0, got {delay_ms}")
        return self.schedule_at(self.now_ms + delay_ms, callback, name=name, priority=priority)

    @property
    def pending(self) -> int:
        return len(self._queue)

    @property
    def fired(self) -> tuple[FiredEvent, ...]:
        return tuple(self._log)

    def _fire_due(self) -> None:
        # Callbacks may schedule more events for "now"; those fire in the same pass.
        while self._queue and self._queue[0].time_ms <= self.now_ms:
            ev = heapq.heappop(self._queue)
            self._log.append(FiredEvent(self._tick, self.now_ms, ev.priority, ev.seq, ev.name))
            ev.callback(self)

    # ------------------------------------------------------------- advancing
    def start(self) -> None:
        """Fire events due at the start time (tick 0). Idempotent."""
        self._fire_due()

    def step(self, n: int = 1) -> int:
        """Advance ``n`` ticks, firing due events after each. Returns the new tick."""
        if n < 0:
            raise ClockError("cannot step backwards; rebuild the run and replay to seek")
        for _ in range(n):
            self._tick += 1
            self._fire_due()
        return self._tick

    def run_until(self, time_ms: int) -> int:
        """Advance until ``now_ms >= time_ms``. Returns the new tick."""
        if time_ms < self.now_ms:
            raise ClockError(f"run_until({time_ms}) is in the past (now {self.now_ms})")
        remaining = time_ms - self.now_ms
        ticks = -(-remaining // self._dt_ms)  # ceil division in ints
        return self.step(ticks)

    def snapshot(self) -> ClockSnapshot:
        return ClockSnapshot(self._tick, self._dt_ms, self._start_ms, self.now_ms, self.pending)


class RngStreams:
    """Independent, named ``random.Random`` streams derived from a single seed.

    >>> a = RngStreams(42).get("traffic").random()
    >>> b = RngStreams(42).get("traffic").random()
    >>> a == b
    True
    """

    def __init__(self, seed: int) -> None:
        if not isinstance(seed, int) or isinstance(seed, bool):
            raise TypeError(f"seed must be an int, got {seed!r}")
        self._seed = seed
        self._streams: dict[str, random.Random] = {}

    @property
    def seed(self) -> int:
        return self._seed

    @staticmethod
    def derive(seed: int, name: str) -> int:
        digest = hashlib.sha256(f"atc-sim:{seed}:{name}".encode()).digest()
        return int.from_bytes(digest[:8], "big")

    def get(self, name: str) -> random.Random:
        if name not in self._streams:
            self._streams[name] = random.Random(self.derive(self._seed, name))
        return self._streams[name]

    def state(self) -> dict[str, Any]:
        """Full RNG state, for checkpointing a run."""
        return {name: rng.getstate() for name, rng in sorted(self._streams.items())}
