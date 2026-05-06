const express = require('express');
const router = express.Router();
const reportController = require('../controllers/ReportController');
const { verifyToken, canManageSales, canManageSpareParts, canManageVehicles } = require('../middleware/authMiddleware');


router.get('/vehicle-lifecycle', canManageVehicles, reportController.getVehicleLifecycle);
router.get('/vehicle-lookup', canManageVehicles, reportController.getVehicleLookup);
router.get('/vehicle-suggestions', canManageVehicles, reportController.getVehicleSuggestions);
router.patch('/vehicle-update/:id', canManageVehicles, reportController.updateVehicleData);
router.get('/inventory', canManageVehicles, reportController.getInventoryReport);
router.get('/general', canManageSales, reportController.getGeneralReport);
router.get('/wholesale-audit', canManageSales, reportController.getWholesaleAudit);
router.get('/wholesale-audit-overview', canManageSales, reportController.getWholesaleAuditOverview);
router.get('/retail-sales-report', canManageSales, reportController.getRetailSalesReport);
router.get('/warranty-report', canManageSales, reportController.getWarrantyReport);
router.get('/daily', canManageSales, reportController.getDailyReport);

// SPARE PARTS REPORTS
router.get('/parts/inventory', canManageSpareParts, reportController.getPartInventoryReport);
router.get('/parts/purchases', canManageSpareParts, reportController.getPartPurchasesReport);
router.get('/parts/purchases-summary', canManageSpareParts, reportController.getPartImportSummaryReport);
router.get('/parts/sales', canManageSpareParts, reportController.getPartSalesReport);
router.get('/parts/usage', canManageSpareParts, reportController.getPartUsageReport);
router.get('/parts/transfers', canManageSpareParts, reportController.getPartTransferReport);
router.get('/parts/transfers/export-monthly', canManageSpareParts, reportController.exportPartTransferMonthlyReport);
router.get('/parts/transfers-summary', canManageSpareParts, reportController.getPartTransferSummaryReport);
router.get('/maintenance', canManageSpareParts, reportController.getMaintenanceReport);


module.exports = router;
