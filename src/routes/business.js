const express = require('express');
const router = express.Router();

const retailController = require('../controllers/RetailSaleController');
const expenseController = require('../controllers/ExpenseController');
const purchaseController = require('../controllers/PurchaseController');
const wholesaleController = require('../controllers/WholesaleSaleController');
const inventoryController = require('../controllers/InventoryController');
const transferController = require('../controllers/TransferController');
const vehicleController = require('../controllers/VehicleController');
const retailPaymentController = require('../controllers/RetailPaymentController');
const Vehicle = require('../models/Vehicle');

const { isAdmin, canManageDebt, canDelete, canManageMoney } = require('../middleware/authMiddleware');

// Retail Sales
router.get('/retail-sales', retailController.getAll);
router.post('/retail-sales', retailController.create);
router.delete('/retail-sales/:id', canDelete, retailController.delete);
router.put('/retail-sales/:id/disbursement', canManageMoney, retailController.updateDisbursement);
router.get('/retail-sales/:id/payments', retailPaymentController.getPaymentsBySale); // Get all payments for a sale
router.post('/retail-payments', canManageMoney, retailPaymentController.addPayment); // Add a new payment
router.delete('/retail-payments/:id', canManageMoney, retailPaymentController.deletePayment); // Delete a payment record

// Expenses
router.get('/expenses', isAdmin, expenseController.getAll);
router.post('/expenses', isAdmin, expenseController.create);
router.delete('/expenses/:id', isAdmin, expenseController.delete);

// Purchases
router.get('/purchases', purchaseController.getBySupplier);
router.post('/purchases', purchaseController.createPurchase);
router.get('/purchases/:id/details', purchaseController.getPurchaseDetails);
router.post('/purchases/payment', canManageMoney, purchaseController.addPayment);
router.delete('/purchases-payments/:id', canManageMoney, purchaseController.deletePayment);
router.delete('/purchases/:id', canDelete, purchaseController.deleteLot);
router.delete('/purchases/:purchase_id/vehicles/:vehicle_id', canDelete, purchaseController.deleteVehicleFromPurchase);

// Wholesale Sales
router.get('/wholesale-sales', wholesaleController.getByCustomer);
router.post('/wholesale-sales', wholesaleController.createSale);
router.get('/wholesale-sales/:id/details', wholesaleController.getSaleDetails);
router.post('/wholesale-sales/payment', canManageMoney, wholesaleController.addPayment);
router.delete('/wholesale-payments/:id', canManageMoney, wholesaleController.deletePayment);
router.delete('/wholesale-sales/:id', canDelete, wholesaleController.deleteSale);
router.delete('/wholesale-sales/:sale_id/vehicles/:vehicle_id', canDelete, wholesaleController.deleteVehicleFromSale);

// Inventory
router.get('/inventory/available', inventoryController.getAvailable);
router.get('/inventory/check', inventoryController.getByEngineNo);


// Vehicles
router.get('/vehicles', vehicleController.getAll);
router.get('/vehicles/:id', vehicleController.getById);
router.delete('/vehicles/:id', isAdmin, vehicleController.delete);

// Transfer
router.get('/transfers', transferController.getTransfers);
router.post('/transfers', transferController.requestTransfer);
router.get('/transfers/:id', transferController.getDetails);
router.put('/transfers/:id', isAdmin, transferController.updateTransfer);
router.post('/transfers/:id/approve', isAdmin, transferController.approveTransfer);
router.post('/transfers/:id/receive', transferController.receiveTransfer);
router.post('/transfers/:id/cancel', transferController.cancelTransfer);
router.post('/transfers/payment', canManageMoney, transferController.addPayment);

// Notification routes removed from here, now handled in notificationRoutes.js


const { Op } = require('sequelize');
const TransferItem = require('../models/TransferItem');
// Utility for fetching vehicles in specific warehouse
router.get('/vehicles-in-warehouse/:warehouse_id', async (req, res) => {
    try {
        const { warehouse_id } = req.params;
        const { include_transfer_id } = req.query;

        let selectedIds = [];
        if (include_transfer_id) {
            const items = await TransferItem.findAll({ where: { transfer_id: include_transfer_id } });
            selectedIds = items.map(i => i.vehicle_id);
        }

        const list = await Vehicle.findAll({ 
            where: { 
                warehouse_id,
                [Op.or]: [
                    { status: 'In Stock' },
                    { id: selectedIds }
                ]
            }
        });

        res.json(list);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

module.exports = router;

