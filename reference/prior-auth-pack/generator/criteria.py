"""Criteria sheet: a list of (rule, met?) pairs for one request, with a latent 'case strength'.

A strong case meets almost every rule; a weak case misses several. Builders ask the sheet to
decide each rule and then write clinical values that agree with the decision, so the chart and
the checklist never contradict each other.
"""
from __future__ import annotations

import random
from typing import List, Tuple

STRENGTH_P = {"strong": 0.992, "borderline": 0.93, "weak": 0.72}


class CriteriaSheet:
    def __init__(self, rng: random.Random, strength: str, boost: bool = False):
        self.rng = rng
        self.strength = strength
        self.boost = boost            # True on a resubmission: time has passed and fixable gaps are closed
        self.items: List[Tuple[str, bool]] = []

    def check(self, label: str, p: float = None) -> bool:
        """Randomly decide a rule using the case strength (or an explicit probability)."""
        prob = STRENGTH_P[self.strength] if p is None else (min(0.97, p + 0.5) if self.boost else p)
        return self.add(label, self.rng.random() < prob)

    def add(self, label: str, met: bool) -> bool:
        self.items.append((label, bool(met)))
        return bool(met)

    @property
    def total(self) -> int:
        return len(self.items)

    @property
    def met(self) -> int:
        return sum(1 for _, m in self.items if m)

    @property
    def unmet_labels(self) -> List[str]:
        return [label for label, m in self.items if not m]

    def detail(self) -> str:
        return "; ".join("%s: %s" % (label, "MET" if m else "NOT MET") for label, m in self.items)


def pick_strength(rng: random.Random, weights=(0.74, 0.20, 0.06)) -> str:
    return rng.choices(["strong", "borderline", "weak"], weights=weights)[0]
