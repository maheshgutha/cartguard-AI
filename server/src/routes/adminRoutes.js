import express from "express";
import {
  getOverview,
  getLiveSessions,
  scoreSession,
  scoreBatch,
  getDemoScenarios,
  runDemoScenario,
  getUpliftSimulation,
  getAuditLog,
  getAllOrdersAdmin,
  getWhatsAppStatus,
  startWhatsAppSession,
  getWhatsAppQRCode,
  clearNotificationCooldown,
  sendTestEmailAdmin,
  sendWhatsAppMessageAdmin,
} from "../controllers/adminController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(protect, requireRole("admin"));

router.get("/overview", getOverview);
router.get("/live-sessions", getLiveSessions);
router.post("/score-session", scoreSession);
router.post("/score-batch", scoreBatch);
router.get("/demo-scenarios", getDemoScenarios);
router.post("/demo-scenarios/:scenarioName/run", runDemoScenario);
router.get("/uplift", getUpliftSimulation);
router.get("/audit-log", getAuditLog);
router.get("/orders", getAllOrdersAdmin);
router.get("/whatsapp-status", getWhatsAppStatus);
router.post("/whatsapp-start", startWhatsAppSession);
router.get("/whatsapp-qrcode", getWhatsAppQRCode);
router.post("/clear-cooldown", clearNotificationCooldown);
router.post("/send-test-email", sendTestEmailAdmin);
router.post("/whatsapp-send", sendWhatsAppMessageAdmin);

export default router;
