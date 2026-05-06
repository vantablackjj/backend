const express = require('express');
const router = express.Router();
const partController = require('../controllers/partController');
const { verifyToken, isAdmin, canManageSpareParts, canDelete, canDeleteTicket, canEditTicket, canApproveTransfer } = require('../middleware/authMiddleware');


// Parts
router.get('/parts', canManageSpareParts, partController.getParts);
router.post('/parts', canManageSpareParts, partController.createPart);
router.put('/parts/:id', canManageSpareParts, partController.updatePart);
router.delete('/parts/:id', isAdmin, partController.deletePart);

// Inventory
router.get('/part-inventory', canManageSpareParts, partController.getPartInventory);
router.put('/part-inventory/:id', canManageSpareParts, partController.updatePartInventory);

// Business Logic
router.post('/part-purchase', canManageSpareParts, partController.createPartPurchase);
router.post('/part-sale', canManageSpareParts, partController.createPartSale);
router.post('/maintenance-order', canManageSpareParts, partController.createMaintenanceOrder);
router.put('/maintenance-order/:id', canEditTicket, partController.updateMaintenanceOrder);
router.delete('/maintenance-order/:id', canDeleteTicket, partController.deleteMaintenanceOrder);

router.get('/maintenance-orders', canManageSpareParts, partController.getMaintenanceOrders);

// Debt Management
router.get('/part-purchases', canManageSpareParts, partController.getPartPurchases);
router.put('/part-purchase/:id', canEditTicket, partController.updatePartPurchase);
router.delete('/part-purchase/:id', canDelete, partController.deletePartPurchase);
router.get('/part-sales', canManageSpareParts, partController.getPartSales);
router.delete('/part-sales/:id', canDelete, partController.deletePartSale);
router.delete('/part-sale/:id', canDelete, partController.deletePartSale);

router.put('/part-purchase/:id/payment', canManageSpareParts, partController.updatePartPurchasePayment);
router.put('/part-sale/:id/payment', canManageSpareParts, partController.updatePartSalePayment);
router.put('/maintenance-order/:id/payment', canManageSpareParts, partController.updateMaintenanceOrderPayment);

// Part Transfers
const partTransferController = require('../controllers/partTransferController');
router.get('/part-transfers', canManageSpareParts, partTransferController.getTransfers);
router.post('/part-transfers', canManageSpareParts, partTransferController.requestTransfer);
router.get('/part-transfers/:id', canManageSpareParts, partTransferController.getDetails);
router.post('/part-transfers/:id/approve', canApproveTransfer, partTransferController.approveTransfer);
router.post('/part-transfers/:id/receive', canManageSpareParts, partTransferController.receiveTransfer);
router.post('/part-transfers/:id/cancel', canManageSpareParts, partTransferController.cancelTransfer);

module.exports = router;
