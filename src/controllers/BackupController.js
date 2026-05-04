const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const os = require("os");
const fixDatabaseSchema = require("../fixDb");

// Cấu hình S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Xóa dòng gán cứng BUCKET_NAME để lấy động từ process.env trong các hàm

// Lấy danh sách các bản backup từ S3
exports.listBackups = async (req, res) => {
  try {
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    if (!bucketName) {
      return res.status(500).json({ message: "Chưa cấu hình AWS_S3_BUCKET_NAME trong biến môi trường server" });
    }

    const command = new ListObjectsV2Command({
      Bucket: bucketName,
    });

    const response = await s3Client.send(command);
    
    const files = (response.Contents || [])
      .map((file) => ({
        key: file.Key,
        name: file.Key, 
        size: file.Size,
        lastModified: file.LastModified,
      }))
      .sort((a, b) => b.lastModified - a.lastModified);

    res.json(files);
  } catch (error) {
    console.error("S3 List Error:", error);
    res.status(500).json({ message: "Lỗi khi lấy danh sách từ S3: " + error.message });
  }
};

// Tạo Pre-signed URL để tải file
exports.getDownloadUrl = async (req, res) => {
  try {
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    const { key } = req.query;
    if (!key) {
      return res.status(400).json({ message: "Thiếu tên file cần tải" });
    }
    if (!bucketName) {
      return res.status(500).json({ message: "Chưa cấu hình AWS_S3_BUCKET_NAME" });
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 600 });
    res.json({ downloadUrl: url });
  } catch (error) {
    console.error("S3 Signed URL Error:", error);
    res.status(500).json({ message: "Lỗi khi tạo link tải: " + error.message });
  }
};

// Tạo bản backup mới và tải lên S3
exports.createBackup = async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `backup_${timestamp}.sql`;
  const filePath = path.join(os.tmpdir(), fileName);
  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  
  try {
    if (!bucketName) throw new Error("Chưa cấu hình AWS_S3_BUCKET_NAME");
    
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("Chưa cấu hình DATABASE_URL trong .env");

    console.log(`Starting backup: ${fileName}...`);
    
    // Tách các thành phần từ dbUrl để lấy mật khẩu
    // URL format: postgres://user:password@host:port/dbname
    const url = new URL(dbUrl);
    const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };

    const command = `pg_dump "${dbUrl}" --clean --if-exists -f "${filePath}"`;

    await new Promise((resolve, reject) => {
      exec(command, { env }, (error, stdout, stderr) => {
        if (error) {
          console.error(`pg_dump error: ${error}`);
          return reject(error);
        }
        resolve();
      });
    });

    const fileContent = fs.readFileSync(filePath);
    const uploadCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: fileContent,
    });

    await s3Client.send(uploadCommand);
    fs.unlinkSync(filePath);

    res.json({ message: "Đã tạo và tải bản sao lưu lên S3 thành công!", fileName });
  } catch (error) {
    console.error("Backup Creation Error:", error);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ message: "Lỗi khi tạo bản sao lưu: " + error.message });
  }
};

// Khôi phục dữ liệu từ bản backup trên S3
exports.restoreBackup = async (req, res) => {
  const { key } = req.body;
  const dbUrl = process.env.DATABASE_URL;

  if (!key) return res.status(400).json({ message: "Thiếu file để khôi phục" });
  if (!dbUrl) return res.status(500).json({ message: "Chưa cấu hình DATABASE_URL" });

  const fileName = key.replace(/\//g, "_");
  const tempFilePath = path.join(os.tmpdir(), fileName);
  let sqlFilePath = tempFilePath;

  try {
    console.log(`\n=== BẮT ĐẦU KHÔI PHỤC: ${key} ===`);
    
    // Tách mật khẩu để psql không hỏi
    const url = new URL(dbUrl);
    const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };

    // 1. Tải file từ S3
    console.log("1. Đang tải file từ S3...");
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    if (!bucketName) throw new Error("Chưa cấu hình AWS_S3_BUCKET_NAME");

    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const response = await s3Client.send(getCommand);
    await pipeline(response.Body, fs.createWriteStream(tempFilePath));
    console.log("-> Đã tải xong file tạm.");

    // 2. Làm sạch Database
    console.log("2. Đang dọn dẹp Database (Nuclear Restore)...");
    const cleanCmd = `psql "${dbUrl}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`;
    await new Promise((resolve, reject) => {
      exec(cleanCmd, { env }, (error, stdout, stderr) => {
        if (error) {
          console.error("Lỗi xóa schema:", stderr);
          return reject(new Error(`Lỗi xóa schema: ${stderr}`));
        }
        resolve();
      });
    });
    console.log("-> Đã dọn dẹp xong.");

    // 3. Giải nén nếu là file .gz
    if (key.endsWith('.gz')) {
      sqlFilePath = tempFilePath + "_decompressed.sql";
      const zlib = require('zlib');
      console.log("3. Đang giải nén file .gz...");
      await pipeline(
        fs.createReadStream(tempFilePath),
        zlib.createGunzip(),
        fs.createWriteStream(sqlFilePath)
      );
      console.log("-> Đã giải nén xong.");
    } else {
      console.log("3. File không nén, bỏ qua bước giải nén.");
    }

    // 4. Nạp dữ liệu
    console.log("4. Đang nạp dữ liệu bằng psql...");
    const restoreCmd = `psql "${dbUrl}" -f "${sqlFilePath}"`;
    await new Promise((resolve, reject) => {
      exec(restoreCmd, { env }, (error, stdout, stderr) => {
        // psql có thể in thông tin ra stderr ngay cả khi thành công (ví dụ: NOTICE)
        // nên ta chỉ reject nếu có error thực sự từ tiến trình
        if (error) {
          console.error("Lỗi nạp dữ liệu psql:", stderr);
          return reject(new Error(`Lỗi nạp dữ liệu: ${stderr}`));
        }
        console.log("-> Nạp dữ liệu hoàn tất.");
        resolve();
      });
    });

    console.log("=== KHÔI PHỤC THÀNH CÔNG! ===");
    
    // Tự động kiểm tra và sửa cấu trúc DB sau khi restore (để thêm các cột mới nếu bản backup cũ thiếu)
    console.log("5. Đang kiểm tra và đồng bộ cấu trúc database mới...");
    await fixDatabaseSchema();
    
    res.json({ message: "Khôi phục dữ liệu thành công và đã đồng bộ cấu trúc mới!" });

  } catch (error) {
    console.error("!!! LỖI KHÔI PHỤC !!!:", error.message);
    res.status(500).json({ message: "Lỗi khi khôi phục dữ liệu: " + error.message });
  } finally {
    // Dọn dẹp file tạm
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (sqlFilePath !== tempFilePath && fs.existsSync(sqlFilePath)) fs.unlinkSync(sqlFilePath);
      console.log("-> Đã dọn dẹp file tạm.");
    } catch (e) {
      console.warn("Lỗi khi xóa file tạm:", e.message);
    }
  }
};
