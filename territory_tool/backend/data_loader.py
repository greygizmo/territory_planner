"""
Data loading and preprocessing for ICP territory builder.
Handles CSV loading, type coercion, derived metrics, and unit aggregation.
"""
import os
from pathlib import Path
from collections import defaultdict
import numpy as np
import pandas as pd


# ============================================================================
# US State Normalization
# ============================================================================

# Map of full state/province names and common variations to standard 2-letter codes
STATE_NORMALIZATION = {
    # US States (Standard 2-letter codes)
    'AK': 'AK', 'AL': 'AL', 'AR': 'AR', 'AZ': 'AZ', 'CA': 'CA', 'CO': 'CO',
    'CT': 'CT', 'DC': 'DC', 'DE': 'DE', 'FL': 'FL', 'GA': 'GA', 'HI': 'HI',
    'IA': 'IA', 'ID': 'ID', 'IL': 'IL', 'IN': 'IN', 'KS': 'KS', 'KY': 'KY',
    'LA': 'LA', 'MA': 'MA', 'MD': 'MD', 'ME': 'ME', 'MI': 'MI', 'MN': 'MN',
    'MO': 'MO', 'MS': 'MS', 'MT': 'MT', 'NC': 'NC', 'ND': 'ND', 'NE': 'NE',
    'NH': 'NH', 'NJ': 'NJ', 'NM': 'NM', 'NV': 'NV', 'NY': 'NY', 'OH': 'OH',
    'OK': 'OK', 'OR': 'OR', 'PA': 'PA', 'RI': 'RI', 'SC': 'SC', 'SD': 'SD',
    'TN': 'TN', 'TX': 'TX', 'UT': 'UT', 'VA': 'VA', 'VT': 'VT', 'WA': 'WA',
    'WI': 'WI', 'WV': 'WV', 'WY': 'WY',
    # US Territories
    'PR': 'PR', 'GU': 'GU', 'VI': 'VI', 'AS': 'AS', 'MP': 'MP',
    
    # Canada Provinces/Territories (Standard 2-letter codes)
    'AB': 'AB', 'BC': 'BC', 'MB': 'MB', 'NB': 'NB', 'NL': 'NL', 'NS': 'NS',
    'NT': 'NT', 'NU': 'NU', 'ON': 'ON', 'PE': 'PE', 'QC': 'QC', 'SK': 'SK',
    'YT': 'YT',

    # US Full state names
    'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR',
    'CALIFORNIA': 'CA', 'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE',
    'FLORIDA': 'FL', 'GEORGIA': 'GA', 'HAWAII': 'HI', 'IDAHO': 'ID',
    'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA', 'KANSAS': 'KS',
    'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
    'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS',
    'MISSOURI': 'MO', 'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV',
    'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
    'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH', 'OKLAHOMA': 'OK',
    'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
    'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT',
    'VERMONT': 'VT', 'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV',
    'WISCONSIN': 'WI', 'WYOMING': 'WY', 'DISTRICT OF COLUMBIA': 'DC',
    'PUERTO RICO': 'PR', 'GUAM': 'GU',

    # Canada Full names & Variations
    'ALBERTA': 'AB',
    'BRITISH COLUMBIA': 'BC',
    'MANITOBA': 'MB',
    'NEW BRUNSWICK': 'NB',
    'NEWFOUNDLAND AND LABRADOR': 'NL', 'NEWFOUNDLAND': 'NL', 'LABRADOR': 'NL', 'NF': 'NL',
    'NOVA SCOTIA': 'NS',
    'NORTHWEST TERRITORIES': 'NT',
    'NUNAVUT': 'NU',
    'ONTARIO': 'ON',
    'PRINCE EDWARD ISLAND': 'PE', 'PEI': 'PE',
    'QUEBEC': 'QC', 'QUÉBEC': 'QC', 'QUABEC': 'QC', 'PQ': 'QC',
    'SASKATCHEWAN': 'SK',
    'YUKON': 'YT', 'YUKON TERRITORY': 'YT',
}

# Valid State/Province codes
VALID_STATES = {
    # USA
    'AK', 'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL',
    'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA',
    'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE',
    'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI',
    'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY',
    'PR', 'GU', 'VI', 'AS', 'MP',
    # Canada
    'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
}

# Adjacency Map (US + Canada)
STATE_ADJACENCY = {
    # --- USA ---
    'AK': {'YT', 'BC'},  # Connects to Canada
    'HI': set(),
    'AL': {'FL', 'GA', 'MS', 'TN'},
    'AR': {'LA', 'MO', 'MS', 'OK', 'TN', 'TX'},
    'AZ': {'CA', 'CO', 'NM', 'NV', 'UT'},
    'CA': {'AZ', 'NV', 'OR'},
    'CO': {'AZ', 'KS', 'NE', 'NM', 'OK', 'UT', 'WY'},
    'CT': {'MA', 'NY', 'RI'},
    'DC': {'MD', 'VA'},
    'DE': {'MD', 'NJ', 'PA'},
    'FL': {'AL', 'GA'},
    'GA': {'AL', 'FL', 'NC', 'SC', 'TN'},
    'IA': {'IL', 'MN', 'MO', 'NE', 'SD', 'WI'},
    'ID': {'MT', 'NV', 'OR', 'UT', 'WA', 'WY', 'BC'},
    'IL': {'IA', 'IN', 'KY', 'MO', 'WI'},
    'IN': {'IL', 'KY', 'MI', 'OH'},
    'KS': {'CO', 'MO', 'NE', 'OK'},
    'KY': {'IL', 'IN', 'MO', 'OH', 'TN', 'VA', 'WV'},
    'LA': {'AR', 'MS', 'TX'},
    'MA': {'CT', 'NH', 'NY', 'RI', 'VT'},
    'MD': {'DC', 'DE', 'PA', 'VA', 'WV'},
    'ME': {'NH', 'QC', 'NB'},
    'MI': {'IN', 'OH', 'WI', 'ON'}, # MI-ON connected via bridges
    'MN': {'IA', 'ND', 'SD', 'WI', 'MB', 'ON'},
    'MO': {'AR', 'IA', 'IL', 'KS', 'KY', 'NE', 'OK', 'TN'},
    'MS': {'AL', 'AR', 'LA', 'TN'},
    'MT': {'ID', 'ND', 'SD', 'WY', 'BC', 'AB', 'SK'},
    'NC': {'GA', 'SC', 'TN', 'VA'},
    'ND': {'MN', 'MT', 'SD', 'SK', 'MB'},
    'NE': {'CO', 'IA', 'KS', 'MO', 'SD', 'WY'},
    'NH': {'MA', 'ME', 'VT', 'QC'},
    'NJ': {'DE', 'NY', 'PA'},
    'NM': {'AZ', 'CO', 'OK', 'TX', 'UT'},
    'NV': {'AZ', 'CA', 'ID', 'OR', 'UT'},
    'NY': {'CT', 'MA', 'NJ', 'PA', 'VT', 'ON', 'QC'},
    'OH': {'IN', 'KY', 'MI', 'PA', 'WV'},
    'OK': {'AR', 'CO', 'KS', 'MO', 'NM', 'TX'},
    'OR': {'CA', 'ID', 'NV', 'WA'},
    'PA': {'DE', 'MD', 'NJ', 'NY', 'OH', 'WV'},
    'RI': {'CT', 'MA'},
    'SC': {'GA', 'NC'},
    'SD': {'IA', 'MN', 'MT', 'ND', 'NE', 'WY'},
    'TN': {'AL', 'AR', 'GA', 'KY', 'MO', 'MS', 'NC', 'VA'},
    'TX': {'AR', 'LA', 'NM', 'OK'},
    'UT': {'AZ', 'CO', 'ID', 'NM', 'NV', 'WY'},
    'VA': {'DC', 'KY', 'MD', 'NC', 'TN', 'WV'},
    'VT': {'MA', 'NH', 'NY', 'QC'},
    'WA': {'ID', 'OR', 'BC'},
    'WI': {'IA', 'IL', 'MI', 'MN'},
    'WV': {'KY', 'MD', 'OH', 'PA', 'VA'},
    'WY': {'CO', 'ID', 'MT', 'NE', 'SD', 'UT'},
    # US Territories
    'PR': set(), 'GU': set(), 'VI': set(), 'AS': set(), 'MP': set(),

    # --- Canada ---
    'AB': {'BC', 'SK', 'MT', 'NT'},
    'BC': {'AB', 'NT', 'YT', 'WA', 'ID', 'MT', 'AK'},
    'MB': {'SK', 'ON', 'NU', 'ND', 'MN'},
    'NB': {'QC', 'NS', 'PE', 'ME'},
    'NL': {'QC'},
    'NS': {'NB', 'PE'},
    'NT': {'BC', 'AB', 'SK', 'NU', 'YT'},
    'NU': {'MB', 'NT'},
    'ON': {'MB', 'QC', 'MN', 'MI', 'NY'},
    'PE': {'NB', 'NS'},
    'QC': {'ON', 'NB', 'NL', 'NY', 'VT', 'NH', 'ME'},
    'SK': {'AB', 'MB', 'NT', 'MT', 'ND'},
    'YT': {'BC', 'NT', 'AK'},
}


def get_adjacent_states(state: str) -> set[str]:
    """Get set of states adjacent to the given state."""
    return STATE_ADJACENCY.get(state, set())


def get_adjacency_list(granularity: str) -> dict[str, set[str]]:
    """
    Return adjacency list for the requested granularity.
    Currently only state-level adjacency is implemented.
    """
    if granularity == "state":
        return STATE_ADJACENCY
    # TODO: implement ZIP adjacency when topology is available
    print(f"[data_loader] No adjacency list available for granularity '{granularity}'. Contiguity checks will be skipped.")
    return {}


def normalize_state_code(state: str | None) -> str | None:
    """Normalize state name/code to standard 2-letter abbreviation."""
    if not state or pd.isna(state):
        return None
    
    state_str = str(state).strip().upper()
    
    # Direct lookup
    if state_str in STATE_NORMALIZATION:
        return STATE_NORMALIZATION[state_str]
    
    # Try removing extra spaces
    state_clean = ' '.join(state_str.split())
    if state_clean in STATE_NORMALIZATION:
        return STATE_NORMALIZATION[state_clean]
    
    # Check if it's already a valid 2-letter code (case-insensitive)
    if len(state_str) == 2 and state_str in VALID_STATES:
        return state_str
    
    return None  # Invalid/non-US/non-CA state


# ============================================================================
# Column Type Definitions
# ============================================================================

# Core identifier and geography columns
ID_COLUMNS = ["Customer ID", "Company Name", "ShippingState", "ShippingZip", "ShippingCity", "ShippingCountry"]

# ICP score columns (numeric, 0-100 scale)
ICP_SCORE_COLUMNS = [
    "Hardware_ICP_Score",
    "CRE_ICP_Score",
    "CPE_ICP_Score",
]

# ICP grade columns (categorical: A, B, C, D, F, or blank)
ICP_GRADE_COLUMNS = [
    "Hardware_ICP_Grade",
    "CRE_ICP_Grade",
    "CPE_ICP_Grade",
]

# Note: Account_Priority_Tier doesn't exist in this dataset
# We'll compute it based on combined ICP scores
PRIORITY_TIER_COLUMN = "Computed_Priority_Tier"

# Spend columns (numeric, currency) - legacy, prefer GP metrics
SPEND_COLUMNS = [
    "spend_12m",
    "spend_13w",
    "spend_24m",
    "spend_36m",
    "delta_13w",
    "delta_13w_pct",
    "delta_12m",
    "delta_12m_pct",
    "yoy_13w_pct",
]

# Gross Profit columns - primary financial metrics
GP_COLUMNS = [
    "GP_12M_Total",     # GP over last 12 months
    "GP_24M_Total",     # GP over last 24 months  
    "GP_36M_Total",     # GP over last 36 months
    "GP_T4Q_Total",     # GP trailing 4 quarters
    "GP_Since_2023_Total",  # GP since Jan 2023
]

# Assets under management columns
ASSET_COLUMNS = [
    "Total_Assets",     # Total assets under management (derived)
    "SW_Assets",        # Software assets (fallback)
    "HW_Assets",        # Hardware assets (Qty_Scanners + Qty_Printers)
    "CRE_Assets",       # cre_adoption_assets
    "CPE_Assets",       # Seats_CPE / seats_CPE
    "Asset_Count_Total",
    "Active_Assets_Total",
    "edu_assets",
    "cre_adoption_assets",
    "active_assets_total",
    "asset_count_total",
    "Qty_Scanners",
    "Qty_Printers",
    # NOTE: dataset uses "Seats_CPE" (capital S); keep both for compatibility
    "seats_CPE",
    "Seats_CPE",
]

# Engagement / composite score columns
ENGAGEMENT_COLUMNS = [
    "trend_score",
    "recency_score",
    "magnitude_score",
    "cadence_score",
    "momentum_score",
    "engagement_health_score",
]

# Division-specific spend columns
DIVISION_SPEND_COLUMNS = [
    "spend_12m_hw", "spend_13w_hw", "delta_13w_pct_hw", "yoy_13w_pct_hw",
    "spend_12m_cre", "spend_13w_cre", "delta_13w_pct_cre", "yoy_13w_pct_cre",
    "spend_12m_cpe", "spend_13w_cpe", "delta_13w_pct_cpe", "yoy_13w_pct_cpe",
]

# All numeric columns that should be coerced to float
NUMERIC_COLUMNS = (
    ICP_SCORE_COLUMNS +
    SPEND_COLUMNS +
    GP_COLUMNS +
    ASSET_COLUMNS +
    ENGAGEMENT_COLUMNS +
    DIVISION_SPEND_COLUMNS
)

# Grade fields to track for territory stats
GRADE_FIELDS = ICP_GRADE_COLUMNS + ["Computed_Priority_Tier"]

# Metrics available for balancing
BALANCING_METRICS = [
    # ICP Score metrics
    "Combined_ICP_Score",
    "Hardware_ICP_Score",
    "CRE_ICP_Score",
    "CPE_ICP_Score",
    "Weighted_ICP_Value",
    # Gross Profit metrics (primary financial)
    "GP_12M_Total",
    "GP_24M_Total",
    "GP_36M_Total",
    # Assets under management (optimize on these)
    "Total_Assets",
    "HW_Assets",
    "CRE_Assets",
    "CPE_Assets",
    # A+B account count metrics (for balancing high-value accounts)
    "Hardware_AB_Count",
    "CRE_AB_Count",
    "CPE_AB_Count",
    "Combined_AB_Count",
    "Account_Count",  # Total account count
    # Attention load (weighted counts)
    "HighTouchWeighted_HW",
    "HighTouchWeighted_CRE",
    "HighTouchWeighted_CPE",
    "HighTouchWeighted_Combined",
]

# Metric display names for the frontend
METRIC_DISPLAY_NAMES = {
    # ICP metrics
    "Combined_ICP_Score": "Combined ICP Score",
    "Hardware_ICP_Score": "Hardware ICP",
    "CRE_ICP_Score": "CRE ICP",
    "CPE_ICP_Score": "CPE ICP",
    "Weighted_ICP_Value": "Weighted ICP Value",
    # Gross Profit metrics
    "GP_12M_Total": "GP (12 Month)",
    "GP_24M_Total": "GP (24 Month)",
    "GP_36M_Total": "GP (36 Month)",
    # Assets
    "Total_Assets": "Total Assets",
    "HW_Assets": "Hardware Assets",
    "CRE_Assets": "CRE Assets",
    "CPE_Assets": "CPE Assets",
    # Attention load (weighted counts)
    "HighTouchWeighted_HW": "Attention Load (HW)",
    "HighTouchWeighted_CRE": "Attention Load (CRE)",
    "HighTouchWeighted_CPE": "Attention Load (CPE)",
    "HighTouchWeighted_Combined": "Attention Load (All)",
    # Account counts
    "Hardware_AB_Count": "HW A+B Accounts",
    "CRE_AB_Count": "CRE A+B Accounts",
    "CPE_AB_Count": "CPE A+B Accounts",
    "Combined_AB_Count": "All A+B Accounts",
    "Account_Count": "Total Accounts",
}


class DataStore:
    """
    Singleton-like data store that holds the loaded DataFrame and precomputed aggregates.
    """
    
    def __init__(self):
        self.df: pd.DataFrame | None = None
        self.state_aggregates: dict[str, dict] | None = None
        self.zip_aggregates: dict[str, dict] | None = None
        self._loaded = False
    
    def load_data(
        self, 
        csv_path: str | Path, 
        countries: list[str] | None = None
    ) -> None:
        """
        Load and preprocess the ICP scored accounts CSV.
        
        Args:
            csv_path: Path to the CSV file.
            countries: List of country codes to include. Defaults to ["_unitedStates", "_canada"].
        """
        csv_path = Path(csv_path)
        if not csv_path.exists():
            raise FileNotFoundError(f"CSV file not found: {csv_path}")
        
        if countries is None:
            countries = ["_unitedStates", "_canada"]
            
        print(f"Loading data from {csv_path}...")
        print(f"Target countries: {countries}")
        
        # Read CSV with optimized settings for large file
        # Only read relevant columns to speed up check/load if needed, but for now read all
        self.df = pd.read_csv(
            csv_path,
            low_memory=False,
            na_values=["", "NA", "N/A", "null", "NULL"],
        )
        
        # Strip whitespace from column names
        self.df.columns = self.df.columns.str.strip()
        
        # Filter to specified countries
        original_count = len(self.df)
        if "ShippingCountry" in self.df.columns:
            # Normalize country column if needed (strip whitespace)
            if self.df["ShippingCountry"].dtype == "object":
                self.df["ShippingCountry"] = self.df["ShippingCountry"].str.strip()
                
            self.df = self.df[self.df["ShippingCountry"].isin(countries)].copy()
            print(f"Filtered to {countries} accounts: {len(self.df):,} of {original_count:,}")
        
        # Normalize state codes to standard 2-letter abbreviations
        if "ShippingState" in self.df.columns:
            self.df["ShippingState_Original"] = self.df["ShippingState"]
            self.df["ShippingState"] = self.df["ShippingState"].apply(normalize_state_code)
            
            # Filter out rows with invalid/unmapped states
            valid_mask = self.df["ShippingState"].notna()
            invalid_count = (~valid_mask).sum()
            if invalid_count > 0:
                print(f"Removed {invalid_count:,} accounts with invalid state codes")
            self.df = self.df[valid_mask].copy()
        
        # Coerce numeric columns
        self._coerce_numeric_columns()
        
        # Compute derived metrics
        self._compute_derived_metrics()
        
        # Precompute aggregates for both granularities
        self.state_aggregates = self._build_unit_aggregates("state")
        self.zip_aggregates = self._build_unit_aggregates("zip")
        
        self._loaded = True
        print(f"Loaded {len(self.df):,} accounts")
        print(f"  States/Provinces: {len(self.state_aggregates)}")
        print(f"  ZIPs/Postalcodes: {len(self.zip_aggregates)}")
        print(f"  Adjacency entries: {len(STATE_ADJACENCY)}")
    
    def _coerce_numeric_columns(self) -> None:
        """Convert numeric columns to float, handling errors gracefully."""
        for col in NUMERIC_COLUMNS:
            if col in self.df.columns:
                self.df[col] = pd.to_numeric(self.df[col], errors="coerce").fillna(0.0)
    
    def _compute_derived_metrics(self) -> None:
        """Compute Combined_ICP_Score, Weighted_ICP_Value, High_Touch_Score, and Computed_Priority_Tier."""
        def _first_existing_numeric(candidates: list[str]) -> pd.Series:
            """
            Return the first existing column among candidates as a numeric series.
            This handles dataset column naming drift (e.g. 'Seats_CPE' vs 'seats_CPE').
            """
            for col in candidates:
                if col in self.df.columns:
                    return self.df[col].fillna(0)
            return pd.Series(0, index=self.df.index)

        # Get ICP scores, filling missing with 0
        hw = self.df.get("Hardware_ICP_Score", pd.Series(0, index=self.df.index)).fillna(0)
        cre = self.df.get("CRE_ICP_Score", pd.Series(0, index=self.df.index)).fillna(0)
        cpe = self.df.get("CPE_ICP_Score", pd.Series(0, index=self.df.index)).fillna(0)
        
        # Count divisions with non-zero scores
        div_count = (hw > 0).astype(int) + (cre > 0).astype(int) + (cpe > 0).astype(int)
        
        # Combined ICP Score = average of non-zero division scores
        self.df["Combined_ICP_Score"] = np.where(
            div_count > 0,
            (hw + cre + cpe) / div_count,
            0.0,
        )
        
        # Harmonize GP windows from existing spend columns if GP columns are missing/zero
        spend_12m = self.df.get("spend_12m", pd.Series(0, index=self.df.index)).fillna(0)
        spend_24m = self.df.get("spend_24m", pd.Series(0, index=self.df.index)).fillna(0)
        spend_36m = self.df.get("spend_36m", pd.Series(0, index=self.df.index)).fillna(0)
        
        gp_12m_series = self.df.get("GP_12M_Total", pd.Series(0, index=self.df.index)).fillna(0)
        if gp_12m_series.sum() == 0 and spend_12m.sum() > 0:
            gp_12m_series = spend_12m
        self.df["GP_12M_Total"] = gp_12m_series
        
        gp_24m_series = self.df.get("GP_24M_Total", pd.Series(0, index=self.df.index)).fillna(0)
        if gp_24m_series.sum() == 0 and spend_24m.sum() > 0:
            gp_24m_series = spend_24m
        self.df["GP_24M_Total"] = gp_24m_series
        
        gp_36m_series = self.df.get("GP_36M_Total", pd.Series(0, index=self.df.index)).fillna(0)
        if gp_36m_series.sum() == 0 and spend_36m.sum() > 0:
            gp_36m_series = spend_36m
        self.df["GP_36M_Total"] = gp_36m_series
        
        # Weighted ICP Value = Combined_ICP_Score * log1p(GP_12M or spend_12m as fallback)
        financial_base = np.where(gp_12m_series > 0, gp_12m_series, spend_12m)
        negatives = (financial_base < 0).sum()
        if negatives > 0:
            print(f"[data_loader] Taking absolute value for {negatives} negative GP/spend rows before log1p")
        financial_base = np.where(financial_base < 0, np.abs(financial_base), financial_base)
        self.df["Weighted_ICP_Value"] = self.df["Combined_ICP_Score"] * np.log1p(financial_base)
        self.df["Opportunity_Combined"] = self.df["Weighted_ICP_Value"]
        
        # Derived YoY fields from available columns
        self.df["GP_12M_Prior"] = self.df.get("spend_12m_prior", pd.Series(0, index=self.df.index)).fillna(0)
        self.df["GP_12M_Delta"] = self.df.get("delta_12m", pd.Series(0, index=self.df.index)).fillna(0)
        self.df["GP_12M_Delta_Pct"] = self.df.get("delta_12m_pct", pd.Series(0, index=self.df.index)).fillna(0)

        # Assets mapping per division
        hw_assets = self.df.get("Qty_Scanners", pd.Series(0, index=self.df.index)).fillna(0) + \
                    self.df.get("Qty_Printers", pd.Series(0, index=self.df.index)).fillna(0)
        cre_assets = self.df.get("cre_adoption_assets", pd.Series(0, index=self.df.index)).fillna(0)
        # NOTE: CSV uses "Seats_CPE" (capital S) but older code expected "seats_CPE".
        cpe_assets = _first_existing_numeric(["Seats_CPE", "seats_CPE"])

        self.df["HW_Assets"] = hw_assets
        self.df["CRE_Assets"] = cre_assets
        self.df["CPE_Assets"] = cpe_assets
        self.df["Total_Assets"] = hw_assets + cre_assets + cpe_assets
        self.df["Active_Assets_Total"] = self.df.get("active_assets_total", self.df["Total_Assets"]).fillna(0)
        self.df["Asset_Count_Total"] = self.df.get("asset_count_total", self.df["Total_Assets"]).fillna(0)
        self.df["SW_Assets"] = self.df.get("SW_Assets", pd.Series(0, index=self.df.index)).fillna(0)

        # High-touch weighted counts based on grades (A=3, B=2, C=1, else 0)
        weight_map = {"A": 3, "B": 2, "C": 1}
        hw_grade = self.df.get("Hardware_ICP_Grade", pd.Series("", index=self.df.index)).fillna("").str.upper().map(weight_map).fillna(0)
        cre_grade = self.df.get("CRE_ICP_Grade", pd.Series("", index=self.df.index)).fillna("").str.upper().map(weight_map).fillna(0)
        cpe_grade = self.df.get("CPE_ICP_Grade", pd.Series("", index=self.df.index)).fillna("").str.upper().map(weight_map).fillna(0)

        self.df["HighTouchWeighted_HW"] = hw_grade.astype(float)
        self.df["HighTouchWeighted_CRE"] = cre_grade.astype(float)
        self.df["HighTouchWeighted_CPE"] = cpe_grade.astype(float)
        self.df["HighTouchWeighted_Combined"] = (hw_grade + cre_grade + cpe_grade).astype(float)
        
        # Compute Priority Tier based on Combined ICP Score percentiles
        # A = top 20%, B = next 20%, C = next 20%, D = next 20%, F = bottom 20%
        combined = self.df["Combined_ICP_Score"]
        tier = pd.cut(
            combined.rank(pct=True),
            bins=[0, 0.2, 0.4, 0.6, 0.8, 1.0],
            labels=["F", "D", "C", "B", "A"],
            include_lowest=True,
        )
        # Convert to string to allow fillna with "Blank"
        self.df["Computed_Priority_Tier"] = tier.astype(str).replace("nan", "Blank")
    
    def _build_unit_aggregates(self, granularity: str) -> dict[str, dict]:
        """
        Build aggregated metrics per geographic unit (state or ZIP).
        
        Returns a dict mapping unit_id -> {
            "account_count": int,
            "metric_sums": {metric_name: float, ...},
            "grades": {grade_field: [list of grades], ...},
            "spend_dynamics_components": {...}
        }
        """
        if granularity == "state":
            group_col = "ShippingState"
        else:
            group_col = "ShippingZip"
        
        if group_col not in self.df.columns:
            return {}
        
        # Filter out rows with missing group values
        df_valid = self.df[self.df[group_col].notna() & (self.df[group_col] != "")]
        
        aggregates = {}
        
        for unit_id, group in df_valid.groupby(group_col):
            unit_id = str(unit_id).strip()
            if not unit_id:
                continue
            
            # Basic counts
            account_count = len(group)
            
            # Sum all balancing metrics
            metric_sums = {}
            for metric in BALANCING_METRICS:
                # Skip count metrics - computed separately below
                if metric.endswith("_Count"):
                    continue
                if metric in group.columns:
                    metric_sums[metric] = float(group[metric].sum())
                else:
                    metric_sums[metric] = 0.0
            
            # Compute A+B account counts
            # Hardware A+B count
            if "Hardware_ICP_Grade" in group.columns:
                hw_ab = group["Hardware_ICP_Grade"].isin(["A", "B"]).sum()
                metric_sums["Hardware_AB_Count"] = float(hw_ab)
            else:
                metric_sums["Hardware_AB_Count"] = 0.0
            
            # CRE A+B count
            if "CRE_ICP_Grade" in group.columns:
                cre_ab = group["CRE_ICP_Grade"].isin(["A", "B"]).sum()
                metric_sums["CRE_AB_Count"] = float(cre_ab)
            else:
                metric_sums["CRE_AB_Count"] = 0.0
            
            # CPE A+B count
            if "CPE_ICP_Grade" in group.columns:
                cpe_ab = group["CPE_ICP_Grade"].isin(["A", "B"]).sum()
                metric_sums["CPE_AB_Count"] = float(cpe_ab)
            else:
                metric_sums["CPE_AB_Count"] = 0.0
            
            # Combined A+B count (any division has A or B)
            combined_ab_mask = (
                group.get("Hardware_ICP_Grade", pd.Series("", index=group.index)).isin(["A", "B"]) |
                group.get("CRE_ICP_Grade", pd.Series("", index=group.index)).isin(["A", "B"]) |
                group.get("CPE_ICP_Grade", pd.Series("", index=group.index)).isin(["A", "B"])
            )
            metric_sums["Combined_AB_Count"] = float(combined_ab_mask.sum())
            
            # Total account count
            metric_sums["Account_Count"] = float(account_count)
            
            # Collect grades as lists for distribution computation
            grades = {}
            for grade_field in GRADE_FIELDS:
                if grade_field in group.columns:
                    grades[grade_field] = group[grade_field].fillna("Blank").tolist()
                else:
                    grades[grade_field] = ["Blank"] * account_count
            
            # Financial dynamics components - GP time windows are primary
            financial_dynamics = {
                # GP time windows (primary metrics)
                "gp_12m": float(group.get("GP_12M_Total", pd.Series(0)).fillna(0).sum()),
                "gp_24m": float(group.get("GP_24M_Total", pd.Series(0)).fillna(0).sum()),
                "gp_36m": float(group.get("GP_36M_Total", pd.Series(0)).fillna(0).sum()),
                "gp_t4q": float(group.get("GP_T4Q_Total", pd.Series(0)).fillna(0).sum()),
                "gp_since_2023": float(group.get("GP_Since_2023_Total", pd.Series(0)).fillna(0).sum()),
                # Legacy spend (for compatibility)
                "spend_12m": float(group.get("spend_12m", pd.Series(0)).fillna(0).sum()),
                "gp_12m_prior": float(group.get("GP_12M_Prior", pd.Series(0)).fillna(0).sum()),
                "yoy_delta_12m": float(group.get("GP_12M_Delta", pd.Series(0)).fillna(0).sum()),
                "yoy_delta_12m_pct": float(group.get("GP_12M_Delta_Pct", pd.Series(0)).fillna(0).sum()),
                # Assets under management
                "total_assets": float(group.get("Total_Assets", pd.Series(0)).fillna(0).sum()),
                "sw_assets": float(group.get("SW_Assets", pd.Series(0)).fillna(0).sum()),
                "hw_assets": float(group.get("HW_Assets", pd.Series(0)).fillna(0).sum()),
                # High-touch weighted counts
                "high_touch_hw": float(group.get("HighTouchWeighted_HW", pd.Series(0)).fillna(0).sum()),
                "high_touch_cre": float(group.get("HighTouchWeighted_CRE", pd.Series(0)).fillna(0).sum()),
                "high_touch_cpe": float(group.get("HighTouchWeighted_CPE", pd.Series(0)).fillna(0).sum()),
                "high_touch_combined": float(group.get("HighTouchWeighted_Combined", pd.Series(0)).fillna(0).sum()),
                # Engagement scores (sums for averaging)
                "trend_score_sum": float(group.get("trend_score", pd.Series(0)).fillna(0).sum()),
                "recency_score_sum": float(group.get("recency_score", pd.Series(0)).fillna(0).sum()),
                "momentum_score_sum": float(group.get("momentum_score", pd.Series(0)).fillna(0).sum()),
                "engagement_health_score_sum": float(
                    group.get("engagement_health_score", pd.Series(0)).fillna(0).sum()
                ),
            }
            
            aggregates[unit_id] = {
                "account_count": account_count,
                "metric_sums": metric_sums,
                "grades": grades,
                "financial_dynamics": financial_dynamics,
            }
        
        return aggregates
    
    def get_aggregates(self, granularity: str) -> dict[str, dict]:
        """Get precomputed aggregates for the specified granularity."""
        if granularity == "state":
            return self.state_aggregates or {}
        else:
            return self.zip_aggregates or {}
    
    @property
    def row_count(self) -> int:
        return len(self.df) if self.df is not None else 0
    
    @property
    def state_count(self) -> int:
        return len(self.state_aggregates) if self.state_aggregates else 0
    
    @property
    def zip_count(self) -> int:
        return len(self.zip_aggregates) if self.zip_aggregates else 0
    
    @property
    def is_loaded(self) -> bool:
        return self._loaded
    
    def get_zip_to_state_mapping(self) -> dict[str, str]:
        """
        Build a mapping from ZIP code to state code.
        Used for ZIP-level optimization to inherit state-level territory assignments.
        """
        if self.df is None:
            return {}
        
        # Create unique mapping - for ZIPs that span multiple states (rare), 
        # use the first/most common state
        zip_state_counts = self.df.groupby(["ShippingZip", "ShippingState"]).size()
        
        zip_to_state = {}
        for (zip_code, state), count in zip_state_counts.items():
            zip_code = str(zip_code).strip()
            state = str(state).strip().upper() if state else ""
            if zip_code and state:
                if zip_code not in zip_to_state:
                    zip_to_state[zip_code] = state
        
        return zip_to_state
    
    def get_unique_industries(self) -> list[str]:
        """
        Get list of unique industries in the dataset.
        Returns sorted list of industry names.
        """
        if self.df is None or "Industry" not in self.df.columns:
            return []
        
        industries = self.df["Industry"].dropna().unique().tolist()
        # Filter out empty strings and sort
        industries = sorted([ind for ind in industries if ind and str(ind).strip()])
        return industries
    
    def get_industry_counts(self) -> dict[str, int]:
        """
        Get count of accounts per industry.
        Returns dict mapping industry name to account count.
        """
        if self.df is None or "Industry" not in self.df.columns:
            return {}
        
        counts = self.df["Industry"].value_counts().to_dict()
        return {str(k): int(v) for k, v in counts.items() if k and str(k).strip()}
    
    def get_filtered_aggregates(
        self, 
        granularity: str, 
        excluded_industries: list[str] | None = None,
        country_filter: str | None = None,
    ) -> dict[str, dict]:
        """
        Get aggregates with optional industry and country filtering.
        If filters are provided, recompute aggregates on filtered data.
        
        Args:
            granularity: "state" or "zip"
            excluded_industries: List of industry names to exclude
            country_filter: Filter by country: 'us', 'ca', or 'all'/None (default)
        
        Returns:
            Dict of unit_id -> aggregate data
        """
        # If no filtering needed, return cached aggregates
        if not excluded_industries and not country_filter:
            return self.get_aggregates(granularity)
        
        if self.df is None:
            return {}
        
        # Filter dataframe
        df_filtered = self.df.copy()
        
        # Apply industry filter
        if "Industry" in df_filtered.columns and excluded_industries:
            mask = ~df_filtered["Industry"].isin(excluded_industries)
            df_filtered = df_filtered[mask]
        
        # Apply country filter
        if country_filter and country_filter.lower() != "all":
            if "ShippingCountry" in df_filtered.columns:
                country_map = {
                    "us": "_unitedStates",
                    "ca": "_canada",
                }
                target_country = country_map.get(country_filter.lower())
                if target_country:
                    df_filtered = df_filtered[df_filtered["ShippingCountry"] == target_country]
        
        # Rebuild aggregates on filtered data
        return self._build_unit_aggregates_from_df(df_filtered, granularity)
    
    def _build_unit_aggregates_from_df(
        self, 
        df: pd.DataFrame, 
        granularity: str
    ) -> dict[str, dict]:
        """
        Build unit aggregates from a given dataframe.
        This is the internal implementation used by both cached and filtered aggregates.
        """
        if granularity == "state":
            group_col = "ShippingState"
        else:
            group_col = "ShippingZip"
        
        if group_col not in df.columns:
            return {}
        
        # Filter out rows with missing group values
        df_valid = df[df[group_col].notna() & (df[group_col] != "")]
        
        aggregates = {}
        
        for unit_id, group in df_valid.groupby(group_col):
            unit_id = str(unit_id).strip()
            if not unit_id:
                continue
            
            # Basic counts
            account_count = len(group)
            
            # Sum all balancing metrics
            metric_sums = {}
            for metric in BALANCING_METRICS:
                # Skip count metrics - computed separately below
                if metric.endswith("_Count"):
                    continue
                if metric in group.columns:
                    metric_sums[metric] = float(group[metric].sum())
                else:
                    metric_sums[metric] = 0.0
            
            # Compute A+B account counts
            # Hardware A+B count
            if "Hardware_ICP_Grade" in group.columns:
                hw_ab = group["Hardware_ICP_Grade"].isin(["A", "B"]).sum()
                metric_sums["Hardware_AB_Count"] = float(hw_ab)
            else:
                metric_sums["Hardware_AB_Count"] = 0.0
            
            # CRE A+B count
            if "CRE_ICP_Grade" in group.columns:
                cre_ab = group["CRE_ICP_Grade"].isin(["A", "B"]).sum()
                metric_sums["CRE_AB_Count"] = float(cre_ab)
            else:
                metric_sums["CRE_AB_Count"] = 0.0
            
            # CPE A+B count
            if "CPE_ICP_Grade" in group.columns:
                cpe_ab = group["CPE_ICP_Grade"].isin(["A", "B"]).sum()
                metric_sums["CPE_AB_Count"] = float(cpe_ab)
            else:
                metric_sums["CPE_AB_Count"] = 0.0
            
            # Combined A+B count (any division has A or B)
            combined_ab_mask = (
                group.get("Hardware_ICP_Grade", pd.Series("", index=group.index)).isin(["A", "B"]) |
                group.get("CRE_ICP_Grade", pd.Series("", index=group.index)).isin(["A", "B"]) |
                group.get("CPE_ICP_Grade", pd.Series("", index=group.index)).isin(["A", "B"])
            )
            metric_sums["Combined_AB_Count"] = float(combined_ab_mask.sum())
            
            # Total account count
            metric_sums["Account_Count"] = float(account_count)
            
            # Collect grades as lists for distribution computation
            grades = {}
            for grade_field in GRADE_FIELDS:
                if grade_field in group.columns:
                    grades[grade_field] = group[grade_field].fillna("Blank").tolist()
                else:
                    grades[grade_field] = ["Blank"] * account_count
            
            # Financial dynamics components - GP time windows are primary
            financial_dynamics = {
                # GP time windows (primary metrics)
                "gp_12m": float(group.get("GP_12M_Total", pd.Series(0)).fillna(0).sum()),
                "gp_24m": float(group.get("GP_24M_Total", pd.Series(0)).fillna(0).sum()),
                "gp_36m": float(group.get("GP_36M_Total", pd.Series(0)).fillna(0).sum()),
                "gp_t4q": float(group.get("GP_T4Q_Total", pd.Series(0)).fillna(0).sum()),
                "gp_since_2023": float(group.get("GP_Since_2023_Total", pd.Series(0)).fillna(0).sum()),
                # Legacy spend (for compatibility)
                "spend_12m": float(group.get("spend_12m", pd.Series(0)).fillna(0).sum()),
                "gp_12m_prior": float(group.get("GP_12M_Prior", pd.Series(0)).fillna(0).sum()),
                "yoy_delta_12m": float(group.get("GP_12M_Delta", pd.Series(0)).fillna(0).sum()),
                "yoy_delta_12m_pct": float(group.get("GP_12M_Delta_Pct", pd.Series(0)).fillna(0).sum()),
                # Assets under management
                "total_assets": float(group.get("Total_Assets", pd.Series(0)).fillna(0).sum()),
                "sw_assets": float(group.get("SW_Assets", pd.Series(0)).fillna(0).sum()),
                "hw_assets": float(group.get("HW_Assets", pd.Series(0)).fillna(0).sum()),
                # High-touch weighted counts
                "high_touch_hw": float(group.get("HighTouchWeighted_HW", pd.Series(0)).fillna(0).sum()),
                "high_touch_cre": float(group.get("HighTouchWeighted_CRE", pd.Series(0)).fillna(0).sum()),
                "high_touch_cpe": float(group.get("HighTouchWeighted_CPE", pd.Series(0)).fillna(0).sum()),
                "high_touch_combined": float(group.get("HighTouchWeighted_Combined", pd.Series(0)).fillna(0).sum()),
                # Engagement scores (sums for averaging)
                "trend_score_sum": float(group.get("trend_score", pd.Series(0)).fillna(0).sum()),
                "recency_score_sum": float(group.get("recency_score", pd.Series(0)).fillna(0).sum()),
                "momentum_score_sum": float(group.get("momentum_score", pd.Series(0)).fillna(0).sum()),
                "engagement_health_score_sum": float(
                    group.get("engagement_health_score", pd.Series(0)).fillna(0).sum()
                ),
            }
            
            aggregates[unit_id] = {
                "account_count": account_count,
                "metric_sums": metric_sums,
                "grades": grades,
                "financial_dynamics": financial_dynamics,
            }
        
        return aggregates


# Global data store instance
data_store = DataStore()


def get_data_store() -> DataStore:
    """Get the global data store instance."""
    return data_store


def load_csv_data(csv_path: str | Path | None = None) -> DataStore:
    """
    Load data from CSV, using default path if not specified.
    Returns the data store instance.
    """
    if csv_path is None:
        # Default to CSV in project root (two levels up from backend)
        backend_dir = Path(__file__).parent
        project_root = backend_dir.parent.parent
        csv_path = project_root / "icp_scored_accounts.csv"
    
    data_store.load_data(csv_path)
    return data_store
