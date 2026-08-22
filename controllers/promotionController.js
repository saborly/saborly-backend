// controllers/promotionController.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendPromotionalEmail } = require('../utils/emailService');

const UNSUBSCRIBE_EXPIRY = '365d';

const buildUnsubscribeUrl = (userId) => {
  const token = jwt.sign({ userId, purpose: 'email-unsubscribe' }, process.env.JWT_SECRET, {
    expiresIn: UNSUBSCRIBE_EXPIRY,
  });
  const base = process.env.BASE_URL || process.env.PUBLIC_API_URL || process.env.API_BASE_URL || '';
  return `${base}/api/v1/promotions/unsubscribe?token=${token}`;
};

// Build the query for users eligible to receive promotional emails.
// Promotions are sent to the whole customer base across every branch, not just
// the branch the admin happens to be viewing — so branchId is intentionally NOT filtered here.
const subscribedUsersQuery = () => ({
  role: 'user',
  isActive: true,
  email: { $exists: true, $ne: '' },
  'preferences.notifications.email': { $ne: false },
});

// GET /api/v1/promotions/recipients/count
exports.getRecipientCount = async (req, res) => {
  try {
    const count = await User.countDocuments(subscribedUsersQuery());
    res.status(200).json({ success: true, count });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error counting recipients',
      error: error.message,
    });
  }
};

// GET /api/v1/promotions/recipients?search=&page=&limit=
// Lists users eligible for promotional emails (already-unsubscribed users are excluded)
exports.getRecipients = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const { search } = req.query;

    const query = subscribedUsersQuery();
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('_id firstName lastName email authProvider')
        .sort({ firstName: 1, lastName: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      users,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching recipients',
      error: error.message,
    });
  }
};

// POST /api/v1/promotions/send
exports.sendPromotion = async (req, res) => {
  try {
    const { subject, title, message, imageUrl, ctaText, ctaUrl, userIds } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, message: 'Subject is required' });
    }
    if (!title?.trim() && !message?.trim() && !imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Add at least a title, message, or image before sending',
      });
    }

    const query = subscribedUsersQuery();
    if (Array.isArray(userIds) && userIds.length > 0) {
      query._id = { $in: userIds };
    }

    const users = await User.find(query).select('_id email firstName').lean();

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        sent: 0,
        failed: 0,
        total: 0,
        message: 'No subscribed recipients found',
      });
    }

    const results = await Promise.allSettled(
      users.map((user) =>
        sendPromotionalEmail(user.email, user.firstName, {
          subject: subject.trim(),
          title: title?.trim() || '',
          message: message?.trim() || '',
          imageUrl: imageUrl || '',
          ctaText: ctaText?.trim() || '',
          ctaUrl: ctaUrl?.trim() || '',
          unsubscribeUrl: buildUnsubscribeUrl(user._id),
        })
      )
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - sent;

    res.status(200).json({
      success: true,
      sent,
      failed,
      total: users.length,
      message: `Sent to ${sent} of ${users.length} subscribed users${failed ? ` (${failed} failed)` : ''}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error sending promotional email',
      error: error.message,
    });
  }
};

// GET /api/v1/promotions/unsubscribe?token=...  (public, no auth)
exports.unsubscribe = async (req, res) => {
  const { token } = req.query;
  const appName = process.env.APP_NAME || 'Saborly';

  const renderPage = (heading, body) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${heading} - ${appName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f4f4; margin:0; padding:0; }
          .box { max-width: 480px; margin: 80px auto; background:#fff; border-radius:12px; padding:40px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.1); }
          h1 { color:#0f172a; font-size:22px; margin-bottom:12px; }
          p { color:#475569; font-size:15px; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>${heading}</h1>
          <p>${body}</p>
        </div>
      </body>
    </html>
  `;

  if (!token) {
    return res.status(400).send(renderPage('Invalid link', 'This unsubscribe link is missing required information.'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose !== 'email-unsubscribe' || !decoded.userId) {
      return res.status(400).send(renderPage('Invalid link', 'This unsubscribe link is not valid.'));
    }

    await User.updateOne(
      { _id: decoded.userId },
      { $set: { 'preferences.notifications.email': false } }
    );

    return res.status(200).send(
      renderPage('You have been unsubscribed', `You will no longer receive promotional emails from ${appName}.`)
    );
  } catch (error) {
    return res.status(400).send(renderPage('Link expired', 'This unsubscribe link is no longer valid.'));
  }
};
