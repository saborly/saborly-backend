const admin = require('firebase-admin');
require('dotenv').config();

if (!admin.apps.length) {
  try {
    let serviceAccount;

    // Decode from Base64 (works on Vercel)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      console.log('📦 Decoding service account from Base64...');
      const decoded = Buffer.from(
        process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
        'base64'
      ).toString('utf-8');

      serviceAccount = JSON.parse(decoded);
      console.log('✅ Service account decoded successfully');
      console.log('   Project ID:', serviceAccount.project_id);
      console.log('   Client Email:', serviceAccount.client_email);
    } else {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable is not set');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('🔥 Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed');
    console.error('Error message:', error.message);
    throw error;
  }
} else {
  console.log('ℹ️  Firebase Admin already initialized');
}

module.exports = admin;