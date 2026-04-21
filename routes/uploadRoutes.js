/**
 * uploadRoutes.js
 * Dedicated endpoints for uploading images to local disk storage.
 *
 * POST /api/v1/upload/image        — upload a single image, returns imageUrl
 * POST /api/v1/upload/images       — upload up to 10 images, returns imageUrls[]
 * DELETE /api/v1/upload/image      — delete an image by filename (body: { filename })
 *
 * All write endpoints require admin or manager role.
 */

const express = require('express');
const router = express.Router();

const { auth, authorize } = require('../middleware/auth');
const { attachBranchToRequest, resolveBranchContext } = require('../middleware/branchContext');
const { uploadSingle, uploadMultiple } = require('../middleware/upload.middleware');
const { deleteLocalFile } = require('../utils/fileHelper');

// ─── Upload single image ───────────────────────────────────────────────────────
// @route   POST /api/v1/upload/image
// @access  Private (admin / manager)
// @body    multipart/form-data  field: "image"
// @returns { success, imageUrl }
router.post(
  '/image',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  uploadSingle('image'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided. Use field name "image".',
      });
    }

    const imageUrl = `${process.env.BASE_URL}/uploads/images/${req.file.filename}`;

    return res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      imageUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  }
);

// ─── Upload multiple images ────────────────────────────────────────────────────
// @route   POST /api/v1/upload/images
// @access  Private (admin / manager)
// @body    multipart/form-data  field: "images" (up to 10 files)
// @returns { success, imageUrls[] }
router.post(
  '/images',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  uploadMultiple('images', 10),
  (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files provided. Use field name "images".',
      });
    }

    const imageUrls = req.files.map((file) => ({
      imageUrl: `${process.env.BASE_URL}/uploads/images/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
    }));

    return res.status(201).json({
      success: true,
      message: `${imageUrls.length} image(s) uploaded successfully`,
      images: imageUrls,
    });
  }
);

// ─── Delete an image ───────────────────────────────────────────────────────────
// @route   DELETE /api/v1/upload/image
// @access  Private (admin / manager)
// @body    { filename: "abc-123.jpg" }  OR  { imageUrl: "http://…/uploads/images/abc-123.jpg" }
// @returns { success, message }
router.delete(
  '/image',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  (req, res) => {
    const { filename, imageUrl } = req.body;

    if (!filename && !imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Provide either "filename" or "imageUrl" in the request body.',
      });
    }

    // Prefer explicit filename; fall back to parsing the URL
    const target = filename || imageUrl;
    deleteLocalFile(target);

    return res.json({
      success: true,
      message: 'Image deleted successfully',
    });
  }
);

module.exports = router;
