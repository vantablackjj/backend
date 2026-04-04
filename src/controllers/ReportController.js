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
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const dayjs = require('dayjs');

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
                    price: sale.total_amount_vnd,
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
            sale_channel // 'RETAIL' or 'WHOLESALE'
        } = req.query;

        let where = {};
        
        let includes = [
            { model: VehicleType, attributes: ['name'] },
            { model: VehicleColor, attributes: ['color_name'] }
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
                    purchaseWhere.purchase_date = { [Op.between]: [from_date, to_date] };
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
                // This is tricky because it can be Retail or Wholesale
                // We'll use a manual check or a complex include
                // For simplicity, we filter vehicles where either Retail or Wholesale matches the date
                // But Sequelize includes are easier if we just fetch all and filter in JS if needed, 
                // OR use Op.or on the includes.
            } else {
                // IMPORT_DATE_IMPORTER criteria but for SOLD vehicles
                let purchaseWhere = {};
                if (from_date && to_date) purchaseWhere.purchase_date = { [Op.between]: [from_date, to_date] };
                if (created_by) purchaseWhere.created_by = created_by;
                purchaseInclude.where = purchaseWhere;
                purchaseInclude.required = true;
            }
        }

        const vehicles = await Vehicle.findAll({
            where,
            include: includes,
            order: (sale_channel === 'RETAIL' || sale_channel === 'WHOLESALE') 
                ? [['createdAt', 'DESC']] 
                : [[Purchase, 'purchase_date', 'DESC']]
        });

        // Post-process for "SALE_DATE" type if mode is SALE
        let filteredVehicles = vehicles;
        if (mode === 'SALE' && type === 'SALE_DATE' && from_date && to_date) {
            filteredVehicles = vehicles.filter(v => {
                const retailDate = v.RetailSale?.sale_date;
                const wholesaleDate = v.WholesaleSale?.sale_date;
                const dateToCheck = retailDate || wholesaleDate;
                if (!dateToCheck) return false;
                const d = new Date(dateToCheck);
                return d >= new Date(from_date) && d <= new Date(to_date);
            });
        }

        const results = filteredVehicles.map(v => {
            const saleDate = v.RetailSale?.sale_date || v.WholesaleSale?.sale_date;
            let channel = 'Chưa bán';
            if (v.RetailSale) channel = 'Bán Lẻ';
            else if (v.WholesaleSale) channel = 'Bán Sỉ (Lô)';

            return {
                id: v.id,
                engine_no: v.engine_no,
                chassis_no: v.chassis_no,
                type_name: v.VehicleType?.name,
                color_name: v.VehicleColor?.color_name,
                import_date: v.Purchase?.purchase_date,
                importer_name: v.Purchase?.creator?.full_name || 'N/A',
                supplier_name: v.Purchase?.Supplier?.name || 'N/A',
                purchase_price: v.price_vnd,
                sale_date: saleDate,
                sale_channel: channel,
                sale_price: v.RetailSale?.total_price || v.WholesaleSale?.total_amount_vnd, // Note: Wholesale price is for the whole lot, might need logic adjustment if per-vehicle
                customer_name: v.RetailSale?.customer_name || v.WholesaleSale?.WholesaleCustomer?.name || 'N/A',
                address: v.RetailSale?.address || v.WholesaleSale?.WholesaleCustomer?.address || 'N/A',
                guarantee: v.RetailSale?.guarantee || 'Không'
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

        // Áp dụng bộ lọc quyền hạn Source of Truth
        if (req.user.role !== 'ADMIN') {
            where.warehouse_id = req.user.warehouse_id;
        } else if (warehouse_id) {
            where.warehouse_id = warehouse_id;
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
                { model: Purchase, attributes: ['purchase_date'] }
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
            whereSale.sale_date = { [Op.between]: [from_date, to_date] };
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
                ...(from_date && to_date ? { payment_date: { [Op.between]: [from_date, to_date] } } : {})
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
            where.sale_date = { 
                [Op.between]: [
                    dayjs(from_date).startOf('day').toDate(), 
                    dayjs(to_date).endOf('day').toDate()
                ] 
            };
        }

        if (has_debt === 'true') {
            where[Op.and] = sequelize.literal('total_price > paid_amount');
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
                        { model: VehicleColor, attributes: ['color_name'] }
                    ]
                },
                { model: User, as: 'seller', attributes: ['full_name'] }
            ],
            order: [['sale_date', 'DESC']]
        });

        // Tính toán tổng hợp cho Footer (Tổng số xe, Doanh thu, Thực thu, Tổng nợ)
        const summary = {
            total_count: sales.length,
            total_revenue: sales.reduce((sum, s) => sum + Number(s.total_price || 0), 0),
            total_collected: sales.reduce((sum, s) => sum + Number(s.paid_amount || 0), 0),
            total_debt: sales.reduce((sum, s) => sum + (Number(s.total_price || 0) - Number(s.paid_amount || 0)), 0)
        };

        res.json({ sales, summary });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.getWarrantyReport = async (req, res) => {
    try {
        const { month, year, turn } = req.query; // turn: 1, 2, 3, 4
        
        // Xác định số tháng cộng thêm dựa trên lượt bảo hành 
        // Lần 1: 1 tháng, Lần 2: 6 tháng, Lần 3: 12 tháng, Lần 4: 18 tháng
        const turnIntervals = { '1': 1, '2': 6, '3': 12, '4': 18 };
        const monthsToAdd = turnIntervals[turn] || 1;

        // Tính ngày bắt đầu và kết thúc của tháng đích
        const targetMonthDate = dayjs(`${year}-${month}-01`);
        
        // Tìm xe đã bán cách đây X tháng so với tháng đích
        const saleMonthStart = targetMonthDate.subtract(monthsToAdd, 'month').startOf('month').toDate();
        const saleMonthEnd = targetMonthDate.subtract(monthsToAdd, 'month').endOf('month').toDate();

        let where = {
            sale_date: { [Op.between]: [saleMonthStart, saleMonthEnd] },
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

