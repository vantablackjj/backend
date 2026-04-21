const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MaintenanceOrder = sequelize.define('MaintenanceOrder', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  maintenance_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  // Vehicle Info (Internal or External)
  license_plate: {
    type: DataTypes.STRING,
    allowNull: true
  },
  engine_no: {
    type: DataTypes.STRING,
    allowNull: true
  },
  chassis_no: {
    type: DataTypes.STRING,
    allowNull: true
  },
  model_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  km_reading: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  is_internal_vehicle: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  vehicle_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  // Customer Info
  customer_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customer_phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customer_address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Order Details
  mechanic_1_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  mechanic_2_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  service_type: {
    type: DataTypes.STRING,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  total_amount: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  paid_amount: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  vat_percent: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true
  },
  warehouse_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  lift_table_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'),
    defaultValue: 'PENDING'
  },
  gift_used: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = MaintenanceOrder;
