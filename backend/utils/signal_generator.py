"""
CartGuard AI - Synthetic Behavioral Signal Generator
Derives micro-signals from available data to fill gaps in behavioral data.
"""
from typing import Dict, Any, Optional

try:
    import numpy as np
    import pandas as pd
except ImportError:
    np = None
    pd = None
import math
from typing import Dict, Any, Optional, List


class BehavioralSignalGenerator:
    """
    Generates derived behavioral micro-signals from raw session data.
    These signals capture hesitation, friction, intent, and urgency.
    """

    def calculate_hesitation_score(
        self,
        session_duration: float,
        cart_changes: int,
        page_revisits: int,
        checkout_time: float = 0,
    ) -> float:
        """
        Hesitation = Long session + many cart changes + revisiting pages.
        Scale: 0 (decisive) to 1 (highly hesitant)
        """
        # Normalize session duration (penalize > 5 minutes)
        duration_factor = min(session_duration / 300.0, 1.0)

        # Cart changes (adds/removes) indicate indecision
        cart_factor = min(cart_changes / 10.0, 1.0)

        # Page revisits indicate uncertainty
        revisit_factor = min(page_revisits / 5.0, 1.0)

        # Checkout time penalty
        checkout_factor = min(checkout_time / 120.0, 1.0) if checkout_time > 0 else 0

        hesitation = (
            0.35 * duration_factor
            + 0.30 * cart_factor
            + 0.20 * revisit_factor
            + 0.15 * checkout_factor
        )
        return round(min(hesitation, 1.0), 4)

    def calculate_price_sensitivity(
        self,
        cart_value_changes: int,
        product_views: int,
        category_switches: int,
        original_cart_value: float,
        current_cart_value: float,
    ) -> float:
        """
        Price sensitivity = removing items, comparing categories, volatile cart value.
        """
        # Volatile cart value changes
        value_change_ratio = abs(original_cart_value - current_cart_value) / max(
            original_cart_value, 1
        )
        value_factor = min(value_change_ratio, 1.0)

        # High product views with low cart adds = comparison shopping
        view_to_cart_ratio = product_views / max(cart_value_changes + 1, 1)
        view_factor = min(view_to_cart_ratio / 10.0, 1.0)

        # Category switches = looking for alternatives
        category_factor = min(category_switches / 5.0, 1.0)

        sensitivity = 0.4 * value_factor + 0.35 * view_factor + 0.25 * category_factor
        return round(min(sensitivity, 1.0), 4)

    def calculate_funnel_friction(
        self,
        checkout_steps_completed: int,
        total_checkout_steps: int,
        time_per_step: float,
        form_field_errors: int = 0,
        back_navigations: int = 0,
    ) -> float:
        """
        Funnel friction = dropping out early + slow progress + errors.
        """
        # How far they got through checkout (less progress = more friction)
        if total_checkout_steps > 0:
            progress = checkout_steps_completed / total_checkout_steps
            friction_from_dropout = 1.0 - progress
        else:
            friction_from_dropout = 1.0

        # Slow time per step
        time_factor = min(time_per_step / 60.0, 1.0)

        # Form errors
        error_factor = min(form_field_errors / 5.0, 1.0)

        # Back navigations
        back_factor = min(back_navigations / 3.0, 1.0)

        friction = (
            0.35 * friction_from_dropout
            + 0.25 * time_factor
            + 0.25 * error_factor
            + 0.15 * back_factor
        )
        return round(min(friction, 1.0), 4)

    def calculate_comparison_intent(
        self,
        category_switches: int,
        tab_switches: int,
        product_views: int,
        cart_adds: int,
        session_duration: float,
    ) -> float:
        """
        Comparison intent = browsing multiple categories without committing.
        """
        # Category switching
        category_factor = min(category_switches / 5.0, 1.0)

        # Tab switching (competitor checking)
        tab_factor = min(tab_switches / 10.0, 1.0)

        # High product views relative to cart adds
        if cart_adds > 0:
            pv_ratio = product_views / cart_adds
        else:
            pv_ratio = product_views
        view_ratio_factor = min(pv_ratio / 20.0, 1.0)

        comparison = (
            0.40 * category_factor + 0.35 * tab_factor + 0.25 * view_ratio_factor
        )
        return round(min(comparison, 1.0), 4)

    def calculate_urgency_score(
        self,
        cart_adds_per_minute: float,
        view_to_cart_ratio: float,
        session_recency_minutes: float,
        is_returning_visitor: bool = False,
    ) -> float:
        """
        Urgency = quick adds + low view-to-cart ratio + recent activity.
        Higher urgency = more likely to buy NOW.
        """
        # Fast adds = urgency
        add_rate_factor = min(cart_adds_per_minute / 5.0, 1.0)

        # Low view-to-cart ratio = decisive
        view_ratio_factor = 1.0 - min(view_to_cart_ratio / 10.0, 1.0)

        # Recent activity
        recency_factor = 1.0 - min(session_recency_minutes / 30.0, 1.0)

        # Returning visitor bonus
        returning_bonus = 0.15 if is_returning_visitor else 0.0

        urgency = (
            0.30 * add_rate_factor
            + 0.35 * view_ratio_factor
            + 0.25 * recency_factor
            + returning_bonus
        )
        return round(min(urgency, 1.0), 4)

    def calculate_payment_risk(
        self,
        payment_attempts: int,
        payment_failures: int,
        time_on_payment_page: float,
        payment_method_switches: int = 0,
    ) -> float:
        """
        Payment risk = failed attempts + time stuck on payment page.
        """
        if payment_attempts == 0:
            return 0.0

        failure_rate = payment_failures / payment_attempts
        time_factor = min(time_on_payment_page / 180.0, 1.0)
        switch_factor = min(payment_method_switches / 3.0, 1.0)

        risk = 0.50 * failure_rate + 0.30 * time_factor + 0.20 * switch_factor
        return round(min(risk, 1.0), 4)

    def generate_all_signals(self, session_data: Dict[str, Any]) -> Dict[str, float]:
        """
        Generate complete behavioral signal set from raw session data.
        """
        sd = session_data

        hesitation = self.calculate_hesitation_score(
            session_duration=sd.get("session_duration", 0),
            cart_changes=sd.get("cart_changes", 0),
            page_revisits=sd.get("page_revisits", 0),
            checkout_time=sd.get("checkout_time", 0),
        )

        price_sensitivity = self.calculate_price_sensitivity(
            cart_value_changes=sd.get("cart_value_changes", 0),
            product_views=sd.get("product_views", 0),
            category_switches=sd.get("category_switches", 0),
            original_cart_value=sd.get("original_cart_value") or sd.get("cart_value") or 100,
            current_cart_value=sd.get("cart_value", 100),
        )

        session_dur = sd.get("session_duration", 1)
        funnel_friction = self.calculate_funnel_friction(
            checkout_steps_completed=sd.get("checkout_steps_completed", 0),
            total_checkout_steps=sd.get("total_checkout_steps", 5),
            time_per_step=sd.get("checkout_time", 0) / max(sd.get("checkout_steps_completed", 1), 1),
            form_field_errors=sd.get("form_field_errors", 0),
            back_navigations=sd.get("back_navigations", 0),
        )

        # Check if they have comparison items in cart
        has_comparison_items = False
        items = sd.get("cart_items", [])
        if items and len(items) >= 2:
            for i in range(len(items)):
                for j in range(i + 1, len(items)):
                    item1 = items[i]
                    item2 = items[j]
                    name1 = (item1.get("name") or "").lower().strip()
                    name2 = (item2.get("name") or "").lower().strip()
                    price1 = float(item1.get("price") or 0)
                    price2 = float(item2.get("price") or 0)
                    words1 = name1.split()
                    words2 = name2.split()
                    min_len = min(len(words1), len(words2))
                    if min_len >= 2:
                        common_prefix = words1[:2] == words2[:2]
                    else:
                        common_prefix = name1 == name2
                    if common_prefix and price1 != price2:
                        has_comparison_items = True
                        break

        comparison_intent = self.calculate_comparison_intent(
            category_switches=sd.get("category_switches", 0),
            tab_switches=sd.get("tab_switches", 0),
            product_views=sd.get("product_views", 0),
            cart_adds=max(sd.get("cart_adds", 1), 1),
            session_duration=session_dur,
        )
        if has_comparison_items:
            comparison_intent = max(comparison_intent, 0.95)

        cart_adds = sd.get("cart_adds", 0)
        minutes = max(session_dur / 60.0, 0.1)
        product_views = sd.get("product_views", 1)
        urgency = self.calculate_urgency_score(
            cart_adds_per_minute=cart_adds / minutes,
            view_to_cart_ratio=product_views / max(cart_adds, 1),
            session_recency_minutes=sd.get("session_recency_minutes", 10),
            is_returning_visitor=sd.get("is_returning_visitor", False),
        )

        payment_risk = self.calculate_payment_risk(
            payment_attempts=sd.get("payment_attempts", 0),
            payment_failures=sd.get("payment_failures", 0),
            time_on_payment_page=sd.get("time_on_payment_page", 0),
            payment_method_switches=sd.get("payment_method_switches", 0),
        )

        return {
            "hesitation_score": hesitation,
            "price_sensitivity": price_sensitivity,
            "funnel_friction": funnel_friction,
            "comparison_intent": comparison_intent,
            "urgency_score": urgency,
            "payment_risk": payment_risk,
            # Derived composite signals
            "behavioral_risk_index": round(
                0.25 * hesitation
                + 0.20 * price_sensitivity
                + 0.20 * funnel_friction
                + 0.15 * comparison_intent
                + 0.20 * payment_risk,
                4,
            ),
            "engagement_score": round(1.0 - (0.5 * hesitation + 0.5 * (1.0 - urgency)), 4),
        }


# Global instance
signal_generator = BehavioralSignalGenerator()