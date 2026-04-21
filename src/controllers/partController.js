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
const { checkAndNotifyLowStock, notifyNewPurchase, sendNotification } = require('../utils/notificationHelper');

// --- PART CONTROLLERS ---
const getParts = async (req, res) => {
  try {
    const parts = await Part.findAll({
      include: [
        { model: Part, as: 'LinkedPart', attributes: ['id', 'code', 'name', 'unit'] },
        { model: PartInventory, attributes: ['warehouse_id', 'quantity'] }
      ],
      order: [['code', 'ASC']]
    });

    // Bổ sung: Nếu là mã cha (thùng), cần tính toán tồn kho ảo từ mã con (chai)
    // để hiển thị đúng trong các dropdown tìm kiếm.
    // Và ngược lại, nếu là mã con, cũng khớp với dữ liệu thực tế.
    
    // Tạo map để tra cứu tồn kho theo part_id nhanh chóng
    const inventoryMap = new Map();
    parts.forEach(p => {
        p.PartInventories?.forEach(inv => {
            inventoryMap.set(`${p.id}_${inv.warehouse_id}`, Number(inv.quantity));
        });
    });

    const results = parts.map(p => {
        const plain = p.toJSON();
        
        // Nếu là mã cha (thùng), tồn kho hiển thị = (Tồn kho của chính nó * conversion + Tồn kho của thằng con) / conversion
        if (p.linked_part_id) {
            const conversion = p.default_conversion_rate || 1;
            const allWhs = Array.from(new Set(parts.flatMap(x => (x.PartInventories || []).map(i => i.warehouse_id))));
            
            plain.PartInventories = allWhs.map(whId => {
                const selfQty = inventoryMap.get(`${p.id}_${whId}`) || 0;
                const childQty = inventoryMap.get(`${p.linked_part_id}_${whId}`) || 0;
                return { warehouse_id: whId, quantity: (selfQty * conversion + childQty) / conversion };
            }).filter(inv => inv.quantity > 0);
        }
        
        return plain;
    });

    res.json(results);
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
    const { supplier_id, warehouse_id: bodyWH, purchase_date, invoice_no, items, vat_percent, notes, paid_amount } = req.body;
    
    // Enforcement: staff only create in their warehouse
    const warehouse_id = (req.user.role === 'ADMIN') ? (bodyWH || req.user.warehouse_id) : req.user.warehouse_id;
    if (!warehouse_id) return res.status(400).json({ message: 'Vui lòng xác định kho nhập hàng' });

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
      
      // Check low stock
      const vWarehouse = await Warehouse.findByPk(warehouse_id, { transaction: t });
      await checkAndNotifyLowStock(req.app.get('io'), vPart.name, vPart.code, Number(inventory.quantity) + base_quantity, warehouse_id, vWarehouse?.warehouse_name);
    }

    const final_total = total_amount * (1 + (vat_percent || 0) / 100);
    await purchase.update({ total_amount: final_total }, { transaction: t });

    // Notify about new purchase
    const vWh = await Warehouse.findByPk(warehouse_id, { transaction: t });
    const vUser = await User.findByPk(req.user.id, { transaction: t });
    await notifyNewPurchase(req.app.get('io'), invoice_no || 'Đơn nhập tay', warehouse_id, vWh?.warehouse_name, vUser?.full_name || 'Nhân viên', req.user.id);

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
        items, vat_percent, paid_amount, warehouse_id, lift_table_id, status,
        gift_used
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
        gift_used,
        created_by: req.user.id
    }, { transaction: t });

    // Handle gift usage tracking
    if (gift_used && is_internal) {
        const RetailSale = require('../models/RetailSale');
        const sale = await RetailSale.findOne({ 
            where: { engine_no: order.engine_no, chassis_no: order.chassis_no },
            transaction: t
        });
        if (sale) {
            const usedGifts = sale.used_gifts || [];
            if (!usedGifts.includes(gift_used)) {
                await sale.update({ used_gifts: [...usedGifts, gift_used] }, { transaction: t });
            }
        }
    }

    // Auto-update Lift Table to BUSY (only if status is active)
    if (lift_table_id && !['COMPLETED', 'CANCELLED'].includes(status)) {
        const LiftTable = require('../models/LiftTable');
        await LiftTable.update({ status: 'BUSY' }, { where: { id: lift_table_id }, transaction: t });
    }

    let order_total_amount = 0;
    for (const item of items) {
        const item_total = Number(item.quantity) * Number(item.unit_price);
        order_total_amount += item_total;

        await MaintenanceItem.create({
            maintenance_order_id: order.id,
            type: item.type, // 'PART' or 'SERVICE'
            part_id: item.type === 'PART' ? item.part_id : null,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            total_price: item_total,
            sale_type: item.sale_type || 'THU_NGAY',
            purchase_price: item.purchase_price || 0
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
            
            // Notification: Low Stock
            const vWh = await Warehouse.findByPk(warehouse_id, { transaction: t });
            await checkAndNotifyLowStock(req.app.get('io'), vPart.name, vPart.code, Number(inventory.quantity) - baseQty, warehouse_id, vWh?.warehouse_name);
        }
    }

    const final_total = order_total_amount * (1 + (vat_percent || 0) / 100);
    const final_paid = (status === 'COMPLETED') ? final_total : (paid_amount || 0);

    await order.update({ 
        total_amount: final_total,
        paid_amount: final_paid
    }, { transaction: t });

    await t.commit();

    // Notification: New Maintenance Order
    const vWhModel = require('../models/Warehouse');
    const warehouseObj = await vWhModel.findByPk(warehouse_id);
    await sendNotification(req, {
        title: '🛠️ Phiếu sửa chữa mới',
        message: `Xe ${license_plate || engine_no} đã được tiếp nhận tại [${warehouseObj?.warehouse_name || 'N/A'}]. Trạng thái: ${status || 'IN_PROGRESS'}.`,
        type: 'MAINTENANCE',
        warehouse_id,
        link: '/maintenance-hub'
    });

    res.status(201).json(order);
  } catch (error) {
    if (t) await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

// --- INVENTORY ---
const getPartInventory = async (req, res) => {
  try {
    const { warehouse_id: queryWH, part_type } = req.query;
    const where = {};
    
    // Allow viewing inventory of any warehouse for stock checking
    if (queryWH) where.warehouse_id = queryWH;
    
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
    const { sale_date, sale_type, customer_id, customer_name, customer_phone, items, vat_percent, paid_amount, warehouse_id: bodyWH } = req.body;

    const warehouse_id = (req.user.role === 'ADMIN') ? (bodyWH || req.user.warehouse_id) : req.user.warehouse_id;
    if (!warehouse_id) return res.status(400).json({ message: 'Vui lòng xác định kho xuất hàng' });

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

      // Unified inventory check
      let totalAvailableBase = Number(inventory?.quantity || 0);
      let parentInventory = null;
      if (vPart.linked_part_id) {
          parentInventory = await PartInventory.findOne({
              where: { part_id: vPart.id, warehouse_id },
              transaction: t
          });
          if (parentInventory) totalAvailableBase += Number(parentInventory.quantity) * conversion;
      }

      if (totalAvailableBase < baseQty) {
        throw new Error(`Phụ tùng mã ${vPart.code} không đủ tồn kho! (Yêu cầu: ${baseQty}, Hiện có: ${totalAvailableBase})`);
      }

      // Deduction logic: Prioritize "Zombie Stock" from parent if searching for parent
      let remainingToDeduct = baseQty;
      if (parentInventory && parentInventory.quantity > 0) {
          const canDeductFromParent = Math.min(parentInventory.quantity, remainingToDeduct / conversion);
          if (canDeductFromParent > 0) {
              await parentInventory.decrement('quantity', { by: canDeductFromParent, transaction: t });
              remainingToDeduct -= canDeductFromParent * conversion;
          }
      }

      if (remainingToDeduct > 0) {
          if (!inventory) {
              await PartInventory.create({ part_id: inventoryPartId, warehouse_id, quantity: -remainingToDeduct }, { transaction: t });
          } else {
              await inventory.decrement('quantity', { by: remainingToDeduct, transaction: t });
          }
      }

      // Notification: Low Stock
      const vWh = await Warehouse.findByPk(warehouse_id, { transaction: t });
      await checkAndNotifyLowStock(req.app.get('io'), vPart.name, vPart.code, totalAvailableBase - baseQty, warehouse_id, vWh?.warehouse_name);
    }

    const final_total = total_amount * (1 + (vat_percent || 0) / 100);
    await sale.update({ total_amount: final_total }, { transaction: t });

    const fullSale = await PartSale.findByPk(sale.id, {
      include: [
        { model: Warehouse },
        { model: User, as: 'creator', attributes: ['full_name'] },
        { model: PartSaleItem, include: [Part] }
      ]
    });

    await t.commit();
    
    // Notification: New Part Sale
    const vWhModel = require('../models/Warehouse');
    const warehouseObj = await vWhModel.findByPk(warehouse_id);
    await sendNotification(req, {
        title: sale_type === 'Wholesale' ? '📦 Bán buôn phụ tùng' : '🛒 Bán lẻ phụ tùng',
        message: `Nhân viên ${req.user.full_name} đã tạo hóa đơn ${sale_type === 'Wholesale' ? 'bán buôn' : 'bán lẻ'} tại [${warehouseObj?.warehouse_name || 'N/A'}]. Tổng tiền: ${Number(final_total).toLocaleString()} đ.`,
        type: sale_type === 'Wholesale' ? 'PART_WHOLESALE' : 'PART_RETAIL',
        warehouse_id,
        link: sale_type === 'Wholesale' ? '/report/parts-sales-wholesale' : '/report/parts-sales-retail'
    });

    res.status(201).json(fullSale);
  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

const getPartPurchases = async (req, res) => {
    try {
        const where = {};
        if (req.user.role !== 'ADMIN' && req.user.warehouse_id) {
            where.warehouse_id = req.user.warehouse_id;
        }

        const purchases = await PartPurchase.findAll({
            where,
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
        
        if (req.user.role !== 'ADMIN' && req.user.warehouse_id) {
            where.warehouse_id = req.user.warehouse_id;
        }

        const sales = await PartSale.findAll({
            where,
            include: [
                { model: Warehouse },
                { model: User, as: 'creator', attributes: ['full_name'] }
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

        if (req.user.role !== 'ADMIN' && purchase.warehouse_id !== req.user.warehouse_id) {
            return res.status(403).json({ message: 'Bạn không có quyền cập nhật thanh toán cho kho khác!' });
        }

        await purchase.update({ paid_amount: Number(purchase.paid_amount) + Number(amount) });

        // Notification: Payment for Part Purchase
        const vWhModel = require('../models/Warehouse');
        const warehouseObj = await vWhModel.findByPk(purchase.warehouse_id);
        await sendNotification(req, {
            title: '💳 Trả tiền nhập hàng PT',
            message: `Nhân viên ${req.user.full_name} đã ghi nhận trả ${Number(amount).toLocaleString()} đ cho đơn nhập ${purchase.invoice_no || purchase.id} tại [${warehouseObj?.warehouse_name || 'N/A'}].`,
            type: 'PART_PURCHASE_PAYMENT',
            warehouse_id: purchase.warehouse_id,
            link: '/report/parts-purchases'
        });

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

        if (req.user.role !== 'ADMIN' && sale.warehouse_id !== req.user.warehouse_id) {
            return res.status(403).json({ message: 'Bạn không có quyền cập nhật thanh toán cho kho khác!' });
        }

        await sale.update({ paid_amount: Number(sale.paid_amount) + Number(amount) });

        // Notification: Payment for Part Sale
        const vWhModel = require('../models/Warehouse');
        const warehouseObj = await vWhModel.findByPk(sale.warehouse_id);
        await sendNotification(req, {
            title: '💰 Thu nợ phụ tùng',
            message: `Nhân viên ${req.user.full_name} đã thu ${Number(amount).toLocaleString()} đ từ đơn hàng của ${sale.customer_name || 'khách lẻ'} tại [${warehouseObj?.warehouse_name || 'N/A'}].`,
            type: 'PART_SALE_PAYMENT',
            warehouse_id: sale.warehouse_id,
            link: sale.sale_type === 'Wholesale' ? '/report/parts-sales-wholesale' : '/report/parts-sales-retail'
        });

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

        if (req.user.role !== 'ADMIN' && order.warehouse_id !== req.user.warehouse_id) {
            return res.status(403).json({ message: 'Bạn không có quyền cập nhật thanh toán cho kho khác!' });
        }

        await order.update({ paid_amount: Number(order.paid_amount) + Number(amount) });

        // Notification: Payment for Maintenance Order
        const vWhModel = require('../models/Warehouse');
        const warehouseObj = await vWhModel.findByPk(order.warehouse_id);
        await sendNotification(req, {
            title: '🛠️ Thu nợ sửa chữa',
            message: `Nhân viên ${req.user.full_name} đã thu ${Number(amount).toLocaleString()} đ cho phiếu sửa chữa xe ${order.license_plate || order.engine_no} tại [${warehouseObj?.warehouse_name || 'N/A'}].`,
            type: 'MAINTENANCE_PAYMENT',
            warehouse_id: order.warehouse_id,
            link: '/maintenance-hub'
        });

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
            items, vat_percent, paid_amount, warehouse_id, lift_table_id, status,
            gift_used
        } = req.body;

        const order = await MaintenanceOrder.findByPk(id, { include: [MaintenanceItem] });
        if (!order) throw new Error('Không tìm thấy phiếu bảo trì');

        // Security check
        if (req.user.role !== 'ADMIN' && order.warehouse_id !== req.user.warehouse_id) {
            return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa phiếu bảo trì thuộc kho khác' });
        }

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
            vat_percent, paid_amount, warehouse_id, lift_table_id, status,
            gift_used
        }, { transaction: t });

        // Handle gift usage tracking on update
        if (gift_used && order.is_internal_vehicle) {
            const RetailSale = require('../models/RetailSale');
            const sale = await RetailSale.findOne({ 
                where: { engine_no: order.engine_no, chassis_no: order.chassis_no },
                transaction: t
            });
            if (sale) {
                const usedGifts = sale.used_gifts || [];
                if (!usedGifts.includes(gift_used)) {
                    await sale.update({ used_gifts: [...usedGifts, gift_used] }, { transaction: t });
                }
            }
        }

        // Auto-update Lift Table Statuses
        const LiftTable = require('../models/LiftTable');
        const currentLiftId = lift_table_id || oldLiftId;
        
        // 1. If lift changed, free the old one
        if (oldLiftId && lift_table_id && oldLiftId !== lift_table_id) {
            await LiftTable.update({ status: 'AVAILABLE' }, { where: { id: oldLiftId }, transaction: t });
        }
        
        // 2. Update current lift based on order status
        if (currentLiftId) {
            if (['COMPLETED', 'CANCELLED'].includes(status)) {
                await LiftTable.update({ status: 'AVAILABLE' }, { where: { id: currentLiftId }, transaction: t });
            } else {
                await LiftTable.update({ status: 'BUSY' }, { where: { id: currentLiftId }, transaction: t });
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
                total_price: item_total,
                sale_type: item.sale_type || 'THU_NGAY',
                purchase_price: item.purchase_price || 0
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
                if (status !== 'CANCELLED') {
                    if (!inventory || inventory.quantity < baseQty) {
                        throw new Error(`Phụ tùng ${item.description || item.part_id} không đủ tồn kho tại kho này!`);
                    }
                    await inventory.decrement('quantity', { by: baseQty, transaction: t });
                }
            }
        }

        const final_total = total_amount * (1 + (vat_percent || 0) / 100);
        const final_paid = (status === 'COMPLETED') ? final_total : (paid_amount || 0);

        await order.update({ 
            total_amount: final_total,
            paid_amount: final_paid
        }, { transaction: t });

        await t.commit();

        // Notification: Maintenance Order Updated / Completed
        const vWhModel = require('../models/Warehouse');
        const warehouseObj = await vWhModel.findByPk(warehouse_id);
        if (status === 'COMPLETED') {
            await sendNotification(req, {
                title: '✅ Hoàn thành sửa chữa',
                message: `Xe ${license_plate || engine_no} tại [${warehouseObj?.warehouse_name || 'N/A'}] đã hoàn thành và thanh toán. Tổng: ${Number(final_total).toLocaleString()} đ.`,
                type: 'MAINTENANCE_COMPLETED',
                warehouse_id,
                link: '/maintenance-hub'
            });
        }

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

        // Phân quyền: Nhân viên chỉ thấy lịch sử của kho mình
        if (req.user.role !== 'ADMIN' && req.user.warehouse_id) {
            where.warehouse_id = req.user.warehouse_id;
        }

        if (search) {
            const searchCondition = {
                [Op.or]: [
                    { license_plate: { [Op.like]: `%${search}%` } },
                    { engine_no: { [Op.like]: `%${search}%` } },
                    { chassis_no: { [Op.like]: `%${search}%` } },
                    { customer_name: { [Op.like]: `%${search}%` } }
                ]
            };
            // Kết hợp điều kiện tìm kiếm với điều kiện kho (nếu có)
            where = { ...where, ...searchCondition };
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
