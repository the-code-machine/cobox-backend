import multer from "multer";
import path from "path";
import fs from "fs";

// Define storage paths relative to project root
const UPLOAD_ROOT = path.join(process.cwd(), "storage");
const THUMBNAIL_DIR = path.join(UPLOAD_ROOT, "thumbnails");
const GAMES_DIR = path.join(UPLOAD_ROOT, "games");
// Ensure directories exist on the Ubuntu server
[UPLOAD_ROOT, THUMBNAIL_DIR, GAMES_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "thumbnail") {
      cb(null, THUMBNAIL_DIR);
    } else {
      cb(null, GAMES_DIR);
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-random-originalName
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB Limit
});
