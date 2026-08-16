"""
CartGuard AI - FastAPI Backend
Main API server with WebSocket support for real-time session scoring.
Member M3: Backend & Systems Engineer
"""
import asyncio
import json
import time
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

from agents.orchestrator import orchestrator
from agents.chatbot_agent import ChatbotAgent
from services.audit_service import audit_service
from services.notification_service import notification_service
from services.redis_service import redis_service
from config.settings import settings


# ──────────────────────────── Lifespan ────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    print("[CartGuard AI] Starting up...")
    # Connect Redis (or fallback to in-memory)
    connected = await redis_service.connect()
    if connected:
        print("[Redis] Connected successfully")
    else:
        print("[Redis] Offline, using in-memory cache fallback")

    # Pre-load ML model
    try:
        from models.ensemble_model import get_model
        get_model()
        print("[ML Model] Loaded successfully")
    except Exception as e:
        print(f"[ML Model] Warning: {e}")
    
    # Init DB
    audit_service.init_db()
    print("[Audit DB] Database initialized")
    yield
    await redis_service.close()
    print("[CartGuard AI] Shutting down...")


app = FastAPI(
    title="CartGuard AI API",
    description="Real-time cart abandonment risk scoring and remediation",
    version="2.0.0",
    lifespan=lifespan,
)

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# CORS for dashboard & frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.get("/", response_class=FileResponse, tags=["Pages"])
@app.get("/overview", response_class=FileResponse, tags=["Pages"])
@app.get("/scenarios", response_class=FileResponse, tags=["Pages"])
async def serve_overview():
    return FileResponse(os.path.join(frontend_path, "index.html"))

@app.get("/audit-trail", response_class=FileResponse, tags=["Pages"])
async def serve_audit_trail():
    return FileResponse(os.path.join(frontend_path, "audit_trail.html"))

@app.get("/twilio-hub", response_class=FileResponse, tags=["Pages"])
async def serve_twilio_hub():
    return FileResponse(os.path.join(frontend_path, "twilio_hub.html"))

@app.get("/margin-analytics", response_class=FileResponse, tags=["Pages"])
async def serve_margin_analytics():
    return FileResponse(os.path.join(frontend_path, "margin_analytics.html"))


@app.get("/health", tags=["System"])
@app.get("/api/v1/health", tags=["System"])
async def health_check():
    return {
        "status": "online",
        "version": "2.0.0",
        "engine": "FastAPI + Ensemble ML",
        "timestamp": datetime.now().isoformat()
    }


# ──────────────────────────── Request / Response Models ────────────────────────────
class SessionRequest(BaseModel):
    session_id: str
    cart_value: float = 0.0
    session_duration: float = 0.0
    product_views: int = 0
    cart_adds: int = 0
    checkout_reached: int = 0
    payment_attempts: int = 0
    payment_failures: int = 0
    email_opt_in: bool = True
    whatsapp_opt_in: bool = False
    
    # Behavioral signals (from M4 SDK)
    mouse_velocity: Optional[float] = None
    scroll_speed: Optional[float] = None
    form_hesitation: Optional[float] = None
    tab_loss_count: Optional[int] = None

    class Config:
        extra = "allow"


class ActionResponse(BaseModel):
    session_id: str
    risk_score: float
    risk_level: str
    reason: str
    confidence: float
    evidence: List[str] = []
    action: str
    action_message: str
    discount: float
    channel: str
    expected_margin: float
    self_check: str
    audit_id: str
    latency_ms: float

    class Config:
        extra = "allow"


class SessionData(BaseModel):
    session_id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    
    # Session behavior
    session_duration: float = 0
    product_views: int = 0
    cart_adds: int = 0
    cart_removes: int = 0
    cart_changes: int = 0
    cart_value: float = 0
    original_cart_value: Optional[float] = None
    
    # Navigation
    category_switches: int = 0
    tab_switches: int = 0
    page_revisits: int = 0
    back_navigations: int = 0
    
    # Checkout
    checkout_steps_completed: int = 0
    total_checkout_steps: int = 5
    checkout_time: float = 0
    
    # Payment
    payment_attempts: int = 0
    payment_failures: int = 0
    time_on_payment_page: float = 0
    payment_method_switches: int = 0
    
    # Form
    form_field_errors: int = 0
    
    # User profile
    is_returning_visitor: bool = False
    session_recency_minutes: float = 10
    user_segment: str = "REGULAR"
    user_discount_spend_this_month: float = 0
    
    # Consent
    is_dnd_registered: bool = False
    sms_opt_in: bool = True
    email_opt_in: bool = True
    whatsapp_opt_in: bool = True   # Default True — blocked only if user explicitly opts out
    
    # Contact
    user_email: Optional[str] = None
    user_phone: Optional[str] = None

    class Config:
        extra = "allow"


class BatchSessionRequest(BaseModel):
    sessions: List[SessionRequest]


class ChatRequest(BaseModel):
    message: str
    context: Dict[str, Any]


# ──────────────────────────── WebSocket Manager ────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: str):
        self.active_connections.pop(session_id, None)

    async def send_result(self, session_id: str, result: Dict):
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_json(result)
            except Exception:
                self.disconnect(session_id)


manager = ConnectionManager()


# ──────────────────────────── Helper Functions ────────────────────────────
def build_action_response(request_dict: Dict[str, Any], result: Dict[str, Any], start_time: float) -> ActionResponse:
    session_id = str(request_dict.get("session_id", "unknown"))
    risk_score = float(result.get("risk_score", 0.0))
    risk_level = str(result.get("risk_level", "LOW"))
    
    diagnosis = result.get("diagnosis", {})
    reason = str(diagnosis.get("root_cause", "LOW_RISK"))
    confidence = float(diagnosis.get("confidence", 0.9))
    evidence = list(diagnosis.get("evidence", []))
    
    action_obj = result.get("action", {})
    action_str = str(action_obj.get("action", action_obj.get("action_type", "DO_NOTHING")))
    action_msg = str(action_obj.get("action_message", action_obj.get("message", "No intervention needed")))
    discount = float(action_obj.get("discount", action_obj.get("discount_amount", 0.0)))
    channel = str(action_obj.get("channel", "NONE"))
    expected_margin = float(action_obj.get("expected_margin", result.get("policy", {}).get("expected_incremental_margin_inr", 0.0)))
    
    self_check_obj = result.get("self_check", {})
    self_check_status = str(self_check_obj.get("status", "PASSED"))
    
    latency_ms = (time.time() - start_time) * 1000
    audit_id = f"audit_{int(time.time()*1000)}_{session_id}"

    return ActionResponse(
        session_id=session_id,
        risk_score=round(risk_score, 4),
        risk_level=risk_level,
        reason=reason,
        confidence=round(confidence, 2),
        evidence=evidence,
        action=action_str,
        action_message=action_msg,
        discount=round(discount, 2),
        channel=channel,
        expected_margin=round(expected_margin, 2),
        self_check=self_check_status,
        audit_id=audit_id,
        latency_ms=round(latency_ms, 2)
    )


# ──────────────────────────── API Endpoints ────────────────────────────

@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "service": "CartGuard AI API", "version": "2.0.0"}


@app.get("/health", tags=["Health"])
async def health_check():
    """Health monitoring endpoint."""
    return {"status": "ok", "timestamp": time.time()}


@app.get("/metrics", tags=["Metrics"])
async def get_metrics():
    """Prometheus-style metrics endpoint."""
    return audit_service.get_metrics()


@app.get("/api/v1/metrics", tags=["Metrics"])
async def get_metrics_v1():
    """Metrics endpoint alias."""
    return audit_service.get_metrics()


@app.post("/score-session", response_model=ActionResponse, tags=["Scoring"])
async def score_session(request: SessionRequest, background_tasks: BackgroundTasks):
    """
    Primary scoring endpoint specified in M3 PDF breakdown.
    Returns structured ActionResponse with robust fallback on error.
    """
    start_time = time.time()
    try:
        session_dict = request.model_dump()
        result = await orchestrator.process_session(session_dict)
        
        # Async audit log
        background_tasks.add_task(audit_service.log_decision, result, session_dict)
        
        response = build_action_response(session_dict, result, start_time)
        return response
    except Exception as e:
        return ActionResponse(
            session_id=request.session_id,
            risk_score=0.0,
            risk_level="UNKNOWN",
            reason="ERROR",
            confidence=0.0,
            evidence=[str(e)],
            action="DO_NOTHING",
            action_message="System error, defaulting to no action",
            discount=0.0,
            channel="NONE",
            expected_margin=0.0,
            self_check="FAILED",
            audit_id=f"error_{int(time.time())}",
            latency_ms=0.0
        )


chatbot_agent = ChatbotAgent()


@app.post("/api/v1/chat", tags=["Chatbot"])
async def chatbot_reply(req: ChatRequest):
    """Chatbot endpoint to answer checkout questions dynamically."""
    try:
        reply = await chatbot_agent.get_response(req.message, req.context)
        return {"reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/score", tags=["Scoring"])
async def score_session_v1(session: SessionData, background_tasks: BackgroundTasks):
    """v1 score endpoint for extended session data."""
    start = time.time()
    try:
        session_dict = session.model_dump()
        if session_dict.get("original_cart_value") is None:
            session_dict["original_cart_value"] = session_dict["cart_value"]
        
        result = await orchestrator.process_session(session_dict)

        # MongoDB-backed 10-minute cooldown check (survives server restarts)
        action = result.get("action", {})
        action_type = action.get("action_type", "DO_NOTHING")
        is_cooldown_active = False

        if action_type not in ["DO_NOTHING", None]:
            user_id = session_dict.get("user_id") or session_dict.get("session_id", "unknown")
            is_cooldown_active = notification_service._is_in_cooldown(user_id, action_type)
            if is_cooldown_active:
                print(f"[SCORE ENDPOINT] Cooldown active for user={user_id} action={action_type}. Skipping notification.")

        result["cooldown_active"] = is_cooldown_active

        # Send notifications BEFORE audit log so dispatched channels are recorded
        has_contact = bool(
            session_dict.get("user_email")
            or session_dict.get("user_phone")
            or session_dict.get("user_mobile")
            or session_dict.get("user_whatsapp")
        )
        if action_type not in ["DO_NOTHING", None] and not is_cooldown_active:
            if has_contact:
                notif_res = await notification_service.send_notification(session_dict, action)
                result["notification_result"] = notif_res
                # Store which channels were actually dispatched for the audit log
                result["dispatched_channels"] = notif_res.get("channels", [])
            else:
                result["notification_result"] = {"status": "skipped", "reason": "no_contact_info"}
                result["dispatched_channels"] = []
        elif is_cooldown_active:
            result["notification_result"] = {"status": "skipped", "reason": "cooldown_active"}
            result["dispatched_channels"] = []
        else:
            result["dispatched_channels"] = []

        # Audit log in background (only when real action/diagnosis occurs, not on cooldown-blocked heartbeats)
        if not is_cooldown_active:
            background_tasks.add_task(audit_service.log_decision, result, session_dict)
        
        latency = (time.time() - start) * 1000
        result["api_latency_ms"] = round(latency, 2)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




@app.post("/api/v1/score/batch", tags=["Scoring"])
async def score_batch(request: BatchSessionRequest):
    """Score multiple sessions in parallel."""
    tasks = [
        orchestrator.process_session(s.model_dump())
        for s in request.sessions
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    return {
        "results": [r if not isinstance(r, Exception) else {"error": str(r)} for r in results],
        "total": len(results),
    }


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket for real-time session event streaming.
    Browser SDK sends events; server scores in real-time.
    """
    await manager.connect(websocket, session_id)
    try:
        session_accumulator = {"session_id": session_id}
        
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type", "update")
            
            if event_type == "event":
                session_accumulator.update(data.get("data", {}))
            elif event_type == "score_request" or "cart_value" in data:
                event_data = data.get("data", data)
                session_accumulator.update(event_data)
                
                result = await orchestrator.process_session(session_accumulator)
                action_resp = build_action_response(session_accumulator, result, time.time())
                await manager.send_result(session_id, action_resp.model_dump())
            elif event_type == "ping":
                await websocket.send_json({"type": "pong", "timestamp": time.time()})
                
    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception:
        await websocket.close()


@app.get("/audit-log/{session_id}", tags=["Audit"])
async def get_audit_log_endpoint(session_id: str):
    """Retrieve decision history for a session."""
    log = audit_service.get_audit_log_by_session(session_id)
    if not log:
        return {"session_id": session_id, "logs": [], "count": 0}
    return log


@app.get("/api/v1/audit", tags=["Audit"])
async def get_audit_logs_v1(limit: int = 50, session_id: Optional[str] = None, user_id: Optional[str] = None, exclude_cooldown: bool = False):
    """Retrieve audit log entries."""
    logs = audit_service.get_logs(limit=limit, session_id=session_id, user_id=user_id, exclude_cooldown=exclude_cooldown)
    return {"logs": logs, "count": len(logs)}


@app.get("/api/v1/demo/scenarios", tags=["Demo"])
async def get_demo_scenarios():
    """Get pre-built demo scenarios for testing."""
    return {"scenarios": DEMO_SCENARIOS}


@app.post("/api/v1/demo/run/{scenario_name}", tags=["Demo"])
async def run_demo_scenario(scenario_name: str):
    """Run a specific demo scenario."""
    scenario = next((s for s in DEMO_SCENARIOS if s["name"] == scenario_name), None)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_name}' not found")
    
    session_dict = dict(scenario["session_data"])
    if session_dict.get("original_cart_value") is None:
        session_dict["original_cart_value"] = session_dict.get("cart_value")
    session = SessionData(**session_dict)
    result = await orchestrator.process_session(session.model_dump())
    return {
        "scenario": scenario["name"],
        "description": scenario["description"],
        "cart_value": session.cart_value,
        "result": result,
    }


@app.post("/api/v1/send-test-email", tags=["Notifications"])
async def send_test_email(to_email: str = "yuvagude@gmail.com", discount_percent: float = 10.0):
    """
    Send a test cart recovery email to high priority user (e.g. yuvagude@gmail.com).
    """
    session_id = f"SES-YUVA-{int(time.time())}"
    message = f"Notice you left items in your cart! As a valued high-priority customer, enjoy an exclusive {int(discount_percent)}% discount (promo code: SAVE{int(discount_percent)}) to complete your purchase today."
    cart_value = 1500.0
    discount_amount = cart_value * (discount_percent / 100.0)

    res = await notification_service.send_email(
        to_email=to_email,
        subject=f"🛒 Exclusive {int(discount_percent)}% Off Your Cart - CartGuard AI",
        message=message,
        discount=discount_amount
    )

    # Log to audit database
    audit_service.log_decision({
        "session_id": session_id,
        "risk_score": 0.88,
        "risk_level": "HIGH",
        "diagnosis": {"root_cause": "PRICE_SENSITIVITY", "confidence": 0.94, "evidence": ["High priority user profile", f"Cart value ₹{cart_value:.0f}", "Price check activity"]},
        "action": {"action_type": "LIMITED_OFFER", "channel": "EMAIL", "message": message, "discount_amount": discount_amount},
        "policy": {"uplift_probability": 0.35, "expected_incremental_margin_inr": 225.0},
        "self_check": {"status": "PASSED"},
        "metrics": {"total_latency_ms": 142.0, "total_cost_inr": 0.0512},
        "signals": {"price_sensitivity": 0.85, "urgency_score": 0.90}
    }, {"session_id": session_id, "user_email": to_email, "cart_value": cart_value, "user_segment": "PREMIUM"})

    return {
        "status": "success",
        "email_result": res,
        "session_id": session_id,
        "to_email": to_email,
        "discount_percent": discount_percent,
        "discount_amount": discount_amount
    }


@app.post("/api/v1/demo/seed", tags=["Demo"])
async def seed_demo_data():
    """Seed dummy audit records into database."""
    conn = audit_service.init_db()
    return {"status": "success", "message": "Audit database initialized and dummy records seeded."}


@app.get("/api/v1/uplift/simulate", tags=["Uplift"])
async def simulate_uplift(n_sessions: int = 10000):
    """Run synthetic uplift simulation."""
    from services.uplift_service import uplift_simulator
    return uplift_simulator.simulate_ab_test(n_sessions=n_sessions)


# ──────────────────────────── Demo Scenarios ────────────────────────────
# NOTE: keys below match the `SessionData` model fields exactly. The previous
# version used fields (checkout_reached, mouse_velocity, scroll_speed,
# form_hesitation, tab_loss_count) that don't exist on SessionData, so they
# were silently dropped and never reached the risk model.
DEMO_SCENARIOS = [
    {
        "name": "payment_failure",
        "description": "Complex Payment Failure: 2 failed UPI attempts, high time on payment page, high cart value",
        "expected": "ALTERNATE_PAYMENT_GUIDANCE",
        "session_data": {
            "session_id": "S1001",
            "cart_value": 3500,
            "session_duration": 240,
            "product_views": 4,
            "cart_adds": 2,
            "cart_removes": 0,
            "cart_changes": 2,
            "checkout_steps_completed": 4,
            "payment_attempts": 2,
            "payment_failures": 2,
            "time_on_payment_page": 180,
            "payment_method_switches": 2,
            "is_returning_visitor": True,
            "user_segment": "PREMIUM",
            "email_opt_in": True,
            "whatsapp_opt_in": False,
        },
    },
    {
        "name": "comparison_shopping",
        "description": "Comparison Shopping: 12 views, heavy category/tab switching, no checkout",
        "expected": "SOCIAL_PROOF_NUDGE",
        "session_data": {
            "session_id": "S1002",
            "cart_value": 1200,
            "session_duration": 480,
            "product_views": 18,
            "cart_adds": 1,
            "cart_removes": 0,
            "cart_changes": 3,
            "category_switches": 7,
            "tab_switches": 12,
            "page_revisits": 6,
            "checkout_steps_completed": 0,
            "is_returning_visitor": False,
            "user_segment": "REGULAR",
            "email_opt_in": True,
            "whatsapp_opt_in": False,
        },
    },
    {
        "name": "friction_abandonment",
        "description": "Checkout Friction: repeated form errors, back navigations, no payment attempt",
        "expected": "CHECKOUT_ASSISTANCE",
        "session_data": {
            "session_id": "S1003",
            "cart_value": 800,
            "session_duration": 360,
            "product_views": 3,
            "cart_adds": 2,
            "cart_removes": 0,
            "cart_changes": 2,
            "checkout_steps_completed": 2,
            "checkout_time": 240,
            "form_field_errors": 5,
            "back_navigations": 6,
            "payment_attempts": 0,
            "is_returning_visitor": False,
            "user_segment": "REGULAR",
            "email_opt_in": True,
            "whatsapp_opt_in": False,
        },
    },
    {
        "name": "mixed_signals",
        "description": "Mixed Signals: one failed payment attempt but cart value trending down, returning visitor",
        "expected": "DO_NOTHING",
        "session_data": {
            "session_id": "S1004",
            "cart_value": 1500,
            "original_cart_value": 2200,
            "session_duration": 300,
            "product_views": 5,
            "cart_adds": 2,
            "cart_removes": 1,
            "cart_changes": 5,
            "category_switches": 2,
            "tab_switches": 3,
            "checkout_steps_completed": 3,
            "payment_attempts": 2,
            "payment_failures": 1,
            "is_returning_visitor": True,
            "user_segment": "REGULAR",
            "email_opt_in": True,
            "whatsapp_opt_in": False,
        },
    },
    {
        "name": "low_intent",
        "description": "Low Intent Browsing: 15 product views, zero cart adds, research-only session",
        "expected": "DO_NOTHING",
        "session_data": {
            "session_id": "S1005",
            "cart_value": 0,
            "session_duration": 720,
            "product_views": 15,
            "cart_adds": 0,
            "cart_removes": 0,
            "cart_changes": 0,
            "category_switches": 4,
            "tab_switches": 10,
            "page_revisits": 2,
            "checkout_steps_completed": 0,
            "payment_attempts": 0,
            "is_returning_visitor": False,
            "user_segment": "NEW",
            "email_opt_in": True,
            "whatsapp_opt_in": False,
        },
    },
    {
        "name": "urgent_bargain_hunter",
        "description": "Urgent Bargain Hunter: high cart churn, cart value dropping, cross-site price checking",
        "expected": "LIMITED_OFFER",
        "session_data": {
            "session_id": "S1006",
            "cart_value": 900,
            "original_cart_value": 1200,
            "session_duration": 1800,
            "product_views": 40,
            "cart_adds": 4,
            "cart_removes": 6,
            "cart_changes": 20,
            "category_switches": 3,
            "tab_switches": 10,
            "page_revisits": 20,
            "checkout_steps_completed": 0,
            "is_returning_visitor": True,
            "user_segment": "BARGAIN",
            "email_opt_in": True,
            "whatsapp_opt_in": False,
        },
    },
]


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)