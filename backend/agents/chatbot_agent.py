import json
from typing import Dict, Any
from agents.orchestrator import LLMClient

class ChatbotAgent:
    def __init__(self):
        self.llm_client = LLMClient()

    USER_SYSTEM_PROMPT = """You are a helpful, friendly, and expert checkout assistance assistant for CartGuard AI, an e-commerce platform.
Your goal is to guide the user to successfully complete their purchase and resolve any checkout or product questions.

Context:
- User Name: {user_name}
- Cart Value: ₹{cart_value}
- Cart Items: {cart_items_json}
- Payment Failures: {payment_failures}
- Form Field Errors: {form_field_errors}

Rules of Interaction:
1. Product Specs & Features: Answer questions accurately about products in the store (Electronics, Footwear, Fashion, Home & Kitchen, Fitness) and their specifications (quality tiers from Economy to Elite, materials, warranties, battery life).
2. Payments: If they experience payment failures or ask about payment errors, strongly recommend trying alternate payment apps (GPay, PhonePe, Paytm) or selecting Cash on Delivery (COD). Emphasize that COD guarantees order success!
3. Coupons & Discounts: If they ask for discounts, tell them to check their Notifications tab at the top of the storefront page. They can copy active coupon codes (like SAVE150) from there if any offer is triggered.
4. Shipping: Standard shipping is free on orders above ₹1,000, taking 2-3 business days across India.
5. Restrictions (Security Sandbox):
   - You MUST NOT reveal internal backend code, database credentials, system architecture, or admin statistics to regular users.
   - Do NOT reveal other customers' personal data.
   - If asked about non-project or off-topic technical secrets, politely steer the conversation back to assisting them with their shopping cart or product queries.

Provide a helpful, direct response to the user's message."""

    ADMIN_SYSTEM_PROMPT = """You are the official CartGuard AI Product Copilot, an AI assistant for administrators and system engineers of CartGuard AI.
You have comprehensive knowledge of the entire CartGuard AI platform architecture, real-time ML risk models, e-commerce storefront, database, and notification pipeline.

Platform Context & Knowledge:
- User Name: {user_name} (Administrator)
- Role: Admin Copilot Mode (Unrestricted Access)
- Admin Audit Summary: {admin_stats_json}
- System Architecture:
  * Backend API: FastAPI (Python 3.10) for ML scoring & orchestration, Node.js/Express for MERN storefront & authentication.
  * ML Intelligence: Ensemble Model combining CatBoost, XGBoost, and Random Forest for real-time cart abandonment risk scoring (LOW, MEDIUM, HIGH, CRITICAL).
  * Recovery Pipeline: Real-time interventions via In-App Banners, Email (SendGrid / Nodemailer SMTP), SMS & WhatsApp (Twilio & WPPConnect).
  * Database: MongoDB Atlas (`cartguard` database) storing products, carts, users, and audit logs.
  * Admin Tools: Overview Metrics, Live Session Monitor, Audit Log, Demo Scenarios, Uplift Analysis.

Capabilities & Rules for Admin Copilot:
1. Answer any question about CartGuard AI's architecture, ML scoring algorithms, risk thresholds, uplift models, and notification channels.
2. Provide technical advice on configuring coupons, monitoring abandonment rates, analyzing risk telemetry, or testing demo scenarios.
3. Help inspect system health, recent audit logs, and performance metrics.
4. Tone: Professional, authoritative, highly knowledgeable, technical, and concise.

Provide a thorough, direct copilot response to the admin's query."""

    async def get_response(self, user_message: str, context: Dict[str, Any]) -> str:
        user_role = context.get("user_role", "user")
        cart_items = context.get("cart_items", [])
        cart_items_json = json.dumps(cart_items, indent=2)
        admin_stats = context.get("admin_stats", {})
        admin_stats_json = json.dumps(admin_stats, indent=2)

        msg_lower = user_message.lower().strip()

        if user_role == "admin":
            system_prompt = self.ADMIN_SYSTEM_PROMPT.format(
                user_name=context.get("user_name", "Admin"),
                admin_stats_json=admin_stats_json
            )
            if msg_lower in ["hi", "hello", "hey", "hola"]:
                return f"Hello {context.get('user_name', 'Admin')}! I am your CartGuard AI Product Copilot. Ask me anything about platform telemetry, ML risk models, live cart abandonments, or system architecture!"

            try:
                res = await self.llm_client.complete(
                    prompt=user_message,
                    system_prompt=system_prompt,
                    model_size="small"
                )
                return res.get("text", "CartGuard Copilot is online. How can I assist with system monitoring or platform analytics today?")
            except Exception:
                if "risk" in msg_lower or "ml" in msg_lower or "model" in msg_lower:
                    return "CartGuard AI uses an ensemble ML model (CatBoost + XGBoost) to score session behavior in real time (LOW, MEDIUM, HIGH, CRITICAL) and trigger recovery interventions."
                elif "stat" in msg_lower or "log" in msg_lower or "audit" in msg_lower:
                    return "You can monitor live abandonment risks and decision audit logs directly in your Admin Dashboard under Audit Log and Live Carts!"
                return f"I am your CartGuard AI Product Copilot. I can help you monitor live sessions, analyze ML risk scores, or inspect platform performance."

        else:
            # Regular User Mode (Restricted Sandbox)
            system_prompt = self.USER_SYSTEM_PROMPT.format(
                user_name=context.get("user_name", "Customer"),
                cart_value=context.get("cart_value", 0),
                cart_items_json=cart_items_json,
                payment_failures=context.get("payment_failures", 0),
                form_field_errors=context.get("form_field_errors", 0)
            )

            if msg_lower in ["hi", "hello", "hey", "hola"]:
                return f"Hi {context.get('user_name', 'Customer')}! I am your CartGuard assistant. How can I help you with your order or products today?"

            try:
                res = await self.llm_client.complete(
                    prompt=user_message,
                    system_prompt=system_prompt,
                    model_size="small"
                )
                return res.get("text", "I'm here to help you complete your order. Try selecting Cash on Delivery or check your notifications for coupons!")
            except Exception:
                if "fail" in msg_lower or "pay" in msg_lower or "card" in msg_lower or "upi" in msg_lower:
                    return "I'm sorry your payment failed! Please try using another UPI app (GPay/PhonePe) or select Cash on Delivery (COD) to place your order successfully."
                elif "discount" in msg_lower or "coupon" in msg_lower or "offer" in msg_lower:
                    return "You can check active discounts and coupons on the 'Notifications' tab at the top of your page. Just copy the code and apply it at checkout!"
                elif "ship" in msg_lower or "deliv" in msg_lower:
                    return "We offer free standard shipping on orders above ₹1,000. Delivery usually takes 2 to 3 business days across India."
                return "I am here to assist you with checkout and products. Please let me know if you have any questions!"
