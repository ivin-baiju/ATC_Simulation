from __future__ import annotations

import pytest

from atc_sim.clock import ClockError, RngStreams, SimClock


def _run(seed: int) -> list[tuple[int, str, float]]:
    """A small scripted run whose event log depends on the clock and RNG only."""
    clock = SimClock(dt_ms=100)
    rng = RngStreams(seed)
    log: list[tuple[int, str, float]] = []

    def spawn(c: SimClock) -> None:
        r = rng.get("traffic").random()
        log.append((c.now_ms, "spawn", r))
        if c.now_ms < 60_000:
            c.schedule_in(int(1000 + r * 5000), spawn, name="spawn")

    def wind(c: SimClock) -> None:
        log.append((c.now_ms, "wind", rng.get("weather").gauss(0, 1)))
        c.schedule_in(7_000, wind, name="wind")

    clock.schedule_at(0, spawn, name="spawn")
    clock.schedule_at(0, wind, name="wind", priority=-1)
    clock.start()
    clock.run_until(90_000)
    return log


def test_same_seed_same_run() -> None:
    assert _run(7) == _run(7)


def test_different_seed_different_run() -> None:
    assert _run(7) != _run(8)


def test_time_is_integer_and_does_not_drift() -> None:
    clock = SimClock(dt_ms=100)
    clock.step(1_000_000)
    assert clock.now_ms == 100_000_000
    assert isinstance(clock.now_ms, int)
    assert clock.now_s == 100_000.0


def test_start_offset() -> None:
    clock = SimClock(dt_ms=250, start_ms=1_000)
    clock.step(4)
    assert clock.now_ms == 2_000


def test_same_instant_ordering_is_priority_then_insertion() -> None:
    clock = SimClock(dt_ms=100)
    order: list[str] = []
    for name, prio in [("c", 1), ("a", 0), ("b", 0), ("z", -5)]:
        clock.schedule_at(500, lambda _c, n=name: order.append(n), name=name, priority=prio)
    clock.run_until(500)
    assert order == ["z", "a", "b", "c"]


def test_events_fire_on_first_tick_at_or_after_their_time() -> None:
    clock = SimClock(dt_ms=100)
    fired: list[int] = []
    clock.schedule_at(250, lambda c: fired.append(c.now_ms))
    clock.step(2)
    assert fired == []
    clock.step(1)
    assert fired == [300]


def test_callbacks_can_schedule_for_now() -> None:
    clock = SimClock(dt_ms=100)
    seen: list[str] = []

    def first(c: SimClock) -> None:
        seen.append("first")
        c.schedule_in(0, lambda _c: seen.append("chained"))

    clock.schedule_at(100, first)
    clock.step()
    assert seen == ["first", "chained"]


def test_fired_log_records_ticks() -> None:
    clock = SimClock(dt_ms=100)
    clock.schedule_at(200, lambda _c: None, name="x")
    clock.run_until(300)
    (ev,) = clock.fired
    assert (ev.tick, ev.time_ms, ev.name) == (2, 200, "x")


def test_run_until_rounds_up_to_tick_boundary() -> None:
    clock = SimClock(dt_ms=100)
    clock.run_until(250)
    assert clock.now_ms == 300


@pytest.mark.parametrize("bad", [0, -1, 1.5, True])
def test_rejects_bad_dt(bad: object) -> None:
    with pytest.raises(ClockError):
        SimClock(dt_ms=bad)  # type: ignore[arg-type]


def test_rejects_past_and_backwards() -> None:
    clock = SimClock(dt_ms=100)
    clock.step(5)
    with pytest.raises(ClockError):
        clock.schedule_at(100, lambda _c: None)
    with pytest.raises(ClockError):
        clock.step(-1)
    with pytest.raises(ClockError):
        clock.run_until(0)
    with pytest.raises(ClockError):
        clock.schedule_at(600.0, lambda _c: None)  # type: ignore[arg-type]


def test_rng_streams_are_independent() -> None:
    a = RngStreams(1)
    first = [a.get("traffic").random() for _ in range(3)]
    b = RngStreams(1)
    b.get("weather").random()  # touching another stream must not shift "traffic"
    assert [b.get("traffic").random() for _ in range(3)] == first


def test_rng_streams_differ_by_name() -> None:
    assert RngStreams.derive(42, "traffic") != RngStreams.derive(42, "weather")
    assert RngStreams.derive(42, "traffic") != RngStreams.derive(43, "traffic")


def test_rng_derivation_pinned() -> None:
    # Guards against accidental use of Python's salted hash(), which changes per process.
    import hashlib

    expected = int.from_bytes(hashlib.sha256(b"atc-sim:42:traffic").digest()[:8], "big")
    assert RngStreams.derive(42, "traffic") == expected


def test_snapshot() -> None:
    clock = SimClock(dt_ms=100)
    clock.schedule_at(1_000, lambda _c: None)
    clock.step(3)
    snap = clock.snapshot()
    assert (snap.tick, snap.now_ms, snap.pending_events) == (3, 300, 1)
