const express = require('express');
const router = express.Router();

const colorController = require('../controllers/VehicleColorController');
const typeController = require('../controllers/VehicleTypeController');
const supplierController = require('../controllers/SupplierController');
const customerController = require('../controllers/WholesaleCustomerController');
const warehouseController = require('../controllers/WarehouseController');
const mechanicController = require('../controllers/MechanicController');


const { isAdmin, canManageMasterData } = require('../middleware/authMiddleware');

// Colors
router.get('/colors', colorController.getAll);
router.post('/colors', canManageMasterData, colorController.create);
router.put('/colors/:id', canManageMasterData, colorController.update);
router.delete('/colors/:id', canManageMasterData, colorController.delete);

// Vehicle Types
router.get('/vehicle-types', typeController.getAll);
router.post('/vehicle-types', canManageMasterData, typeController.create);
router.put('/vehicle-types/:id', canManageMasterData, typeController.update);
router.delete('/vehicle-types/:id', canManageMasterData, typeController.delete);

// Suppliers
router.get('/suppliers', supplierController.getAll);
router.post('/suppliers', canManageMasterData, supplierController.create);
router.put('/suppliers/:id', canManageMasterData, supplierController.update);
router.delete('/suppliers/:id', canManageMasterData, supplierController.delete);

// Wholesale Customers
router.get('/wholesale-customers', customerController.getAll);
router.post('/wholesale-customers', canManageMasterData, customerController.create);
router.put('/wholesale-customers/:id', canManageMasterData, customerController.update);
router.delete('/wholesale-customers/:id', canManageMasterData, customerController.delete);

// Warehouses
router.get('/warehouses', warehouseController.getAll);
router.post('/warehouses', isAdmin, warehouseController.create);
router.put('/warehouses/:id', isAdmin, warehouseController.update);
router.delete('/warehouses/:id', isAdmin, warehouseController.delete);

// Mechanics
router.get('/mechanics', mechanicController.getAll);
router.post('/mechanics', isAdmin, mechanicController.create);
router.put('/mechanics/:id', isAdmin, mechanicController.update);
router.delete('/mechanics/:id', isAdmin, mechanicController.delete);

module.exports = router;
