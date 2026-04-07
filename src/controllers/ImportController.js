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
const { sendNotification } = require('../utils/notificationHelper');

const importData = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn file Excel!' });
    }

    const { type } = req.body;
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Header mapping: Vietnamese -> English (Lowercase & Trimmed)
    const headerMap = {
      'ngày bán': 'sale_date',
      'ngày nhập': 'purchase_date',
      'số máy': 'engine_no',
      'số khung': 'chassis_no',
      'tên kho': 'warehouse_name',
      'kho': 'warehouse_name',
      'ghi chú': 'notes',
      'địa chỉ': 'address',
      'tên màu': 'color_name',
      'màu sắc': 'color_name',
      'tên loại xe': 'name',
      'loại xe': 'name',
      'phân loại': 'type',
      'tiền tố khung': 'chassis_prefix',
      'tiền tố máy': 'engine_prefix',
      'mã khách hàng': 'customer_code',
      'mã khách': 'customer_code',
      'tên khách': 'customer_name', 
      'tên khách hàng': 'customer_name',
      'tên ncc': 'supplier_name',
      'nhà cung cấp': 'supplier_name',
      'hình thức tt': 'payment_type',
      'giá nhập': 'price_vnd',
      'số điện thoại': 'phone',
      'giá bán': 'sale_price',
      'total': 'sale_price',
      'tiền khách trả': 'paid_amount',
      'thanh toán': 'paid_amount',
      'bảo hành': 'guarantee',
      'phát sổ bảo hành': 'guarantee',
      'giá bán buôn': 'sale_price_vnd',
      'giá bán lẻ': 'sale_price_vnd', 
      'tiền khách trả buôn': 'paid_amount_vnd',
      'đã trả': 'paid_amount_vnd',
    };

    // Normalize data: Map Vietnamese headers to English keys
    const data = rawData.map(row => {
      const newRow = {};
      Object.keys(row).forEach(key => {
        const cleanKey = key.trim().toLowerCase();
        const normalizedKey = headerMap[cleanKey] || key;
        newRow[normalizedKey] = row[key];
      });
      return newRow;
    });

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
            if ((row.name || row.type_name) && row.type) {
              await VehicleType.findOrCreate({ 
                where: { name: row.name || row.type_name }, 
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
            const cName = row.customer_name || row.name;
            if (cName && row.customer_code) {
              await WholesaleCustomer.findOrCreate({ 
                where: { customer_code: row.customer_code }, 
                defaults: { 
                    name: cName, 
                    address: row.address || '', 
                    payment_type: row.payment_type || 'Trả gộp' 
                },
                transaction: t
              });
              results.success++;
            }
            break;

          case 'suppliers':
            const sName = row.supplier_name || row.name;
            if (sName) {
              await Supplier.findOrCreate({ 
                where: { name: sName }, 
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
            if (row.engine_no && row.chassis_no && row.name && row.color_name && row.supplier_name && row.warehouse_name) {
              // Master Data Validation - STRICT
              const [vColor] = await VehicleColor.findOrCreate({ where: { color_name: row.color_name }, transaction: t });
              const [vType] = await VehicleType.findOrCreate({ where: { name: row.name }, defaults: { type: 'Xe mới' }, transaction: t });
              
              const vSupplier = await Supplier.findOne({ where: { name: row.supplier_name }, transaction: t });
              if (!vSupplier) throw new Error(`Nhà cung cấp '${row.supplier_name}' không tồn tại trong danh mục.`);
              
              const vWarehouse = await Warehouse.findOne({ where: { warehouse_name: row.warehouse_name }, transaction: t });
              if (!vWarehouse) throw new Error(`Kho '${row.warehouse_name}' không tồn tại trong danh mục.`);

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
                  purchase_date: purchaseDate,
                  created_by: req.user.id
                },
                transaction: t
              });

              const [vehicle, created] = await Vehicle.findOrCreate({
                where: { engine_no: row.engine_no },
                defaults: {
                  chassis_no: row.chassis_no,
                  type_id: vType.id,
                  color_id: vColor.id,
                  warehouse_id: vWarehouse.id,
                  purchase_id: vPurchase.id,
                  price_vnd: Number(row.price_vnd) || 0,
                  status: 'In Stock'
                },
                transaction: t
              });

              if (created) {
                await vPurchase.increment('total_amount_vnd', { by: Number(row.price_vnd) || 0, transaction: t });
                results.success++;
              } else {
                 results.failed++;
                 results.errors.push(`Số máy ${row.engine_no} đã tồn tại.`);
              }
            }
            break;

          case 'retail_sales':
             if (row.engine_no && row.customer_name && row.sale_price) {
                const vehicle = await Vehicle.findOne({ where: { engine_no: row.engine_no, status: 'In Stock' }, transaction: t });
                if (!vehicle) throw new Error(`Số máy ${row.engine_no} không tồn tại hoặc đã bán.`);
                
                const vWarehouse = await Warehouse.findOne({ where: { warehouse_name: row.warehouse_name || 'Kho mặc định' }, transaction: t });
                if (!vWarehouse) throw new Error(`Kho '${row.warehouse_name}' không tồn tại.`);
                
                const guaranteeValue = (String(row.guarantee).toLowerCase() === 'có' || row.guarantee === true) ? 'Có' : 'Không';
                const sale = await RetailSale.create({
                    sale_date: row.sale_date ? new Date(row.sale_date) : new Date(),
                    customer_name: row.customer_name,
                    phone: row.phone || '',
                    address: row.address || '',
                    engine_no: vehicle.engine_no,
                    chassis_no: vehicle.chassis_no,
                    total_price: Number(row.sale_price),
                    paid_amount: Number(row.paid_amount || row.sale_price),
                    guarantee: guaranteeValue,
                    payment_method: row.payment_method || 'Trả thẳng',
                    warehouse_id: vWarehouse.id,
                    created_by: req.user.id
                }, { transaction: t });

                await vehicle.update({ status: 'Sold', retail_sale_id: sale.id }, { transaction: t });
                results.success++;
             }
             break;

          case 'wholesale_sales':
              if (row.engine_no && row.customer_code && (row.sale_price_vnd || row.sale_price)) {
                  const vehicle = await Vehicle.findOne({ where: { engine_no: row.engine_no, status: 'In Stock' }, transaction: t });
                  if (!vehicle) throw new Error(`Số máy ${row.engine_no} không tồn tại hoặc đã bán.`);

                  const customer = await WholesaleCustomer.findOne({ where: { customer_code: row.customer_code }, transaction: t });
                  if (!customer) throw new Error(`Khách buôn mã ${row.customer_code} không tồn tại.`);

                  const vWarehouse = await Warehouse.findOne({ where: { warehouse_name: row.warehouse_name || 'Kho mặc định' }, transaction: t });
                  if (!vWarehouse) throw new Error(`Kho '${row.warehouse_name}' không tồn tại.`);

                  const wsPrice = Number(row.sale_price_vnd || row.sale_price);
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
                  await wSale.increment('total_amount_vnd', { by: wsPrice, transaction: t });
                  results.success++;
              }
              break;

          default:
            throw new Error('Loại dữ liệu không hợp lệ!');
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`Số máy/Tên: ${row.engine_no || row.name || 'N/A'} -> ${err.message}`);
      }
    }

    await t.commit();

    // 🔔 SEND NOTIFICATION AFTER SUCCESSFUL IMPORT
    if (results.success > 0) {
        const typeLabels = {
            'colors': 'danh mục màu',
            'types': 'danh mục loại xe',
            'purchases': 'lô hàng nhập',
            'retail_sales': 'đơn bán lẻ',
            'wholesale_sales': 'đơn bán buôn',
            'suppliers': 'nhà cung cấp',
            'customers': 'khách buôn'
        };
        await sendNotification(req, {
            title: `📥 Import Excel: ${typeLabels[type] || type}`,
            message: `Nhân viên ${req.user.full_name} đã nhập thành công ${results.success} bản ghi từ file Excel.`,
            type: 'IMPORT_EXCEL',
            link: '/dashboard'
        });
    }

    res.json({
      message: `Đã xử lý xong: ${results.success} thành công, ${results.failed} thất bại.`,
      results
    });

  } catch (error) {
    if (t) await t.rollback();
    res.status(500).json({ message: 'Lỗi khi import file: ' + error.message });
  }
};

module.exports = {
  importData
};
