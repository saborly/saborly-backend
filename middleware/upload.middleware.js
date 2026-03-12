/**
 * upload.middleware.js
 * Multer-based local disk storage middleware for image uploads.
 * Saves files to /uploads/images/ with uuid+timestamp filenames.
 * Allows jpeg, png, webp, gif — max 5 MB per file.
 */

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// Use Node.js built-in crypto instead of uuid package (avoids ESM compatibility issues)
const uuidv4 = () => crypto.randomUUID();

// ─── Ensure upload directory exists ────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'images');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ─── Storage engine ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}-${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

// ─── File-type filter ──────────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
    err.message = 'Unsupported file type. Only JPEG, PNG, WebP and GIF are allowed.';
    err.statusCode = 415;
    cb(err, false);
  }
};

// ─── Base multer instance ──────────────────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

// ─── Error handler wrapper ─────────────────────────────────────────────────────
/**
 * Wraps a multer middleware and converts multer errors into clean JSON responses.
 * @param {Function} multerMiddleware - result of upload.single() or upload.array()
 * @returns Express middleware
 */
function wrapMulter(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            message: 'File too large. Maximum allowed size is 5 MB.',
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE' && err.statusCode === 415) {
          return res.status(415).json({
            success: false,
            message: err.message,
          });
        }
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`,
        });
      }

      // Unknown errors
      return res.status(500).json({
        success: false,
        message: 'An unexpected error occurred during file upload.',
      });
    });
  };
}

// ─── Public helpers ────────────────────────────────────────────────────────────

/**
 * Middleware that accepts a single file from the given field name.
 * @param {string} fieldName - Form-data field name
 */
const uploadSingle = (fieldName) => wrapMulter(upload.single(fieldName));

/**
 * Middleware that accepts multiple files from the given field name.
 * @param {string} fieldName  - Form-data field name
 * @param {number} maxCount   - Maximum number of files (default 10)
 */
const uploadMultiple = (fieldName, maxCount = 10) =>
  wrapMulter(upload.array(fieldName, maxCount));

module.exports = { uploadSingle, uploadMultiple };
