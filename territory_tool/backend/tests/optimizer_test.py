import pytest
from optimizer import is_territory_contiguous, can_add_to_territory, check_assignments_contiguity


def test_is_territory_contiguous_connected():
    adjacency = {
        "A": {"B"},
        "B": {"A", "C"},
        "C": {"B"},
    }
    assert is_territory_contiguous({"A", "B", "C"}, adjacency=adjacency)


def test_is_territory_contiguous_disconnected():
    adjacency = {
        "A": {"B"},
        "B": {"A"},
        "C": set(),
    }
    assert not is_territory_contiguous({"A", "C"}, adjacency=adjacency)


def test_can_add_to_territory_respects_adjacency():
    adjacency = {"A": {"B"}, "B": {"A"}}
    territory = {"A"}
    assert can_add_to_territory("B", territory, adjacency=adjacency)
    assert not can_add_to_territory("C", territory, adjacency=adjacency)


def test_check_assignments_contiguity_reports_failures():
    adjacency = {"A": {"B"}, "B": {"A"}, "C": set()}
    assignments = {"unit1": "T1", "unit2": "T1", "unit3": "T2"}
    # T1 gets A and C -> disconnected, T2 gets none -> contiguous by default
    result = check_assignments_contiguity(assignments={"A": "T1", "C": "T1"}, adjacency=adjacency)
    assert result["checked"] is True
    assert result["ok"] is False
    assert "T1" in result["non_contiguous"]


def test_primary_balanced_raises_when_contiguity_impossible():
    from optimizer import primary_balanced

    adjacency = {"A": {"B"}, "B": {"A"}}
    unit_values = {
        "A": {"primary": 1.0, "secondary": 0.0},
        "C": {"primary": 1.0, "secondary": 0.0},  # Not adjacent to A
    }

    with pytest.raises(ValueError):
        primary_balanced(
            unit_values=unit_values,
            k=1,
            locked={},
            require_contiguity=True,
            adjacency=adjacency,
        )

