// config/firebase.js
require('dotenv').config();

if (!admin.apps.length) {
  try {
    const requiredVars = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required env vars: ${missingVars.join(', ')}`);
    }

    let privateKey = process.env.FIREBASE_PRIVATE_KEY.trim();

    // Remove quotes AND fix escaped newlines
    privateKey = privateKey
      .replace(/^"|"$/g, '')     // strip outer quotes
      .replace(/\\n/g, '\n')     // convert \n → real newline
      .replace(/\r\n/g, '\n')    // handle Windows line endings
      .trim();

    // Validate PEM format
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || 
        !privateKey.includes('-----END PRIVATE KEY-----')) {
      throw new Error('Invalid PEM format in FIREBASE_PRIVATE_KEY');
    }

    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('Firebase Admin initialized @chitral_travel');
  } catch (error) {
    console.error('Firebase Admin init failed:', error.message);
    throw error;
  }
} else {
  console.log('Firebase Admin already initialized');
}

module.exports = admin;