const XLSX = require('xlsx');
const sequelize = require('../config/database');
const VehicleColor = require('../models/VehicleColor');
const VehicleType = require('../models/VehicleType');
const WholesaleCustomer = require('../models/WholesaleCustomer');
const Supplier = require('../models/Supplier');
const Warehouse = require('../models/Warehouse');
const Vehicle = require('../models/Vehicle');
const Purchase = require('../models/Purchase');
const RetailSale = require('../models/RetailSale');
const WholesaleSale = require('../models/WholesaleSale');
const { Op } = require('sequelize');

const importData = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn file Excel!' });
    }

    const { type } = req.body;
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let results = { success: 0, failed: 0, errors: [] };

    for (const row of data) {
      try {
        switch (type) {
          case 'colors':
            if (row.color_name) {
              await VehicleColor.findOrCreate({ where: { color_name: row.color_name }, transaction: t });
              results.success++;
            }
            break;

          case 'types':
            if (row.name && row.type) {
              await VehicleType.findOrCreate({ 
                where: { name: row.name }, 
                defaults: { 
                  type: row.type, 
                  chassis_prefix: row.chassis_prefix || '', 
                  engine_prefix: row.engine_prefix || '' 
                },
                transaction: t
              });
              results.success++;
            }
            break;

          case 'customers':
            if (row.name && row.customer_code) {
              await WholesaleCustomer.findOrCreate({ 
                where: { customer_code: row.customer_code }, 
                defaults: { 
                    name: row.name, 
                    address: row.address || '', 
                    payment_type: row.payment_type || 'Trả gộp' 
                },
                transaction: t
              });
              results.success++;
            }
            break;

          case 'suppliers':
            if (row.name) {
              await Supplier.findOrCreate({ 
                where: { name: row.name }, 
                defaults: { 
                    address: row.address || '', 
                    notes: row.notes || '', 
                    payment_type: row.payment_type || 'Trả gộp' 
                },
                transaction: t
              });
              results.success++;
            }
            break;

          case 'purchases':
            if (row.engine_no && row.chassis_no && row.type_name && row.color_name && row.supplier_name && row.warehouse_name) {
              // 1. Find or create Master Data
              const [vColor] = await VehicleColor.findOrCreate({ where: { color_name: row.color_name }, transaction: t });
              const [vType] = await VehicleType.findOrCreate({ where: { name: row.type_name }, defaults: { type: 'Xe mới' }, transaction: t });
              const [vSupplier] = await Supplier.findOrCreate({ where: { name: row.supplier_name }, transaction: t });
              const [vWarehouse] = await Warehouse.findOrCreate({ where: { warehouse_name: row.warehouse_name }, transaction: t });

              // 2. Create Purchase (One per row for simplicity in old data import, or you could group by date/supplier)
              const purchaseDate = row.purchase_date ? new Date(row.purchase_date) : new Date();
              const [vPurchase] = await Purchase.findOrCreate({
                where: {
                  supplier_id: vSupplier.id,
                  warehouse_id: vWarehouse.id,
                  purchase_date: { [Op.between]: [new Date(purchaseDate.setHours(0,0,0,0)), new Date(purchaseDate.setHours(23,59,59,999))] }
                },
                defaults: {
                  supplier_id: vSupplier.id,
                  warehouse_id: vWarehouse.id,
                  purchase_date: row.purchase_date ? new Date(row.purchase_date) : new Date(),
                  created_by: req.user.id
                },
                transaction: t
              });

              // 3. Create Vehicle
              const [vehicle, created] = await Vehicle.findOrCreate({
                where: { engine_no: row.engine_no },
                defaults: {
                  chassis_no: row.chassis_no,
                  type_id: vType.id,
                  color_id: vColor.id,
                  warehouse_id: vWarehouse.id,
                  purchase_id: vPurchase.id,
                  price_vnd: row.price_vnd || 0,
                  status: 'In Stock'
                },
                transaction: t
              });

              if (created) {
                // Update Purchase total
                await vPurchase.increment('total_amount_vnd', { by: row.price_vnd || 0, transaction: t });
                results.success++;
              } else {
                 results.failed++;
                 results.errors.push(`Số máy ${row.engine_no} đã tồn tại trong hệ thống.`);
              }
            }
            break;

          case 'retail_sales':
             if (row.engine_no && row.customer_name && row.sale_price) {
                const vehicle = await Vehicle.findOne({ where: { engine_no: row.engine_no, status: 'In Stock' }, transaction: t });
                if (!vehicle) {
                    results.failed++;
                    results.errors.push(`Số máy ${row.engine_no} không tồn tại hoặc đã bán.`);
                    break;
                }
                const [vWarehouse] = await Warehouse.findOrCreate({ where: { warehouse_name: row.warehouse_name || 'Kho mặc định' }, transaction: t });
                
                const sale = await RetailSale.create({
                    sale_date: row.sale_date ? new Date(row.sale_date) : new Date(),
                    customer_name: row.customer_name,
                    phone: row.phone || '',
                    address: row.address || '',
                    engine_no: vehicle.engine_no,
                    chassis_no: vehicle.chassis_no,
                    total_price: row.sale_price,
                    paid_amount: row.paid_amount || row.sale_price,
                    guarantee: row.guarantee || 'Không',
                    payment_method: row.payment_method || 'Trả thẳng',
                    bank_name: row.bank_name || '',
                    contract_number: row.contract_number || '',
                    loan_amount: row.loan_amount || 0,
                    warehouse_id: vWarehouse.id,
                    created_by: req.user.id
                }, { transaction: t });

                await vehicle.update({ status: 'Sold', retail_sale_id: sale.id }, { transaction: t });
                results.success++;
             }
             break;

          case 'wholesale_sales':
              if (row.engine_no && row.customer_code && row.sale_price_vnd) {
                  const vehicle = await Vehicle.findOne({ where: { engine_no: row.engine_no, status: 'In Stock' }, transaction: t });
                  if (!vehicle) {
                      results.failed++;
                      results.errors.push(`Số máy ${row.engine_no} không tồn tại hoặc đã bán.`);
                      break;
                  }
                  
                  const customer = await WholesaleCustomer.findOne({ where: { customer_code: row.customer_code }, transaction: t });
                  if (!customer) {
                      results.failed++;
                      results.errors.push(`Khách buôn mã ${row.customer_code} không tồn tại.`);
                      break;
                  }

                  const [vWarehouse] = await Warehouse.findOrCreate({ where: { warehouse_name: row.warehouse_name || 'Kho mặc định' }, transaction: t });

                  const saleDate = row.sale_date ? new Date(row.sale_date) : new Date();
                  const [wSale] = await WholesaleSale.findOrCreate({
                      where: {
                          customer_id: customer.id,
                          warehouse_id: vWarehouse.id,
                          sale_date: { [Op.between]: [new Date(saleDate.setHours(0,0,0,0)), new Date(saleDate.setHours(23,59,59,999))] }
                      },
                      defaults: {
                          customer_id: customer.id,
                          warehouse_id: vWarehouse.id,
                          sale_date: saleDate,
                          created_by: req.user.id
                      },
                      transaction: t
                  });

                  await vehicle.update({ status: 'Sold', wholesale_sale_id: wSale.id }, { transaction: t });
                  await wSale.increment('total_amount_vnd', { by: row.sale_price_vnd, transaction: t });
                  results.success++;
              }
              break;

          default:
            throw new Error('Loại dữ liệu không hợp lệ!');
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`Dòng ${JSON.stringify(row)}: ${err.message}`);
      }
    }

    await t.commit();
    res.json({
      message: `Đã xử lý xong: ${results.success} thành công, ${results.failed} thất bại.`,
      results
    });

  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Lỗi khi import file: ' + error.message });
  }
};

module.exports = {
  importData
};

module.exports = {
  importData
};
