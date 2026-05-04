const XLSX = require("xlsx");
const sequelize = require("../config/database");
const VehicleColor = require("../models/VehicleColor");
const VehicleType = require("../models/VehicleType");
const WholesaleCustomer = require("../models/WholesaleCustomer");
const Supplier = require("../models/Supplier");
const Warehouse = require("../models/Warehouse");
const Vehicle = require("../models/Vehicle");
const Purchase = require("../models/Purchase");
const RetailSale = require("../models/RetailSale");
const WholesaleSale = require("../models/WholesaleSale");
const User = require("../models/User");
const { Op } = require("sequelize");
const { sendNotification } = require("../utils/notificationHelper");
const Gift = require("../models/Gift");
const GiftInventory = require("../models/GiftInventory");
const GiftTransaction = require("../models/GiftTransaction");
const dayjs = require("dayjs");
const Expense = require("../models/Expense");
const Part = require("../models/Part");
const PartInventory = require("../models/PartInventory");
const PartPurchase = require("../models/PartPurchase");
const PartPurchaseItem = require("../models/PartPurchaseItem");
const PartSale = require("../models/PartSale");
const PartSaleItem = require("../models/PartSaleItem");
const customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

const MaintenanceOrder = require("../models/MaintenanceOrder");
const MaintenanceItem = require("../models/MaintenanceItem");
const Mechanic = require("../models/Mechanic");

const parseImportDate = (val, preferredFormat = null) => {
  if (!val) return new Date();

  if (typeof val === "number") {
    try {
      const date = new Date((val - 25569) * 86400 * 1000);
      return date;
    } catch (e) {
      return new Date();
    }
  }

  if (val instanceof Date) {
    let d = dayjs(val);
    const now = dayjs();

    // CAUSALITY SWAP: If date is > 7 days in future, try swapping DD and MM
    if (d.isAfter(now.add(7, "day"))) {
      const day = d.date();
      const month = d.month(); // 0-indexed
      // Only swap if the original Day is a valid Month index (<= 12)
      if (day <= 12) {
        const swapped = d.month(day - 1).date(month + 1);
        if (swapped.isValid() && swapped.isBefore(now.add(7, "day"))) {
          return swapped.toDate();
        }
      }
    }
    return val;
  }

  if (typeof val === "string") {
    const trimmed = val.trim();

    // Use detected format if available (e.g. from the scanner)
    if (preferredFormat) {
      const d = dayjs(trimmed, preferredFormat, true);
      if (d.isValid()) return d.toDate();
    }

    // Standard sequence for ambiguous cases
    const formats = [
      "DD/MM/YYYY",
      "D/M/YYYY",
      "DD-MM-YYYY",
      "YYYY-MM-DD",
      "MM/DD/YYYY",
    ];
    const d = dayjs(trimmed, formats, true);
    if (d.isValid()) return d.toDate();

    const fb = dayjs(trimmed);
    if (fb.isValid()) return fb.toDate();
  }

  return new Date();
};

const detectDateFormat = (data) => {
  // Look at columns that likely contain dates
  const dateKeys = ["purchase_date", "sale_date", "transaction_date"];

  let scoreDMY = 0;
  let scoreMDY = 0;

  for (const row of data) {
    for (const key of dateKeys) {
      const val = row[key];
      if (typeof val === "string" && val.includes("/")) {
        const parts = val.split("/").map(Number);
        if (parts.length >= 2) {
          const [p1, p2] = parts;
          // If first part > 12, it's definitely Day/Month
          if (p1 > 12 && p1 <= 31 && p2 <= 12) scoreDMY++;
          // If second part > 12, it's definitely Month/Day
          if (p1 <= 12 && p2 > 12 && p2 <= 31) scoreMDY++;
        }
      }
    }
    if (scoreDMY + scoreMDY > 5) break; // Decision reached
  }

  if (scoreDMY > scoreMDY) return "DD/MM/YYYY";
  if (scoreMDY > scoreDMY) return "MM/DD/YYYY";
  return null; // Ambiguous
};

const importData = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng chọn file Excel!" });
    }

    const { type, warehouse_id, supplier_id } = req.body;
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Header mapping: Vietnamese -> English (Lowercase & Trimmed)
    const headerMap = {
      "ngày bán": "sale_date",
      "ngày nhập": "purchase_date",
      "số máy": "engine_no",
      "số khung": "chassis_no",
      "tên kho": "warehouse_name",
      kho: "warehouse_name",
      "ghi chú": "notes",
      "địa chỉ": "address",
      "tên màu": "color_name",
      "màu sắc": "color_name",
      "tên loại xe": "name",
      "loại xe": "name",
      "phân loại": "type",
      "tiền tố khung": "chassis_prefix",
      "tiền tố máy": "engine_prefix",
      "mã khách hàng": "customer_code",
      "mã khách": "customer_code",
      "tên khách": "customer_name",
      "tên khách hàng": "customer_name",
      "tên ncc": "supplier_name",
      "nhà cung cấp": "supplier_name",
      "hình thức tt": "payment_method",
      "hình thức thanh toán": "payment_method",
      "giá nhập": "purchase_price",
      "số điện thoại": "phone",
      "giá bán": "selling_price",
      total: "sale_price",
      "tiền khách trả": "paid_amount",
      "thanh toán": "paid_amount",
      "bảo hành": "guarantee",
      "phát sổ bảo hành": "guarantee",
      "số cmt": "id_card",
      "số cccd": "id_card",
      "cmt/cccd": "id_card",
      "giới tính": "gender",
      "phân loại hồ sơ": "sale_type",
      "kiểu bán": "sale_type",
      "người bảo lãnh": "guarantor_name",
      "sđt người bảo lãnh": "guarantor_phone",
      "tên ngân hàng": "bank_name",
      "số hợp đồng": "contract_number",
      "số tiền vay": "loan_amount",
      "quà tặng": "gifts_string",
      "người bán": "seller_name",
      "giá bán buôn": "sale_price_vnd",
      "giá bán lẻ": "sale_price_vnd",
      "tiền khách trả buôn": "paid_amount_vnd",
      "đã trả": "paid_amount_vnd",
      "mã phụ tùng": "code",
      "mã pt": "code",
      "tên phụ tùng": "name",
      "đơn vị": "unit",
      "đơn vị tính": "unit",
      "số lượng tồn": "quantity",
      "số lượng": "quantity",
      "số po": "po_number",
      "số hoá đơn hvn": "invoice_no",
      dnp: "purchase_price", // Dealer Net Price
      "giá nhập": "purchase_price",
      "đơn giá": "unit_price",
      "giá sỉ": "unit_price",
      "giá mua": "purchase_price",
      "thành tiền chưa vat": "total_amount_before_vat",
      "vat thành tiền": "vat_amount",
      vat: "vat_percent",
      "vat (%)": "vat_percent",
      "ngày sinh": "birthday",
      "ngày tháng năm sinh": "birthday",
      dob: "birthday",
      "phân loại mã": "code_type",
      "loại mã": "code_type",
      "tỷ lệ quy đổi": "default_conversion_rate",
      "quy đổi": "default_conversion_rate",
      "mã liên kết": "linked_part_code",
      "mô tả": "description",
      "ngày chi": "expense_date",
      xe: "engine_no",
      "biển số": "license_plate",
      "nội dung": "content",
      "nội dung chi": "content",
      "số tiền": "amount",
      "số tiền thanh toán": "amount",
      "giá trị": "amount",
      "tiền mặt": "cash_amount",
      "chuyển khoản": "transfer_amount",
      "vị trí": "location",
      "ngày bảo trì": "maintenance_date",
      "số km": "km_reading",
      "loại dịch vụ": "service_type",
      "tên dịch vụ": "service_name",
      "mã pt": "part_code",
      "mã phụ tùng": "part_code",
      "ghi chú tư vấn": "consultation_notes",
      "trừ kho": "update_inventory",
      "cập nhật kho": "update_inventory",
      "tên pt/dịch vụ": "item_description",
    };

    // Normalize data: Map Vietnamese headers to English keys
    const data = rawData.map((row) => {
      // ... same mapping logic ...
      const newRow = {};
      Object.keys(row).forEach((key) => {
        const cleanKey = key.trim().toLowerCase();
        const normalizedKey = headerMap[cleanKey] || key;
        let value = row[key];
        if (typeof value === "string") {
          value = value.trim();
          const upperKeys = [
            "code",
            "engine_no",
            "chassis_no",
            "engine_prefix",
            "chassis_prefix",
            "customer_code",
          ];
          if (upperKeys.includes(normalizedKey)) value = value.toUpperCase();
          const priceKeys = [
            "purchase_price",
            "selling_price",
            "sale_price_vnd",
            "unit_price",
            "paid_amount",
            "paid_amount_vnd",
            "price_vnd",
            "total_amount_before_vat",
          ];
          if (priceKeys.includes(normalizedKey))
            value = value.replace(/,/g, "");
        } else if (typeof value === "number") {
          // FIXED: Numeric codes (e.g. 9410110800) must be cast to string to avoid
          // PostgreSQL "operator does not exist: character varying = bigint" error
          const upperKeys = [
            "code",
            "engine_no",
            "chassis_no",
            "chassis_prefix",
            "engine_prefix",
            "customer_code",
          ];
          if (upperKeys.includes(normalizedKey))
            value = String(value).toUpperCase();
        }
        newRow[normalizedKey] = value;
      });
      return newRow;
    });

    const detectedFormat = detectDateFormat(data);

    let results = { success: 0, failed: 0, errors: [] };

    // CACHING: Pre-fetch common reference data to reduce DB lookups
    const [allWarehouses, allSuppliers, allParts, allUsers, allGifts] =
      await Promise.all([
        Warehouse.findAll({ attributes: ["id", "warehouse_name"] }),
        Supplier.findAll({ attributes: ["id", "name"] }),
        Part.findAll({
          attributes: ["id", "code", "name", "unit", "default_conversion_rate"],
        }),
        User.findAll({ attributes: ["id", "full_name"] }),
        Gift.findAll({ attributes: ["id", "name"] }),
      ]);

    const warehouseMap = new Map(
      allWarehouses.map((w) => [w.warehouse_name.toLowerCase(), w.id]),
    );
    const supplierMap = new Map(
      allSuppliers.map((s) => [s.name.toLowerCase(), s.id]),
    );
    const partMap = new Map(allParts.map((p) => [p.code.toLowerCase(), p]));
    const userMap = new Map(
      allUsers.map((u) => [u.full_name.toLowerCase(), u.id]),
    );
    const giftMap = new Map(allGifts.map((g) => [g.name.toLowerCase(), g]));

    // Use a small chunk size for transactions to prevent timeouts on large datasets (e.g. 2000 rows)
    const CHUNK_SIZE = 500;

    // BIỆN PHÁP BẢO VỆ: Nếu không phải Admin/Manager, ép buộc dùng warehouse_id của chính mình kể cả trong Excel
    const enforcedWH =
      req.user.role === "ADMIN" || req.user.role === "MANAGER"
        ? null
        : req.user.warehouse_id;

    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      const t = await sequelize.transaction();

      try {
        for (let rowIdx = 0; rowIdx < chunk.length; rowIdx++) {
          const row = chunk[rowIdx];
          try {
            // Create a savepoint before each row so a DB error doesn't abort the whole transaction
            await sequelize.query(`SAVEPOINT row_sp_${rowIdx}`, {
              transaction: t,
            });
            switch (type) {
              case "part_locations":
                if (row.code && row.location !== undefined) {
                  const vWarehouseId =
                    enforcedWH ||
                    warehouseMap.get(
                      (row.warehouse_name || "").toLowerCase(),
                    ) ||
                    warehouse_id;
                  if (!vWarehouseId)
                    throw new Error(`Vui lòng xác định kho hàng.`);

                  const cleanCode = String(row.code).trim().toUpperCase();
                  const vPart = partMap.get(cleanCode.toLowerCase());
                  if (!vPart)
                    throw new Error(
                      `Mã phụ tùng '${cleanCode}' không tồn tại.`,
                    );

                  const [inventory] = await PartInventory.findOrCreate({
                    where: { part_id: vPart.id, warehouse_id: vWarehouseId },
                    defaults: { quantity: 0, location: row.location },
                    transaction: t,
                  });

                  if (
                    inventory.location &&
                    inventory.location !== row.location
                  ) {
                    // Check if the location is already in the list to avoid "Kệ A, Kệ A"
                    const currentLocs = inventory.location
                      .split(",")
                      .map((l) => l.trim());
                    if (!currentLocs.includes(String(row.location).trim())) {
                      await inventory.update(
                        { location: inventory.location + ", " + row.location },
                        { transaction: t },
                      );
                    }
                  } else {
                    await inventory.update(
                      { location: row.location },
                      { transaction: t },
                    );
                  }
                  results.success++;
                }
                break;

              case "colors":
                if (row.color_name) {
                  await VehicleColor.findOrCreate({
                    where: { color_name: row.color_name },
                    transaction: t,
                  });
                  results.success++;
                }
                break;

              case "types":
                if ((row.name || row.type_name) && row.type) {
                  const [vType, created] = await VehicleType.findOrCreate({
                    where: { name: row.name || row.type_name },
                    defaults: {
                      type: row.type,
                      chassis_prefix: row.chassis_prefix || "",
                      engine_prefix: row.engine_prefix || "",
                    },
                    transaction: t,
                  });

                  if (!created) {
                    // If already exists, update with catalog data
                    await vType.update(
                      {
                        type: row.type,
                        chassis_prefix:
                          row.chassis_prefix || vType.chassis_prefix,
                        engine_prefix: row.engine_prefix || vType.engine_prefix,
                      },
                      { transaction: t },
                    );
                  }
                  results.success++;
                }
                break;

              case "customers":
                const cName = row.customer_name || row.name;
                if (cName && row.customer_code) {
                  const rowType = row.type
                    ? row.type.toString().toUpperCase()
                    : null;
                  let finalType = req.body.customer_type || "VEHICLE"; // Default to VEHICLE if not specified

                  if (rowType) {
                    if (
                      rowType.includes("PHỤ TÙNG") ||
                      rowType.includes("PART")
                    )
                      finalType = "PART";
                    else if (
                      rowType.includes("CẢ HAI") ||
                      rowType.includes("BOTH")
                    )
                      finalType = "BOTH";
                    else if (
                      rowType.includes("XE MÁY") ||
                      rowType.includes("VEHICLE")
                    )
                      finalType = "VEHICLE";
                  }

                  await WholesaleCustomer.findOrCreate({
                    where: { customer_code: row.customer_code },
                    defaults: {
                      name: cName,
                      address: row.address || "",
                      phone: row.phone || "",
                      payment_type:
                        row.payment_method || row.payment_type || "Trả gộp",
                      customer_type: finalType,
                    },
                    transaction: t,
                  });
                  results.success++;
                }
                break;

              case "suppliers":
                const sName = row.supplier_name || row.name;
                if (sName) {
                  await Supplier.findOrCreate({
                    where: { name: sName },
                    defaults: {
                      address: row.address || "",
                      notes: row.notes || "",
                      payment_type:
                        row.payment_method || row.payment_type || "Trả gộp",
                    },
                    transaction: t,
                  });
                  results.success++;
                }
                break;

              case "purchases":
                if (
                  row.engine_no &&
                  row.chassis_no &&
                  row.name &&
                  row.color_name &&
                  (row.supplier_name || supplier_id) &&
                  (row.warehouse_name || warehouse_id)
                ) {
                  // Master Data Validation - STRICT
                  const [vColor] = await VehicleColor.findOrCreate({
                    where: { color_name: { [Op.iLike]: row.color_name } },
                    defaults: { color_name: row.color_name },
                    transaction: t,
                  });
                  const [vType] = await VehicleType.findOrCreate({
                    where: { name: { [Op.iLike]: row.name } },
                    defaults: { name: row.name, type: "Xe mới" },
                    transaction: t,
                  });

                  const finalEngineNo = String(row.engine_no)
                    .trim()
                    .toUpperCase();
                  const finalChassisNo = String(row.chassis_no)
                    .trim()
                    .toUpperCase();

                  // Warehouse Permission / Validation - ENFORCED
                  const targetWarehouseId =
                    enforcedWH ||
                    warehouse_id ||
                    warehouseMap.get((row.warehouse_name || "").toLowerCase());
                  if (!targetWarehouseId)
                    throw new Error(`Vui lòng xác định kho nhập hàng.`);

                  // Permission Check
                  if (
                    req.user.role !== "ADMIN" &&
                    req.user.warehouse_id &&
                    req.user.warehouse_id !== targetWarehouseId
                  ) {
                    throw new Error(
                      "Bạn không có quyền nhập hàng vào kho này.",
                    );
                  }

                  const vWarehouse = await Warehouse.findByPk(
                    targetWarehouseId,
                    { transaction: t },
                  );
                  if (!vWarehouse) throw new Error("Kho không tồn tại.");

                  // Supplier Validation
                  let targetSupplierId = supplier_id;
                  if (!targetSupplierId && row.supplier_name) {
                    const sup = await Supplier.findOne({
                      where: { name: { [Op.iLike]: row.supplier_name } },
                      transaction: t,
                    });
                    if (sup) targetSupplierId = sup.id;
                  }

                  if (!targetSupplierId)
                    throw new Error(
                      `Nhà cung cấp '${row.supplier_name}' không tồn tại.`,
                    );

                  let purchaseDate = parseImportDate(
                    row.purchase_date,
                    detectedFormat,
                  );

                  const startDate = dayjs(purchaseDate).startOf("day").toDate();
                  const endDate = dayjs(purchaseDate).endOf("day").toDate();

                  let vPurchase = await Purchase.findOne({
                    where: {
                      supplier_id: targetSupplierId,
                      warehouse_id: targetWarehouseId,
                      purchase_date: { [Op.between]: [startDate, endDate] },
                    },
                    transaction: t,
                  });

                  if (!vPurchase) {
                    vPurchase = await Purchase.create(
                      {
                        supplier_id: targetSupplierId,
                        warehouse_id: targetWarehouseId,
                        purchase_date: purchaseDate,
                        created_by: req.user.id,
                      },
                      { transaction: t },
                    );
                  }

                  const vehiclePrice =
                    Number(row.purchase_price || row.price_vnd) || 0;

                  let vehicle = await Vehicle.findOne({
                    where: { engine_no: finalEngineNo },
                    transaction: t,
                  });

                  if (!vehicle) {
                    // CREATE NEW
                    vehicle = await Vehicle.create(
                      {
                        engine_no: finalEngineNo,
                        chassis_no: finalChassisNo,
                        type_id: vType.id,
                        color_id: vColor.id,
                        warehouse_id: vWarehouse.id,
                        purchase_id: vPurchase.id,
                        price_vnd: vehiclePrice,
                        status: "In Stock",
                      },
                      { transaction: t },
                    );

                    await vPurchase.increment("total_amount_vnd", {
                      by: vehiclePrice,
                      transaction: t,
                    });
                    results.success++;
                  } else {
                    // Vehicle already exists.
                    // Repair if incomplete: In Stock and (missing purchase_id OR missing price)
                    const needsRepair =
                      vehicle.status === "In Stock" &&
                      (!vehicle.purchase_id ||
                        !vehicle.price_vnd ||
                        Number(vehicle.price_vnd) === 0);

                    if (needsRepair) {
                      // Update purchase total amount ONLY IF we are adding it now or the price changed
                      const oldPrice = Number(vehicle.price_vnd || 0);
                      const priceDiff = vehiclePrice - oldPrice;

                      await vehicle.update(
                        {
                          chassis_no: finalChassisNo,
                          type_id: vType.id,
                          color_id: vColor.id,
                          warehouse_id: vWarehouse.id,
                          purchase_id: vPurchase.id,
                          price_vnd: vehiclePrice,
                        },
                        { transaction: t },
                      );

                      // If it belongs to a DIFFERENT purchase now, we should ideally adjust that too...
                      // but for simplicity and safety (as it's usually null -> something), we just adjust the target one
                      if (vehiclePrice > 0) {
                        await vPurchase.increment("total_amount_vnd", {
                          by: vehiclePrice,
                          transaction: t,
                        });
                      }
                      results.success++;
                    } else if (
                      vehicle.status === "In Stock" &&
                      vehicle.purchase_id === vPurchase.id
                    ) {
                      // Already in THIS lot, just count as success (skip duplicate logic)
                      results.success++;
                    } else {
                      results.failed++;
                      results.errors.push(
                        `Số máy ${finalEngineNo} đã tồn tại (Trạng thái: ${vehicle.status}) và thuộc quyền quản lý khác.`,
                      );
                    }
                  }
                }
                break;

              case "retail_sales":
                if (
                  row.engine_no &&
                  row.customer_name &&
                  (row.selling_price || row.sale_price)
                ) {
                  const vWarehouseId =
                    enforcedWH ||
                    warehouseMap.get(
                      (row.warehouse_name || "").toLowerCase(),
                    ) ||
                    warehouse_id;
                  if (!vWarehouseId)
                    throw new Error(`Vui lòng xác định kho hàng.`);

                  let vehicle = await Vehicle.findOne({
                    where: {
                      engine_no: row.engine_no,
                      warehouse_id: vWarehouseId,
                      status: "In Stock",
                      is_locked: false,
                    },
                    transaction: t,
                  });

                  if (!vehicle) {
                    const searchEngineNo = String(row.engine_no || "");
                    const allTypesWithPrefix = await VehicleType.findAll({
                      where: { engine_prefix: { [Op.ne]: "" } },
                      transaction: t,
                    });
                    for (const vt of allTypesWithPrefix) {
                      const potentialId = vt.engine_prefix + searchEngineNo;
                      vehicle = await Vehicle.findOne({
                        where: {
                          engine_no: potentialId,
                          warehouse_id: vWarehouseId,
                          status: "In Stock",
                          is_locked: false,
                        },
                        transaction: t,
                      });
                      if (vehicle) break;
                    }
                  }

                  if (!vehicle)
                    throw new Error(
                      `Số máy ${row.engine_no} không tồn tại trong kho hoặc đã bán.`,
                    );

                  const guaranteeValue =
                    String(row.guarantee).toLowerCase() === "có" ||
                    row.guarantee === true
                      ? "Có"
                      : "Không";
                  const genderValue =
                    row.gender &&
                    ["nữ", "gái", "nu", "gai", "nư"].includes(
                      String(row.gender).toLowerCase(),
                    )
                      ? "Nữ"
                      : "Nam";
                  const saleTypeValue =
                    row.sale_type &&
                    String(row.sale_type).toLowerCase().includes("đăng ký")
                      ? "Đăng ký"
                      : "Hồ sơ xe";
                  const sellerId =
                    row.seller_name &&
                    userMap.has(row.seller_name.toLowerCase())
                      ? userMap.get(row.seller_name.toLowerCase())
                      : req.user.id;

                  let giftsArray = [];
                  if (row.gifts_string) {
                    giftsArray = String(row.gifts_string)
                      .split(/[,;|]/)
                      .map((g) => g.trim())
                      .filter((g) => g);
                  }

                  const saleDate = parseImportDate(
                    row.sale_date,
                    detectedFormat,
                  );

                  const sale = await RetailSale.create(
                    {
                      sale_date: saleDate,
                      customer_name: row.customer_name,
                      phone: row.phone || "",
                      address: row.address || "",
                      id_card: String(row.id_card || ""),
                      gender: genderValue,
                      engine_no: vehicle.engine_no,
                      chassis_no: vehicle.chassis_no,
                      total_price: Number(row.selling_price || row.sale_price),
                      paid_amount: Number(row.paid_amount || 0),
                      cash_amount: Number(row.cash_amount || 0),
                      transfer_amount: Number(row.transfer_amount || 0),
                      guarantee: guaranteeValue,
                      sale_type: saleTypeValue,
                      guarantor_name: row.guarantor_name || "",
                      guarantor_phone: row.guarantor_phone || "",
                      payment_method: row.payment_method || "Trả thẳng",
                      bank_name: row.bank_name || "",
                      contract_number: row.contract_number || "",
                      loan_amount: Number(row.loan_amount || 0),
                      birthday: row.birthday
                        ? parseImportDate(row.birthday, detectedFormat)
                        : null,
                      warehouse_id: vWarehouseId,
                      seller_id: sellerId,
                      created_by: req.user.id,
                      gifts: giftsArray,
                    },
                    { transaction: t },
                  );

                  // Deduct Gifts logic FROM INVENTORY
                  if (giftsArray.length > 0) {
                    for (const gName of giftsArray) {
                      const gift = giftMap.get(gName.toLowerCase());
                      if (gift) {
                        const inventory = await GiftInventory.findOne({
                          where: {
                            gift_id: gift.id,
                            warehouse_id: vWarehouseId,
                          },
                          transaction: t,
                        });

                        if (inventory && Number(inventory.quantity) > 0) {
                          await GiftTransaction.create(
                            {
                              gift_id: gift.id,
                              warehouse_id: vWarehouseId,
                              quantity: -1,
                              type: "EXPORT_RETAIL",
                              transaction_date: saleDate,
                              notes: `Tặng kèm xe ${vehicle.engine_no} (Import Excel)`,
                              created_by: req.user.id,
                            },
                            { transaction: t },
                          );

                          await inventory.decrement("quantity", {
                            by: 1,
                            transaction: t,
                          });
                        }
                      }
                    }
                  }

                  await vehicle.update(
                    { status: "Sold", retail_sale_id: sale.id },
                    { transaction: t },
                  );
                  results.success++;
                }
                break;

              case "wholesale_sales":
                if (
                  row.engine_no &&
                  row.customer_code &&
                  (row.sale_price_vnd ||
                    row.selling_price ||
                    row.sale_price ||
                    row.unit_price)
                ) {
                  const vWarehouseId =
                    enforcedWH ||
                    warehouseMap.get(
                      (row.warehouse_name || "").toLowerCase(),
                    ) ||
                    warehouse_id;
                  if (!vWarehouseId)
                    throw new Error(`Vui lòng xác định kho bán hàng.`);

                  let vehicle = await Vehicle.findOne({
                    where: {
                      engine_no: row.engine_no,
                      warehouse_id: vWarehouseId,
                      status: "In Stock",
                      is_locked: false,
                    },
                    transaction: t,
                  });

                  // If not found, try to match by appending prefix if row.engine_no is just a suffix
                  if (!vehicle) {
                    const searchEngineNo = String(row.engine_no || "");
                    const allTypesWithPrefix = await VehicleType.findAll({
                      where: { engine_prefix: { [Op.ne]: "" } },
                      transaction: t,
                    });
                    for (const vt of allTypesWithPrefix) {
                      const potentialId = vt.engine_prefix + searchEngineNo;
                      vehicle = await Vehicle.findOne({
                        where: {
                          engine_no: potentialId,
                          warehouse_id: vWarehouseId,
                          status: "In Stock",
                          is_locked: false,
                        },
                        transaction: t,
                      });
                      if (vehicle) break;
                    }
                  }

                  if (!vehicle)
                    throw new Error(
                      `Số máy ${row.engine_no} không tồn tại trong kho hoặc đã bán.`,
                    );

                  const customer = await WholesaleCustomer.findOne({
                    where: { customer_code: row.customer_code },
                    transaction: t,
                  });
                  if (!customer)
                    throw new Error(
                      `Khách buôn mã ${row.customer_code} không tồn tại.`,
                    );

                  const wsPrice = Number(
                    row.sale_price_vnd ||
                      row.selling_price ||
                      row.sale_price ||
                      row.unit_price,
                  );
                  const saleDate = parseImportDate(
                    row.sale_date,
                    detectedFormat,
                  );

                  const startDate = dayjs(saleDate).startOf("day").toDate();
                  const endDate = dayjs(saleDate).endOf("day").toDate();

                  let wSale = await WholesaleSale.findOne({
                    where: {
                      customer_id: customer.id,
                      warehouse_id: vWarehouseId,
                      sale_date: { [Op.between]: [startDate, endDate] },
                    },
                    transaction: t,
                  });

                  if (!wSale) {
                    wSale = await WholesaleSale.create(
                      {
                        customer_id: customer.id,
                        warehouse_id: vWarehouseId,
                        sale_date: saleDate,
                        created_by: req.user.id,
                      },
                      { transaction: t },
                    );
                  }

                  await vehicle.update(
                    {
                      status: "Sold",
                      wholesale_sale_id: wSale.id,
                      wholesale_price_vnd: wsPrice,
                    },
                    { transaction: t },
                  );

                  const paidAmountVnd = Number(row.paid_amount_vnd || 0);
                  await wSale.increment(
                    {
                      total_amount_vnd: wsPrice,
                      paid_amount_vnd: paidAmountVnd,
                    },
                    { transaction: t },
                  );
                  results.success++;
                }
                break;

              case "part_master":
                if (row.code) {
                  const codeType =
                    row.code_type &&
                    ["HONDA", "SELF_CREATED"].includes(
                      String(row.code_type).toUpperCase(),
                    )
                      ? String(row.code_type).toUpperCase()
                      : String(row.code_type).toLowerCase() === "xe ngoài" ||
                          String(row.code_type).toLowerCase() === "tự tạo"
                        ? "SELF_CREATED"
                        : "HONDA";

                  let linkedPartId = null;
                  if (row.linked_part_code) {
                    const lp = await Part.findOne({
                      where: {
                        code: String(row.linked_part_code).trim().toUpperCase(),
                      },
                      transaction: t,
                    });
                    if (lp) linkedPartId = lp.id;
                  }

                  const [vPart, created] = await Part.findOrCreate({
                    where: { code: row.code },
                    defaults: {
                      name: row.name || row.code,
                      unit: row.unit || "Cái",
                      purchase_price: Number(row.purchase_price) || 0,
                      selling_price: Number(row.selling_price) || 0,
                      code_type: codeType,
                      default_conversion_rate:
                        Number(row.default_conversion_rate) || 1,
                      linked_part_id: linkedPartId,
                      description: row.description || "",
                    },
                    transaction: t,
                  });

                  if (!created) {
                    const updateData = {};
                    if (row.name) updateData.name = row.name;
                    if (row.unit) updateData.unit = row.unit;
                    if (row.purchase_price !== undefined)
                      updateData.purchase_price = Number(row.purchase_price);
                    if (row.selling_price !== undefined)
                      updateData.selling_price = Number(row.selling_price);
                    if (row.code_type) updateData.code_type = codeType;
                    if (row.default_conversion_rate !== undefined)
                      updateData.default_conversion_rate = Number(
                        row.default_conversion_rate,
                      );
                    if (linkedPartId) updateData.linked_part_id = linkedPartId;
                    if (row.description)
                      updateData.description = row.description;

                    await vPart.update(updateData, { transaction: t });
                  }
                  results.success++;
                }
                break;

              case "part_inventory":
                if (row.code && (row.warehouse_name || warehouse_id)) {
                  // FIXED: Always cast to string to avoid character varying = bigint error
                  const cleanCode = String(row.code).trim().toUpperCase();
                  if (!cleanCode) break;

                  const vWarehouseId =
                    enforcedWH ||
                    warehouseMap.get(
                      (row.warehouse_name || "").toLowerCase(),
                    ) ||
                    warehouse_id;
                  if (!vWarehouseId)
                    throw new Error(`Vui lòng xác định kho hàng.`);

                  // FIXED: Auto-create Part if not exist in catalog
                  // This allows importing inventory balance for any part code
                  const [vPart] = await Part.findOrCreate({
                    where: { code: cleanCode },
                    defaults: {
                      name: row.name || cleanCode,
                      unit: row.unit || "Cái",
                      purchase_price: Number(row.purchase_price) || 0,
                      selling_price: Number(row.selling_price) || 0,
                      code_type: "HONDA",
                    },
                    transaction: t,
                  });

                  // FIXED: Use vPart.id directly (không dùng linked_part_id)
                  const [inventory, invCreated] =
                    await PartInventory.findOrCreate({
                      where: {
                        part_id: vPart.id,
                        warehouse_id: vWarehouseId,
                      },
                      defaults: {
                        quantity: Number(row.quantity) || 0,
                      },
                      transaction: t,
                    });

                  if (!invCreated) {
                    await inventory.update(
                      { quantity: Number(row.quantity) || 0 },
                      { transaction: t },
                    );
                  }
                  results.success++;
                }
                break;

              case "part_purchases":
                if (row.code && Number(row.quantity) > 0) {
                  const cleanCode = String(row.code).trim();
                  const cleanPo = row.po_number
                    ? String(row.po_number).trim()
                    : null;
                  const cleanInvoice = row.invoice_no
                    ? String(row.invoice_no).trim()
                    : null;

                  // 1. Validate Part
                  let vPart = partMap.get(cleanCode.toLowerCase());
                  if (!vPart) {
                    const [newPart] = await Part.findOrCreate({
                      where: { code: cleanCode },
                      defaults: {
                        name: row.name || cleanCode,
                        unit: row.unit || "Cái",
                      },
                      transaction: t,
                    });
                    vPart = newPart;
                    partMap.set(cleanCode.toLowerCase(), vPart);
                  }

                  // 2. Validate Warehouse / Permissions
                  let targetWarehouseId = warehouse_id;
                  if (!targetWarehouseId && row.warehouse_name) {
                    targetWarehouseId = warehouseMap.get(
                      row.warehouse_name.toLowerCase(),
                    );
                  }

                  // Fallback if still none
                  if (!targetWarehouseId) {
                    targetWarehouseId = Array.from(warehouseMap.values())[0];
                  }

                  if (!targetWarehouseId)
                    throw new Error("Hệ thống chưa có kho nào.");

                  // Permission Check
                  if (
                    req.user.role !== "ADMIN" &&
                    req.user.warehouse_id &&
                    req.user.warehouse_id !== targetWarehouseId
                  ) {
                    throw new Error(
                      `Bạn không có quyền nhập hàng vào kho này.`,
                    );
                  }

                  const vWarehouseId = targetWarehouseId;
                  // No need to find the whole object if we only need the ID for PartPurchase create

                  // 3. Find or Create PartPurchase
                  let purchaseDate = parseImportDate(
                    row.purchase_date,
                    detectedFormat,
                  );

                  const startDate = dayjs(purchaseDate).startOf("day").toDate();
                  const endDate = dayjs(purchaseDate).endOf("day").toDate();

                  let vPurchase = await PartPurchase.findOne({
                    where: {
                      po_number: cleanPo,
                      invoice_no: cleanInvoice,
                      purchase_date: { [Op.between]: [startDate, endDate] },
                    },
                    transaction: t,
                  });

                  if (!vPurchase) {
                    // Find a supplier: provided ID -> Excel name -> First available
                    let targetSupplierId = supplier_id;
                    if (!targetSupplierId && row.supplier_name) {
                      targetSupplierId = supplierMap.get(
                        row.supplier_name.toLowerCase(),
                      );
                    }
                    if (!targetSupplierId) {
                      targetSupplierId = Array.from(supplierMap.values())[0];
                    }

                    let rawVat = Number(row.vat_percent) || 0;
                    // Robust VAT: if from Excel percentage format (0.08), convert to whole number (8)
                    const normalizedVat =
                      rawVat > 0 && rawVat < 1 ? rawVat * 100 : rawVat;

                    vPurchase = await PartPurchase.create(
                      {
                        supplier_id: targetSupplierId,
                        warehouse_id: vWarehouseId,
                        purchase_date: purchaseDate,
                        po_number: cleanPo || "",
                        invoice_no: cleanInvoice || "",
                        vat_percent: normalizedVat,
                        created_by: req.user.id,
                      },
                      { transaction: t },
                    );
                  }

                  // 4. Create PartPurchaseItem
                  const qty = Number(row.quantity) || 0;
                  const unitPrice = Number(row.purchase_price) || 0;
                  const totalPrice = qty * unitPrice;
                  const conversion = vPart.default_conversion_rate || 1;
                  const baseQty = qty * conversion;

                  await PartPurchaseItem.create(
                    {
                      purchase_id: vPurchase.id,
                      part_id: vPart.id,
                      quantity: qty,
                      unit: row.unit || vPart.unit,
                      conversion_rate: conversion,
                      base_quantity: baseQty,
                      unit_price: unitPrice,
                      total_price: totalPrice,
                    },
                    { transaction: t },
                  );

                  // 5. Update Inventory (Deducting/Adding to linked part if exists)
                  const inventoryPartId = vPart.linked_part_id || vPart.id;
                  const [inventory] = await PartInventory.findOrCreate({
                    where: {
                      part_id: inventoryPartId,
                      warehouse_id: vWarehouseId,
                    },
                    defaults: { quantity: 0 },
                    transaction: t,
                  });

                  await inventory.increment("quantity", {
                    by: baseQty,
                    transaction: t,
                  });

                  // 6. Update Purchase Total
                  const rawVat = Number(row.vat_percent || 0);
                  const normalizedVat =
                    rawVat > 0 && rawVat < 1 ? rawVat * 100 : rawVat;
                  const itemVatAmount = totalPrice * (normalizedVat / 100);
                  const rowTotalWithVat = totalPrice + itemVatAmount;
                  await vPurchase.increment("total_amount", {
                    by: rowTotalWithVat,
                    transaction: t,
                  });

                  results.success++;
                }
                break;

              case "part_retail_sales":
                if (row.customer_name && row.code && row.quantity) {
                  const vWarehouseId =
                    enforcedWH ||
                    warehouseMap.get(
                      (row.warehouse_name || "").toLowerCase(),
                    ) ||
                    warehouse_id;
                  if (!vWarehouseId)
                    throw new Error(`Vui lòng xác định kho hàng.`);

                  const cleanCode = String(row.code).trim().toUpperCase();
                  let vPart = partMap.get(cleanCode.toLowerCase());
                  if (!vPart)
                    throw new Error(
                      `Mã phụ tùng '${cleanCode}' không tồn tại.`,
                    );

                  const saleDate = parseImportDate(
                    row.sale_date,
                    detectedFormat,
                  );
                  const startDate = dayjs(saleDate).startOf("day").toDate();
                  const endDate = dayjs(saleDate).endOf("day").toDate();

                  // Group items from same customer on same day into one PartSale
                  let vSale = await PartSale.findOne({
                    where: {
                      customer_name: row.customer_name,
                      warehouse_id: vWarehouseId,
                      sale_type: "Retail",
                      sale_date: { [Op.between]: [startDate, endDate] },
                    },
                    transaction: t,
                  });

                  if (!vSale) {
                    vSale = await PartSale.create(
                      {
                        sale_date: saleDate,
                        customer_name: row.customer_name,
                        customer_phone: row.phone || "",
                        warehouse_id: vWarehouseId,
                        sale_type: "Retail",
                        paid_amount: Number(row.paid_amount) || 0,
                        vat_percent:
                          Number(row.vat_percent) < 1 &&
                          Number(row.vat_percent) > 0
                            ? Number(row.vat_percent) * 100
                            : Number(row.vat_percent) || 0,
                        created_by: req.user.id,
                      },
                      { transaction: t },
                    );
                  }

                  const qty = Number(row.quantity) || 0;
                  const unitPrice =
                    Number(row.unit_price) || Number(vPart.selling_price) || 0;
                  const totalPrice = qty * unitPrice;

                  await PartSaleItem.create(
                    {
                      sale_id: vSale.id,
                      part_id: vPart.id,
                      quantity: qty,
                      unit: row.unit || vPart.unit,
                      unit_price: unitPrice,
                      total_price: totalPrice,
                    },
                    { transaction: t },
                  );

                  // Update Sale Total
                  const currentTotal = Number(vSale.total_amount);
                  const newTotal = currentTotal + totalPrice;
                  // VAT is handled on the total amount in PartRetailPage, but here we store total_amount as sum of item totals then apply VAT if needed in display or just store it.
                  // Logic in PartRetailPage: totalAmount = subtotal * (1 + vatPercent / 100);
                  // We'll update the vSale.total_amount
                  await vSale.update(
                    { total_amount: newTotal },
                    { transaction: t },
                  );

                  // Update Inventory
                  const inventoryPartId = vPart.linked_part_id || vPart.id;
                  const [inventory] = await PartInventory.findOrCreate({
                    where: {
                      part_id: inventoryPartId,
                      warehouse_id: vWarehouseId,
                    },
                    defaults: { quantity: 0 },
                    transaction: t,
                  });
                  await inventory.decrement("quantity", {
                    by: qty,
                    transaction: t,
                  });

                  results.success++;
                }
                break;

              case "part_wholesale_sales":
                if (row.customer_code && row.code && row.quantity) {
                  const vWarehouseId =
                    enforcedWH ||
                    warehouseMap.get(
                      (row.warehouse_name || "").toLowerCase(),
                    ) ||
                    warehouse_id;
                  if (!vWarehouseId)
                    throw new Error(`Vui lòng xác định kho hàng.`);

                  const cleanCode = String(row.code).trim().toUpperCase();
                  let vPart = partMap.get(cleanCode.toLowerCase());
                  if (!vPart)
                    throw new Error(
                      `Mã phụ tùng '${cleanCode}' không tồn tại.`,
                    );

                  const customer = await WholesaleCustomer.findOne({
                    where: { customer_code: row.customer_code },
                    transaction: t,
                  });
                  if (!customer)
                    throw new Error(
                      `Đối tác buôn mã '${row.customer_code}' không tồn tại.`,
                    );

                  const saleDate = parseImportDate(
                    row.sale_date,
                    detectedFormat,
                  );
                  const startDate = dayjs(saleDate).startOf("day").toDate();
                  const endDate = dayjs(saleDate).endOf("day").toDate();

                  // Group items from same customer on same day into one PartSale
                  let vSale = await PartSale.findOne({
                    where: {
                      customer_id: customer.id,
                      warehouse_id: vWarehouseId,
                      sale_type: "Wholesale",
                      sale_date: { [Op.between]: [startDate, endDate] },
                    },
                    transaction: t,
                  });

                  if (!vSale) {
                    vSale = await PartSale.create(
                      {
                        sale_date: saleDate,
                        customer_id: customer.id,
                        customer_name: customer.name,
                        customer_phone: customer.phone,
                        warehouse_id: vWarehouseId,
                        sale_type: "Wholesale",
                        paid_amount: Number(row.paid_amount) || 0,
                        vat_percent:
                          Number(row.vat_percent) < 1 &&
                          Number(row.vat_percent) > 0
                            ? Number(row.vat_percent) * 100
                            : Number(row.vat_percent) || 0,
                        created_by: req.user.id,
                      },
                      { transaction: t },
                    );
                  }

                  const qty = Number(row.quantity) || 0;
                  const unitPrice =
                    Number(row.unit_price) ||
                    Number(vPart.wholesale_price || vPart.selling_price) ||
                    0;
                  const totalPrice = qty * unitPrice;

                  await PartSaleItem.create(
                    {
                      sale_id: vSale.id,
                      part_id: vPart.id,
                      quantity: qty,
                      unit: row.unit || vPart.unit,
                      unit_price: unitPrice,
                      total_price: totalPrice,
                    },
                    { transaction: t },
                  );

                  // Update Sale Total
                  const currentTotal = Number(vSale.total_amount);
                  const newTotal = currentTotal + totalPrice;
                  await vSale.update(
                    { total_amount: newTotal },
                    { transaction: t },
                  );

                  // Update Inventory
                  const inventoryPartId = vPart.linked_part_id || vPart.id;
                  const [inventory] = await PartInventory.findOrCreate({
                    where: {
                      part_id: inventoryPartId,
                      warehouse_id: vWarehouseId,
                    },
                    defaults: { quantity: 0 },
                    transaction: t,
                  });
                  await inventory.decrement("quantity", {
                    by: qty,
                    transaction: t,
                  });

                  results.success++;
                }
                break;

              case "expenses":
                if (row.amount && row.content) {
                  const expenseDate = parseImportDate(
                    row.expense_date,
                    detectedFormat,
                  );

                  let vehicleId = null;
                  if (row.engine_no || row.license_plate) {
                    const vehicle = await Vehicle.findOne({
                      where: {
                        [Op.or]: [
                          row.engine_no
                            ? { engine_no: "" + row.engine_no }
                            : null,
                          row.license_plate
                            ? { license_plate: "" + row.license_plate }
                            : null,
                        ].filter(Boolean),
                      },
                      transaction: t,
                    });
                    if (vehicle) vehicleId = vehicle.id;
                  }

                  let targetWarehouseId = warehouse_id;
                  if (!targetWarehouseId && row.warehouse_name) {
                    const wh = await Warehouse.findOne({
                      where: {
                        warehouse_name: { [Op.iLike]: row.warehouse_name },
                      },
                      transaction: t,
                    });
                    if (wh) targetWarehouseId = wh.id;
                  }

                  // Permission check
                  if (
                    req.user.role !== "ADMIN" &&
                    req.user.role !== "MANAGER"
                  ) {
                    if (req.user.expense_warehouses) {
                      const warehouseIds = req.user.expense_warehouses
                        .split(",")
                        .filter((id) => id.trim() !== "");
                      if (
                        targetWarehouseId &&
                        !warehouseIds.includes(targetWarehouseId)
                      ) {
                        throw new Error(
                          `Bạn không có quyền nhập chi tiêu cho kho '${row.warehouse_name}'`,
                        );
                      }
                    } else if (
                      targetWarehouseId &&
                      targetWarehouseId !== req.user.warehouse_id
                    ) {
                      throw new Error(
                        `Bạn không có quyền nhập chi tiêu cho kho '${row.warehouse_name}'`,
                      );
                    }
                  }

                  await Expense.create(
                    {
                      expense_date: expenseDate,
                      amount: Number(row.amount),
                      content: row.content,
                      notes: row.notes || "",
                      vehicle_id: vehicleId,
                      warehouse_id: targetWarehouseId || null,
                    },
                    { transaction: t },
                  );

                  results.success++;
                }
                break;

              case "maintenance":
                // Relaxed condition: at least an engine no, plate, customer name, OR part/service info must exist
                if (
                  row.engine_no ||
                  row.license_plate ||
                  row.customer_name ||
                  row.part_code ||
                  row.item_description
                ) {
                  const vWarehouseId =
                    enforcedWH ||
                    warehouseMap.get(
                      (row.warehouse_name || "").toLowerCase(),
                    ) ||
                    warehouse_id;

                  const maintenanceDate = parseImportDate(
                    row.maintenance_date,
                    detectedFormat,
                  );
                  const startDate = dayjs(maintenanceDate)
                    .startOf("day")
                    .toDate();
                  const endDate = dayjs(maintenanceDate).endOf("day").toDate();

                  const finalEngineNo = row.engine_no
                    ? String(row.engine_no).trim().toUpperCase()
                    : "";
                  const finalChassisNo = row.chassis_no
                    ? String(row.chassis_no).trim().toUpperCase()
                    : "";

                  // Check if vehicle exists in system and auto-fill info
                  let vehicle_id = null;
                  let is_internal = false;
                  let auto_customer_name = "";
                  let auto_phone = "";
                  let auto_address = "";
                  let auto_model = "";
                  let auto_plate = "";

                  if (finalEngineNo || finalChassisNo) {
                    const vehicle = await Vehicle.findOne({
                      where: {
                        [Op.or]: [
                          finalEngineNo ? { engine_no: finalEngineNo } : null,
                          finalChassisNo ? { chassis_no: finalChassisNo } : null,
                        ].filter(Boolean),
                      },
                      include: [{ model: VehicleType, attributes: ["name"] }],
                      transaction: t,
                    });
                    if (vehicle) {
                      vehicle_id = vehicle.id;
                      is_internal = true;
                      auto_model = vehicle.VehicleType?.name || "";

                      // Try to get customer info and plate from the last retail sale
                      const lastSale = await RetailSale.findOne({
                        where: {
                          engine_no: vehicle.engine_no,
                          chassis_no: vehicle.chassis_no,
                        },
                        order: [["sale_date", "DESC"]],
                        transaction: t,
                      });
                      if (lastSale) {
                        auto_customer_name = lastSale.customer_name;
                        auto_phone = lastSale.phone;
                        auto_address = lastSale.address;
                      }

                      // Try to get license plate from last maintenance if not in sale (since RetailSale doesn't have it)
                      const lastMaint = await MaintenanceOrder.findOne({
                        where: {
                          [Op.or]: [
                            { vehicle_id: vehicle.id },
                            { engine_no: vehicle.engine_no },
                          ],
                          license_plate: { [Op.ne]: null },
                        },
                        order: [["maintenance_date", "DESC"]],
                        transaction: t,
                      });
                      if (lastMaint) {
                        auto_plate = lastMaint.license_plate;
                        // If sale didn't have info, use maintenance info as second fallback
                        if (!auto_customer_name)
                          auto_customer_name = lastMaint.customer_name;
                        if (!auto_phone) auto_phone = lastMaint.customer_phone;
                        if (!auto_address)
                          auto_address = lastMaint.customer_address;
                      }
                    }
                  }

                  const finalCustomerName =
                    row.customer_name || auto_customer_name || "Khách lẻ";
                  const finalPhone =
                    row.phone || row.customer_phone || auto_phone || "";
                  const finalAddress =
                    row.address || row.customer_address || auto_address || "";
                  const finalModel = row.model_name || auto_model || "";
                  const finalPlate = row.license_plate || auto_plate || "";

                  // Find or create the order
                  let vOrder = await MaintenanceOrder.findOne({
                    where: {
                      maintenance_date: { [Op.between]: [startDate, endDate] },
                      warehouse_id: vWarehouseId,
                      [Op.or]: [
                        finalEngineNo ? { engine_no: finalEngineNo } : null,
                        finalPlate ? { license_plate: finalPlate } : null,
                        { customer_name: finalCustomerName },
                      ].filter(Boolean),
                    },
                    transaction: t,
                  });

                  if (!vOrder) {
                    vOrder = await MaintenanceOrder.create(
                      {
                        maintenance_date: maintenanceDate,
                        customer_name: finalCustomerName,
                        customer_phone: finalPhone,
                        customer_address: finalAddress,
                        license_plate: finalPlate,
                        engine_no: finalEngineNo,
                        chassis_no: finalChassisNo,
                        model_name: finalModel,
                        km_reading: Number(row.km_reading) || 0,
                        service_type: row.service_type || "Sửa chữa chung",
                        total_amount: 0, // Will be incremented by items
                        paid_amount: Number(row.paid_amount) || 0,
                        status: "COMPLETED",
                        warehouse_id: vWarehouseId,
                        created_by: req.user.id,
                        vehicle_id: vehicle_id,
                        is_internal_vehicle: is_internal,
                        consultation_notes: row.consultation_notes || "",
                      },
                      { transaction: t },
                    );
                  } else {
                    // Update notes if provided in subsequent rows
                    if (row.consultation_notes) {
                      await vOrder.update(
                        { consultation_notes: row.consultation_notes },
                        { transaction: t },
                      );
                    }
                  }

                  // If there is item info, add as MaintenanceItem and update order total
                  const qty = Number(row.quantity) || 1;
                  const price = Number(row.unit_price) || 0;
                  const itemTotal = qty * price;

                  if (row.part_code) {
                    const cleanPartCode = String(row.part_code)
                      .trim()
                      .toUpperCase();
                    const vPart = await Part.findOne({
                      where: { code: cleanPartCode },
                      transaction: t,
                    });

                    if (vPart) {
                      const finalPrice =
                        price || Number(vPart.selling_price) || 0;
                      const finalItemTotal = qty * finalPrice;

                      await MaintenanceItem.create(
                        {
                          maintenance_order_id: vOrder.id,
                          part_id: vPart.id,
                          quantity: qty,
                          unit_price: finalPrice,
                          total_price: finalItemTotal,
                          type: "PART",
                          description: row.item_description || vPart.name,
                          unit: row.unit || vPart.unit,
                        },
                        { transaction: t },
                      );
                      // Update order total
                      await vOrder.increment("total_amount", {
                        by: finalItemTotal,
                        transaction: t,
                      });

                      // Update Inventory (only if not explicitly skipped)
                      const skipDecrement =
                        String(row.update_inventory).toLowerCase() ===
                          "không" ||
                        String(row.update_inventory).toLowerCase() === "no";

                      if (!skipDecrement) {
                        const inventoryPartId = vPart.linked_part_id || vPart.id;
                        const [inventory] = await PartInventory.findOrCreate({
                          where: {
                            part_id: inventoryPartId,
                            warehouse_id: vWarehouseId,
                          },
                          defaults: { quantity: 0 },
                          transaction: t,
                        });
                        await inventory.decrement("quantity", {
                          by: qty * (vPart.default_conversion_rate || 1),
                          transaction: t,
                        });
                      }
                    } else {
                      // Part code provided but not found - treat as manual entry/service if name exists
                      await MaintenanceItem.create(
                        {
                          maintenance_order_id: vOrder.id,
                          quantity: qty,
                          unit_price: price,
                          total_price: itemTotal,
                          type: "SERVICE",
                          description:
                            row.item_description || row.part_code || "Dịch vụ",
                          unit: row.unit || "Lần",
                        },
                        { transaction: t },
                      );
                      await vOrder.increment("total_amount", {
                        by: itemTotal,
                        transaction: t,
                      });
                    }
                  } else if (row.item_description) {
                    // Service only item (no part code)
                    await MaintenanceItem.create(
                      {
                        maintenance_order_id: vOrder.id,
                        quantity: qty,
                        unit_price: price,
                        total_price: itemTotal,
                        type: "SERVICE",
                        description: row.item_description,
                        unit: row.unit || "Lần",
                      },
                      { transaction: t },
                    );
                    await vOrder.increment("total_amount", {
                      by: itemTotal,
                      transaction: t,
                    });
                  }
                  results.success++;
                }
                break;

              default:
                throw new Error("Loại dữ liệu không hợp lệ!");
            }
            // Row succeeded - release the savepoint to free resources
            await sequelize.query(`RELEASE SAVEPOINT row_sp_${rowIdx}`, {
              transaction: t,
            });
          } catch (err) {
            // For PostgreSQL: rollback to savepoint so the transaction is not fully aborted
            // This allows subsequent rows in the same chunk to still be processed
            try {
              await sequelize.query(`ROLLBACK TO SAVEPOINT row_sp_${rowIdx}`, {
                transaction: t,
              });
            } catch (_) {
              /* savepoint may not exist if error was before DB call */
            }
            results.failed++;
            results.errors.push(
              `Số máy/Tên: ${row.engine_no || row.name || row.code || "N/A"} -> ${err.message}`,
            );
          }
        } // End chunk loop

        await t.commit();
      } catch (err) {
        if (t) await t.rollback();
        // In case of a catastrophic chunk failure, we can continue or break.
        // For now, let's record it and continue next chunk.
        results.failed += chunk.length;
        results.errors.push(
          `Lỗi nghiêm trọng tại lô ${i / CHUNK_SIZE + 1}: ${err.message}`,
        );
      }
    } // End outer chunking loop

    // 🔔 SEND NOTIFICATION AFTER ALL CHUNKS PROCESSED
    if (results.success > 0) {
      const typeLabels = {
        colors: "danh mục màu",
        types: "danh mục loại xe",
        purchases: "lô hàng nhập",
        retail_sales: "đơn bán lẻ",
        wholesale_sales: "đơn bán buôn",
        suppliers: "nhà cung cấp",
        customers: "khách buôn",
        part_master: "danh mục phụ tùng",
        part_inventory: "tồn kho phụ tùng",
        part_retail_sales: "đơn bán lẻ phụ tùng",
        part_wholesale_sales: "đơn bán buôn phụ tùng",
        part_purchases: "nhập phụ tùng",
        part_locations: "vị trí phụ tùng",
        expenses: "danh sách chi tiêu",
        maintenance: "phiếu bảo trì",
      };
      await sendNotification(req, {
        title: `📥 Import Excel: ${typeLabels[type] || type}`,
        message: `Nhân viên ${req.user.full_name} đã nhập thành công ${results.success} bản ghi từ file Excel.`,
        type: "IMPORT_EXCEL",
        link: "/dashboard",
      });
    }

    res.json({
      message: `Đã xử lý xong: ${results.success} thành công, ${results.failed} thất bại.`,
      results,
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi import file: " + error.message });
  }
};

const exceljs = require("exceljs");

const downloadTemplate = async (req, res) => {
  try {
    const { type, warehouse_id } = req.query;
    const workbook = new exceljs.Workbook();
    const mainSheet = workbook.addWorksheet("Mau_Import");
    const dataSheet = workbook.addWorksheet("Data_Source"); // Will contain dropdown options

    // Hide data sheet from user
    dataSheet.state = "hidden";

    const templateColumns = {
      colors: ["Tên màu"],
      types: ["Tên loại xe", "Phân loại", "Tiền tố khung", "Tiền tố máy"],
      customers: ["Mã khách", "Tên khách", "Địa chỉ", "Hình thức TT"],
      suppliers: ["Tên NCC", "Địa chỉ", "Ghi chú", "Hình thức TT"],
      purchases: [
        "Số máy",
        "Số khung",
        "Loại xe",
        "Màu sắc",
        "Giá nhập",
        "Tên NCC",
        "Tên kho",
        "Ngày nhập",
      ],
      retail_sales: [
        "Ngày bán",
        "Số máy",
        "Tên khách",
        "Ngày sinh",
        "Số điện thoại",
        "Địa chỉ",
        "Số CMT/CCCD",
        "Giới tính",
        "Giá bán",
        "Tiền khách trả",
        "Hình thức TT",
        "Kiểu bán",
        "Người bảo lãnh",
        "SĐT người bảo lãnh",
        "Tên ngân hàng",
        "Số hợp đồng",
        "Số tiền vay",
        "Quà tặng",
        "Người bán",
        "Tên kho",
        "Phát sổ bảo hành",
      ],
      wholesale_sales: [
        "Ngày bán",
        "Số máy",
        "Mã khách hàng",
        "Giá bán lẻ",
        "Đã trả",
        "Hình thức TT",
        "Tên kho",
      ],
      part_master: [
        "Mã phụ tùng",
        "Tên phụ tùng",
        "Đơn vị tính",
        "Giá nhập",
        "Giá bán",
        "Phân loại mã",
        "Tỷ lệ quy đổi",
        "Mã liên kết",
        "Mô tả",
      ],
      part_inventory: ["Mã phụ tùng", "Số lượng tồn", "Kho"],
      part_retail_sales: [
        "Ngày bán",
        "Tên khách",
        "Số điện thoại",
        "Mã PT",
        "Số lượng",
        "Đơn giá",
        "Đã trả",
        "VAT (%)",
        "Tên kho",
      ],
      part_wholesale_sales: [
        "Ngày bán",
        "Mã khách hàng",
        "Mã PT",
        "Số lượng",
        "Giá sỉ",
        "Đã trả",
        "VAT (%)",
        "Tên kho",
      ],
      part_purchases: [
        "SỐ PO",
        "SỐ HOÁ ĐƠN HVN",
        "MÃ PHỤ TÙNG",
        "TÊN PHỤ TÙNG",
        "SỐ LƯỢNG",
        "DNP",
        "THÀNH TIỀN CHƯA VAT",
        "VAT",
        "VAT THÀNH TIỀN",
        "NGÀY NHẬP",
        "TÊN KHO",
        "TÊN NCC",
      ],
      expenses: [
        "Ngày chi",
        "Số tiền",
        "Nội dung chi",
        "Ghi chú",
        "Số máy",
        "Tên kho",
      ],
      part_locations: ["Mã phụ tùng", "Vị trí", "Tên kho"],
      maintenance: [
        "Ngày bảo trì",
        "Biển số",
        "Số máy",
        "Số khung",
        "Tên khách",
        "Số điện thoại",
        "Địa chỉ",
        "Loại xe",
        "Số KM",
        "Loại dịch vụ",
        "Ghi chú",
        "Mã PT",
        "Tên PT/Dịch vụ",
        "Số lượng",
        "Đơn giá",
        "Đã trả",
        "Tên kho",
        "Trừ kho (Có/Không)",
        "Ghi chú tư vấn",
      ],
    };

    const headers = templateColumns[type] || [];
    mainSheet.addRow(headers);

    // Stylize headers
    const headerRow = mainSheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    headerRow.alignment = { horizontal: "center" };

    // Auto height & width for header
    mainSheet.columns = headers.map((h) => ({ header: h, key: h, width: 20 }));

    const effectiveWarehouseId =
      warehouse_id ||
      (req.user.role === "STAFF" ? req.user.warehouse_id : null);

    // Conditional Part filtering: for sales imports, only show parts with stock in the target warehouse
    const partsQuery = {
      attributes: ["code", "name", "unit", "purchase_price"],
      order: [["code", "ASC"]],
    };
    const sellingTypes = [
      "retail_sales",
      "wholesale_sales",
      "part_retail_sales",
      "part_wholesale_sales",
      "part_inventory",
    ];
    if (sellingTypes.includes(type) && effectiveWarehouseId) {
      partsQuery.include = [
        {
          model: PartInventory,
          where: {
            warehouse_id: effectiveWarehouseId,
            quantity: { [Op.gt]: 0 },
          },
          required: true,
        },
      ];
    }

    // POPULATE DROPDOWNS IF NECESSARY
    const [
      types,
      colors,
      suppliers,
      warehouses,
      customers,
      parts,
      allUsers,
      allGifts,
    ] = await Promise.all([
      VehicleType.findAll({ attributes: ["name"], order: [["name", "ASC"]] }),
      VehicleColor.findAll({
        attributes: ["color_name"],
        order: [["color_name", "ASC"]],
      }),
      Supplier.findAll({ attributes: ["name"], order: [["name", "ASC"]] }),
      Warehouse.findAll({
        attributes: ["warehouse_name", "id"],
        order: [["warehouse_name", "ASC"]],
      }),
      WholesaleCustomer.findAll({
        attributes: ["customer_code"],
        order: [["customer_code", "ASC"]],
      }),
      Part.findAll(partsQuery),
      User.findAll({
        attributes: ["full_name"],
        order: [["full_name", "ASC"]],
      }),
      Gift.findAll({ attributes: ["name"], order: [["name", "ASC"]] }),
    ]);

    const engineWhere = { status: "In Stock" };
    if (effectiveWarehouseId) {
      engineWhere.warehouse_id = effectiveWarehouseId;
    }
    const engines = await Vehicle.findAll({
      where: engineWhere,
      attributes: ["engine_no"],
      order: [["engine_no", "ASC"]],
    });

    // Detailed Vehicle list for maintenance auto-fill (Full list, not just In Stock)
    let maintenanceVehicles = [];
    if (type === "maintenance") {
      maintenanceVehicles = await Vehicle.findAll({
        attributes: ["engine_no", "chassis_no"],
        include: [
          { model: VehicleType, attributes: ["name"] },
          {
            model: RetailSale,
            attributes: ["customer_name", "phone", "address"],
          },
          {
            model: MaintenanceOrder,
            attributes: [
              "license_plate",
              "customer_name",
              "customer_phone",
              "customer_address",
            ],
            separate: true,
            order: [["maintenance_date", "DESC"]],
            limit: 1,
          },
        ],
        order: [["engine_no", "ASC"]],
      });
    }

    const typeValues = types.map((t) => t.name);
    const colorValues = colors.map((c) => c.color_name);
    const supplierValues = suppliers.map((s) => s.name);

    let warehouseValues = warehouses.map((w) => w.warehouse_name);
    if (effectiveWarehouseId) {
      const wh = warehouses.find((w) => w.id === effectiveWarehouseId);
      if (wh) warehouseValues = [wh.warehouse_name];
    }

    const customerValues = customers.map((c) => c.customer_code);
    const partValues = parts.map((p) => p.code);
    const engineValues = engines.map((v) => v.engine_no);
    const paymentMethods = [
      "Trả góp",
      "Trả thẳng",
      "Trả gộp",
      "Chuyển khoản",
      "Trúng thưởng/Công nợ",
    ].sort();
    const warrantyOptions = ["Có", "Không"];
    const vehicleClasses = ["Xe ga", "Xe số", "Xe côn tay", "Khác"].sort();
    const units = ["Cái", "Bộ", "Lít", "Chiếc", "Thùng", "Hộp"].sort();
    const genderOptions = ["Nam", "Nữ"];
    const saleTypes = ["Hồ sơ xe", "Đăng ký"];
    const userValues = allUsers.map((u) => u.full_name);

    // Add values to Data_Source sheet (A=1, B=2, ...)
    typeValues.forEach((v, i) => (dataSheet.getCell(i + 1, 1).value = v));
    colorValues.forEach((v, i) => (dataSheet.getCell(i + 1, 2).value = v));
    supplierValues.forEach((v, i) => (dataSheet.getCell(i + 1, 3).value = v));
    warehouseValues.forEach((v, i) => (dataSheet.getCell(i + 1, 4).value = v));
    customerValues.forEach((v, i) => (dataSheet.getCell(i + 1, 5).value = v));
    // Part info for auto-fill: F=Code(6), G=Name(7), H=Unit(8), I=SellingPrice(9), J=PurchasePrice(10)
    parts.forEach((p, i) => {
      dataSheet.getCell(i + 1, 6).value = p.code;
      dataSheet.getCell(i + 1, 7).value = p.name;
      dataSheet.getCell(i + 1, 8).value = p.unit;
      dataSheet.getCell(i + 1, 9).value = Number(p.selling_price) || 0;
      dataSheet.getCell(i + 1, 10).value = Number(p.purchase_price) || 0;
    });
    engineValues.forEach((v, i) => (dataSheet.getCell(i + 1, 7).value = v));
    paymentMethods.forEach((v, i) => (dataSheet.getCell(i + 1, 8).value = v));
    warrantyOptions.forEach((v, i) => (dataSheet.getCell(i + 1, 9).value = v));
    vehicleClasses.forEach((v, i) => (dataSheet.getCell(i + 1, 10).value = v));
    units.forEach((v, i) => (dataSheet.getCell(i + 1, 11).value = v));
    genderOptions.forEach((v, i) => (dataSheet.getCell(i + 1, 15).value = v));
    saleTypes.forEach((v, i) => (dataSheet.getCell(i + 1, 16).value = v));
    userValues.forEach((v, i) => (dataSheet.getCell(i + 1, 17).value = v));
    const codeTypeValues = ["HONDA", "SELF_CREATED"];
    codeTypeValues.forEach((v, i) => (dataSheet.getCell(i + 1, 18).value = v));

    // Vehicle Data for Maintenance (Col 19-25)
    // S=19(Engine), T=20(Chassis), U=21(Plate), V=22(Model), W=23(Cust), X=24(Phone), Y=25(Address)
    maintenanceVehicles.forEach((v, i) => {
      const sale = v.RetailSale || {};
      const lastMaint = v.MaintenanceOrders?.[0] || {};

      dataSheet.getCell(i + 1, 19).value = v.engine_no;
      dataSheet.getCell(i + 1, 20).value = v.chassis_no;
      dataSheet.getCell(i + 1, 21).value = lastMaint.license_plate || "";
      dataSheet.getCell(i + 1, 22).value = v.VehicleType?.name || "";
      dataSheet.getCell(i + 1, 23).value =
        sale.customer_name || lastMaint.customer_name || "";
      dataSheet.getCell(i + 1, 24).value =
        sale.phone || lastMaint.customer_phone || "";
      dataSheet.getCell(i + 1, 25).value =
        sale.address || lastMaint.customer_address || "";
    });

    // Validation mapping: { HeaderName: { sourceColLetter, isSearchable, valuesCount } }
    const validationConfigs = {
      purchases: {
        "Loại xe": { col: "A", search: true },
        "Màu sắc": { col: "B", search: true },
        "Tên NCC": { col: "C", search: true },
        "Tên kho": { col: "D", search: true },
      },
      retail_sales: {
        "Số máy": { col: "G", search: true },
        "Tên kho": { col: "D", search: true },
        "Hình thức TT": {
          col: "H",
          search: false,
          count: paymentMethods.length,
        },
        "Phát sổ bảo hành": {
          col: "I",
          search: false,
          count: warrantyOptions.length,
        },
        "Giới tính": { col: "O", search: false, count: genderOptions.length },
        "Kiểu bán": { col: "P", search: false, count: saleTypes.length },
        "Người bán": { col: "Q", search: true },
      },
      wholesale_sales: {
        "Số máy": { col: "G", search: true },
        "Tên kho": { col: "D", search: true },
        "Mã khách hàng": { col: "E", search: true },
        "Hình thức TT": {
          col: "H",
          search: false,
          count: paymentMethods.length,
        },
      },
      part_inventory: {
        "Mã phụ tùng": { col: "F", search: true },
        Kho: { col: "D", search: true },
      },
      part_retail_sales: {
        "Mã PT": { col: "F", search: true },
        "Tên kho": { col: "D", search: true },
      },
      part_wholesale_sales: {
        "Mã PT": { col: "F", search: true },
        "Tên kho": { col: "D", search: true },
        "Mã khách hàng": { col: "E", search: true },
      },
      part_purchases: {
        "MÃ PHỤ TÙNG": { col: "F", search: true },
        "TÊN KHO": { col: "D", search: true },
        "TÊN NCC": { col: "C", search: true },
      },
      part_master: {
        "Đơn vị tính": { col: "K", search: false, count: units.length },
        "Phân loại mã": { col: "R", search: false, count: 2 },
        "Mã liên kết": { col: "F", search: true },
      },
      types: {
        "Phân loại": { col: "J", search: false, count: vehicleClasses.length },
      },
      suppliers: {
        "Hình thức TT": {
          col: "H",
          search: false,
          count: paymentMethods.length,
        },
      },
      customers: {
        "Hình thức TT": {
          col: "H",
          search: false,
          count: paymentMethods.length,
        },
      },
      expenses: {
        "Số máy": { col: "G", search: true },
        "Tên kho": { col: "D", search: true },
      },
      maintenance: {
        "Mã PT": { col: "F", search: true },
        "Tên kho": { col: "D", search: true },
        "Số máy": { col: "S", search: true }, // Use column S (19) for maintenance engine list
      },
    };

    const config = validationConfigs[type];
    if (config) {
      Object.keys(config).forEach((colName) => {
        const colIdx = headers.indexOf(colName) + 1;
        if (colIdx > 0) {
          const cfg = config[colName];
          const sourceCol = cfg.col;
          const mainColLetter = String.fromCharCode(64 + colIdx); // A, B, C...

          for (let i = 2; i <= 1000; i++) {
            const cell = mainSheet.getCell(i, colIdx);
            if (cfg.search) {
              // Dynamic OFFSET/MATCH formula for "Search as you type"
              // Requires source list to be sorted (we did it above)
              // Formula: =OFFSET(SourceStart, MATCH(TypedValue&"*", SourceRange, 0)-1, 0, COUNTIF(SourceRange, TypedValue&"*"), 1)
              const sourceRange = `Data_Source!$${sourceCol}:$${sourceCol}`;
              const firstCell = `Data_Source!$${sourceCol}$1`;

              cell.dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: [
                  `OFFSET(${firstCell}, MATCH(${mainColLetter}${i}&"*", ${sourceRange}, 0)-1, 0, COUNTIF(${sourceRange}, ${mainColLetter}${i}&"*"), 1)`,
                ],
                showErrorMessage: false, // Essential: allows typing partial value without Excel blocking it
                errorStyle: "information",
              };
            } else {
              // Standard List
              const count = cfg.count || 1;
              cell.dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: [
                  `Data_Source!$${sourceCol}$1:$${sourceCol}$${Math.max(1, count)}`,
                ],
              };
            }
          }
        }
      });

      // Special Formulas for Maintenance: Auto-fill vehicle/customer info from Engine No
      if (type === "maintenance") {
        // Biển số (B), Số máy (C), Số khung (D), Tên khách (E), SĐT (F), Địa chỉ (G), Loại xe (H)
        // Data_Source: Engine(S/19), Chassis(T/20), Plate(U/21), Model(V/22), Name(W/23), Phone(X/24), Address(Y/25)
        for (let i = 2; i <= 1000; i++) {
          // B (Plate) = VLOOKUP(C, Data_Source!S:Y, 3, FALSE)
          mainSheet.getCell(i, 2).value = {
            formula: `IFERROR(VLOOKUP(C${i}, Data_Source!$S:$Y, 3, FALSE), "")`,
          };
          // D (Chassis) = VLOOKUP(C, Data_Source!S:Y, 2, FALSE)
          mainSheet.getCell(i, 4).value = {
            formula: `IFERROR(VLOOKUP(C${i}, Data_Source!$S:$Y, 2, FALSE), "")`,
          };
          // E (Name) = VLOOKUP(C, Data_Source!S:Y, 5, FALSE)
          mainSheet.getCell(i, 5).value = {
            formula: `IFERROR(VLOOKUP(C${i}, Data_Source!$S:$Y, 5, FALSE), "")`,
          };
          // F (Phone) = VLOOKUP(C, Data_Source!S:Y, 6, FALSE)
          mainSheet.getCell(i, 6).value = {
            formula: `IFERROR(VLOOKUP(C${i}, Data_Source!$S:$Y, 6, FALSE), "")`,
          };
          // G (Address) = VLOOKUP(C, Data_Source!S:Y, 7, FALSE)
          mainSheet.getCell(i, 7).value = {
            formula: `IFERROR(VLOOKUP(C${i}, Data_Source!$S:$Y, 7, FALSE), "")`,
          };
          // H (Model) = VLOOKUP(C, Data_Source!S:Y, 4, FALSE)
          mainSheet.getCell(i, 8).value = {
            formula: `IFERROR(VLOOKUP(C${i}, Data_Source!$S:$Y, 4, FALSE), "")`,
          };

          // PART Auto-fill: L(Mã PT), M(Tên PT), O(Đơn giá)
          // Data_Source: Code(F/6), Name(G/7), Unit(H/8), SellingPrice(I/9)
          mainSheet.getCell(i, 13).value = {
            formula: `IFERROR(VLOOKUP(L${i}, Data_Source!$F:$I, 2, FALSE), "")`,
          };
          mainSheet.getCell(i, 15).value = {
            formula: `IFERROR(VLOOKUP(L${i}, Data_Source!$F:$I, 4, FALSE), 0)`,
          };
        }
      }
    }

    // AUTO-FILL Formulas for part_purchases
    if (type === "part_purchases") {
      // Column G = Thành tiền chưa VAT, H = VAT, I = VAT Thành tiền
      // Set Column H to Percentage format
      for (let i = 2; i <= 1000; i++) {
        mainSheet.getCell(i, 8).numFmt = "0%";
        mainSheet.getCell(i, 8).value = 0.08; // Default 8%
      }

      for (let i = 2; i <= 1000; i++) {
        // Column C = Mã PT (Dropdown), D = Tên PT, F = DNP (Price)z
        // Data_Source: Col F(6) = Code, Col L(12) = Name, Col N(14) = Price
        mainSheet.getCell(i, 4).value = {
          formula: `IFERROR(VLOOKUP(C${i}, Data_Source!$F:$N, 7, FALSE), "")`,
        };
        mainSheet.getCell(i, 6).value = {
          formula: `IFERROR(VLOOKUP(C${i}, Data_Source!$F:$N, 9, FALSE), 0)`,
        };
        // Thành tiền chưa VAT (G) = E * F
        mainSheet.getCell(i, 7).value = { formula: `E${i}*F${i}` };
        // VAT Thành tiền (I) = G * H (Excel handles % as decimal automatically)
        mainSheet.getCell(i, 9).value = { formula: `G${i}*H${i}` };
      }
    }

    // AUTO-FILL WAREHOUSE Column
    if (effectiveWarehouseId) {
      const wh = warehouses.find((w) => w.id === effectiveWarehouseId);
      if (wh) {
        const whName = wh.warehouse_name;
        const whColNames = ["TÊN KHO", "Tên kho", "Kho"];
        let whColIdx = 0;
        for (const name of whColNames) {
          const idx = headers.indexOf(name) + 1;
          if (idx > 0) {
            whColIdx = idx;
            break;
          }
        }

        // Fallback for part_purchases if not found
        if (whColIdx === 0 && type === "part_purchases") whColIdx = 11;

        if (whColIdx > 0) {
          for (let i = 2; i <= 1000; i++) {
            mainSheet.getCell(i, whColIdx).value = whName;
          }
        }
      }
    }

    // Send file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Mau_Export_${type}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi tạo file mẫu: " + error.message });
  }
};

module.exports = {
  importData,
  downloadTemplate,
};
