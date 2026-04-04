const express = require('express');
const cors = require('cors');
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

// 5. RetailSale & Associations for Search
RetailSale.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
RetailSale.belongsTo(User, { as: 'seller', foreignKey: 'seller_id' });
RetailSale.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
RetailSale.hasOne(Vehicle, { foreignKey: 'retail_sale_id' });
Vehicle.belongsTo(RetailSale, { foreignKey: 'retail_sale_id' });

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

Purchase.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
Purchase.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });


const masterDataRoutes = require('./routes/masterData');
const businessRoutes = require('./routes/business');
const authRoutes = require('./routes/auth'); // MỚI
const { verifyToken, isAdmin } = require('./middleware/authMiddleware'); // MỚI
const { seedAdmin } = require('./controllers/AuthController'); // MỚI

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
app.use(cors());
app.use(express.json());

// Routes
// Các luồng đăng nhập/đăng ký (không cần Token)
app.use('/api/auth', authRoutes);

// Toàn bộ dữ liệu kinh doanh và danh mục (CẦN có Token mới xem được)
app.use('/api', verifyToken, masterDataRoutes);
app.use('/api', verifyToken, businessRoutes);
app.use('/api/reports', verifyToken, require('./routes/reportRoutes'));
app.use('/api/notifications', verifyToken, require('./routes/notificationRoutes'));
app.use('/api/dashboard', verifyToken, isAdmin, require('./routes/dashboardRoutes'));
app.use('/api/import', verifyToken, isAdmin, require('./routes/importRoutes'));


app.get('/', (req, res) => {
  res.send('API Hệ thống Quản ký Xe Máy đang hoạt động...');
});

// Sync Database & Start Server
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Kết nối PostgreSQL thành công.');

    // Sync all models 
    await sequelize.sync({ alter: true });
    console.log('✅ Các bảng đã được đồng bộ hóa.');

    // Khởi tạo Admin đầu tiên nếu DB trống
    await seedAdmin();

    server.listen(PORT, () => {
      console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Lỗi khi khởi động server:', error.message);
  }
};

startServer();
