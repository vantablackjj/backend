const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MaintenanceItem = sequelize.define('MaintenanceItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  maintenance_order_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('PART', 'SERVICE'),
    allowNull: false
  },
  part_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true
  },
  quantity: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 1
  },
  unit: {
    type: DataTypes.STRING,
    allowNull: true
  },
  unit_price: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  total_price: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  sale_type: {
    type: DataTypes.ENUM('THU_NGAY', 'BAO_HANH', 'KHUYEN_MAI'),
    defaultValue: 'THU_NGAY'
  },
  purchase_price: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  discount_pct: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0
  },
  discount_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  notes: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = MaintenanceItem;
