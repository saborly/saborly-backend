/**
 * fileHelper.js
 * Utility helpers for managing locally-stored files.
 */

const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'images');

/**
 * Deletes a locally stored image file by filename.
 * Silently ignores ENOENT (file already gone).
 *
 * @param {string} filename - The bare filename (e.g. "abc-123.jpg"), NOT the full URL.
 */
function deleteLocalFile(filename) {
  if (!filename) return;

  // Accept a full URL like http://localhost:5000/uploads/images/foo.jpg
  // or a path like /uploads/images/foo.jpg — extract just the basename.
  const basename = path.basename(filename);
  const filePath = path.join(UPLOAD_DIR, basename);

  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Log unexpected errors (permissions, etc.) but don't throw
      console.error(`[fileHelper] Failed to delete file "${filePath}":`, err.message);
    }
  }
}

/**
 * Extracts the filename from a full image URL or path.
 * Returns null if the input is falsy or not a local upload URL.
 *
 * @param {string} imageUrl - Full URL, e.g. "http://localhost:5000/uploads/images/foo.jpg"
 * @returns {string|null}
 */
function extractFilename(imageUrl) {
  if (!imageUrl) return null;
  // Only handle URLs that contain our upload path
  if (!imageUrl.includes('/uploads/images/')) return null;
  return path.basename(imageUrl);
}

module.exports = { deleteLocalFile, extractFilename };
