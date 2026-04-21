const express = require("express");
const router = express.Router();
const GiftController = require("../controllers/GiftController");

// Gift Master Data
router.get("/", GiftController.getAllGifts);
router.post("/", GiftController.createGift);
router.put("/:id", GiftController.updateGift);
router.delete("/:id", GiftController.deleteGift);

// Gift Inventory
router.get("/inventory", GiftController.getGiftInventory);

// Gift Transactions (Diary)
router.get("/transactions", GiftController.getTransactions);
router.post("/import", GiftController.importGifts);
router.post("/export", GiftController.exportGifts);

module.exports = router;
