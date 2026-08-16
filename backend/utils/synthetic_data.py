"""
CartGuard AI - Synthetic Data Generator
Generates realistic e-commerce session data with behavioral signals.

FIX (leakage patch): archetypes previously used non-overlapping, deterministic
ranges for checkout_steps_completed / payment_attempts / payment_failures,
which let the model perfectly separate classes by memorizing archetype
boundaries instead of learning behavior. This version adds cross-archetype
overlap noise + small label noise so no single feature (or fixed combination)
perfectly determines `abandoned`.
"""
import numpy as np
import random
from typing import List, Dict, Any


def generate_synthetic_sessions(n_samples: int = 5000, seed: int = 42) -> List[Dict[str, Any]]:
    """
    Generate synthetic e-commerce sessions with realistic behavioral patterns.
    Labels sessions as abandoned (1) or converted (0).

    Session types:
    - Payment failure (15%)
    - Comparison shopping (20%)
    - Friction abandonment (15%)
    - Low intent (10%)
    - Urgent buyer (20%)
    - Converted (20%)
    """
    np.random.seed(seed)
    random.seed(seed)
    sessions = []

    types = ["payment_failure", "comparison_shopping", "friction",
             "low_intent", "urgent_buyer", "converted", "price_sensitivity"]
    weights = [0.15, 0.15, 0.15, 0.10, 0.15, 0.15, 0.15]

    for i in range(n_samples):
        session_type = np.random.choice(types, p=weights)
        session = _generate_session_by_type(session_type, i)
        session = _apply_overlap_noise(session)
        sessions.append(session)

    return sessions


def _apply_overlap_noise(session: Dict[str, Any]) -> Dict[str, Any]:
    """
    Break deterministic archetype boundaries so classes overlap realistically.
    - 10% chance: checkout_steps_completed sampled from full 0-5 range
      regardless of type (people abandon at any step, including the last one).
    - 8% chance: payment_attempts / payment_failures sampled from full range
      regardless of type (payment issues can occur even on sessions that
      otherwise look like a clean browse or a clean buy).
    - 3% label noise: flip `abandoned` (real-world labels are never perfectly
      clean, and this prevents the ensemble from treating any feature set as
      a deterministic lookup table).
    """
    if random.random() < 0.10:
        session["checkout_steps_completed"] = np.random.randint(0, 6)
        session["checkout_completion_rate"] = session["checkout_steps_completed"] / 5.0

    if random.random() < 0.08:
        session["payment_attempts"] = np.random.randint(0, 4)
        session["payment_failures"] = np.random.randint(0, session["payment_attempts"] + 1)

    if random.random() < 0.03:
        session["abandoned"] = 1 - session["abandoned"]

    return session


def _generate_session_by_type(session_type: str, idx: int) -> Dict[str, Any]:
    """Generate a session matching the given type."""

    base = {
        "session_id": f"S{idx:06d}",
        "session_type": session_type,
        "is_returning_visitor": random.random() > 0.6,
        "session_recency_minutes": np.random.exponential(15),
    }

    if session_type == "payment_failure":
        return {
            **base,
            "session_duration": np.random.uniform(180, 480),
            "product_views": np.random.randint(2, 8),
            "cart_adds": np.random.randint(1, 3),
            "cart_removes": np.random.randint(0, 1),
            "cart_changes": np.random.randint(1, 4),
            "cart_value": np.random.uniform(500, 5000),
            "original_cart_value": np.random.uniform(500, 5000),
            "category_switches": np.random.randint(0, 2),
            "tab_switches": np.random.randint(0, 3),
            "page_revisits": np.random.randint(1, 3),
            "checkout_steps_completed": np.random.randint(2, 6),
            "total_checkout_steps": 5,
            "checkout_time": np.random.uniform(60, 180),
            "payment_attempts": np.random.randint(1, 4),
            "payment_failures": np.random.randint(1, 3),
            "time_on_payment_page": np.random.uniform(60, 300),
            "payment_method_switches": np.random.randint(1, 3),
            "form_field_errors": np.random.randint(0, 2),
            "back_navigations": np.random.randint(1, 3),
            "abandoned": 1,
        }

    elif session_type == "comparison_shopping":
        return {
            **base,
            "session_duration": np.random.uniform(300, 900),
            "product_views": np.random.randint(8, 25),
            "cart_adds": np.random.randint(0, 2),
            "cart_removes": np.random.randint(0, 2),
            "cart_changes": np.random.randint(2, 6),
            "cart_value": np.random.uniform(100, 3000),
            "original_cart_value": np.random.uniform(100, 3000),
            "category_switches": np.random.randint(3, 8),
            "tab_switches": np.random.randint(5, 15),
            "page_revisits": np.random.randint(2, 6),
            "checkout_steps_completed": np.random.randint(0, 2),
            "total_checkout_steps": 5,
            "checkout_time": np.random.uniform(0, 30),
            "payment_attempts": np.random.randint(0, 1),
            "payment_failures": 0,
            "time_on_payment_page": np.random.uniform(0, 20),
            "payment_method_switches": 0,
            "form_field_errors": 0,
            "back_navigations": np.random.randint(2, 5),
            "abandoned": 1,
        }

    elif session_type == "friction":
        return {
            **base,
            "session_duration": np.random.uniform(240, 600),
            "product_views": np.random.randint(2, 6),
            "cart_adds": np.random.randint(1, 3),
            "cart_removes": np.random.randint(0, 1),
            "cart_changes": np.random.randint(1, 4),
            "cart_value": np.random.uniform(200, 2000),
            "original_cart_value": np.random.uniform(200, 2000),
            "category_switches": np.random.randint(0, 2),
            "tab_switches": np.random.randint(0, 2),
            "page_revisits": np.random.randint(1, 4),
            "checkout_steps_completed": np.random.randint(1, 4),
            "total_checkout_steps": 5,
            "checkout_time": np.random.uniform(120, 300),
            "payment_attempts": np.random.randint(0, 2),
            "payment_failures": np.random.randint(0, 1),
            "time_on_payment_page": np.random.uniform(0, 60),
            "payment_method_switches": 0,
            "form_field_errors": np.random.randint(2, 6),
            "back_navigations": np.random.randint(3, 7),
            "abandoned": 1,
        }

    elif session_type == "low_intent":
        return {
            **base,
            "session_duration": np.random.uniform(120, 900),
            "product_views": np.random.randint(5, 20),
            "cart_adds": 0,
            "cart_removes": 0,
            "cart_changes": 0,
            "cart_value": 0,
            "original_cart_value": 0,
            "category_switches": np.random.randint(2, 6),
            "tab_switches": np.random.randint(3, 10),
            "page_revisits": np.random.randint(0, 3),
            "checkout_steps_completed": 0,
            "total_checkout_steps": 5,
            "checkout_time": 0,
            "payment_attempts": 0,
            "payment_failures": 0,
            "time_on_payment_page": 0,
            "payment_method_switches": 0,
            "form_field_errors": 0,
            "back_navigations": np.random.randint(1, 4),
            "abandoned": 1,
        }

    elif session_type == "urgent_buyer":
        return {
            **base,
            "session_duration": np.random.uniform(60, 240),
            "product_views": np.random.randint(1, 5),
            "cart_adds": np.random.randint(1, 3),
            "cart_removes": 0,
            "cart_changes": np.random.randint(0, 2),
            "cart_value": np.random.uniform(300, 4000),
            "original_cart_value": np.random.uniform(300, 4000),
            "category_switches": np.random.randint(0, 1),
            "tab_switches": np.random.randint(0, 2),
            "page_revisits": np.random.randint(0, 1),
            "checkout_steps_completed": np.random.randint(4, 6),
            "total_checkout_steps": 5,
            "checkout_time": np.random.uniform(30, 90),
            "payment_attempts": np.random.randint(1, 2),
            "payment_failures": 0,
            "time_on_payment_page": np.random.uniform(20, 60),
            "payment_method_switches": 0,
            "back_navigations": 0,
            "form_field_errors": 0,
            "abandoned": 0,  # CONVERTED
        }

    elif session_type == "price_sensitivity":
        cart_value = np.random.uniform(500, 3000)
        return {
            **base,
            "session_duration": np.random.uniform(200, 600),
            "product_views": np.random.randint(5, 15),
            "cart_adds": np.random.randint(1, 3),
            "cart_removes": np.random.randint(1, 3),
            "cart_changes": np.random.randint(3, 7),
            "cart_value": cart_value,
            "original_cart_value": cart_value * np.random.uniform(1.2, 1.8),
            "category_switches": np.random.randint(2, 5),
            "tab_switches": np.random.randint(1, 4),
            "page_revisits": np.random.randint(1, 3),
            "checkout_steps_completed": np.random.randint(1, 4),
            "total_checkout_steps": 5,
            "checkout_time": np.random.uniform(30, 120),
            "payment_attempts": 0,
            "payment_failures": 0,
            "time_on_payment_page": 0,
            "payment_method_switches": 0,
            "form_field_errors": 0,
            "back_navigations": np.random.randint(1, 3),
            "abandoned": 1,
        }

    else:  # converted
        return {
            **base,
            "session_duration": np.random.uniform(90, 360),
            "product_views": np.random.randint(2, 10),
            "cart_adds": np.random.randint(1, 4),
            "cart_removes": np.random.randint(0, 1),
            "cart_changes": np.random.randint(0, 3),
            "cart_value": np.random.uniform(200, 8000),
            "original_cart_value": np.random.uniform(200, 8000),
            "category_switches": np.random.randint(0, 3),
            "tab_switches": np.random.randint(0, 3),
            "page_revisits": np.random.randint(0, 2),
            "checkout_steps_completed": np.random.randint(4, 6),
            "total_checkout_steps": 5,
            "checkout_time": np.random.uniform(45, 120),
            "payment_attempts": np.random.randint(1, 2),
            "payment_failures": np.random.randint(0, 1),
            "time_on_payment_page": np.random.uniform(30, 90),
            "payment_method_switches": np.random.randint(0, 1),
            "form_field_errors": np.random.randint(0, 2),
            "back_navigations": np.random.randint(0, 2),
            "abandoned": 0,
        }