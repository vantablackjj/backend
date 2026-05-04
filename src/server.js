const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const sequelize = require('./config/database');
const http = require('http');
const { Server } = require("socket.io");



// Import Models
const User = require('./models/User');
const Warehouse = require('./models/Warehouse');
const VehicleColor = require('./models/VehicleColor');
const VehicleType = require('./models/VehicleType');
const Supplier = require('./models/Supplier');
const WholesaleCustomer = require('./models/WholesaleCustomer');
const Vehicle = require('./models/Vehicle');
const RetailSale = require('./models/RetailSale');
const Expense = require('./models/Expense');
const Purchase = require('./models/Purchase');
const WholesaleSale = require('./models/WholesaleSale');
const WholesalePayment = require('./models/WholesalePayment');
const PurchasePayment = require('./models/PurchasePayment');
const Transfer = require('./models/Transfer');
const TransferItem = require('./models/TransferItem');
const TransferLog = require('./models/TransferLog');
const Notification = require('./models/Notification');
const TransferPayment = require('./models/TransferPayment');
const RetailPayment = require('./models/RetailPayment');
const Income = require('./models/Income');


// NEW Spare Parts & Maintenance Models
const Part = require('./models/Part');
const PartInventory = require('./models/PartInventory');
const PartPurchase = require('./models/PartPurchase');
const PartPurchaseItem = require('./models/PartPurchaseItem');
const PartSale = require('./models/PartSale');
const PartSaleItem = require('./models/PartSaleItem');
const MaintenanceOrder = require('./models/MaintenanceOrder');
const MaintenanceItem = require('./models/MaintenanceItem');
const Mechanic = require('./models/Mechanic');
const LiftTable = require('./models/LiftTable');
const MaintenanceRule = require('./models/MaintenanceRule');

// Gift Management Models
const Gift = require('./models/Gift');
const GiftInventory = require('./models/GiftInventory');
const GiftTransaction = require('./models/GiftTransaction');

// Associations
// 1. Vehicle
Vehicle.belongsTo(VehicleType, { foreignKey: 'type_id' });
Vehicle.belongsTo(VehicleColor, { foreignKey: 'color_id' });
Vehicle.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Vehicle.belongsTo(Purchase, { foreignKey: 'purchase_id' });

// 2. Purchase
Purchase.belongsTo(Supplier, { foreignKey: 'supplier_id' });
Purchase.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Purchase.hasMany(Vehicle, { foreignKey: 'purchase_id' });

// 3. WholesaleSale
WholesaleSale.belongsTo(WholesaleCustomer, { foreignKey: 'customer_id' });
WholesaleSale.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });

// 4. Transfer
Transfer.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
Transfer.belongsTo(Warehouse, { as: 'fromWarehouse', foreignKey: 'from_warehouse_id' });
Transfer.belongsTo(Warehouse, { as: 'toWarehouse', foreignKey: 'to_warehouse_id' });
Transfer.hasMany(TransferItem, { foreignKey: 'transfer_id' });
TransferItem.belongsTo(Transfer, { foreignKey: 'transfer_id' });
TransferItem.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });
Transfer.hasMany(TransferPayment, { foreignKey: 'transfer_id' });
TransferPayment.belongsTo(Transfer, { foreignKey: 'transfer_id' });
TransferPayment.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });

// 5. RetailSale & Associations for Search
RetailSale.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
RetailSale.belongsTo(User, { as: 'seller', foreignKey: 'seller_id' });
RetailSale.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
RetailSale.hasOne(Vehicle, { foreignKey: 'retail_sale_id' });
Vehicle.belongsTo(RetailSale, { foreignKey: 'retail_sale_id' });
RetailSale.hasMany(RetailPayment, { foreignKey: 'retail_sale_id', as: 'payments' });
RetailPayment.belongsTo(RetailSale, { foreignKey: 'retail_sale_id' });
RetailPayment.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });

WholesaleSale.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
WholesaleSale.hasMany(Vehicle, { foreignKey: 'wholesale_sale_id' });
Vehicle.belongsTo(WholesaleSale, { foreignKey: 'wholesale_sale_id' });

// 6. Notification
Notification.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
Notification.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Warehouse.hasMany(Notification, { foreignKey: 'warehouse_id' });

// 7. Expenses
Expense.belongsTo(Vehicle, { as: 'related_vehicle', foreignKey: 'vehicle_id' });
Vehicle.hasMany(Expense, { as: 'expenses', foreignKey: 'vehicle_id' });
Expense.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Warehouse.hasMany(Expense, { foreignKey: 'warehouse_id' });

// 7b. Incomes
Income.belongsTo(Vehicle, { as: 'related_vehicle', foreignKey: 'vehicle_id' });
Vehicle.hasMany(Income, { as: 'incomes', foreignKey: 'vehicle_id' });
Income.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Warehouse.hasMany(Income, { foreignKey: 'warehouse_id' });


Purchase.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
Purchase.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });

// 8. Spare Parts & Maintenance Associations
PartInventory.belongsTo(Part, { foreignKey: 'part_id' });
Part.hasMany(PartInventory, { foreignKey: 'part_id' });
PartInventory.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });

PartPurchase.belongsTo(Supplier, { foreignKey: 'supplier_id' });
PartPurchase.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
PartPurchase.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
PartPurchase.hasMany(PartPurchaseItem, { foreignKey: 'purchase_id' });
PartPurchaseItem.belongsTo(PartPurchase, { foreignKey: 'purchase_id' });
PartPurchaseItem.belongsTo(Part, { foreignKey: 'part_id' });

PartSale.belongsTo(WholesaleCustomer, { foreignKey: 'customer_id' });
PartSale.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
PartSale.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
PartSale.hasMany(PartSaleItem, { foreignKey: 'sale_id' });
PartSaleItem.belongsTo(PartSale, { foreignKey: 'sale_id' });
PartSaleItem.belongsTo(Part, { foreignKey: 'part_id' });

MaintenanceOrder.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });
Vehicle.hasMany(MaintenanceOrder, { foreignKey: 'vehicle_id' });
MaintenanceOrder.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
MaintenanceOrder.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
MaintenanceOrder.belongsTo(Mechanic, { as: 'mechanic1', foreignKey: 'mechanic_1_id' });
MaintenanceOrder.belongsTo(Mechanic, { as: 'mechanic2', foreignKey: 'mechanic_2_id' });
MaintenanceOrder.hasMany(MaintenanceItem, { foreignKey: 'maintenance_order_id' });
MaintenanceItem.belongsTo(MaintenanceOrder, { foreignKey: 'maintenance_order_id' });
MaintenanceItem.belongsTo(Part, { foreignKey: 'part_id' });

// 9. Part Transfers
const PartTransfer = require('./models/PartTransfer');
const PartTransferItem = require('./models/PartTransferItem');
const PartTransferLog = require('./models/PartTransferLog');

PartTransfer.belongsTo(Warehouse, { as: 'FromWarehouse', foreignKey: 'from_warehouse_id' });
PartTransfer.belongsTo(Warehouse, { as: 'ToWarehouse', foreignKey: 'to_warehouse_id' });
PartTransfer.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
PartTransfer.hasMany(PartTransferItem, { foreignKey: 'transfer_id' });
PartTransferItem.belongsTo(PartTransfer, { foreignKey: 'transfer_id' });
PartTransferItem.belongsTo(Part, { foreignKey: 'part_id' });
PartTransfer.hasMany(PartTransferLog, { foreignKey: 'transfer_id' });
PartTransferLog.belongsTo(PartTransfer, { foreignKey: 'transfer_id' });
PartTransferLog.belongsTo(User, { foreignKey: 'user_id' });

// 10. Lift Tables
LiftTable.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Warehouse.hasMany(LiftTable, { foreignKey: 'warehouse_id' });
MaintenanceOrder.belongsTo(LiftTable, { foreignKey: 'lift_table_id' });
LiftTable.hasMany(MaintenanceOrder, { foreignKey: 'lift_table_id' });

Mechanic.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });

// 10. Promotional Gift Associations
GiftInventory.belongsTo(Gift, { foreignKey: 'gift_id' });
GiftInventory.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Gift.hasMany(GiftInventory, { foreignKey: 'gift_id' });

GiftTransaction.belongsTo(Gift, { foreignKey: 'gift_id' });
GiftTransaction.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
GiftTransaction.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
Gift.hasMany(GiftTransaction, { foreignKey: 'gift_id' });


const masterDataRoutes = require('./routes/masterData');
const businessRoutes = require('./routes/business');
const authRoutes = require('./routes/auth'); // MỚI
const { verifyToken, isAdmin, isPowerUser } = require('./middleware/authMiddleware'); // MỚI
const { seedAdmin } = require('./controllers/AuthController'); // MỚI
const fixDatabaseSchema = require('./fixDb');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Cho phép mọi origin (đối với local dev)
    methods: ["GET", "POST"]
  }
});

// Middleware Socket.io
io.on("connection", (socket) => {
  console.log("A user connected: " + socket.id);
  
  socket.on("join_room", (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined personal room`);
  });

  socket.on("join_warehouse", (whId) => {
    if (whId) {
      socket.join(`warehouse_${whId}`);
      console.log(`User joined warehouse room: ${whId}`);
    }
  });

  socket.on("join_admins", () => {
    socket.join("admins");
    console.log(`Admin joined admin room`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

app.set('io', io);

const PORT = process.env.PORT || 5000;


// Middleware
app.use(helmet()); // Bảo mật HTTP headers
app.disable('x-powered-by'); // Ẩn thông tin công nghệ
app.use(cors());
app.use(express.json());

// Giới hạn lượt thử đăng nhập (Brute-force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 20, // 20 lần thử mỗi IP
  message: { message: 'Thử lại quá nhiều lần, vui lòng đợi 15 phút.' }
});
app.use('/api/auth/login', loginLimiter);

// Routes
// Các luồng đăng nhập/đăng ký (không cần Token)
app.use('/api/auth', authRoutes);

// Toàn bộ dữ liệu kinh doanh và danh mục (CẦN có Token mới xem được)
app.use('/api', verifyToken, masterDataRoutes);
app.use('/api', verifyToken, businessRoutes);
app.use('/api/reports', verifyToken, require('./routes/reportRoutes'));
app.use('/api/notifications', verifyToken, require('./routes/notificationRoutes'));
app.use('/api/dashboard', verifyToken, isPowerUser, require('./routes/dashboardRoutes'));
app.use('/api', verifyToken, require('./routes/partRoutes'));
app.use('/api/import', verifyToken, require('./routes/importRoutes'));
app.use('/api/gifts', verifyToken, require('./routes/giftRoutes'));
app.use('/api/system', verifyToken, isAdmin, require('./routes/systemRoutes'));


app.get('/', (req, res) => {
  res.send('API Hệ thống Quản ký Xe Máy đang hoạt động...');
});

// Sync Database & Start Server
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Kết nối PostgreSQL thành công.');

    // Vá cấu trúc DB nếu thiếu cột hoặc enum
    await fixDatabaseSchema();

    // Sync all models 
    await sequelize.sync({ alter: true });

    console.log('✅ Các bảng đã được đồng bộ hóa.');

    // Khởi tạo Admin đầu tiên nếu DB trống
    await seedAdmin();

    server.listen(PORT, () => {
      console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
    });
    // Tăng timeout lên 10 phút để tránh kill request backup/restore lâu
    server.timeout = 10 * 60 * 1000;
  } catch (error) {
    console.error('❌ Lỗi khi khởi động server:', error.message);
  }
};

startServer();
