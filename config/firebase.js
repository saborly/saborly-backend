const admin = require('firebase-admin');
require('dotenv').config();

if (!admin.apps.length) {
  try {
    let serviceAccount;

    // Method 1: Use full JSON service account (recommended for Vercel)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        console.log('✅ Using full service account JSON');
      } catch (parseError) {
        console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', parseError.message);
        throw parseError;
      }
    } 
    // Method 2: Use individual environment variables (fallback)
    else {
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

      // Try to fix common formatting issues
      if (privateKey.startsWith('"') || privateKey.startsWith("'")) {
        privateKey = privateKey.slice(1, -1);
      }
      
      // Replace literal \n with actual newlines
      privateKey = privateKey.split('\\n').join('\n');

      // Log first/last few characters for debugging (without exposing key)
      console.log('Private key starts with:', privateKey.substring(0, 30));
      console.log('Private key ends with:', privateKey.substring(privateKey.length - 30));
      console.log('Private key length:', privateKey.length);
      console.log('Contains newlines:', privateKey.includes('\n'));

      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      };
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    console.error('Full error:', error);
    throw error;
  }
} else {
  console.log('ℹ️ Firebase Admin already initialized');
}

module.exports = admin;