const express = require('express');
const router = express.Router();
const reportController = require('../controllers/ReportController');
const { verifyToken } = require('../middleware/authMiddleware');


router.get('/vehicle-lifecycle', reportController.getVehicleLifecycle);
router.get('/vehicle-lookup', reportController.getVehicleLookup);
router.get('/vehicle-suggestions', reportController.getVehicleSuggestions);
router.patch('/vehicle-update/:id', reportController.updateVehicleData);
router.get('/inventory', reportController.getInventoryReport);
router.get('/general', reportController.getGeneralReport);
router.get('/wholesale-audit', reportController.getWholesaleAudit);
router.get('/retail-sales-report', reportController.getRetailSalesReport);
router.get('/warranty-report', reportController.getWarrantyReport);
router.get('/daily', reportController.getDailyReport);


module.exports = router;
