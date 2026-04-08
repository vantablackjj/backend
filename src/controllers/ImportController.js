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
const Part = require('../models/Part');
const PartInventory = require('../models/PartInventory');

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
      'mã phụ tùng': 'code',
      'tên phụ tùng': 'name',
      'đơn vị': 'unit',
      'đơn vị tính': 'unit',
      'số lượng tồn': 'quantity',
      'số lượng': 'quantity',
      'vị trí': 'location'
    };

    // Normalize data: Map Vietnamese headers to English keys
    const data = rawData.map(row => {
      const newRow = {};
      Object.keys(row).forEach(key => {
        const cleanKey = key.trim().toLowerCase();
        const normalizedKey = headerMap[cleanKey] || key;
        
        let value = row[key];
        if (typeof value === 'string') {
          value = value.trim();
          // Normalize codes to Uppercase
          if (normalizedKey === 'code' || normalizedKey === 'engine_no' || normalizedKey === 'chassis_no') {
            value = value.toUpperCase();
          }
        }
        
        newRow[normalizedKey] = value;
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
              const [vType, created] = await VehicleType.findOrCreate({ 
                where: { name: row.name || row.type_name }, 
                defaults: { 
                  type: row.type, 
                  chassis_prefix: row.chassis_prefix || '', 
                  engine_prefix: row.engine_prefix || '' 
                },
                transaction: t
              });

              if (!created) {
                // If already exists, update with catalog data
                await vType.update({
                  type: row.type,
                  chassis_prefix: row.chassis_prefix || vType.chassis_prefix,
                  engine_prefix: row.engine_prefix || vType.engine_prefix
                }, { transaction: t });
              }
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

                  await vehicle.update({ 
                      status: 'Sold', 
                      wholesale_sale_id: wSale.id,
                      wholesale_price_vnd: wsPrice 
                  }, { transaction: t });
                  await wSale.increment('total_amount_vnd', { by: wsPrice, transaction: t });
                  results.success++;
              }
              break;

          case 'part_master':
            if (row.code) {
              const [vPart, created] = await Part.findOrCreate({
                where: { code: row.code },
                defaults: {
                  name: row.name || row.code,
                  unit: row.unit || 'Cái',
                  purchase_price: Number(row.purchase_price) || 0,
                  selling_price: Number(row.selling_price) || 0
                },
                transaction: t
              });

              if (!created) {
                await vPart.update({
                  name: row.name || vPart.name,
                  unit: row.unit || vPart.unit,
                  purchase_price: row.purchase_price !== undefined ? Number(row.purchase_price) : vPart.purchase_price,
                  selling_price: row.selling_price !== undefined ? Number(row.selling_price) : vPart.selling_price
                }, { transaction: t });
              }
              results.success++;
            }
            break;

          case 'part_inventory':
            if (row.code && row.warehouse_name) {
              const vPart = await Part.findOne({ where: { code: row.code }, transaction: t });
              if (!vPart) throw new Error(`Mã phụ tùng '${row.code}' không tồn tại trong danh mục.`);

              const vWarehouse = await Warehouse.findOne({ where: { warehouse_name: row.warehouse_name }, transaction: t });
              if (!vWarehouse) throw new Error(`Kho '${row.warehouse_name}' không tồn tại.`);

              const [inventory, invCreated] = await PartInventory.findOrCreate({
                where: { part_id: vPart.id, warehouse_id: vWarehouse.id },
                defaults: {
                  quantity: Number(row.quantity) || 0,
                  location: row.location || ''
                },
                transaction: t
              });

              if (!invCreated) {
                await inventory.update({
                  quantity: Number(row.quantity) || 0,
                  location: row.location || inventory.location
                }, { transaction: t });
              }
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
            'customers': 'khách buôn',
            'part_master': 'danh mục phụ tùng',
            'part_inventory': 'tồn kho phụ tùng'
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

const exceljs = require('exceljs');

const downloadTemplate = async (req, res) => {
    try {
        const { type } = req.query;
        const workbook = new exceljs.Workbook();
        const mainSheet = workbook.addWorksheet('Mau_Import');
        const dataSheet = workbook.addWorksheet('Data_Source'); // Will contain dropdown options
        
        // Hide data sheet from user
        dataSheet.state = 'hidden';

        const templateColumns = {
            colors: ['Tên màu'],
            types: ['Tên loại xe', 'Phân loại', 'Tiền tố khung', 'Tiền tố máy'],
            customers: ['Mã khách', 'Tên khách', 'Địa chỉ', 'Hình thức TT'],
            suppliers: ['Tên NCC', 'Địa chỉ', 'Ghi chú', 'Hình thức TT'],
            purchases: ['Số máy', 'Số khung', 'Loại xe', 'Màu sắc', 'Giá nhập', 'Tên NCC', 'Tên kho', 'Ngày nhập'],
            retail_sales: ['Ngày bán', 'Số máy', 'Tên khách', 'Số điện thoại', 'Địa chỉ', 'Giá bán', 'Tiền khách trả', 'Tên kho', 'Phát sổ bảo hành'],
            wholesale_sales: ['Ngày bán', 'Số máy', 'Mã khách hàng', 'Giá bán lẻ', 'Đã trả', 'Tên kho'],
            part_master: ['Mã phụ tùng', 'Tên phụ tùng', 'Đơn vị tính', 'Giá nhập', 'Giá bán'],
            part_inventory: ['Mã phụ tùng', 'Số lượng tồn', 'Kho', 'Vị trí']
        };

        const headers = templateColumns[type] || [];
        mainSheet.addRow(headers);
        
        // Stylize headers
        const headerRow = mainSheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        headerRow.alignment = { horizontal: 'center' };

        // Auto height & width for header
        mainSheet.columns = headers.map(h => ({ header: h, key: h, width: 20 }));

        // POPULATE DROPDOWNS IF NECESSARY
        const types = await VehicleType.findAll({ attributes: ['name'] });
        const colors = await VehicleColor.findAll({ attributes: ['color_name'] });
        const suppliers = await Supplier.findAll({ attributes: ['name'] });
        const warehouses = await Warehouse.findAll({ attributes: ['warehouse_name'] });
        const customers = await WholesaleCustomer.findAll({ attributes: ['customer_code'] });
        const parts = await Part.findAll({ attributes: ['code'] });

        // Add options to Data sheet
        const typeValues = types.map(t => t.name);
        const colorValues = colors.map(c => c.color_name);
        const supplierValues = suppliers.map(s => s.name);
        const warehouseValues = warehouses.map(w => w.warehouse_name);
        const customerValues = customers.map(c => c.customer_code);
        const partValues = parts.map(p => p.code);

        // Range address helper
        const typeRange = `Data_Source!$A$1:$A$${Math.max(1, typeValues.length)}`;
        const colorRange = `Data_Source!$B$1:$B$${Math.max(1, colorValues.length)}`;
        const supplierRange = `Data_Source!$C$1:$C$${Math.max(1, supplierValues.length)}`;
        const warehouseRange = `Data_Source!$D$1:$D$${Math.max(1, warehouseValues.length)}`;
        const customerRange = `Data_Source!$E$1:$E$${Math.max(1, customerValues.length)}`;
        const partRange = `Data_Source!$F$1:$F$${Math.max(1, partValues.length)}`;

        typeValues.forEach((v, i) => dataSheet.getCell(i + 1, 1).value = v);
        colorValues.forEach((v, i) => dataSheet.getCell(i + 1, 2).value = v);
        supplierValues.forEach((v, i) => dataSheet.getCell(i + 1, 3).value = v);
        warehouseValues.forEach((v, i) => dataSheet.getCell(i + 1, 4).value = v);
        customerValues.forEach((v, i) => dataSheet.getCell(i + 1, 5).value = v);
        partValues.forEach((v, i) => dataSheet.getCell(i + 1, 6).value = v);

        // Validation mapping per sheet type
        const validationConfigs = {
            purchases: { 'Loại xe': typeRange, 'Màu sắc': colorRange, 'Tên NCC': supplierRange, 'Tên kho': warehouseRange },
            retail_sales: { 'Tên kho': warehouseRange },
            wholesale_sales: { 'Tên kho': warehouseRange, 'Mã khách hàng': customerRange },
            part_inventory: { 'Mã phụ tùng': partRange, 'Kho': warehouseRange },
            types: { 'Phân loại': '"Xe ga,Xe số,Xe mới"' } // Static inline list
        };

        const config = validationConfigs[type];
        if (config) {
            Object.keys(config).forEach(colName => {
                const colIdx = headers.indexOf(colName) + 1;
                if (colIdx > 0) {
                    const rangeOrList = config[colName];
                    const isRange = rangeOrList.includes('!');
                    for (let i = 2; i <= 500; i++) {
                        mainSheet.getCell(i, colIdx).dataValidation = {
                            type: 'list',
                            allowBlank: true,
                            formulae: [rangeOrList]
                        };
                    }
                }
            });
        }


        // Send file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Mau_Export_${type}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi tạo file mẫu: ' + error.message });
    }
};

module.exports = {
  importData,
  downloadTemplate
};
