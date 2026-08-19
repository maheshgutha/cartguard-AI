"""
CartGuard AI - Notification Service
Handles email (Resend), SMS/WhatsApp (WPPConnect/Twilio) notifications.
Respects TRAI/DND and consent rules.

Cooldown is persisted in MongoDB (collection: notification_cooldowns) so it
survives server restarts (hot-reload wipes in-memory dicts every save).
"""
import os
import time
import asyncio
from typing import Dict, Any, Optional
import httpx
from dotenv import load_dotenv

# Ensure environment variables from root .env are loaded
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))


class NotificationService:
    COOLDOWN_SECONDS = 600  # 10 minutes — heartbeat fires every 5 min, so next notification at ~10 min

    def __init__(self):
        self.reload_config()
        self.wpp_token_cache = None
        # ── Mongo-backed cooldown ────────────────────────────────────
        # Falls back gracefully to an in-memory dict if Mongo is unavailable.
        self._mongo_cooldown = None
        self._mem_cache: Dict[str, float] = {}   # fallback only
        self._init_mongo_cooldown()

    def _init_mongo_cooldown(self):
        """Connect to MongoDB cooldown collection with a TTL index."""
        try:
            import certifi
            from pymongo import MongoClient, ASCENDING
            import sys
            sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            from config.settings import settings
            client = MongoClient(settings.MONGO_URI, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=3000)
            db = client[settings.MONGO_DB_NAME]
            col = db["notification_cooldowns"]
            # TTL index: documents auto-deleted after COOLDOWN_SECONDS seconds
            col.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
            self._mongo_cooldown = col
            print("[NOTIFICATION] MongoDB cooldown store ready.")
        except Exception as e:
            print(f"[NOTIFICATION] MongoDB cooldown unavailable, using in-memory fallback: {e}")
            self._mongo_cooldown = None

    def _is_in_cooldown(self, user_id: str, action_type: str) -> bool:
        """Return True if a notification was already sent within the last 10 minutes."""
        key = f"{user_id}::{action_type}"
        now = time.time()
        if self._mongo_cooldown is not None:
            try:
                doc = self._mongo_cooldown.find_one({"_id": key})
                if doc and doc.get("last_sent", 0) + self.COOLDOWN_SECONDS > now:
                    remaining = int(doc["last_sent"] + self.COOLDOWN_SECONDS - now)
                    print(f"[COOLDOWN] Active for {key}. {remaining}s remaining.")
                    return True
                return False
            except Exception:
                pass  # fall through to memory fallback
        # In-memory fallback
        last = self._mem_cache.get(key, 0)
        if last + self.COOLDOWN_SECONDS > now:
            remaining = int(last + self.COOLDOWN_SECONDS - now)
            print(f"[COOLDOWN MEM] Active for {key}. {remaining}s remaining.")
            return True
        return False

    def _record_sent(self, user_id: str, action_type: str):
        """Record that a notification was sent right now."""
        key = f"{user_id}::{action_type}"
        now = time.time()
        if self._mongo_cooldown is not None:
            try:
                self._mongo_cooldown.update_one(
                    {"_id": key},
                    {"$set": {"last_sent": now, "expires_at": __import__("datetime").datetime.utcfromtimestamp(now + self.COOLDOWN_SECONDS)}},
                    upsert=True,
                )
                return
            except Exception:
                pass
        self._mem_cache[key] = now

    def clear_cooldowns(self):
        """Wipe all cooldown timers so notifications fire immediately for testing."""
        if self._mongo_cooldown is not None:
            try:
                self._mongo_cooldown.delete_many({})
            except Exception:
                pass
        self._mem_cache.clear()
        print("[NOTIFICATION] Cooldowns cleared for testing.")

    # Keep last_sent_cache as a property alias for backward compat
    # (main.py reads notification_service.last_sent_cache)
    @property
    def last_sent_cache(self):
        return self._mem_cache

    def reload_config(self):
        """Reload configuration from environment variables."""
        self.sendgrid_key = os.getenv("SENDGRID_API_KEY", "")
        self.resend_key = os.getenv("RESEND_API_KEY", "")
        self.twilio_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        self.twilio_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        self.twilio_from = os.getenv("TWILIO_FROM_NUMBER", "")
        self.from_email = os.getenv("FROM_EMAIL", "onboarding@resend.dev")
        # SMTP Fallback Settings (Nodemailer equivalent for Python)
        self.smtp_host = os.getenv("SMTP_HOST") or "smtp.gmail.com"
        self.smtp_port = int(os.getenv("SMTP_PORT") or "465")
        self.smtp_user = os.getenv("SMTP_USER") or "maheshchoudare21@gmail.com"
        self.smtp_password = os.getenv("SMTP_PASSWORD") or "kjwnvtztpnxysxgh"

    async def send_notification(self, session_data: Dict[str, Any], action: Dict[str, Any]):
        """Send notification across ALL channels (Email + WhatsApp + In-App) concurrently."""
        action_type = action.get("action_type", "DO_NOTHING")
        message = action.get("message", "")
        comparison_data = action.get("comparison_data")

        if not message or action_type == "DO_NOTHING":
            print("[NOTIFICATION] Skipped: Action is DO_NOTHING or message is empty.")
            return {"status": "skipped", "reason": "no action or DO_NOTHING"}

        user_id = session_data.get("user_id") or session_data.get("session_id", "unknown")

        # MongoDB-backed 10-minute cooldown check
        if self._is_in_cooldown(user_id, action_type):
            return {"status": "skipped", "reason": "cooldown_active"}

        user_phone = (
            session_data.get("user_phone")
            or session_data.get("user_mobile")
            or session_data.get("user_whatsapp")
            or ""
        )

        user_email = session_data.get("user_email") or ""

        # Strip WhatsApp *bold* markers for clean plain-text channels
        plain_message = message.replace("*", "")

        results = {}

        # 1. Email Dispatch — always send if email + consent, with HTML comparison table if available
        if user_email and self._check_consent(session_data, "EMAIL"):
            try:
                results["email"] = await self.send_email(
                    to_email=user_email,
                    subject="Your cart is waiting! 🛒",
                    message=plain_message,
                    discount=action.get("discount_amount", 0),
                    comparison_data=comparison_data,
                )
            except Exception as e:
                results["email"] = {"status": "failed", "error": str(e)}

        # 2. WhatsApp Dispatch — always send if phone + consent, same content
        if user_phone and self._check_consent(session_data, "WHATSAPP"):
            try:
                results["whatsapp"] = await self.send_sms(
                    to_number=user_phone,
                    message=message,   # keep *bold* for WhatsApp formatting
                    channel="WHATSAPP",
                )
            except Exception as e:
                results["whatsapp"] = {"status": "failed", "error": str(e)}
        elif user_phone and self._check_consent(session_data, "SMS"):
            try:
                results["sms"] = await self.send_sms(
                    to_number=user_phone,
                    message=plain_message,
                    channel="SMS",
                )
            except Exception as e:
                results["sms"] = {"status": "failed", "error": str(e)}

        # 3. In-App alert (always included — logged via audit)
        results["in_app"] = {"status": "logged", "message": plain_message}

        # Record dispatch timestamp to enforce the 10-minute cooldown (persisted in MongoDB)
        self._record_sent(user_id, action_type)

        return {
            "status": "dispatched",
            "channels": list(results.keys()),
            "results": results
        }


    def _check_consent(self, session_data: Dict, channel: str) -> bool:
        """TRAI/DND compliance check."""
        if session_data.get("is_dnd_registered", False) and channel == "SMS":
            return False
        if channel == "EMAIL" and not session_data.get("email_opt_in", True):
            return False
        if channel == "WHATSAPP" and session_data.get("whatsapp_opt_in") is False:
            return False
        return True

    def _format_phone(self, phone: str) -> str:
        """Format phone number into E.164 standard (e.g. +919876543210)."""
        if not phone:
            return ""
        p = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        if not p:
            return ""
        if not p.startswith("+"):
            if len(p) == 10:
                p = "+91" + p
            else:
                p = "+" + p
        return p

    async def send_email(
        self,
        to_email: str,
        subject: str,
        message: str,
        discount: float = 0,
        comparison_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Send cart recovery email via SMTP (if configured) or Resend.
        When comparison_data is provided, renders a rich HTML product comparison table.
        """

        # ── Build HTML body ─────────────────────────────────────────
        discount_html = ""
        if discount > 0:
            discount_html = f'<p style="color:#e53e3e;font-weight:bold;">🎁 Save ₹{discount:.0f} with code: SAVE{int(discount)}</p>'

        if comparison_data:
            item1 = comparison_data.get("item1", {})
            item2 = comparison_data.get("item2", {})
            spec_rows = comparison_data.get("spec_rows", [])
            recommended = comparison_data.get("recommended", "item1")
            reason = comparison_data.get("reason", "")
            rec_name = comparison_data.get("rec_name", "")
            product_base = comparison_data.get("product_base", "")

            rec_item = item1 if recommended == "item1" else item2
            other_item = item2 if recommended == "item1" else item1

            def col_style(is_rec):
                border = "2px solid #10B981" if is_rec else "1px solid #ddd"
                bg = "#f0fdf4" if is_rec else "#fff"
                return f'style="flex:1;padding:14px;background:{bg};border:{border};border-radius:8px;text-align:center;position:relative;"'

            tier1 = item1.get("quality_tier") or item1.get("name", "").split(" - ")[-1]
            tier2 = item2.get("quality_tier") or item2.get("name", "").split(" - ")[-1]
            price1 = item1.get("price", 0)
            price2 = item2.get("price", 0)
            rating1 = item1.get("rating")
            rating2 = item2.get("rating")

            rec1 = recommended == "item1"

            # Spec rows HTML
            spec_rows_html = ""
            for idx, row in enumerate(spec_rows):
                bg = "#f9f9f9" if idx % 2 == 0 else "#fff"
                i1_winner = row.get("winner") == "item1"
                i2_winner = row.get("winner") == "item2"
                spec_rows_html += f"""
                <tr style="background:{bg}">
                    <td style="padding:7px 10px;font-size:12px;color:#555;font-weight:600;border-right:1px solid #eee;">{row['label']}</td>
                    <td style="padding:7px 10px;font-size:12px;text-align:center;color:{'#10B981' if i1_winner else '#333'};font-weight:{'700' if i1_winner else '400'};">
                        {'✓ ' if i1_winner else ''}{row['item1']}
                    </td>
                    <td style="padding:7px 10px;font-size:12px;text-align:center;color:{'#10B981' if i2_winner else '#333'};font-weight:{'700' if i2_winner else '400'};">
                        {'✓ ' if i2_winner else ''}{row['item2']}
                    </td>
                </tr>"""

            rating1_html = f"<div style='font-size:12px;color:#F59E0B;margin:4px 0;'>{'⭐' * round(rating1)} {rating1}</div>" if rating1 else ""
            rating2_html = f"<div style='font-size:12px;color:#F59E0B;margin:4px 0;'>{'⭐' * round(rating2)} {rating2}</div>" if rating2 else ""

            body_html = f"""
            <h2 style="color:#333;font-size:16px;text-align:center;margin-bottom:4px;">🆚 {product_base} Comparison</h2>
            <p style="text-align:center;font-size:13px;color:#888;margin-top:0;">We noticed you have both versions in your cart. Here's how they compare:</p>

            <!-- Price columns -->
            <div style="display:flex;gap:12px;margin:16px 0;">
                <div {col_style(rec1)}>
                    {'<div style="background:#10B981;color:white;font-size:10px;font-weight:800;padding:2px 10px;border-radius:12px;margin-bottom:8px;display:inline-block;">✅ BEST PICK</div>' if rec1 else ''}
                    <div style="font-size:13px;font-weight:700;color:#333;">{tier1}</div>
                    <div style="font-size:22px;font-weight:800;color:{'#10B981' if rec1 else '#333'};">₹{price1:,.0f}</div>
                    {rating1_html}
                </div>
                <div style="display:flex;align-items:center;font-weight:800;color:#999;font-size:13px;">VS</div>
                <div {col_style(not rec1)}>
                    {'<div style="background:#10B981;color:white;font-size:10px;font-weight:800;padding:2px 10px;border-radius:12px;margin-bottom:8px;display:inline-block;">✅ BEST PICK</div>' if not rec1 else ''}
                    <div style="font-size:13px;font-weight:700;color:#333;">{tier2}</div>
                    <div style="font-size:22px;font-weight:800;color:{'#10B981' if not rec1 else '#333'};">₹{price2:,.0f}</div>
                    {rating2_html}
                </div>
            </div>

            <!-- Spec table -->
            {'<table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:16px;"><thead><tr style="background:#f3f4f6;"><th style="padding:8px 10px;font-size:11px;color:#888;text-align:left;border-right:1px solid #eee;">SPECIFICATION</th><th style="padding:8px 10px;font-size:11px;color:#555;text-align:center;">' + tier1 + '</th><th style="padding:8px 10px;font-size:11px;color:#555;text-align:center;">' + tier2 + '</th></tr></thead><tbody>' + spec_rows_html + '</tbody></table>' if spec_rows else ''}

            <!-- Recommendation banner -->
            <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                <span style="font-size:24px;">✅</span>
                <div>
                    <div style="font-size:13px;font-weight:800;color:#10B981;">Our Recommendation: {rec_name}</div>
                    <div style="font-size:12px;color:#555;margin-top:2px;">{reason}</div>
                </div>
            </div>
            """
        else:
            # Standard plain message body
            body_html = f'<p style="font-size:16px;line-height:1.6;color:#333;">{message}</p>'

        html_content = f"""
        <html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:30px;border-radius:10px 10px 0 0;text-align:center;color:white;">
            <h1 style="margin:0;font-size:22px;">🛒 CartGuard AI</h1>
            <p style="margin:8px 0 0;opacity:0.85;font-size:13px;">Smart Cart Recovery</p>
        </div>
        <div style="padding:24px;background:#f9f9f9;border-radius:0 0 10px 10px;">
            {body_html}
            {discount_html}
            <div style="text-align:center;margin-top:20px;">
                <a href="#" style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:14px 32px;border-radius:25px;text-decoration:none;display:inline-block;font-weight:700;font-size:14px;">
                    Complete Your Purchase →
                </a>
            </div>
        </div>
        <p style="color:#999;font-size:11px;text-align:center;margin-top:20px;">Unsubscribe | CartGuard AI — Smart Cart Recovery</p>
        </body></html>
        """

        # ── SMTP (Nodemailer equivalent) Dispatch ───────────────────
        if self.smtp_user and self.smtp_password:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart

            try:
                msg = MIMEMultipart()
                msg["From"] = f"CartGuard AI <{self.smtp_user}>"
                msg["To"] = to_email
                msg["Subject"] = subject
                msg.attach(MIMEText(html_content, "html"))

                def send_sync():
                    # If port 465 configured or on cloud fallback, use SMTP_SSL
                    if self.smtp_port == 465:
                        with smtplib.SMTP_SSL(self.smtp_host, 465, timeout=12) as server:
                            server.login(self.smtp_user, self.smtp_password)
                            server.sendmail(self.smtp_user, to_email, msg.as_string())
                    else:
                        try:
                            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=8) as server:
                                server.starttls()
                                server.login(self.smtp_user, self.smtp_password)
                                server.sendmail(self.smtp_user, to_email, msg.as_string())
                        except Exception as first_err:
                            print(f"[SMTP 587 FALLBACK] Port {self.smtp_port} failed ({first_err}), retrying with SSL 465...")
                            with smtplib.SMTP_SSL(self.smtp_host, 465, timeout=12) as server:
                                server.login(self.smtp_user, self.smtp_password)
                                server.sendmail(self.smtp_user, to_email, msg.as_string())

                await asyncio.to_thread(send_sync)
                print(f"[SMTP EMAIL SENT] Successfully sent via SMTP to {to_email}")
                return {
                    "status": "sent",
                    "channel": "email",
                    "status_code": 200,
                    "response": "Success",
                    "sender": self.smtp_user
                }
            except Exception as e:
                print(f"[SMTP EMAIL FAILED] Error sending to {to_email}: {e}")
                return {
                    "status": "failed",
                    "channel": "email",
                    "status_code": 500,
                    "response": str(e),
                    "sender": self.smtp_user
                }

        # ── Resend API Dispatch ──────────────────────────────────────
        if not self.resend_key or not to_email:
            safe_subj = subject.encode('ascii', 'replace').decode('ascii')
            safe_msg = message.encode('ascii', 'replace').decode('ascii')
            print(f"[EMAIL MOCK] To: {to_email} | Subject: {safe_subj} | Message: {safe_msg}")
            return {"status": "mock_sent", "channel": "email"}

        # Resend Sandbox fallback: force recipient to owner email if sending to other addresses in sandbox
        original_to = to_email
        owner_recipient = "maheshchoudare21@gmail.com"
        if to_email.lower() != owner_recipient:
            to_email = owner_recipient
            subject = f"[Sandbox for {original_to}] {subject}"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {self.resend_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": f"CartGuard AI <{self.from_email}>",
                        "to": [to_email],
                        "subject": subject,
                        "html": html_content,
                    },
                    timeout=10.0,
                )
                print(f"[EMAIL SENT] Status {response.status_code} to {to_email} | Response: {response.text}")
                return {
                    "status": "sent" if response.status_code in [200, 201] else "failed",
                    "channel": "email",
                    "status_code": response.status_code,
                    "response": response.text,
                    "sender": self.from_email
                }
        except Exception as e:
            print(f"[EMAIL ERROR] {str(e)}")
            return {"status": "error", "error": str(e), "sender": self.from_email}



    async def get_wpp_token(self, wpp_url: str, session: str) -> str:
        """Dynamically fetch or refresh WPPConnect JWT authorization token."""
        if self.wpp_token_cache:
            return self.wpp_token_cache

        env_token = os.getenv("WPPCONNECT_TOKEN", "")
        if env_token:
            self.wpp_token_cache = env_token
            return env_token

        secret_key = "THISISMYSECURETOKEN"
        url = f"{wpp_url.rstrip('/')}/api/{session}/{secret_key}/generate-token"
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, timeout=5.0)
                if resp.status_code in [200, 201]:
                    data = resp.json()
                    token = data.get("token")
                    if token:
                        self.wpp_token_cache = token
                        return token
        except Exception as e:
            print(f"[WPPCONNECT TOKEN EXCEPTION] Failed to generate token: {str(e)}")
        return ""

    async def send_sms(
        self,
        to_number: str,
        message: str,
        channel: str = "SMS",
    ) -> Dict[str, Any]:
        """Send WhatsApp via WPPConnect (Twilio removed entirely)."""
        formatted_num = self._format_phone(to_number)
        
        # ─── WPPConnect WhatsApp Integration ───
        if channel == "WHATSAPP":
            wpp_url = os.getenv("WPPCONNECT_API_URL", "")
            wpp_session = os.getenv("WPPCONNECT_SESSION", "cartguard")
            wpp_token = await self.get_wpp_token(wpp_url, wpp_session)
            
            if wpp_url and formatted_num:
                cleaned_phone = formatted_num.replace("+", "")
                url = f"{wpp_url.rstrip('/')}/api/{wpp_session}/send-message"
                headers = {"Content-Type": "application/json"}
                if wpp_token:
                    headers["Authorization"] = f"Bearer {wpp_token}"
                
                print(f"[WHATSAPP WPPCONNECT DISPATCHING] To: {cleaned_phone} via {url}")
                try:
                    async with httpx.AsyncClient() as client:
                        response = await client.post(
                            url,
                            headers=headers,
                            json={"phone": cleaned_phone, "message": message},
                            timeout=20.0
                        )
                        if response.status_code in [200, 201]:
                            print(f"[WHATSAPP WPPCONNECT SUCCESS] Sent to {cleaned_phone}")
                            return {"status": "sent", "channel": "whatsapp", "provider": "wppconnect"}
                        else:
                            resp_json = {}
                            try:
                                resp_json = response.json()
                            except Exception:
                                pass
                            err_msg = resp_json.get("message") or response.text
                            print(f"[WHATSAPP WPPCONNECT ERROR] Status {response.status_code}: {err_msg}")
                            return {"status": "failed", "channel": "whatsapp", "error": err_msg}
                except Exception as e:
                    print(f"[WHATSAPP WPPCONNECT EXCEPTION] {str(e)}")
                    return {"status": "failed", "channel": "whatsapp", "error": str(e)}

        # SMS is mocked since Twilio was removed
        print(f"[{channel} MOCK] To: '{formatted_num}' | Message: {message}")
        return {"status": "mock_sent", "channel": channel.lower()}


notification_service = NotificationService()
