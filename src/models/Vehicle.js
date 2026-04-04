const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Vehicle = sequelize.define('Vehicle', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  engine_no: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  chassis_no: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('In Stock', 'Sold', 'Returned', 'Transferring'),
    defaultValue: 'In Stock'
  },
  warehouse_id: {
    type: DataTypes.UUID,
    allowNull: true
  },

  type_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  color_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  purchase_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  retail_sale_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  wholesale_sale_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  price_vnd: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  is_locked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {

  timestamps: true
});

module.exports = Vehicle;
