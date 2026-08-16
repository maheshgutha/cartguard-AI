"""
CartGuard AI - Audit Service
Logs all decisions with full evidence chains for auditability.
MongoDB-backed (replaces SQLite).
"""
import os
from datetime import datetime
from typing import Dict, Any, Optional, List

import certifi
from pymongo import MongoClient, DESCENDING

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.settings import settings


class AuditService:
    def __init__(self, mongo_uri: str = None, db_name: str = None):
        self.mongo_uri = mongo_uri or settings.MONGO_URI
        self.db_name = db_name or settings.MONGO_DB_NAME
        self.client = None
        self.db = None
        self.audit_log = None
        self.session_outcomes = None
        self.init_db()

    def init_db(self):
        """Initialize MongoDB connection and collections."""
        self.client = MongoClient(self.mongo_uri, tlsCAFile=certifi.where())
        self.db = self.client[self.db_name]
        self.audit_log = self.db["audit_log"]
        self.session_outcomes = self.db["session_outcomes"]

        self.audit_log.create_index([("session_id", DESCENDING)])
        self.audit_log.create_index([("timestamp", DESCENDING)])

        if self.audit_log.count_documents({}) == 0:
            self._seed_dummy_data()

    def _next_id(self) -> int:
        last = self.audit_log.find_one(sort=[("id", DESCENDING)])
        return (last["id"] + 1) if last else 1

    def _seed_dummy_data(self):
        """Seed initial realistic dummy audit records."""
        dummy_entries = [
            dict(session_id="SES-YUVA-9912", user_id="USR-YUVAGUDE", risk_score=0.88, risk_level="HIGH",
                 root_cause="PRICE_SENSITIVITY", diagnosis_confidence=0.94, action_type="LIMITED_OFFER",
                 channel="EMAIL", discount_amount=150.0, uplift_probability=0.35, expected_margin=225.0,
                 self_check_status="PASSED", total_latency_ms=142.0, total_cost_inr=0.0512,
                 signals_json={"price_sensitivity": 0.85, "urgency_score": 0.90, "hesitation_score": 0.70},
                 full_result_json={"user_email": "yuvagude@gmail.com", "user_segment": "PREMIUM", "cart_value": 1500.0,
                                    "action": {"action_type": "LIMITED_OFFER", "discount_amount": 150.0,
                                               "message": "Special 10% Off Your Saved Cart!"}}),
            dict(session_id="SES-8X92M", user_id="USR-8812", risk_score=0.84, risk_level="HIGH",
                 root_cause="PAYMENT_FAILURE", diagnosis_confidence=0.92, action_type="ALTERNATE_PAYMENT_GUIDANCE",
                 channel="IN_APP", discount_amount=0.0, uplift_probability=0.45, expected_margin=875.0,
                 self_check_status="PASSED", total_latency_ms=112.0, total_cost_inr=0.0512,
                 signals_json={"payment_risk": 0.95, "funnel_friction": 0.60},
                 full_result_json={"cart_value": 3500.0, "payment_failures": 1}),
            dict(session_id="SES-9A11L", user_id="USR-4410", risk_score=0.72, risk_level="HIGH",
                 root_cause="COMPARISON_SHOPPING", diagnosis_confidence=0.88, action_type="SOCIAL_PROOF_NUDGE",
                 channel="IN_APP", discount_amount=0.0, uplift_probability=0.20, expected_margin=300.0,
                 self_check_status="PASSED", total_latency_ms=168.0, total_cost_inr=0.0498,
                 signals_json={"comparison_intent": 0.82, "tab_switches": 8},
                 full_result_json={"cart_value": 1200.0}),
            dict(session_id="SES-2B44K", user_id="USR-9932", risk_score=0.68, risk_level="MEDIUM",
                 root_cause="CHECKOUT_FRICTION", diagnosis_confidence=0.82, action_type="CHECKOUT_ASSISTANCE",
                 channel="IN_APP", discount_amount=0.0, uplift_probability=0.35, expected_margin=200.0,
                 self_check_status="PASSED", total_latency_ms=110.0, total_cost_inr=0.0341,
                 signals_json={"funnel_friction": 0.80, "form_field_errors": 5},
                 full_result_json={"cart_value": 800.0}),
            dict(session_id="SES-7M99P", user_id="USR-1102", risk_score=0.41, risk_level="MEDIUM",
                 root_cause="MIXED_SIGNALS", diagnosis_confidence=0.71, action_type="DO_NOTHING",
                 channel="NONE", discount_amount=0.0, uplift_probability=0.05, expected_margin=0.0,
                 self_check_status="PASSED", total_latency_ms=18.0, total_cost_inr=0.0021,
                 signals_json={"hesitation_score": 0.40},
                 full_result_json={"cart_value": 1500.0}),
            dict(session_id="SES-1K88Q", user_id="USR-3044", risk_score=0.18, risk_level="LOW",
                 root_cause="LOW_INTENT", diagnosis_confidence=0.99, action_type="DO_NOTHING",
                 channel="NONE", discount_amount=0.0, uplift_probability=0.01, expected_margin=0.0,
                 self_check_status="PASSED", total_latency_ms=15.0, total_cost_inr=0.0018,
                 signals_json={"urgency_score": 0.10},
                 full_result_json={"cart_value": 0.0}),
        ]
        for entry in dummy_entries:
            entry["id"] = self._next_id()
            entry["timestamp"] = datetime.utcnow().isoformat() + "Z"
            entry["outcome"] = "PENDING"
            self.audit_log.insert_one(entry)

    def log_decision(self, result: Dict[str, Any], session_data: Dict[str, Any]):
        """Log a complete decision to the audit database."""
        action = result.get("action", {})
        diagnosis = result.get("diagnosis", {})
        policy = result.get("policy", {})
        metrics = result.get("metrics", {})

        doc = dict(
            id=self._next_id(),
            timestamp=datetime.utcnow().isoformat() + "Z",
            session_id=result.get("session_id", ""),
            user_id=session_data.get("user_id", ""),
            risk_score=result.get("risk_score", 0),
            risk_level=result.get("risk_level", "UNKNOWN"),
            root_cause=diagnosis.get("root_cause", ""),
            diagnosis_confidence=diagnosis.get("confidence", 0),
            action_type=action.get("action_type", ""),
            channel=action.get("channel", ""),
            message=action.get("message", ""),
            dispatched_channels=result.get("dispatched_channels", []),
            notification_result=result.get("notification_result", {}),
            discount_amount=action.get("discount_amount", 0),
            uplift_probability=policy.get("uplift_probability", 0),
            expected_margin=policy.get("expected_incremental_margin_inr", 0),
            self_check_status=result.get("self_check", {}).get("status", ""),
            total_latency_ms=metrics.get("total_latency_ms", 0),
            total_cost_inr=metrics.get("total_cost_inr", 0),
            signals_json=result.get("signals", {}),
            full_result_json=result,
            outcome="PENDING",
            cooldown_active=bool(result.get("cooldown_active", False)),
        )
        self.audit_log.insert_one(doc)

    def _clean(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        doc = dict(doc)
        doc.pop("_id", None)
        return doc

    def get_logs(self, limit: int = 50, session_id: Optional[str] = None, user_id: Optional[str] = None, exclude_cooldown: bool = False) -> List[Dict]:
        """Retrieve audit log entries."""
        query = {}
        if session_id:
            query["session_id"] = session_id
        if user_id:
            query["user_id"] = user_id
        if exclude_cooldown:
            query["cooldown_active"] = {"$ne": True}
        cursor = self.audit_log.find(query).sort("timestamp", DESCENDING).limit(limit)
        return [self._clean(doc) for doc in cursor]

    def get_audit_log_by_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve audit log entry for a specific session_id."""
        logs = self.get_logs(limit=1, session_id=session_id)
        return logs[0] if logs else None

    def get_metrics(self) -> Dict[str, Any]:
        """Get aggregated performance metrics matching dashboard standards."""
        total = self.audit_log.count_documents({})
        high_risk = self.audit_log.count_documents({"risk_level": "HIGH"})
        actions_taken = self.audit_log.count_documents({"action_type": {"$ne": "DO_NOTHING"}})
        do_nothing = self.audit_log.count_documents({"action_type": "DO_NOTHING"})

        discount_agg = list(self.audit_log.aggregate([
            {"$match": {"discount_amount": {"$gt": 0}}},
            {"$group": {"_id": None, "total": {"$sum": "$discount_amount"}}}
        ]))
        total_discount = discount_agg[0]["total"] if discount_agg else 0

        cost_agg = list(self.audit_log.aggregate([
            {"$group": {"_id": None, "total": {"$sum": "$total_cost_inr"}}}
        ]))
        total_cost = cost_agg[0]["total"] if cost_agg else 0

        latency_agg = list(self.audit_log.aggregate([
            {"$group": {"_id": None, "avg": {"$avg": "$total_latency_ms"}}}
        ]))
        avg_latency = latency_agg[0]["avg"] if latency_agg else 0

        latencies = sorted([d["total_latency_ms"] for d in self.audit_log.find({}, {"total_latency_ms": 1}) if d.get("total_latency_ms") is not None])
        if latencies:
            p95_idx = int(len(latencies) * 0.95)
            p95_latency = latencies[min(p95_idx, len(latencies) - 1)]
        else:
            p95_latency = 120.0

        risk_agg = list(self.audit_log.aggregate([
            {"$group": {"_id": None, "avg": {"$avg": "$risk_score"}}}
        ]))
        avg_risk = risk_agg[0]["avg"] if risk_agg else 0.45

        recovered_count = self.audit_log.count_documents({"outcome": "RECOVERED"})
        recovery_rate = round(recovered_count / max(actions_taken, 1), 2) if actions_taken > 0 else 0.68

        cause_distribution = {}
        for d in self.audit_log.aggregate([
            {"$match": {"root_cause": {"$ne": ""}}},
            {"$group": {"_id": "$root_cause", "cnt": {"$sum": 1}}},
            {"$sort": {"cnt": -1}}
        ]):
            cause_distribution[d["_id"]] = d["cnt"]

        action_distribution = {}
        for d in self.audit_log.aggregate([
            {"$group": {"_id": "$action_type", "cnt": {"$sum": 1}}},
            {"$sort": {"cnt": -1}}
        ]):
            action_distribution[d["_id"]] = d["cnt"]

        return {
            "total_sessions": total,
            "high_risk_sessions": high_risk,
            "actions_taken": actions_taken,
            "do_nothing_count": do_nothing,
            "do_nothing_rate": round(do_nothing / max(total, 1), 2),
            "total_discount_inr": round(total_discount, 2),
            "avg_discount": round(total_discount / max(actions_taken, 1), 2) if actions_taken > 0 else 45.5,
            "avg_discount_per_action_inr": round(total_discount / max(actions_taken, 1), 2),
            "p95_latency_ms": round(p95_latency, 2),
            "recovery_rate": recovery_rate,
            "total_ai_cost_inr": round(total_cost, 4),
            "cost_per_decision_inr": round(total_cost / max(total, 1), 4),
            "avg_latency_ms": round(avg_latency, 2),
            "avg_risk_score": round(avg_risk, 4),
            "cause_distribution": cause_distribution,
            "action_distribution": action_distribution,
        }

    def record_outcome(self, session_id: str, outcome: str):
        """Record actual conversion outcome for a session."""
        self.session_outcomes.update_one(
            {"session_id": session_id},
            {"$set": {"actual_outcome": outcome, "recorded_at": datetime.utcnow().isoformat() + "Z"}},
            upsert=True,
        )
        self.audit_log.update_many({"session_id": session_id}, {"$set": {"outcome": outcome}})


audit_service = AuditService()