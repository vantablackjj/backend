const express = require('express');
const router = express.Router();
const partController = require('../controllers/partController');
const { verifyToken, isAdmin, canManageSpareParts } = require('../middleware/authMiddleware');

// Parts
router.get('/parts', canManageSpareParts, partController.getParts);
router.post('/parts', canManageSpareParts, partController.createPart);
router.put('/parts/:id', canManageSpareParts, partController.updatePart);
router.delete('/parts/:id', isAdmin, partController.deletePart);

// Inventory
router.get('/part-inventory', canManageSpareParts, partController.getPartInventory);

// Business Logic
router.post('/part-purchase', canManageSpareParts, partController.createPartPurchase);
router.post('/part-sale', canManageSpareParts, partController.createPartSale);
router.post('/maintenance-order', canManageSpareParts, partController.createMaintenanceOrder);
router.put('/maintenance-order/:id', canManageSpareParts, partController.updateMaintenanceOrder);

router.get('/maintenance-orders', canManageSpareParts, partController.getMaintenanceOrders);

// Debt Management
router.get('/part-purchases', canManageSpareParts, partController.getPartPurchases);
router.get('/part-sales', canManageSpareParts, partController.getPartSales);
router.put('/part-purchase/:id/payment', canManageSpareParts, partController.updatePartPurchasePayment);
router.put('/part-sale/:id/payment', canManageSpareParts, partController.updatePartSalePayment);
router.put('/maintenance-order/:id/payment', canManageSpareParts, partController.updateMaintenanceOrderPayment);

// Part Transfers
const partTransferController = require('../controllers/partTransferController');
router.get('/part-transfers', canManageSpareParts, partTransferController.getTransfers);
router.post('/part-transfers', canManageSpareParts, partTransferController.requestTransfer);
router.get('/part-transfers/:id', canManageSpareParts, partTransferController.getDetails);
router.post('/part-transfers/:id/approve', isAdmin, partTransferController.approveTransfer);
router.post('/part-transfers/:id/receive', canManageSpareParts, partTransferController.receiveTransfer);
router.post('/part-transfers/:id/cancel', canManageSpareParts, partTransferController.cancelTransfer);

module.exports = router;
