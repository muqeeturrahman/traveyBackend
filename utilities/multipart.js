import multer from "multer";
import path from "path";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, extname, basename, join } from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS__KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const s3Storage = multerS3({
  s3,
  bucket: process.env.S3_BUCKET_NAME,
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    cb(null, fileName);
  },
});

const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, join("uploads", "users"));
  },
  filename: (req, file, cb) => {
    const extension = extname(file.originalname);
    const baseName = basename(file.originalname, extension).replace(/\s+/g, "-");
    const finalName = `${baseName}-${Date.now()}${extension}`;
    cb(null, finalName);
  },
});

const handleMultipartData = multer({
  storage: s3Storage,
  limits: {
    fileSize: 1024 * 1024 * 100, // 100MB
  },
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif|mp4|mp3|mpeg/;
    const isValidFile = fileTypes.test(extname(file.originalname).toLowerCase());
    if (isValidFile) {
      cb(null, true);
    } else {
      cb(new Error("File type not supported"), false);
    }
  },
});

export { handleMultipartData };
