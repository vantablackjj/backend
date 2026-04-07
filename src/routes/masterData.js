const express = require('express');
const router = express.Router();

const colorController = require('../controllers/VehicleColorController');
const typeController = require('../controllers/VehicleTypeController');
const supplierController = require('../controllers/SupplierController');
const customerController = require('../controllers/WholesaleCustomerController');
const warehouseController = require('../controllers/WarehouseController');


const { isAdmin } = require('../middleware/authMiddleware');

// Colors
router.get('/colors', colorController.getAll);
router.post('/colors', isAdmin, colorController.create);
router.delete('/colors/:id', isAdmin, colorController.delete);

// Vehicle Types
router.get('/vehicle-types', typeController.getAll);
router.post('/vehicle-types', isAdmin, typeController.create);
router.put('/vehicle-types/:id', isAdmin, typeController.update);
router.delete('/vehicle-types/:id', isAdmin, typeController.delete);

// Suppliers
router.get('/suppliers', supplierController.getAll);
router.post('/suppliers', isAdmin, supplierController.create);
router.delete('/suppliers/:id', isAdmin, supplierController.delete);

// Wholesale Customers
router.get('/wholesale-customers', customerController.getAll);
router.post('/wholesale-customers', isAdmin, customerController.create);
router.delete('/wholesale-customers/:id', isAdmin, customerController.delete);

// Warehouses
router.get('/warehouses', warehouseController.getAll);
router.post('/warehouses', isAdmin, warehouseController.create);
router.put('/warehouses/:id', isAdmin, warehouseController.update);
router.delete('/warehouses/:id', isAdmin, warehouseController.delete);


module.exports = router;
