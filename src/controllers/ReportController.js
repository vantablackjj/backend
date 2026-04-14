const Vehicle = require('../models/Vehicle');
const Purchase = require('../models/Purchase');
const Supplier = require('../models/Supplier');
const RetailSale = require('../models/RetailSale');
const WholesaleSale = require('../models/WholesaleSale');
const WholesaleCustomer = require('../models/WholesaleCustomer');
const TransferItem = require('../models/TransferItem');
const Transfer = require('../models/Transfer');
const Warehouse = require('../models/Warehouse');
const VehicleType = require('../models/VehicleType');
const VehicleColor = require('../models/VehicleColor');
const User = require('../models/User');
const WholesalePayment = require('../models/WholesalePayment');
const RetailPayment = require('../models/RetailPayment');
const PurchasePayment = require('../models/PurchasePayment');
const TransferPayment = require('../models/TransferPayment');
const Expense = require('../models/Expense');
const Part = require('../models/Part');
const PartInventory = require('../models/PartInventory');
const PartPurchase = require('../models/PartPurchase');
const PartPurchaseItem = require('../models/PartPurchaseItem');
const PartSale = require('../models/PartSale');
const PartSaleItem = require('../models/PartSaleItem');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Ho_Chi_Minh');

exports.getVehicleLifecycle = async (req, res) => {
    try {
        const { engine_no, chassis_no } = req.query;
        if (!engine_no && !chassis_no) {
            return res.status(400).json({ message: 'Vui lòng nhập Số máy hoặc Số khung để tra cứu!' });
        }

        let where = {};
        if (engine_no) where.engine_no = engine_no;
        if (chassis_no) where.chassis_no = chassis_no;

        // 1. Tìm thông tin cơ bản của xe
        const vehicle = await Vehicle.findOne({
            where,
            include: [
                { model: VehicleType, attributes: ['name'] },
                { model: VehicleColor, attributes: ['color_name'] },
                { model: Warehouse, attributes: ['warehouse_name'] }
            ]
        });

        if (!vehicle) {
            return res.status(404).json({ message: 'Không tìm thấy thông tin xe này trong hệ thống!' });
        }

        const lifecycle = [];

        // 2. Lấy thông tin Nhập hàng (Sinh ra)
        if (vehicle.purchase_id) {
            const purchase = await Purchase.findByPk(vehicle.purchase_id, {
                include: [{ model: Supplier, attributes: ['name'] }]
            });
            if (purchase) {
                lifecycle.push({
                    id: 'origin',
                    date: purchase.purchase_date,
                    type: 'PURCHASE',
                    title: 'NHẬP KHO GỐC',
                    message: `Xe được nhập từ chủ hàng: ${purchase.Supplier?.name || 'N/A'}`,
                    warehouse: (await Warehouse.findByPk(purchase.warehouse_id))?.warehouse_name,
                    price: vehicle.price_vnd,
                    notes: purchase.notes
                });
            }
        }

        // 3. Lấy thông tin Chuyển kho (Di chuyển)
        const transferItems = await TransferItem.findAll({
            where: { vehicle_id: vehicle.id },
            include: [{ 
                model: Transfer, 
                include: [
                    { model: Warehouse, as: 'fromWarehouse', attributes: ['warehouse_name'] },
                    { model: Warehouse, as: 'toWarehouse', attributes: ['warehouse_name'] }
                ] 
            }]
        });

        for (const item of transferItems) {
            if (item.Transfer) {
                lifecycle.push({
                    id: `transfer-${item.id}`,
                    date: item.Transfer.createdAt,
                    type: 'TRANSFER',
                    title: 'ĐIỀU CHUYỂN KHO',
                    message: `Di chuyển từ [${item.Transfer.fromWarehouse?.warehouse_name}] sang [${item.Transfer.toWarehouse?.warehouse_name}]`,
                    status: item.Transfer.status,
                    notes: item.Transfer.notes
                });
            }
        }

        // 4. Lấy thông tin Bán lẻ (Kết thúc lẻ)
        if (vehicle.retail_sale_id) {
            const sale = await RetailSale.findByPk(vehicle.retail_sale_id);
            if (sale) {
                lifecycle.push({
                    id: 'sale-retail',
                    date: sale.sale_date,
                    type: 'SALE_RETAIL',
                    title: 'BÁN LẺ THÀNH CÔNG',
                    message: `Bán cho khách hàng: ${sale.customer_name}`,
                    price: sale.total_price,
                    notes: sale.notes,
                    guarantee: sale.guarantee
                });
            }
        }

        // 5. Lấy thông tin Bán buôn (Kết thúc buôn)
        if (vehicle.wholesale_sale_id) {
            const sale = await WholesaleSale.findByPk(vehicle.wholesale_sale_id, {
                include: [{ model: WholesaleCustomer, attributes: ['name'] }]
            });
            if (sale) {
                lifecycle.push({
                    id: 'sale-wholesale',
                    date: sale.sale_date,
                    type: 'SALE_WHOLESALE',
                    title: 'XUẤT BÁN SỈ',
                    message: `Xuất lô hàng cho đối tác: ${sale.WholesaleCustomer?.name || 'N/A'}`,
                    price: vehicle.wholesale_price_vnd || sale.total_amount_vnd,
                    notes: sale.notes
                });
            }
        }

        // Sắp xếp theo ngày tháng
        lifecycle.sort((a, b) => new Date(a.date) - new Date(b.date));

        res.json({
            vehicle,
            timeline: lifecycle
        });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.getVehicleLookup = async (req, res) => {
    try {
        const { 
            mode, // 'IMPORT' or 'SALE'
            type, // 'ENGINE_CHASSIS' or 'DATE_IMPORTER' or 'SALE_DATE'
            from_date, 
            to_date, 
            created_by,
            engine_no,
            chassis_no,
            sale_channel, // 'RETAIL' or 'WHOLESALE'
            supplier_id,
            status // 'In Stock', 'Sold', etc.
        } = req.query;

        let where = {};
        if (status) where.status = status;
        
        let includes = [
            { model: VehicleType, attributes: ['name'] },
            { model: VehicleColor, attributes: ['color_name'] },
            { model: Warehouse, attributes: ['warehouse_name'] }
        ];

        let purchaseInclude = { 
            model: Purchase, 
            include: [
                { model: User, as: 'creator', attributes: ['full_name'] },
                { model: Supplier, attributes: ['name'] }
            ] 
        };
        let retailInclude = { model: RetailSale, include: [{ model: User, as: 'creator', attributes: ['full_name'] }] };
        let wholesaleInclude = { model: WholesaleSale, include: [
            { model: WholesaleCustomer, attributes: ['name', 'address'] },
            { model: User, as: 'creator', attributes: ['full_name'] }
        ] };

        // QUẢN LÝ QUYỀN TRUY CẬP DỮ LIỆU
        if (req.user.role !== 'ADMIN') {
            where.warehouse_id = req.user.warehouse_id;
        } else if (req.query.warehouse_id) {
            where.warehouse_id = req.query.warehouse_id;
        }


        // TÁCH BIỆT BÁO CÁO THEO KÊNH (RETAIL vs WHOLESALE)
        if (sale_channel === 'RETAIL') {
           where.retail_sale_id = { [Op.ne]: null };
           retailInclude.required = true; // Chỉ lấy xe đã bán lẻ
           includes.push(retailInclude);
           includes.push(purchaseInclude);
        } else if (sale_channel === 'WHOLESALE') {
           where.wholesale_sale_id = { [Op.ne]: null };
           wholesaleInclude.required = true; // Chỉ lấy xe đã bán buôn
           includes.push(wholesaleInclude);
           includes.push(purchaseInclude);
        } else {
           // Tra cứu chung (LifeCycle / Global Search)
           includes.push(purchaseInclude, retailInclude, wholesaleInclude);
        }

        // Search logic based on mode and type from legacy UI
        if (mode === 'IMPORT') {
            if (type === 'ENGINE_CHASSIS') {
                if (engine_no) where.engine_no = { [Op.iLike]: `%${engine_no}%` };
                if (chassis_no) where.chassis_no = { [Op.iLike]: `%${chassis_no}%` };
            } else {
                // By Date and Importer
                let purchaseWhere = {};
                if (from_date && to_date) {
                    const endFull = to_date + ' 23:59:59';
                    if (mode === 'IMPORT' && type === 'DATE_IMPORTER') {
                        // Ngày nhập hàng nằm ở bảng Purchase (purchase_date), sẽ lọc kèm ở dưới
                    } else if (mode === 'SALE' && type === 'SALE_DATE') {
                        // Sẽ lọc ở bên dưới khi xử lý filteredVehicles
                    }
                    purchaseWhere.purchase_date = { [Op.between]: [from_date, endFull] };
                }
                if (created_by) {
                    purchaseWhere.created_by = created_by;
                }
                purchaseInclude.where = purchaseWhere;
                purchaseInclude.required = true; // INNER JOIN to filter by purchase criteria
            }
        } else if (mode === 'SALE') {
            where.status = 'Sold';
            
            if (type === 'ENGINE_CHASSIS') {
                if (engine_no) where.engine_no = { [Op.iLike]: `%${engine_no}%` };
                if (chassis_no) where.chassis_no = { [Op.iLike]: `%${chassis_no}%` };
            } else if (type === 'SALE_DATE') {
                // Handled in JS filter below for simplicity with nested models
            } else if (req.query.customer_name) {
                // If searching by customer name specifically
            } else {
                // IMPORT_DATE_IMPORTER criteria but for SOLD vehicles
                let purchaseWhere = {};
                if (from_date && to_date) {
                    const endFull = to_date + ' 23:59:59';
                    purchaseWhere.purchase_date = { [Op.between]: [from_date, endFull] };
                }
                if (created_by) purchaseWhere.created_by = created_by;
                purchaseInclude.where = purchaseWhere;
                purchaseInclude.required = true;
            }
        }

        // ADD SUPPLIER FILTER
        if (supplier_id) {
            purchaseInclude.where = { ...purchaseInclude.where, supplier_id };
            purchaseInclude.required = true;
        }

        // ADD CUSTOMER NAME FILTER (RETAIL & WHOLESALE)
        const customer_name_param = req.query.customer_name || req.query['customer_name[]'];
        
        if (customer_name_param) {
            const names = Array.isArray(customer_name_param) ? customer_name_param : [customer_name_param];
            const cleanNames = names.filter(n => n && n.trim() !== '');

            if (cleanNames.length > 0) {
                const subOr = [];
                cleanNames.forEach(name => {
                    // Chỉ lọc ở bảng Bán lẻ nếu bảng này có trong danh sách include
                    if (includes.some(inc => inc.model === RetailSale)) {
                        subOr.push({ '$RetailSale.customer_name$': { [Op.iLike]: `%${name}%` } });
                    }
                    // Chỉ lọc ở bảng Bán buôn nếu bảng này có trong danh sách include
                    if (includes.some(inc => inc.model === WholesaleSale)) {
                        subOr.push({ '$WholesaleSale.WholesaleCustomer.name$': { [Op.iLike]: `%${name}%` } });
                    }
                });

                if (subOr.length > 0) {
                    where[Op.or] = subOr;
                    // Đảm bảo không bị mất xe do INNER JOIN
                    if (retailInclude) retailInclude.required = false;
                    if (wholesaleInclude) wholesaleInclude.required = false;
                }
            }
        }

        const vehicles = await Vehicle.findAll({
            where,
            include: includes,
            order: (sale_channel === 'RETAIL' || sale_channel === 'WHOLESALE') 
                ? [['createdAt', 'DESC']] 
                : [[Purchase, 'purchase_date', 'DESC']]
        });

        // HẬU KIỂM (Post-process) ĐỂ ĐẢM BẢO CHÍNH XÁC TUYỆT ĐỐI
        let filteredVehicles = vehicles;
        if (customer_name_param || (mode === 'SALE' && type === 'SALE_DATE' && from_date && to_date)) {
            const endFull = to_date + ' 23:59:59';
            const names = customer_name_param ? (Array.isArray(customer_name_param) ? customer_name_param : [customer_name_param]) : [];
            const cleanNamesForFilter = names.map(n => n.toLowerCase());

            filteredVehicles = vehicles.filter(v => {
                // 1. Phải khớp ngày bán nếu có lọc ngày
                if (mode === 'SALE' && type === 'SALE_DATE' && from_date && to_date) {
                    const retailDate = v.RetailSale?.sale_date;
                    const wholesaleDate = v.WholesaleSale?.sale_date;
                    const dateToCheck = retailDate || wholesaleDate;
                    if (!dateToCheck) return false;
                    const d = new Date(dateToCheck).getTime();
                    const start = new Date(from_date).getTime();
                    const end = new Date(endFull).getTime();
                    if (d < start || d > end) return false;
                }

                // 2. Nếu lọc theo khách hàng
                if (cleanNamesForFilter.length > 0) {
                    const rName = (v.RetailSale?.customer_name || '').toLowerCase();
                    const wName = (v.WholesaleSale?.WholesaleCustomer?.name || '').toLowerCase();
                    
                    const matches = cleanNamesForFilter.some(target => 
                        rName.includes(target) || wName.includes(target)
                    );
                    if (!matches) return false;
                }


                return true;
            });
        }

        const results = filteredVehicles.map(v => {
            const saleDate = v.RetailSale?.sale_date || v.WholesaleSale?.sale_date;
            let channel = 'Chưa bán';
            if (v.RetailSale) channel = 'Bán Lẻ';
            else if (v.WholesaleSale) channel = 'Bán Sỉ (Lô)';

            // LOGIC TÍNH GIÁ BÁN:
            // 1. Ưu tiên giá bán lẻ (RetailSale.total_price)
            // 2. Nếu không có (bán buôn), lấy giá bán buôn từng chiếc (wholesale_price_vnd)
            // 3. Nếu vẫn không có, lấy trung bình lô (total_amount_vnd / count)
            let salePrice = 0;
            if (v.RetailSale) {
                salePrice = v.RetailSale.total_price;
            } else if (v.WholesaleSale) {
                // SỬA LỖI: Lấy giá bán buôn của từng xe (wholesale_price_vnd)
                // Nếu chưa có (dữ liệu cũ), dùng trung bình lô (tổng / số lượng)
                const lotCount = v.WholesaleSale.Vehicles?.length || 1; // Tuy nhiên includes không có Vehicles ở đây
                // Vì không include Vehicles, ta có thể dùng wholesale_price_vnd làm chính
                // Nếu không có, tạm thời dùng total_amount_vnd (nhưng đây là lỗi gốc) 
                // Tốt nhất là Number(v.wholesale_price_vnd) || 0
                salePrice = Number(v.wholesale_price_vnd || 0);
            }

            return {
                id: v.id,
                engine_no: v.engine_no,
                chassis_no: v.chassis_no,
                type_name: v.VehicleType?.name,
                color_name: v.VehicleColor?.color_name,
                warehouse_name: v.Warehouse?.warehouse_name || 'N/A', // ADDED
                import_date: v.Purchase?.purchase_date,
                importer_name: v.Purchase?.creator?.full_name || 'N/A',
                supplier_name: v.Purchase?.Supplier?.name || 'N/A',
                purchase_price: v.price_vnd,
                sale_date: saleDate,
                sale_channel: channel,
                sale_price: salePrice,
                customer_name: v.RetailSale?.customer_name || v.WholesaleSale?.WholesaleCustomer?.name || 'N/A',
                address: v.RetailSale?.address || v.WholesaleSale?.WholesaleCustomer?.address || 'N/A',
                wholesale_sale_id: v.wholesale_sale_id,
                purchase_id: v.purchase_id,
                guarantee: v.RetailSale?.guarantee || 'Không',
                payment_method: v.RetailSale?.payment_method,
                bank_name: v.RetailSale?.bank_name,
                contract_number: v.RetailSale?.contract_number,
                loan_amount: v.RetailSale?.loan_amount
            };
        });

        res.json(results);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.getVehicleSuggestions = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || query.length < 2) return res.json([]);

        const vehicles = await Vehicle.findAll({
            where: {
                [Op.or]: [
                    { engine_no: { [Op.iLike]: `%${query}%` } },
                    { chassis_no: { [Op.iLike]: `%${query}%` } }
                ]
            },
            limit: 10,
            attributes: ['id', 'engine_no', 'chassis_no']
        });

        res.json(vehicles);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.updateVehicleData = async (req, res) => {
    try {
        const { id } = req.params;
        const { engine_no, chassis_no, purchase_price, sale_price, import_date, sale_date } = req.body;

        // Check if user is ADMIN (Extra safety, already checked by middleware)
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Bạn không có quyền sửa dữ liệu đã chốt!' });
        }

        const vehicle = await Vehicle.findByPk(id, {
            include: ['Purchase', 'RetailSale', 'WholesaleSale']
        });

        if (!vehicle) return res.status(404).json({ message: 'Không tìm thấy xe!' });

        // Update core vehicle info
        await vehicle.update({ engine_no, chassis_no, price_vnd: purchase_price });

        // Update dates in linked tables if they exist
        if (vehicle.Purchase && import_date) {
            await vehicle.Purchase.update({ purchase_date: import_date });
        }

        if (vehicle.RetailSale) {
            await vehicle.RetailSale.update({ 
                sale_date: sale_date || vehicle.RetailSale.sale_date,
                total_price: sale_price || vehicle.RetailSale.total_price 
            });
        }

        if (vehicle.WholesaleSale) {
            await vehicle.WholesaleSale.update({ 
                sale_date: sale_date || vehicle.WholesaleSale.sale_date,
                total_amount_vnd: sale_price || vehicle.WholesaleSale.total_amount_vnd
            });
        }

        res.json({ message: 'Cập nhật dữ liệu thành công!' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.getInventoryReport = async (req, res) => {
    try {
        const { warehouse_id, type_id, color_id } = req.query;
        let where = { status: { [Op.ne]: 'Sold' } }; // Lấy tồn kho (bao gồm cả xe đang chuyển)

        // Áp dụng bộ lọc (Mặc định là kho của mình nếu là nhân viên và không chọn kho khác)
        const targetWH = warehouse_id || (req.user.role !== 'ADMIN' ? req.user.warehouse_id : null);
        if (targetWH) {
            where.warehouse_id = targetWH;
        }

        if (type_id) where.type_id = type_id;
        if (color_id) where.color_id = color_id;

        // 1. Lấy danh sách xe
        const vehicles = await Vehicle.findAll({
            where,
            include: [
                { model: VehicleType, attributes: ['name'] },
                { model: VehicleColor, attributes: ['color_name'] },
                { model: Warehouse, attributes: ['warehouse_name'] },
                { 
                    model: Purchase, 
                    attributes: ['purchase_date'],
                    include: [{ model: Supplier, attributes: ['name'] }]
                }
            ],
            order: [[Warehouse, 'warehouse_name', 'ASC'], ['createdAt', 'DESC']]
        });

        // 2. Tính tổng hợp (Aggregates)
        const summary = {
            total_count: vehicles.length,
            total_value: vehicles.reduce((sum, v) => sum + (Number(v.price_vnd) || 0), 0),
            available_count: vehicles.filter(v => v.status === 'In Stock').length,
            transferring_count: vehicles.filter(v => v.status === 'Transferring').length
        };

        res.json({ summary, vehicles });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.getGeneralReport = async (req, res) => {
    res.json({ message: 'General report feature coming soon' });
};

exports.getWholesaleAudit = async (req, res) => {
    try {
        const { customer_id, from_date, to_date } = req.query;
        if (!customer_id) return res.status(400).json({ message: 'Vui lòng chọn khách hàng!' });

        let whereSale = { customer_id };
        if (from_date && to_date) {
            whereSale[Op.and] = [
                sequelize.where(
                    sequelize.fn('date', sequelize.fn('timezone', 'Asia/Ho_Chi_Minh', sequelize.col('sale_date'))),
                    { [Op.between]: [from_date, to_date] }
                )
            ];
        }

        // 1. Lấy tất cả các xe đã bán cho khách này
        const vehicles = await Vehicle.findAll({
            where: {
                status: 'Sold',
                wholesale_sale_id: { [Op.ne]: null }
            },
            include: [
                { 
                    model: WholesaleSale, 
                    where: whereSale,
                    include: [{ model: User, as: 'creator', attributes: ['full_name'] }]
                },
                { 
                    model: Purchase, 
                    include: [
                        { model: User, as: 'creator', attributes: ['full_name'] },
                        { model: Supplier, attributes: ['name'] }
                    ] 
                },
                { model: VehicleType, attributes: ['name'] },
                { model: VehicleColor, attributes: ['color_name'] }
            ],
            order: [[WholesaleSale, 'sale_date', 'DESC']]
        });

        // 2. Lấy tất cả các khoản thanh toán của khách này
        const allSales = await WholesaleSale.findAll({
             where: { customer_id },
             attributes: ['id']
        });
        const saleIds = allSales.map(s => s.id);

        const payments = await WholesalePayment.findAll({
            where: { 
                wholesale_sale_id: { [Op.in]: saleIds },
                ...(from_date && to_date ? { 
                    [Op.and]: [
                        sequelize.where(
                            sequelize.fn('date', sequelize.fn('timezone', 'Asia/Ho_Chi_Minh', sequelize.col('payment_date'))),
                            { [Op.between]: [from_date, to_date] }
                        )
                    ]
                } : {})
            },
            order: [['payment_date', 'DESC']]
        });

        // 3. Tính toán tổng hợp (Summary)
        const totalSales = await WholesaleSale.findAll({ where: { customer_id } });
        const totalAmount = totalSales.reduce((sum, s) => sum + Number(s.total_amount_vnd || 0), 0);
        const totalPaid = totalSales.reduce((sum, s) => sum + Number(s.paid_amount_vnd || 0), 0);

        res.json({
            vehicles: vehicles.map(v => ({
                id: v.id,
                import_date: v.Purchase?.purchase_date,
                importer_name: v.Purchase?.creator?.full_name || 'N/A',
                sale_date: v.WholesaleSale?.sale_date,
                type_name: v.VehicleType?.name,
                engine_no: v.engine_no,
                chassis_no: v.chassis_no,
                color_name: v.VehicleColor?.color_name,
                wholesale_price_vnd: v.wholesale_price_vnd,
                sale_price_lot: v.WholesaleSale?.total_amount_vnd,
                lot_vehicles_count: vehicles.filter(x => x.wholesale_sale_id === v.wholesale_sale_id).length
            })),
            payments,
            summary: {
                total_amount: totalAmount,
                paid_amount: totalPaid,
                balance: totalAmount - totalPaid
            }
        });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.getRetailSalesReport = async (req, res) => {
    try {
        const { from_date, to_date, has_debt } = req.query;
        let where = {};
        
        if (from_date && to_date) {
            where[Op.and] = [
                sequelize.where(
                    sequelize.fn('date', sequelize.fn('timezone', 'Asia/Ho_Chi_Minh', sequelize.col('sale_date'))),
                    { [Op.between]: [from_date, to_date] }
                )
            ];
        }

        if (has_debt === 'true') {
            where[Op.and] = sequelize.literal('total_price - paid_amount - (CASE WHEN is_disbursed = true THEN loan_amount ELSE 0 END) > 0');
        }

        if (req.user.role !== 'ADMIN') {
            where.warehouse_id = req.user.warehouse_id;
        } else if (req.query.warehouse_id) {
            where.warehouse_id = req.query.warehouse_id;
        }


        const sales = await RetailSale.findAll({
            where,
            include: [
                {
                    model: Vehicle,
                    include: [
                        { model: VehicleType, attributes: ['name'] },
                        { model: VehicleColor, attributes: ['color_name'] },
                        { 
                            model: Purchase, 
                            attributes: ['purchase_date'],
                            include: [{ model: Supplier, attributes: ['name'] }]
                        }
                    ]
                },
                { model: User, as: 'seller', attributes: ['full_name'] }
            ],
            order: [['sale_date', 'DESC']]
        });

        // Tín toán tổng hợp cho Footer (Tổng số xe, Doanh thu, Thực thu, Tổng nợ)
        const summary = {
            total_count: sales.length,
            total_revenue: sales.reduce((sum, s) => sum + Number(s.total_price || 0), 0),
            total_collected: sales.reduce((sum, s) => sum + Number(s.paid_amount || 0) + (s.is_disbursed ? Number(s.loan_amount || 0) : 0), 0),
            total_debt: sales.reduce((sum, s) => sum + (Number(s.total_price || 0) - Number(s.paid_amount || 0) - (s.is_disbursed ? Number(s.loan_amount || 0) : 0)), 0),
            total_gifts: {}
        };

        // Đếm tổng số lượng quà tặng đã phát
        sales.forEach(s => {
            if (s.gifts && Array.isArray(s.gifts)) {
                s.gifts.forEach(giftName => {
                    summary.total_gifts[giftName] = (summary.total_gifts[giftName] || 0) + 1;
                });
            }
        });

        res.json({ sales, summary });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.getWarrantyReport = async (req, res) => {
    try {
        const { month, year, turn } = req.query; // turn: 1, 2, 3, 4
        
        // Xác định số tháng cộng thêm dựa trên lượt bảo hành (Lần 1: 1th, Lần 2-7: 6th, 12th, 18th, 24th, 30th, 36th)
        const turnIntervals = { 
            '1': 1, 
            '2': 6, 
            '3': 12, 
            '4': 18, 
            '5': 24, 
            '6': 30, 
            '7': 36 
        };
        const monthsToAdd = turnIntervals[turn] || 1;

        // Tính ngày bắt đầu và kết thúc của tháng đích
        const targetMonthDate = dayjs.tz(`${year}-${month}-01`);
        
        // Tìm xe đã bán cách đây X tháng so với tháng đích
        const saleMonthStartStr = targetMonthDate.subtract(monthsToAdd, 'month').startOf('month').format('YYYY-MM-DD');
        const saleMonthEndStr = targetMonthDate.subtract(monthsToAdd, 'month').endOf('month').format('YYYY-MM-DD');

        let where = {
            [Op.and]: [
                sequelize.where(
                    sequelize.fn('date', sequelize.fn('timezone', 'Asia/Ho_Chi_Minh', sequelize.col('sale_date'))),
                    { [Op.between]: [saleMonthStartStr, saleMonthEndStr] }
                )
            ],
            guarantee: 'Có'
        };

        if (req.user.role !== 'ADMIN') {
            where.warehouse_id = req.user.warehouse_id;
        } else if (req.query.warehouse_id) {
            where.warehouse_id = req.query.warehouse_id;
        }


        const sales = await RetailSale.findAll({
            where,
            include: [
                {
                    model: Vehicle,
                    include: [
                        { model: VehicleType, attributes: ['name'] },
                        { model: VehicleColor, attributes: ['color_name'] }
                    ]
                }
            ],
            order: [['sale_date', 'ASC']]
        });

        res.json(sales);

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};


exports.getDailyReport = async (req, res) => {
    try {
        const { date, warehouse_id } = req.query;
        // date string from frontend is YYYY-MM-DD
        const dateStr = date || dayjs.tz().format('YYYY-MM-DD');

        let whereShared = {
            [Op.and]: [
                sequelize.where(sequelize.fn('date', sequelize.col('createdAt')), targetDate.format('YYYY-MM-DD'))
            ]
        };

        // Using SQL side timezone conversion for daily report consistency
        const tz = 'Asia/Ho_Chi_Minh';
        let retailDateWhere = sequelize.where(sequelize.fn('date', sequelize.fn('timezone', tz, sequelize.col('sale_date'))), dateStr);
        let wholesaleDateWhere = sequelize.where(sequelize.fn('date', sequelize.fn('timezone', tz, sequelize.col('sale_date'))), dateStr);
        let purchaseDateWhere = sequelize.where(sequelize.fn('date', sequelize.fn('timezone', tz, sequelize.col('purchase_date'))), dateStr);
        
        let retailPaymentWhere = sequelize.where(sequelize.fn('date', sequelize.fn('timezone', tz, sequelize.col('payment_date'))), dateStr);
        let wholesalePaymentWhere = sequelize.where(sequelize.fn('date', sequelize.fn('timezone', tz, sequelize.col('payment_date'))), dateStr);
        let purchasePaymentWhere = sequelize.where(sequelize.fn('date', sequelize.fn('timezone', tz, sequelize.col('payment_date'))), dateStr);
        let transferPaymentWhere = sequelize.where(sequelize.fn('date', sequelize.fn('timezone', tz, sequelize.col('payment_date'))), dateStr);
        let expenseWhere = sequelize.where(sequelize.fn('date', sequelize.fn('timezone', tz, sequelize.col('createdAt'))), dateStr);

        // Filter by warehouse if provided or if user is limited
        const targetWH = warehouse_id || (req.user.role !== 'ADMIN' ? req.user.warehouse_id : null);
        if (targetWH) {
            retailDateWhere = { [Op.and]: [retailDateWhere, { warehouse_id: targetWH }] };
            wholesaleDateWhere = { [Op.and]: [wholesaleDateWhere, { warehouse_id: targetWH }] };
            purchaseDateWhere = { [Op.and]: [purchaseDateWhere, { warehouse_id: targetWH }] };
            expenseWhere = { [Op.and]: [expenseWhere, { warehouse_id: targetWH }] };
        }

        // 1. RETAIL SALES SUMMARY
        const retailSales = await RetailSale.findAll({ 
            where: retailDateWhere,
            include: [{ model: Vehicle, attributes: ['price_vnd'] }] 
        });
        const retailRevenue = retailSales.reduce((sum, s) => sum + Number(s.total_price || 0), 0);
        const retailCount = retailSales.length;

        // 2. WHOLESALE SALES SUMMARY
        const wholesaleSales = await WholesaleSale.findAll({ where: wholesaleDateWhere });
        const wholesaleRevenue = wholesaleSales.reduce((sum, s) => sum + Number(s.total_amount_vnd || 0), 0);
        const wholesaleCount = await Vehicle.count({ where: { wholesale_sale_id: { [Op.in]: wholesaleSales.map(s => s.id) } } });

        // 3. COLLECTIONS (Cash In)
        // From today's retail sales instant payments
        const retailInstantPaid = retailSales.reduce((sum, s) => sum + Number(s.paid_amount || 0), 0);
        // From previous/other retail payments today
        const retailInstallmentPaid = await RetailPayment.sum('amount', { where: retailPaymentWhere });

        // From today's wholesale instant payments
        const wholesaleInstantPaid = wholesaleSales.reduce((sum, s) => sum + Number(s.paid_amount_vnd || 0), 0);
        // From previous/other wholesale payments today
        const wholesaleInstallmentPaid = await WholesalePayment.sum('amount_paid_vnd', { where: wholesalePaymentWhere });

        const collections = Number(retailInstantPaid || 0) + Number(retailInstallmentPaid || 0) + 
                          Number(wholesaleInstantPaid || 0) + Number(wholesaleInstallmentPaid || 0);

        // 4. PURCHASES (Outflow)
        const purchases = await Purchase.findAll({ where: purchaseDateWhere });
        const purchaseTotal = purchases.reduce((sum, s) => sum + Number(s.total_amount_vnd || 0), 0);
        const purchaseInstantPaid = purchases.reduce((sum, s) => sum + Number(s.paid_amount_vnd || 0), 0);
        const purchaseInstallmentPaid = await PurchasePayment.sum('amount_paid_vnd', { where: purchasePaymentWhere });
        
        const outflow = Number(purchaseInstantPaid || 0) + Number(purchaseInstallmentPaid || 0);

        // 5. EXPENSES
        const expensesTotal = await Expense.sum('amount', { where: expenseWhere });

        res.json({
            date: targetDate.format('YYYY-MM-DD'),
            metrics: {
                totalRevenue: retailRevenue + wholesaleRevenue,
                retailRevenue,
                wholesaleRevenue,
                retailCount,
                wholesaleCount,
                giftDistribution: retailSales.reduce((acc, s) => {
                    if (s.gifts && Array.isArray(s.gifts)) {
                        s.gifts.forEach(g => acc[g] = (acc[g] || 0) + 1);
                    }
                    return acc;
                }, {}),
                totalIncome: collections,
                totalOutcome: outflow + (expensesTotal || 0),
                collections,
                purchasesPaid: outflow,
                expenses: expensesTotal || 0,
                netCashFlow: collections - (outflow + (expensesTotal || 0))
            }
        });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.getPartInventoryReport = async (req, res) => {
    try {
        const { warehouse_id, query } = req.query;
        let where = {};
        let partWhere = {};

        if (query) {
            partWhere[Op.or] = [
                { code: { [Op.iLike]: `%${query}%` } },
                { name: { [Op.iLike]: `%${query}%` } }
            ];
        }

        const targetWH = warehouse_id || (req.user.role !== 'ADMIN' ? req.user.warehouse_id : null);
        if (targetWH) {
            where.warehouse_id = targetWH;
        }

        // 1. Fetch all relevant parts
        const parts = await Part.findAll({
            where: partWhere,
            include: [{ model: Part, as: 'LinkedPart', attributes: ['id', 'code', 'unit'] }],
            order: [['code', 'ASC']]
        });

        // 2. Fetch all raw inventory records for the target warehouse
        const rawInventory = await PartInventory.findAll({
            where,
            include: [{ model: Warehouse, attributes: ['warehouse_name'] }]
        });

        // 3. Map inventory for quick lookup
        const inventoryMap = new Map();
        rawInventory.forEach(inv => {
            inventoryMap.set(`${inv.part_id}_${inv.warehouse_id}`, inv);
        });

        // 4. Build report by calculating balances for each part
        const reportInventory = [];
        const warehouses_to_process = warehouse_id ? [warehouse_id] : Array.from(new Set(rawInventory.map(i => i.warehouse_id)));

        for (const warehouseId of warehouses_to_process) {
            const warehouseName = rawInventory.find(i => i.warehouse_id === warehouseId)?.Warehouse?.warehouse_name || 'Kho mặc định';
            
            for (const part of parts) {
                // Determine which part ID holds the actual stock
                const actualStockPartId = part.linked_part_id || part.id;
                const conversion = part.default_conversion_rate || 1;
                
                const stockRecord = inventoryMap.get(`${actualStockPartId}_${warehouseId}`);
                if (!stockRecord && !warehouse_id) continue; // Skip if no stock and looking at global

                // Calculate virtual quantity in the current part's unit
                const rawQty = Number(stockRecord?.quantity || 0);
                const displayQty = part.linked_part_id ? (rawQty / conversion) : rawQty;

                if (displayQty > 0 || warehouse_id) { // Show all if filtered by warehouse, else only those with stock
                    reportInventory.push({
                        id: `${part.id}_${warehouseId}`,
                        part_id: part.id,
                        warehouse_id: warehouseId,
                        quantity: displayQty,
                        location: stockRecord?.location || '',
                        Part: part,
                        Warehouse: { warehouse_name: warehouseName }
                    });
                }
            }
        }

        const summary = {
            total_items: reportInventory.length,
            total_quantity: reportInventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
            total_value: reportInventory.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.Part?.purchase_price || 0)), 0)
        };

        res.json({ inventory: reportInventory, summary });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.getPartPurchasesReport = async (req, res) => {
    try {
        const { from_date, to_date, supplier_id, warehouse_id, query } = req.query;
        let where = {};
        
        if (from_date && to_date) {
            where.purchase_date = { [Op.between]: [dayjs(from_date).startOf('day').toDate(), dayjs(to_date).endOf('day').toDate()] };
        }

        if (supplier_id) where.supplier_id = supplier_id;

        const targetWH = warehouse_id || (req.user.role !== 'ADMIN' ? req.user.warehouse_id : null);
        if (targetWH) where.warehouse_id = targetWH;

        let itemWhere = {};
        if (query) {
            // Find purchases containing specific part code/name
            const partIds = (await Part.findAll({
                where: {
                    [Op.or]: [
                        { code: { [Op.iLike]: `%${query}%` } },
                        { name: { [Op.iLike]: `%${query}%` } }
                    ]
                },
                attributes: ['id']
            })).map(p => p.id);
            itemWhere.part_id = { [Op.in]: partIds };
        }

        const purchases = await PartPurchase.findAll({
            where,
            include: [
                { model: Supplier, attributes: ['name'] },
                { model: Warehouse, attributes: ['warehouse_name'] },
                { model: User, as: 'creator', attributes: ['full_name'] },
                { 
                    model: PartPurchaseItem, 
                    where: Object.keys(itemWhere).length > 0 ? itemWhere : undefined,
                    required: Object.keys(itemWhere).length > 0,
                    include: [{ model: Part, attributes: ['code', 'name', 'unit'] }] 
                }
            ],
            order: [['purchase_date', 'DESC'], ['createdAt', 'DESC']]
        });

        res.json(purchases);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.getPartSalesReport = async (req, res) => {
    try {
        const { from_date, to_date, warehouse_id, query } = req.query;
        let where = {};

        if (from_date && to_date) {
            where.sale_date = { [Op.between]: [dayjs(from_date).startOf('day').toDate(), dayjs(to_date).endOf('day').toDate()] };
        }

        const targetWH = warehouse_id || (req.user.role !== 'ADMIN' ? req.user.warehouse_id : null);
        if (targetWH) where.warehouse_id = targetWH;

        let itemWhere = {};
        if (query) {
            const partIds = (await Part.findAll({
                where: {
                    [Op.or]: [
                        { code: { [Op.iLike]: `%${query}%` } },
                        { name: { [Op.iLike]: `%${query}%` } }
                    ]
                },
                attributes: ['id']
            })).map(p => p.id);
            itemWhere.part_id = { [Op.in]: partIds };
        }

        const sales = await PartSale.findAll({
            where,
            include: [
                { model: Warehouse, attributes: ['warehouse_name'] },
                { model: User, as: 'seller', attributes: ['full_name'] },
                { 
                    model: PartSaleItem, 
                    where: Object.keys(itemWhere).length > 0 ? itemWhere : undefined,
                    required: Object.keys(itemWhere).length > 0,
                    include: [{ model: Part, attributes: ['code', 'name', 'unit'] }] 
                }
            ],
            order: [['sale_date', 'DESC'], ['createdAt', 'DESC']]
        });

        res.json(sales);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};
