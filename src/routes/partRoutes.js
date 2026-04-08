const express = require('express');
const router = express.Router();
const partController = require('../controllers/partController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// Parts
router.get('/parts', partController.getParts);
router.post('/parts', isAdmin, partController.createPart);
router.put('/parts/:id', isAdmin, partController.updatePart);
router.delete('/parts/:id', isAdmin, partController.deletePart);

// Inventory
router.get('/part-inventory', partController.getPartInventory);

// Business Logic
router.post('/part-purchase', partController.createPartPurchase);
router.post('/part-sale', partController.createPartSale);
router.post('/maintenance-order', partController.createMaintenanceOrder);
router.get('/maintenance-orders', partController.getMaintenanceOrders);

// Debt Management
router.get('/part-purchases', partController.getPartPurchases);
router.get('/part-sales', partController.getPartSales);
router.put('/part-purchase/:id/payment', partController.updatePartPurchasePayment);
router.put('/part-sale/:id/payment', partController.updatePartSalePayment);
router.put('/maintenance-order/:id/payment', partController.updateMaintenanceOrderPayment);

module.exports = router;
