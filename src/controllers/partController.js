const Part = require('../models/Part');
const PartInventory = require('../models/PartInventory');
const PartPurchase = require('../models/PartPurchase');
const PartPurchaseItem = require('../models/PartPurchaseItem');
const PartSale = require('../models/PartSale');
const PartSaleItem = require('../models/PartSaleItem');
const MaintenanceOrder = require('../models/MaintenanceOrder');
const MaintenanceItem = require('../models/MaintenanceItem');
const Supplier = require('../models/Supplier');
const Warehouse = require('../models/Warehouse');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

// --- PART CONTROLLERS ---
const getParts = async (req, res) => {
  try {
    const parts = await Part.findAll({
      include: [{ model: Part, as: 'LinkedPart', attributes: ['code', 'name', 'unit'] }],
      order: [['code', 'ASC']]
    });
    res.json(parts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createPart = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.code) data.code = data.code.toUpperCase();
    const part = await Part.create(data);
    res.status(201).json(part);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updatePart = async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...req.body };
    if (data.code) data.code = data.code.toUpperCase();
    await Part.update(data, { where: { id } });
    res.json({ message: 'Cập nhật phụ tùng thành công' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deletePart = async (req, res) => {
  try {
    const { id } = req.params;
    await Part.destroy({ where: { id } });
    res.json({ message: 'Xóa phụ tùng thành công' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// --- PART PURCHASE (IMPORT) ---
const createPartPurchase = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { supplier_id, warehouse_id, purchase_date, invoice_no, items, vat_percent, notes, paid_amount } = req.body;

    let total_amount = 0;
    const purchase = await PartPurchase.create({
      supplier_id,
      warehouse_id,
      purchase_date,
      invoice_no,
      vat_percent,
      notes,
      paid_amount: paid_amount || 0,
      created_by: req.user.id
    }, { transaction: t });

    for (const item of items) {
      const base_quantity = Number(item.quantity) * Number(item.conversion_rate || 1);
      const total_price = Number(item.quantity) * Number(item.unit_price);
      total_amount += total_price;

      await PartPurchaseItem.create({
        purchase_id: purchase.id,
        part_id: item.part_id,
        quantity: item.quantity,
        unit: item.unit,
        conversion_rate: item.conversion_rate || 1,
        base_quantity,
        unit_price: item.unit_price,
        total_price,
        location: item.location
      }, { transaction: t });

      // Update Inventory
      const vPart = await Part.findByPk(item.part_id, { transaction: t });
      const inventoryPartId = vPart.linked_part_id || vPart.id;

      const [inventory, created] = await PartInventory.findOrCreate({
        where: { part_id: inventoryPartId, warehouse_id },
        defaults: { part_id: inventoryPartId, warehouse_id, quantity: 0 },
        transaction: t
      });

      await inventory.increment('quantity', { by: base_quantity, transaction: t });
      
      // Update location if provided
      if (item.location) {
          await inventory.update({ location: item.location }, { transaction: t });
      }
    }

    const final_total = total_amount * (1 + (vat_percent || 0) / 100);
    await purchase.update({ total_amount: final_total }, { transaction: t });

    await t.commit();
    res.status(201).json(purchase);
  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

// --- MAINTENANCE ORDER ---
const createMaintenanceOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { 
        maintenance_date, license_plate, engine_no, chassis_no, model_name, km_reading,
        customer_name, customer_phone, customer_address,
        mechanic_1_id, mechanic_2_id, service_type, notes,
        items, vat_percent, paid_amount, warehouse_id, lift_table_id, status
    } = req.body;

    // Check if vehicle exists in system
    let vehicle_id = null;
    let is_internal = false;
    if (engine_no || chassis_no) {
        const vehicle = await Vehicle.findOne({ 
            where: { 
                [Op.or]: [
                    engine_no ? { engine_no } : null,
                    chassis_no ? { chassis_no } : null
                ].filter(Boolean)
            } 
        });
        if (vehicle) {
            vehicle_id = vehicle.id;
            is_internal = true;
        }
    }

    const order = await MaintenanceOrder.create({
        maintenance_date, license_plate, engine_no, chassis_no, model_name, km_reading,
        is_internal_vehicle: is_internal,
        vehicle_id,
        customer_name, customer_phone, customer_address,
        mechanic_1_id, mechanic_2_id, service_type, notes,
        vat_percent, paid_amount, warehouse_id,
        lift_table_id, status: status || 'IN_PROGRESS',
        created_by: req.user.id
    }, { transaction: t });

    // Auto-update Lift Table to BUSY
    if (lift_table_id) {
        const LiftTable = require('../models/LiftTable');
        await LiftTable.update({ status: 'BUSY' }, { where: { id: lift_table_id }, transaction: t });
    }

    let total_amount = 0;
    for (const item of items) {
        const item_total = Number(item.quantity) * Number(item.unit_price);
        total_amount += item_total;

        await MaintenanceItem.create({
            maintenance_order_id: order.id,
            type: item.type, // 'PART' or 'SERVICE'
            part_id: item.type === 'PART' ? item.part_id : null,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            total_price: item_total
        }, { transaction: t });

        // If it's a part, decrease inventory
        if (item.type === 'PART') {
            const vPart = await Part.findByPk(item.part_id, { transaction: t });
            const inventoryPartId = vPart.linked_part_id || vPart.id;
            const conversion = vPart.default_conversion_rate || 1;
            const baseQty = Number(item.quantity) * conversion;

            const inventory = await PartInventory.findOne({
                where: { part_id: inventoryPartId, warehouse_id },
                transaction: t
            });
            if (!inventory || inventory.quantity < baseQty) {
                throw new Error(`Phụ tùng ${item.description || item.part_id} không đủ tồn kho tại kho này!`);
            }
            await inventory.decrement('quantity', { by: baseQty, transaction: t });
        }
    }

    const final_total = total_amount * (1 + (vat_percent || 0) / 100);
    await order.update({ total_amount: final_total }, { transaction: t });

    await t.commit();
    res.status(201).json(order);
  } catch (error) {
    if (t) await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

// --- INVENTORY ---
const getPartInventory = async (req, res) => {
  try {
    const { warehouse_id, part_type } = req.query;
    const where = {};
    if (warehouse_id) where.warehouse_id = warehouse_id;
    
    const partWhere = {};
    if (part_type) partWhere.part_type = part_type;

    const inventory = await PartInventory.findAll({
      where,
      include: [
        { 
            model: Part, 
            where: partWhere
        },
        { model: Warehouse, attributes: ['warehouse_name'] }
      ]
    });
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- DIRECT PART SALE ---
const createPartSale = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { sale_date, sale_type, customer_id, customer_name, customer_phone, items, vat_percent, paid_amount, warehouse_id } = req.body;

    const sale = await PartSale.create({
      sale_date,
      sale_type,
      customer_id,
      customer_name,
      customer_phone,
      vat_percent,
      paid_amount: paid_amount || 0,
      warehouse_id,
      created_by: req.user.id
    }, { transaction: t });

    let total_amount = 0;
    for (const item of items) {
      const item_total = Number(item.quantity) * Number(item.unit_price);
      total_amount += item_total;

      await PartSaleItem.create({
        sale_id: sale.id,
        part_id: item.part_id,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item_total
      }, { transaction: t });

      // Update Inventory
      const vPart = await Part.findByPk(item.part_id, { transaction: t });
      const inventoryPartId = vPart.linked_part_id || vPart.id;
      const conversion = vPart.default_conversion_rate || 1;
      const baseQty = Number(item.quantity) * conversion;

      const inventory = await PartInventory.findOne({
        where: { part_id: inventoryPartId, warehouse_id },
        transaction: t
      });

      if (!inventory || inventory.quantity < baseQty) {
        throw new Error(`Phụ tùng mã ${vPart.code} không đủ tồn kho!`);
      }

      await inventory.decrement('quantity', { by: baseQty, transaction: t });
    }

    const final_total = total_amount * (1 + (vat_percent || 0) / 100);
    await sale.update({ total_amount: final_total }, { transaction: t });

    await t.commit();
    res.status(201).json(sale);
  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

const getPartPurchases = async (req, res) => {
    try {
        const purchases = await PartPurchase.findAll({
            include: [
                { model: Supplier, attributes: ['name'] },
                { model: Warehouse, attributes: ['warehouse_name'] }
            ],
            order: [['purchase_date', 'DESC']]
        });
        res.json(purchases);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getPartSales = async (req, res) => {
    try {
        const { sale_type } = req.query;
        const where = {};
        if (sale_type) where.sale_type = sale_type;

        const sales = await PartSale.findAll({
            where,
            include: [
                { model: Warehouse, attributes: ['warehouse_name'] }
            ],
            order: [['sale_date', 'DESC']]
        });
        res.json(sales);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePartPurchasePayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;
        const purchase = await PartPurchase.findByPk(id);
        if (!purchase) return res.status(404).json({ message: 'Không tìm thấy đơn nhập' });

        await purchase.update({ paid_amount: Number(purchase.paid_amount) + Number(amount) });
        res.json({ message: 'Cập nhật thanh toán thành công' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updatePartSalePayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;
        const sale = await PartSale.findByPk(id);
        if (!sale) return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });

        await sale.update({ paid_amount: Number(sale.paid_amount) + Number(amount) });
        res.json({ message: 'Cập nhật thanh toán thành công' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateMaintenanceOrderPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;
        const order = await MaintenanceOrder.findByPk(id);
        if (!order) return res.status(404).json({ message: 'Không tìm thấy phiếu SC' });

        await order.update({ paid_amount: Number(order.paid_amount) + Number(amount) });
        res.json({ message: 'Cập nhật thanh toán thành công' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateMaintenanceOrder = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { 
            maintenance_date, license_plate, engine_no, chassis_no, model_name, km_reading,
            customer_name, customer_phone, customer_address,
            mechanic_1_id, mechanic_2_id, service_type, notes,
            items, vat_percent, paid_amount, warehouse_id, lift_table_id, status
        } = req.body;

        const order = await MaintenanceOrder.findByPk(id, { include: [MaintenanceItem] });
        if (!order) throw new Error('Không tìm thấy phiếu bảo trì');

        // Rollback inventory for existing PART items
        for (const oldItem of order.MaintenanceItems) {
            if (oldItem.type === 'PART' && oldItem.part_id) {
                const vPart = await Part.findByPk(oldItem.part_id, { transaction: t });
                const inventoryPartId = vPart.linked_part_id || vPart.id;
                const conversion = vPart.default_conversion_rate || 1;
                const baseQty = Number(oldItem.quantity) * conversion;

                const inventory = await PartInventory.findOne({
                    where: { part_id: inventoryPartId, warehouse_id: order.warehouse_id },
                    transaction: t
                });
                if (inventory) {
                    await inventory.increment('quantity', { by: baseQty, transaction: t });
                }
            }
        }

        // Delete old items
        await MaintenanceItem.destroy({ where: { maintenance_order_id: id }, transaction: t });

        const oldLiftId = order.lift_table_id;
        const oldStatus = order.status;

        // Update Order info
        await order.update({
            maintenance_date, license_plate, engine_no, chassis_no, model_name, km_reading,
            customer_name, customer_phone, customer_address,
            mechanic_1_id, mechanic_2_id, service_type, notes,
            vat_percent, paid_amount, warehouse_id, lift_table_id, status
        }, { transaction: t });

        // Auto-update Lift Table Statuses
        const LiftTable = require('../models/LiftTable');
        
        // 1. If lift changed
        if (oldLiftId && oldLiftId !== lift_table_id) {
            await LiftTable.update({ status: 'AVAILABLE' }, { where: { id: oldLiftId }, transaction: t });
        }
        
        // 2. Update current lift based on order status
        if (lift_table_id) {
            if (['COMPLETED', 'CANCELLED'].includes(status)) {
                await LiftTable.update({ status: 'AVAILABLE' }, { where: { id: lift_table_id }, transaction: t });
            } else {
                await LiftTable.update({ status: 'BUSY' }, { where: { id: lift_table_id }, transaction: t });
            }
        }

        // Create new items and deduct inventory
        let total_amount = 0;
        for (const item of items) {
            const item_total = Number(item.quantity) * Number(item.unit_price);
            total_amount += item_total;

            await MaintenanceItem.create({
                maintenance_order_id: order.id,
                type: item.type,
                part_id: item.type === 'PART' ? item.part_id : null,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unit_price,
                total_price: item_total
            }, { transaction: t });

            if (item.type === 'PART') {
                const vPart = await Part.findByPk(item.part_id, { transaction: t });
                const inventoryPartId = vPart.linked_part_id || vPart.id;
                const conversion = vPart.default_conversion_rate || 1;
                const baseQty = Number(item.quantity) * conversion;

                const inventory = await PartInventory.findOne({
                    where: { part_id: inventoryPartId, warehouse_id },
                    transaction: t
                });
                if (!inventory || inventory.quantity < baseQty) {
                    throw new Error(`Phụ tùng ${item.description || item.part_id} không đủ tồn kho tại kho này!`);
                }
                await inventory.decrement('quantity', { by: baseQty, transaction: t });
            }
        }

        const final_total = total_amount * (1 + (vat_percent || 0) / 100);
        await order.update({ total_amount: final_total }, { transaction: t });

        await t.commit();
        res.json(order);
    } catch (error) {
        if (t) await t.rollback();
        res.status(400).json({ message: error.message });
    }
};


const getMaintenanceOrders = async (req, res) => {
    try {
        const { search } = req.query;
        let where = {};
        if (search) {
            where = {
                [Op.or]: [
                    { license_plate: { [Op.like]: `%${search}%` } },
                    { engine_no: { [Op.like]: `%${search}%` } },
                    { chassis_no: { [Op.like]: `%${search}%` } },
                    { customer_name: { [Op.like]: `%${search}%` } }
                ]
            };
        }

        const orders = await MaintenanceOrder.findAll({
            where,
            include: [
                { model: Warehouse, attributes: ['warehouse_name'] },
                { model: MaintenanceItem, include: [Part] }
            ],
            order: [['maintenance_date', 'DESC']]
        });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
  getParts, createPart, updatePart, deletePart,
  createPartPurchase, createMaintenanceOrder,
  getPartInventory, createPartSale, getMaintenanceOrders,
  getPartPurchases, getPartSales, 
  updatePartPurchasePayment, updatePartSalePayment, updateMaintenanceOrderPayment,
  updateMaintenanceOrder
};
