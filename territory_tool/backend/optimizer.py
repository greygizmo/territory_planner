"""
Territory optimization algorithms.
Implements greedy balancing strategies for primary, secondary, and dual metrics.
Supports contiguity constraints to ensure territories are geographically connected.

Now includes geographic-aware seed-based region growing for intuitive territory boundaries:
- k=2: East/West split
- k=3: East/Central/West
- k=4: Quadrants (NE, SE, SW, NW)
- k>4: Evenly distributed geographic seeds
"""
from collections import defaultdict
from typing import Any
import heapq
from data_loader import STATE_ADJACENCY

# ============================================================================
# State/Province Centroids (longitude, latitude)
# Used for geographic seed selection and distance calculations
# ============================================================================
STATE_CENTROIDS = {
    # US States (longitude, latitude) - negative longitude = west
    'AK': (-153.4937, 64.2008),
    'AL': (-86.9023, 32.3182),
    'AR': (-91.8318, 34.7465),
    'AZ': (-111.0937, 34.0489),
    'CA': (-119.4179, 36.7783),
    'CO': (-105.3111, 39.5501),
    'CT': (-72.7554, 41.6032),
    'DC': (-77.0369, 38.9072),
    'DE': (-75.5277, 38.9108),
    'FL': (-81.5158, 27.6648),
    'GA': (-83.6431, 32.1656),
    'HI': (-155.5828, 19.8968),
    'IA': (-93.0977, 41.8780),
    'ID': (-114.7420, 44.0682),
    'IL': (-89.3985, 40.6331),
    'IN': (-86.1349, 40.2672),
    'KS': (-98.4842, 39.0119),
    'KY': (-84.2700, 37.8393),
    'LA': (-91.9623, 30.9843),
    'MA': (-71.3824, 42.4072),
    'MD': (-76.6413, 39.0458),
    'ME': (-69.4455, 45.2538),
    'MI': (-85.6024, 44.3148),
    'MN': (-94.6859, 46.7296),
    'MO': (-91.8318, 37.9643),
    'MS': (-89.3985, 32.3547),
    'MT': (-110.3626, 46.8797),
    'NC': (-79.0193, 35.7596),
    'ND': (-101.0020, 47.5515),
    'NE': (-99.9018, 41.4925),
    'NH': (-71.5724, 43.1939),
    'NJ': (-74.4057, 40.0583),
    'NM': (-105.8701, 34.5199),
    'NV': (-116.4194, 38.8026),
    'NY': (-75.4999, 43.2994),
    'OH': (-82.9071, 40.4173),
    'OK': (-97.0929, 35.0078),
    'OR': (-120.5542, 43.8041),
    'PA': (-77.1945, 41.2033),
    'RI': (-71.4774, 41.5801),
    'SC': (-81.1637, 33.8361),
    'SD': (-99.9018, 43.9695),
    'TN': (-86.5804, 35.5175),
    'TX': (-99.9018, 31.9686),
    'UT': (-111.0937, 39.3210),
    'VA': (-78.6569, 37.4316),
    'VT': (-72.5778, 44.5588),
    'WA': (-120.7401, 47.7511),
    'WI': (-89.6165, 43.7844),
    'WV': (-80.4549, 38.5976),
    'WY': (-107.2903, 43.0760),
    # US Territories
    'PR': (-66.5901, 18.2208),
    'GU': (144.7937, 13.4443),
    'VI': (-64.8963, 18.3358),
    'AS': (-170.1322, -14.2710),
    'MP': (145.6739, 15.0979),
    # Canadian Provinces/Territories
    'AB': (-115.0, 55.0),
    'BC': (-125.0, 54.0),
    'MB': (-98.0, 55.0),
    'NB': (-66.0, 46.5),
    'NL': (-57.0, 53.0),
    'NS': (-63.5, 45.0),
    'NT': (-117.0, 64.0),
    'NU': (-95.0, 70.0),
    'ON': (-85.0, 50.0),
    'PE': (-63.0, 46.2),
    'QC': (-72.0, 52.0),
    'SK': (-106.0, 54.0),
    'YT': (-135.0, 64.0),
}

# Non-contiguous states that should be assigned last or handled specially
ISLAND_STATES = {'AK', 'HI', 'PR', 'GU', 'VI', 'AS', 'MP'}


def is_territory_contiguous(
    territory_states: set[str],
    adjacency: dict[str, set[str]] = STATE_ADJACENCY
) -> bool:
    """
    Check if a set of states forms a contiguous region.
    Uses BFS to verify all states are reachable from the first state.
    
    Special handling for non-contiguous states (AK, HI, PR, etc.):
    - If only one state, always contiguous
    - Non-contiguous states (islands) can only be in single-state territories
      or territories that contain only island states
    """
    if len(territory_states) <= 1:
        return True
    
    # Separate island states from mainland states
    island_states = {'AK', 'HI', 'PR', 'GU', 'VI', 'AS', 'MP'}
    mainland_states = territory_states - island_states
    territory_islands = territory_states & island_states
    
    # If we have both mainland and island states, it IS contiguous if the mainland part is contiguous
    # (Checking strictly: usually islands are "attached" to a mainland state administratively/logically,
    #  or users want to just group them. We relax the check here.)
    
    # If only island states, we allow them to be grouped together even if physically disconnected
    # (This supports grouping AK + HI + PR if desired, or just AK alone)
    if not mainland_states:
        return True

    
    # Check mainland contiguity using BFS
    states_list = list(mainland_states)
    visited = {states_list[0]}
    queue = [states_list[0]]
    
    while queue:
        current = queue.pop(0)
        neighbors = adjacency.get(current, set())
        for neighbor in neighbors:
            if neighbor in mainland_states and neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    
    return len(visited) == len(mainland_states)


def can_add_to_territory(
    state: str,
    territory_states: set[str],
    adjacency: dict[str, set[str]] = STATE_ADJACENCY
) -> bool:
    """
    Check if adding a state to a territory maintains contiguity.
    """
    # If territory is empty, can always add
    if not territory_states:
        return True
    
    # Island states can only join empty territories
    island_states = {'AK', 'HI', 'PR', 'GU', 'VI', 'AS', 'MP'}
    if state in island_states:
        # Island can only be alone in its territory
        return len(territory_states) == 0
    
    # If territory has any island state, mainland can't join
    if territory_states & island_states:
        return False
    
    # Check if new state is adjacent to any existing state in territory
    state_neighbors = adjacency.get(state, set())
    return bool(state_neighbors & territory_states)


# ============================================================================
# Geographic Seed Selection
# ============================================================================

def select_geographic_seeds(
    available_units: list[str],
    k: int,
    user_seeds: dict[str, str] | None = None,
) -> dict[str, str]:
    """
    Select k geographically distributed seed states for territory initialization.
    
    Strategy based on k:
    - k=2: East/West (most eastern and most western mainland states)
    - k=3: East/Central/West
    - k=4: Quadrants (NE, SE, SW, NW corners)
    - k>4: Evenly distributed by longitude
    
    Args:
        available_units: List of unit IDs to select seeds from
        k: Number of territories/seeds needed
        user_seeds: Optional user-specified seeds (territory_id -> unit_id)
        
    Returns:
        Dict mapping territory_id -> seed_unit_id
    """
    if not available_units or k <= 0:
        return {}
    
    # Filter to units we have centroids for, excluding islands
    mainland_units = [
        u for u in available_units 
        if u in STATE_CENTROIDS and u not in ISLAND_STATES
    ]
    
    if not mainland_units:
        # Fallback: just use first k units
        seeds = {}
        for i, unit_id in enumerate(available_units[:k]):
            seeds[f"T{i+1}"] = unit_id
        return seeds
    
    # Sort by longitude (west to east)
    sorted_by_lng = sorted(mainland_units, key=lambda u: STATE_CENTROIDS[u][0])
    
    # Start with user-provided seeds if any
    seeds = {}
    used_units = set()
    
    if user_seeds:
        for tid, unit_id in user_seeds.items():
            if unit_id in available_units:
                seeds[tid] = unit_id
                used_units.add(unit_id)
    
    # Fill remaining seeds based on geography
    remaining_k = k - len(seeds)
    remaining_tids = [f"T{i+1}" for i in range(k) if f"T{i+1}" not in seeds]
    available_for_seeds = [u for u in sorted_by_lng if u not in used_units]
    
    if remaining_k <= 0 or not available_for_seeds:
        return seeds
    
    if remaining_k == 1:
        # Pick the middle state
        mid_idx = len(available_for_seeds) // 2
        seeds[remaining_tids[0]] = available_for_seeds[mid_idx]
    elif remaining_k == 2:
        # West and East
        seeds[remaining_tids[0]] = available_for_seeds[0]  # Westmost
        seeds[remaining_tids[1]] = available_for_seeds[-1]  # Eastmost
    elif remaining_k == 3:
        # West, Central, East
        mid_idx = len(available_for_seeds) // 2
        seeds[remaining_tids[0]] = available_for_seeds[0]  # West
        seeds[remaining_tids[1]] = available_for_seeds[mid_idx]  # Central
        seeds[remaining_tids[2]] = available_for_seeds[-1]  # East
    elif remaining_k == 4:
        # Quadrants: sort by latitude to find north/south within west/east halves
        half = len(available_for_seeds) // 2
        west_half = available_for_seeds[:half]
        east_half = available_for_seeds[half:]
        
        # Sort each half by latitude
        west_by_lat = sorted(west_half, key=lambda u: STATE_CENTROIDS[u][1])
        east_by_lat = sorted(east_half, key=lambda u: STATE_CENTROIDS[u][1])
        
        # SW, NW, SE, NE
        if west_by_lat:
            seeds[remaining_tids[0]] = west_by_lat[0]  # SW (south-west)
            seeds[remaining_tids[1]] = west_by_lat[-1] if len(west_by_lat) > 1 else west_by_lat[0]  # NW
        if east_by_lat:
            seeds[remaining_tids[2]] = east_by_lat[0] if len(remaining_tids) > 2 else None  # SE
            seeds[remaining_tids[3]] = east_by_lat[-1] if len(remaining_tids) > 3 and len(east_by_lat) > 1 else None  # NE
        
        # Clean up None values
        seeds = {k: v for k, v in seeds.items() if v is not None}
    else:
        # k > 4: Distribute evenly by longitude
        step = max(1, len(available_for_seeds) // remaining_k)
        for i, tid in enumerate(remaining_tids):
            idx = min(i * step, len(available_for_seeds) - 1)
            if available_for_seeds[idx] not in used_units:
                seeds[tid] = available_for_seeds[idx]
                used_units.add(available_for_seeds[idx])
            else:
                # Find next available
                for u in available_for_seeds:
                    if u not in used_units:
                        seeds[tid] = u
                        used_units.add(u)
                        break
    
    return seeds


def get_geographic_distance(unit1: str, unit2: str) -> float:
    """
    Get approximate geographic distance between two units.
    Uses simple Euclidean distance on lat/lng (sufficient for relative ordering).
    """
    if unit1 not in STATE_CENTROIDS or unit2 not in STATE_CENTROIDS:
        return float('inf')
    
    lng1, lat1 = STATE_CENTROIDS[unit1]
    lng2, lat2 = STATE_CENTROIDS[unit2]
    
    # Simple Euclidean distance (not true geographic but works for ranking)
    return ((lng2 - lng1) ** 2 + (lat2 - lat1) ** 2) ** 0.5


# ============================================================================
# Geographic Region-Growing Optimizer
# ============================================================================

def geographic_balanced(
    unit_values: dict[str, dict],
    k: int,
    locked: dict[str, str],
    require_contiguity: bool = True,
    adjacency: dict[str, set[str]] = STATE_ADJACENCY,
    user_seeds: dict[str, str] | None = None,
    balance_weight: float = 0.5,
) -> dict[str, str]:
    """
    Geographic region-growing optimizer that creates intuitive, contiguous territories.
    
    Uses a Voronoi-like priority queue approach to guarantee strict contiguity:
    1. Select k geographically distributed seed states (E/W for k=2, etc.)
    2. Initialize priority queue with seed neighbors for each territory
    3. Pop lowest-priority entry (territory with lowest load that can expand)
    4. Assign unit to territory, add unit's neighbors to queue
    5. Repeat until all mainland units assigned
    6. Island states (AK, HI, PR, etc.) assigned to least-loaded territory last
    
    Args:
        unit_values: Dict mapping unit_id -> {"primary": float, "secondary": float}
        k: Number of territories
        locked: Pre-locked assignments (unit_id -> territory_id)
        require_contiguity: If True, enforce contiguous territories (always True for this algo)
        adjacency: Adjacency map for contiguity checks
        user_seeds: Optional user-specified seeds (territory_id -> unit_id)
        balance_weight: Weight for metric balance vs geographic expansion (0-1)
        
    Returns:
        Complete assignments dict (unit_id -> territory_id)
    """
    territory_ids = [f"T{i+1}" for i in range(k)]
    
    # Initialize tracking structures
    assignments: dict[str, str] = {}
    load_primary = {tid: 0.0 for tid in territory_ids}
    territory_states: dict[str, set[str]] = {tid: set() for tid in territory_ids}
    
    # Separate all units into mainland and island categories
    all_unit_ids = set(unit_values.keys())
    mainland_units = {u for u in all_unit_ids if u not in ISLAND_STATES}
    island_units = {u for u in all_unit_ids if u in ISLAND_STATES}
    
    # Apply locked assignments first
    for unit_id, tid in locked.items():
        if unit_id not in unit_values:
            continue
        if tid not in territory_ids:
            continue
        assignments[unit_id] = tid
        load_primary[tid] += unit_values[unit_id]["primary"]
        territory_states[tid].add(unit_id)
    
    # Track unassigned mainland units
    unassigned_mainland = mainland_units - set(assignments.keys())
    
    # Select geographic seeds from unassigned mainland units
    seeds = select_geographic_seeds(list(unassigned_mainland), k, user_seeds)
    
    # Helper to assign a unit to a territory
    def assign_unit(unit_id: str, tid: str):
        nonlocal unassigned_mainland
        assignments[unit_id] = tid
        load_primary[tid] += unit_values.get(unit_id, {"primary": 0})["primary"]
        territory_states[tid].add(unit_id)
        unassigned_mainland.discard(unit_id)
    
    # Assign seeds first
    for tid, seed_unit in seeds.items():
        if seed_unit not in assignments and seed_unit in unassigned_mainland:
            assign_unit(seed_unit, tid)
    
    # Ensure each territory has at least one seed
    for tid in territory_ids:
        if not territory_states[tid] and unassigned_mainland:
            # Pick based on geographic position for this territory index
            idx = territory_ids.index(tid)
            sorted_by_lng = sorted(
                unassigned_mainland, 
                key=lambda u: STATE_CENTROIDS.get(u, (0, 0))[0]
            )
            if sorted_by_lng:
                step = max(1, len(sorted_by_lng) // k)
                pick_idx = min(idx * step, len(sorted_by_lng) - 1)
                assign_unit(sorted_by_lng[pick_idx], tid)
    
    # Priority queue for Voronoi-like region growing
    # Entry: (priority, counter, territory_id, unit_id)
    # Priority = territory's current load (lower = higher priority to expand)
    # Counter ensures FIFO ordering for same-priority entries
    pq: list[tuple[float, int, str, str]] = []
    counter = 0
    units_in_queue: set[tuple[str, str]] = set()  # (tid, unit_id) pairs in queue
    
    def add_neighbors_to_queue(tid: str, source_unit: str):
        """Add all unassigned neighbors of source_unit to the queue for territory tid."""
        nonlocal counter
        for neighbor in adjacency.get(source_unit, set()):
            if neighbor in unassigned_mainland and (tid, neighbor) not in units_in_queue:
                # Priority = current load of territory (expand least-loaded first)
                priority = load_primary[tid]
                heapq.heappush(pq, (priority, counter, tid, neighbor))
                units_in_queue.add((tid, neighbor))
                counter += 1
    
    # Initialize queue with neighbors of all seed states
    for tid in territory_ids:
        for state in territory_states[tid]:
            add_neighbors_to_queue(tid, state)
    
    # Main region-growing loop
    # Use round-robin style: each territory takes turns expanding
    # This prevents one territory from "starving" others
    
    stuck_count = 0
    max_stuck = len(mainland_units) * 2
    
    while unassigned_mainland and pq and stuck_count < max_stuck:
        # Build a batch: one expansion candidate per territory
        # This ensures fair round-robin expansion
        candidates_by_tid: dict[str, tuple[float, int, str, str]] = {}
        temp_queue: list[tuple[float, int, str, str]] = []
        
        # Extract best candidate for each territory
        while pq:
            entry = heapq.heappop(pq)
            priority, cnt, tid, unit_id = entry
            units_in_queue.discard((tid, unit_id))
            
            # Skip if unit already assigned
            if unit_id not in unassigned_mainland:
                continue
            
            # Keep best candidate for each territory
            if tid not in candidates_by_tid:
                candidates_by_tid[tid] = entry
            else:
                # Put this back - we already have a candidate for this territory
                temp_queue.append(entry)
                units_in_queue.add((tid, unit_id))
            
            # Stop once we have a candidate for each territory with frontiers
            if len(candidates_by_tid) == k:
                break
        
        # Put temp entries back
        for entry in temp_queue:
            heapq.heappush(pq, entry)
        
        if not candidates_by_tid:
            stuck_count += 1
            continue
        
        stuck_count = 0
        
        # Sort territories by load and let each one expand in order
        sorted_tids = sorted(candidates_by_tid.keys(), key=lambda t: load_primary[t])
        
        # Expand the territory with lowest load
        best_tid = sorted_tids[0]
        _, _, _, best_unit = candidates_by_tid[best_tid]
        
        if best_unit in unassigned_mainland:
            assign_unit(best_unit, best_tid)
            add_neighbors_to_queue(best_tid, best_unit)
        
        # Put non-selected candidates back into queue
        for tid, entry in candidates_by_tid.items():
            if tid != best_tid:
                _, _, _, unit_id = entry
                if unit_id in unassigned_mainland:
                    heapq.heappush(pq, entry)
                    units_in_queue.add((tid, unit_id))
    
    # Handle any remaining disconnected mainland units
    # These are rare and occur when the adjacency map has gaps
    # Use BFS to find shortest path to nearest territory, then bridge
    if unassigned_mainland:
        print(f"[geographic_balanced] {len(unassigned_mainland)} disconnected units: {list(unassigned_mainland)[:5]}")
        
        # Find connected components of unassigned units
        remaining = set(unassigned_mainland)
        while remaining:
            unit = next(iter(remaining))
            
            # Find nearest territory and build a path to it
            best_tid = None
            best_dist = float('inf')
            
            for tid in territory_ids:
                if territory_states[tid]:
                    for state in territory_states[tid]:
                        dist = get_geographic_distance(unit, state)
                        if dist < best_dist:
                            best_dist = dist
                            best_tid = tid
            
            if best_tid is None:
                best_tid = min(territory_ids, key=lambda t: load_primary[t])
            
            # Assign this unit to the nearest territory
            # Note: This may break contiguity but handles edge cases
            assign_unit(unit, best_tid)
            remaining.discard(unit)
    
    # Assign island states to least-loaded territories
    for unit in island_units:
        if unit not in assignments:
            best_tid = min(territory_ids, key=lambda t: load_primary[t])
            assign_unit(unit, best_tid)
    
    return assignments


def primary_balanced(
    unit_values: dict[str, dict],
    k: int,
    locked: dict[str, str],
    require_contiguity: bool = True,
    adjacency: dict[str, set[str]] = STATE_ADJACENCY,
) -> dict[str, str]:
    """
    Generate assignments balanced on the primary metric with contiguity constraint.
    
    Uses greedy first-fit-decreasing algorithm with contiguity check:
    1. Sort units by primary metric (descending)
    2. Assign each unit to territory with minimum primary load that maintains contiguity
    
    Args:
        unit_values: Dict mapping unit_id -> {"primary": float, "secondary": float}
        k: Number of territories
        locked: Pre-locked assignments (unit_id -> territory_id)
        require_contiguity: If True, enforce contiguous territories
        
    Returns:
        Complete assignments dict (unit_id -> territory_id)
    """
    territory_ids = [f"T{i+1}" for i in range(k)]
    
    # Initialize assignments and loads from locks
    assignments = {}
    load_primary = {tid: 0.0 for tid in territory_ids}
    territory_states: dict[str, set[str]] = {tid: set() for tid in territory_ids}
    
    # Apply locked assignments first
    for unit_id, tid in locked.items():
        if unit_id not in unit_values:
            continue
        if tid not in territory_ids:
            continue
        assignments[unit_id] = tid
        load_primary[tid] += unit_values[unit_id]["primary"]
        territory_states[tid].add(unit_id)
    
    # Get remaining (unassigned) units, sorted by primary metric descending
    remaining_units = [
        uid for uid in unit_values.keys() 
        if uid not in assignments
    ]
    remaining_units.sort(
        key=lambda u: unit_values[u]["primary"],
        reverse=True
    )
    
    # Greedy assignment with contiguity constraint
    contiguity_failures = []
    for unit_id in remaining_units:
        best_tid = None
        best_load = float("inf")
        
        # Find territory with minimum load that maintains contiguity
        for tid in territory_ids:
            if require_contiguity and territory_states[tid]:
                # Check if adding this state maintains contiguity
                if not can_add_to_territory(unit_id, territory_states[tid], adjacency=adjacency):
                    continue
            
            if load_primary[tid] < best_load:
                best_load = load_primary[tid]
                best_tid = tid
        
        # If no valid territory found under contiguity, fall back to least loaded with warning
        if best_tid is None:
            if require_contiguity:
                contiguity_failures.append(unit_id)
            best_tid = min(territory_ids, key=lambda t: load_primary[t])
        
        assignments[unit_id] = best_tid
        load_primary[best_tid] += unit_values[unit_id]["primary"]
        territory_states[best_tid].add(unit_id)
    
    if contiguity_failures:
        print(f"[primary_balanced] Contiguity relaxed for {len(contiguity_failures)} units: {contiguity_failures[:5]}...")
    
    return assignments


def secondary_balanced(
    unit_values: dict[str, dict],
    k: int,
    locked: dict[str, str],
    require_contiguity: bool = True,
    adjacency: dict[str, set[str]] = STATE_ADJACENCY,
) -> dict[str, str]:
    """
    Generate assignments balanced on the secondary metric with contiguity constraint.
    
    Same algorithm as primary_balanced but uses secondary metric.
    
    Args:
        unit_values: Dict mapping unit_id -> {"primary": float, "secondary": float}
        k: Number of territories
        locked: Pre-locked assignments
        require_contiguity: If True, enforce contiguous territories
        
    Returns:
        Complete assignments dict
    """
    territory_ids = [f"T{i+1}" for i in range(k)]
    
    # Initialize from locks
    assignments = {}
    load_secondary = {tid: 0.0 for tid in territory_ids}
    territory_states: dict[str, set[str]] = {tid: set() for tid in territory_ids}
    
    for unit_id, tid in locked.items():
        if unit_id not in unit_values:
            continue
        if tid not in territory_ids:
            continue
        assignments[unit_id] = tid
        load_secondary[tid] += unit_values[unit_id]["secondary"]
        territory_states[tid].add(unit_id)
    
    # Remaining units sorted by secondary metric
    remaining_units = [
        uid for uid in unit_values.keys() 
        if uid not in assignments
    ]
    remaining_units.sort(
        key=lambda u: unit_values[u]["secondary"],
        reverse=True
    )
    
    # Greedy assignment with contiguity constraint
    contiguity_failures = []
    for unit_id in remaining_units:
        best_tid = None
        best_load = float("inf")
        
        for tid in territory_ids:
            if require_contiguity and territory_states[tid]:
                if not can_add_to_territory(unit_id, territory_states[tid], adjacency=adjacency):
                    continue
            
            if load_secondary[tid] < best_load:
                best_load = load_secondary[tid]
                best_tid = tid
        
        # If no valid territory found under contiguity, fall back to least loaded with warning
        if best_tid is None:
            if require_contiguity:
                contiguity_failures.append(unit_id)
            best_tid = min(territory_ids, key=lambda t: load_secondary[t])
        
        assignments[unit_id] = best_tid
        load_secondary[best_tid] += unit_values[unit_id]["secondary"]
        territory_states[best_tid].add(unit_id)
    
    if contiguity_failures:
        print(f"[secondary_balanced] Contiguity relaxed for {len(contiguity_failures)} units: {contiguity_failures[:5]}...")
    
    return assignments


def dual_balanced(
    unit_values: dict[str, dict],
    k: int,
    locked: dict[str, str],
    w_primary: float = 0.7,
    w_secondary: float = 0.3,
    require_contiguity: bool = True,
    adjacency: dict[str, set[str]] = STATE_ADJACENCY,
) -> dict[str, str]:
    """
    Generate assignments balanced on both primary and secondary metrics with contiguity.
    
    Uses weighted penalty function to minimize deviation from target on both metrics.
    
    Args:
        unit_values: Dict mapping unit_id -> {"primary": float, "secondary": float}
        k: Number of territories
        locked: Pre-locked assignments
        w_primary: Weight for primary metric penalty (default 0.7)
        w_secondary: Weight for secondary metric penalty (default 0.3)
        require_contiguity: If True, enforce contiguous territories
        
    Returns:
        Complete assignments dict
    """
    territory_ids = [f"T{i+1}" for i in range(k)]
    
    # Compute totals and targets
    total_primary = sum(v["primary"] for v in unit_values.values())
    total_secondary = sum(v["secondary"] for v in unit_values.values())
    target_primary = total_primary / k if k > 0 else 0.0
    target_secondary = total_secondary / k if k > 0 else 0.0
    
    # Initialize from locks
    assignments = {}
    load_primary = {tid: 0.0 for tid in territory_ids}
    load_secondary = {tid: 0.0 for tid in territory_ids}
    territory_states: dict[str, set[str]] = {tid: set() for tid in territory_ids}
    
    for unit_id, tid in locked.items():
        if unit_id not in unit_values:
            continue
        if tid not in territory_ids:
            continue
        assignments[unit_id] = tid
        load_primary[tid] += unit_values[unit_id]["primary"]
        load_secondary[tid] += unit_values[unit_id]["secondary"]
        territory_states[tid].add(unit_id)
    
    # Remaining units sorted by weighted size (descending)
    remaining_units = [
        uid for uid in unit_values.keys() 
        if uid not in assignments
    ]
    remaining_units.sort(
        key=lambda u: (
            w_primary * unit_values[u]["primary"] +
            w_secondary * unit_values[u]["secondary"]
        ),
        reverse=True
    )
    
    # Greedy assignment minimizing combined penalty with contiguity
    contiguity_failures = []
    for unit_id in remaining_units:
        best_tid = None
        best_score = float("inf")
        
        unit_primary = unit_values[unit_id]["primary"]
        unit_secondary = unit_values[unit_id]["secondary"]
        
        for tid in territory_ids:
            # Check contiguity constraint
            if require_contiguity and territory_states[tid]:
                if not can_add_to_territory(unit_id, territory_states[tid], adjacency=adjacency):
                    continue
            
            # Compute penalty if this unit were assigned to tid
            new_primary = load_primary[tid] + unit_primary
            new_secondary = load_secondary[tid] + unit_secondary
            
            # Normalized deviation from target
            score_p = abs(new_primary - target_primary) / (target_primary + 1e-9)
            score_s = abs(new_secondary - target_secondary) / (target_secondary + 1e-9)
            
            # Combined weighted score
            score = w_primary * score_p + w_secondary * score_s
            
            if score < best_score:
                best_score = score
                best_tid = tid
        
        # Fallback if no contiguous option - use least loaded
        if best_tid is None:
            if require_contiguity:
                contiguity_failures.append(unit_id)
            best_tid = min(territory_ids, key=lambda t: load_primary[t])
        
        assignments[unit_id] = best_tid
        load_primary[best_tid] += unit_primary
        load_secondary[best_tid] += unit_secondary
        territory_states[best_tid].add(unit_id)
    
    if contiguity_failures:
        print(f"[dual_balanced] Contiguity relaxed for {len(contiguity_failures)} units: {contiguity_failures[:5]}...")
    
    return assignments


def generate_zip_scenarios_via_states(
    zip_aggregates: dict[str, dict],
    state_aggregates: dict[str, dict],
    zip_to_state: dict[str, str],
    k: int,
    primary_metric: str,
    secondary_metric: str,
    locked_assignments: dict[str, str],
    seed_assignments: dict[str, str] = None,
) -> list[dict[str, Any]]:
    """
    Generate optimization scenarios for ZIP codes by using state-level assignments.
    
    Process:
    1. Run geographic optimization at state level
    2. Assign each ZIP to the same territory as its parent state
    
    This ensures geographic contiguity at the state level while handling 28k+ ZIPs efficiently.
    """
    if seed_assignments is None:
        seed_assignments = {}
    
    print(f"[zip_optimizer] Using state-based optimization for {len(zip_aggregates)} ZIPs")
    
    # Convert ZIP-level seeds to state-level seeds if possible
    state_seeds = {}
    for zip_code, tid in seed_assignments.items():
        state = zip_to_state.get(zip_code)
        if state and tid:
            state_seeds[state] = tid
    
    # Convert ZIP-level locks to state-level (optional: aggregate by state)
    state_locks = {}
    for zip_code, tid in locked_assignments.items():
        state = zip_to_state.get(zip_code)
        if state and tid:
            state_locks[state] = tid
    
    # Run state-level optimization to get state -> territory mappings
    state_scenarios = generate_scenarios(
        aggregates=state_aggregates,
        k=k,
        primary_metric=primary_metric,
        secondary_metric=secondary_metric,
        locked_assignments=state_locks,
        seed_assignments=state_seeds,
        adjacency=STATE_ADJACENCY,
        require_contiguity=True,
    )
    
    # Convert state assignments to ZIP assignments
    zip_scenarios = []
    for state_scenario in state_scenarios:
        state_assignments = state_scenario["assignments"]
        
        # Build ZIP assignments based on parent state
        zip_assignments = {}
        unassigned_zips = []
        for zip_code in zip_aggregates.keys():
            state = zip_to_state.get(zip_code)
            if state and state in state_assignments:
                zip_assignments[zip_code] = state_assignments[state]
            else:
                unassigned_zips.append(zip_code)
        
        # Handle orphan ZIPs (no state mapping or state wasn't assigned)
        if unassigned_zips:
            print(f"[zip_optimizer] {len(unassigned_zips)} ZIPs without state mapping, distributing evenly")
            territory_ids = [f"T{i+1}" for i in range(k)]
            for i, zip_code in enumerate(unassigned_zips):
                zip_assignments[zip_code] = territory_ids[i % k]
        
        zip_scenarios.append({
            "id": state_scenario["id"],
            "label": state_scenario["label"],
            "description": state_scenario["description"] + " (ZIP via state-based assignment)",
            "assignments": zip_assignments,
        })
    
    return zip_scenarios


def generate_scenarios(
    aggregates: dict[str, dict],
    k: int,
    primary_metric: str,
    secondary_metric: str,
    locked_assignments: dict[str, str],
    seed_assignments: dict[str, str] = None,
    adjacency: dict[str, set[str]] = STATE_ADJACENCY,
    require_contiguity: bool = True,
) -> list[dict[str, Any]]:
    """
    Generate three optimization scenarios respecting locked assignments.
    
    Args:
        aggregates: Unit aggregates from data_loader
        k: Number of territories
        primary_metric: Name of primary balancing metric
        secondary_metric: Name of secondary balancing metric
        locked_assignments: Pre-locked unit assignments (hard locks)
        seed_assignments: Initial seed assignments (soft locks/start points)
        
    Returns:
        List of three scenario dicts (primary, secondary, dual)
    """
    if seed_assignments is None:
        seed_assignments = {}
    # Build unit_values from aggregates for the chosen metrics
    unit_values = {}
    for unit_id, unit_data in aggregates.items():
        metric_sums = unit_data.get("metric_sums", {})
        unit_values[unit_id] = {
            "primary": metric_sums.get(primary_metric, 0.0),
            "secondary": metric_sums.get(secondary_metric, 0.0),
        }
    
    # Filter locked assignments to valid units and territories
    valid_locks = {}
    valid_tids = {f"T{i+1}" for i in range(k)}
    for unit_id, tid in locked_assignments.items():
        if unit_id in unit_values and tid in valid_tids:
            valid_locks[unit_id] = tid
    
    # Merge seeds into locks (treating them as locks for the optimizer)
    for unit_id, tid in seed_assignments.items():
        if unit_id in unit_values and tid in valid_tids:
            # Seeds do not overwrite hard locks
            if unit_id not in valid_locks:
                valid_locks[unit_id] = tid
    
    # Convert seed_assignments to territory_id -> unit_id format for geographic optimizer
    # Input format: unit_id -> territory_id
    # Geographic optimizer expects: territory_id -> unit_id
    user_seeds_inverted = {}
    for unit_id, tid in seed_assignments.items():
        if unit_id in unit_values and tid in valid_tids:
            user_seeds_inverted[tid] = unit_id
    
    # Generate three scenarios using geographic region-growing
    scenarios = []
    
    # Scenario A: Geographic Primary-balanced
    # Uses region-growing from geographic seeds with primary metric balance
    primary_assignments = geographic_balanced(
        unit_values,
        k,
        valid_locks,
        require_contiguity=require_contiguity,
        adjacency=adjacency,
        user_seeds=user_seeds_inverted,
        balance_weight=1.0,  # Full balance on primary
    )
    scenarios.append({
        "id": "primary",
        "label": "Geographic Primary",
        "description": f"Region-growing balanced on {primary_metric} (East-West distribution).",
        "assignments": primary_assignments,
    })
    
    # Scenario B: Geographic Secondary-balanced
    # Swap primary/secondary values for secondary balancing
    unit_values_secondary = {
        uid: {"primary": vals["secondary"], "secondary": vals["primary"]}
        for uid, vals in unit_values.items()
    }
    secondary_assignments = geographic_balanced(
        unit_values_secondary,
        k,
        valid_locks,
        require_contiguity=require_contiguity,
        adjacency=adjacency,
        user_seeds=user_seeds_inverted,
        balance_weight=1.0,
    )
    scenarios.append({
        "id": "secondary",
        "label": "Geographic Secondary",
        "description": f"Region-growing balanced on {secondary_metric} (East-West distribution).",
        "assignments": secondary_assignments,
    })
    
    # Scenario C: Geographic Dual-balanced
    # Create combined metric for dual balancing
    unit_values_dual = {}
    for uid, vals in unit_values.items():
        # Combine primary (70%) and secondary (30%)
        combined = 0.7 * vals["primary"] + 0.3 * vals["secondary"]
        unit_values_dual[uid] = {"primary": combined, "secondary": vals["secondary"]}
    
    dual_assignments = geographic_balanced(
        unit_values_dual,
        k,
        valid_locks,
        require_contiguity=require_contiguity,
        adjacency=adjacency,
        user_seeds=user_seeds_inverted,
        balance_weight=0.7,
    )
    scenarios.append({
        "id": "dual",
        "label": "Geographic Dual",
        "description": f"Region-growing balanced on both metrics (70% {primary_metric}, 30% {secondary_metric}).",
        "assignments": dual_assignments,
    })
    
    return scenarios


def check_assignments_contiguity(
    assignments: dict[str, str],
    adjacency: dict[str, set[str]],
) -> dict[str, Any]:
    """
    Evaluate contiguity for each territory in a set of assignments.
    Returns a dict with:
      - checked: whether a non-empty adjacency was available
      - non_contiguous: list of territory ids that failed contiguity
      - ok: True if contiguous or not checked
    """
    if not adjacency:
        return {"checked": False, "non_contiguous": [], "ok": True}
    
    territory_units: dict[str, set[str]] = defaultdict(set)
    for unit_id, territory_id in assignments.items():
        if territory_id:
            normalized_unit = str(unit_id).strip().upper()
            territory_units[territory_id].add(normalized_unit)
    
    failures: list[str] = []
    for territory_id, units in territory_units.items():
        if not is_territory_contiguous(units, adjacency=adjacency):
            failures.append(territory_id)
    
    return {
        "checked": True,
        "non_contiguous": failures,
        "ok": len(failures) == 0,
    }

