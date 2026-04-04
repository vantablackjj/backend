const express = require('express');
const router = express.Router();

const retailController = require('../controllers/RetailSaleController');
const expenseController = require('../controllers/ExpenseController');
const purchaseController = require('../controllers/PurchaseController');
const wholesaleController = require('../controllers/WholesaleSaleController');
const inventoryController = require('../controllers/InventoryController');
const transferController = require('../controllers/TransferController');
const vehicleController = require('../controllers/VehicleController');
const Vehicle = require('../models/Vehicle');

const { isAdmin } = require('../middleware/authMiddleware');

// Retail Sales
router.get('/retail-sales', retailController.getAll);
router.post('/retail-sales', retailController.create);
router.delete('/retail-sales/:id', isAdmin, retailController.delete);

// Expenses
router.get('/expenses', isAdmin, expenseController.getAll);
router.post('/expenses', isAdmin, expenseController.create);
router.delete('/expenses/:id', isAdmin, expenseController.delete);

// Purchases
router.get('/purchases', purchaseController.getBySupplier);
router.post('/purchases', purchaseController.createPurchase);
router.get('/purchases/:id/details', purchaseController.getPurchaseDetails);
router.post('/purchases/payment', isAdmin, purchaseController.addPayment);

// Wholesale Sales
router.get('/wholesale-sales', wholesaleController.getByCustomer);
router.post('/wholesale-sales', wholesaleController.createSale);
router.get('/wholesale-sales/:id/details', wholesaleController.getSaleDetails);
router.post('/wholesale-sales/payment', isAdmin, wholesaleController.addPayment);

// Inventory
router.get('/inventory/available', inventoryController.getAvailable);
router.get('/inventory/check', inventoryController.getByEngineNo);


// Vehicles
router.get('/vehicles', vehicleController.getAll);
router.get('/vehicles/:id', vehicleController.getById);

// Transfer
router.get('/transfers', transferController.getTransfers);
router.post('/transfers', transferController.requestTransfer);
router.get('/transfers/:id', transferController.getDetails);
router.put('/transfers/:id', isAdmin, transferController.updateTransfer);
router.post('/transfers/:id/approve', isAdmin, transferController.approveTransfer);
router.post('/transfers/:id/receive', transferController.receiveTransfer);
router.post('/transfers/:id/cancel', transferController.cancelTransfer);

// Notification routes removed from here, now handled in notificationRoutes.js


// Utility for fetching vehicles in specific warehouse
router.get('/vehicles-in-warehouse/:warehouse_id', async (req, res) => {
    try {
        const { warehouse_id } = req.params;
        const list = await Vehicle.findAll({ 
            where: { warehouse_id, status: 'In Stock' }
        });

        res.json(list);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

module.exports = router;

