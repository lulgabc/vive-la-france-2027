from __future__ import annotations

from typing import Any

import numpy as np


def simulate(candidates: list[dict[str, Any]], draws: int = 20000, seed: int = 42) -> dict[str, Any]:
    """A deliberately simple Monte Carlo skeleton.

    This is not the final model. It demonstrates the contract:
    - input: candidate id, poll average, market probability
    - output: first-round distribution, runoff probability, win probability
    """
    if not candidates:
        return {"candidates": [], "draws": draws}

    rng = np.random.default_rng(seed)
    ids = [candidate["id"] for candidate in candidates]
    polls = np.array([float(candidate.get("poll_avg", 0.0)) for candidate in candidates])
    polls = np.clip(polls, 0.0, None)
    if polls.sum() <= 0:
        polls = np.ones_like(polls)
    polls = polls / polls.sum() * 100.0

    # Correlated noise: common national error + candidate-specific error.
    common = rng.normal(0.0, 1.8, size=(draws, 1))
    specific = rng.normal(0.0, 1.2, size=(draws, len(candidates)))
    simulated = np.clip(polls[None, :] + common + specific, 0.0, None)
    simulated = simulated / simulated.sum(axis=1, keepdims=True) * 100.0

    order = np.argsort(-simulated, axis=1)
    first = order[:, 0]
    second = order[:, 1]

    runoff = np.zeros((draws, len(candidates)), dtype=bool)
    runoff[np.arange(draws), first] = True
    runoff[np.arange(draws), second] = True

    # Simplified runoff: the first-round leader keeps an advantage, with noise.
    win = np.zeros(len(candidates))
    for draw in range(draws):
        a, b = first[draw], second[draw]
        probability_a = 0.5 + (simulated[draw, a] - simulated[draw, b]) / 200.0
        probability_a = float(np.clip(probability_a, 0.05, 0.95))
        winner = a if rng.random() < probability_a else b
        win[winner] += 1

    output = []
    for index, candidate_id in enumerate(ids):
        values = simulated[:, index]
        output.append(
            {
                "id": candidate_id,
                "poll_avg": round(float(polls[index]), 2),
                "mean": round(float(values.mean()), 2),
                "p10": round(float(np.percentile(values, 10)), 2),
                "p90": round(float(np.percentile(values, 90)), 2),
                "runoff_prob": round(float(runoff[:, index].mean()), 4),
                "win_prob": round(float(win[index] / draws), 4),
            }
        )

    return {"draws": draws, "seed": seed, "candidates": output}
