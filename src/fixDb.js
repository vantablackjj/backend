const { QueryTypes } = require('sequelize');
const sequelize = require('./config/database');

async function fixDatabaseSchema() {
  try {
    console.log('🔍 Đang kiểm tra cấu trúc database...');
    
    // Kiểm tra xem cột accessible_warehouses đã tồn tại trong bảng Users chưa
    const tableInfo = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'Users' AND column_name = 'accessible_warehouses'",
      { type: QueryTypes.SELECT }
    );

    if (tableInfo.length === 0) {
      console.log('⚠️ Thiếu cột accessible_warehouses. Đang tiến hành thêm vào...');
      await sequelize.query('ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "accessible_warehouses" TEXT');
      console.log('✅ Đã thêm cột accessible_warehouses thành công.');
    } else {
      console.log('✅ Cấu trúc database Users đã đầy đủ.');
    }

    // Kiểm tra cột transfer_date trong bảng PartTransfers
    const partTransferInfo = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'PartTransfers' AND column_name = 'transfer_date'",
      { type: QueryTypes.SELECT }
    );

    if (partTransferInfo.length === 0) {
      console.log('⚠️ Thiếu cột transfer_date trong PartTransfers. Đang thêm...');
      await sequelize.query('ALTER TABLE "PartTransfers" ADD COLUMN IF NOT EXISTS "transfer_date" DATE');
      // Cập nhật các dòng cũ bằng ngày tạo
      await sequelize.query('UPDATE "PartTransfers" SET "transfer_date" = CAST("createdAt" AS DATE) WHERE "transfer_date" IS NULL');
      console.log('✅ Đã thêm cột transfer_date thành công.');
    }
    
    // Kiểm tra cột type trong bảng Suppliers
    const supplierTypeCheck = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'Suppliers' AND column_name = 'type'",
      { type: QueryTypes.SELECT }
    );

    if (supplierTypeCheck.length === 0) {
      console.log('⚠️ Thiếu cột type trong Suppliers. Đang tiến hành thêm vào...');
      try {
        // Tạo enum type trước nếu chưa có (PostgreSQL)
        await sequelize.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Suppliers_type') THEN CREATE TYPE \"enum_Suppliers_type\" AS ENUM ('VEHICLE', 'PART', 'BOTH'); END IF; END $$;");
        // Thêm cột với kiểu enum vừa tạo
        await sequelize.query('ALTER TABLE "Suppliers" ADD COLUMN IF NOT EXISTS "type" "enum_Suppliers_type" DEFAULT \'BOTH\'');
        console.log('✅ Đã thêm cột type vào Suppliers thành công.');
      } catch (e) {
        console.error('Lỗi khi thêm cột type: ' + e.message);
        // Fallback sang TEXT nếu Enum fail
        await sequelize.query('ALTER TABLE "Suppliers" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT \'BOTH\'');
      }
    }
    
    // Kiểm tra và thêm giá trị 'MANAGER' vào enum_Users_role nếu chưa có
    const enumCheck = await sequelize.query(
      "SELECT enumlabel FROM pg_enum WHERE enumtypid = '\"enum_Users_role\"'::regtype AND enumlabel = 'MANAGER'",
      { type: QueryTypes.SELECT }
    );

    if (enumCheck.length === 0) {
      console.log("⚠️ Thiếu giá trị 'MANAGER' trong enum_Users_role. Đang tiến hành thêm vào...");
      await sequelize.query("ALTER TYPE \"enum_Users_role\" ADD VALUE 'MANAGER'");
      console.log("✅ Đã thêm giá trị 'MANAGER' vào enum_Users_role thành công.");
    }

  } catch (error) {
    console.error('❌ Lỗi khi sửa cấu trúc database:', error.message);
  }
}

module.exports = fixDatabaseSchema;
