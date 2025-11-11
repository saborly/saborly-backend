const admin = require('firebase-admin');
require('dotenv').config();

if (!admin.apps.length) {
  try {
    const requiredVars = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY'
    ];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required env vars: ${missingVars.join(', ')}`);
    }

    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!privateKey) throw new Error('FIREBASE_PRIVATE_KEY is not defined');

    // ✅ Enhanced parsing for both local and Vercel
    privateKey = privateKey
      .replace(/^["']|["']$/g, '')  // Remove wrapping quotes (single or double)
      .replace(/\\\\n/g, '\\n')     // Handle double-escaped newlines first
      .replace(/\\n/g, '\n')        // Convert \n to actual newlines
      .trim();                       // Remove any extra whitespace

    // Validate the key format
    if (!privateKey.includes('BEGIN PRIVATE KEY')) {
      throw new Error('Invalid private key format');
    }

    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('✅ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Firebase Admin init failed:', error.message);
    throw error;
  }
} else {
  console.log('ℹ️ Firebase Admin already initialized');
}

module.exports = admin;