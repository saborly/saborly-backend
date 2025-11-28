# Firebase SenderId Mismatch - Fix Guide

## Problem
You're getting the error: `FirebaseMessagingError: SenderId mismatch`

This happens when:
- Your **client apps** (Flutter/Android) generate FCM tokens using one Firebase project
- Your **backend** tries to send notifications using a different Firebase project's service account

## Root Cause
Your codebase uses **multiple Firebase projects**:

1. **saborly-frontend** (Customer App)
   - Project ID: `saborly-397b6`
   - Sender ID: `420029681993`
   - Config: `saborly-frontend/lib/firebase_options.dart`

2. **soleyadinoe** (Admin App)
   - Project ID: `saborly`
   - Sender ID: `361344460853`
   - Config: `soleyadinoe/lib/firebase_options.dart`

3. **Backend** (soleybackend)
   - Currently using: `FIREBASE_PROJECT_ID` from `.env`
   - Must match the project that generated the FCM tokens

## Solution

### Step 1: Identify Which App is Failing
Check the error logs to see which user/app is experiencing the issue:
- If it's a customer → Use project `saborly-397b6`
- If it's an admin → Use project `saborly`

### Step 2: Update Backend Environment Variables

#### Option A: Use the Customer App Project (saborly-397b6)
```env
FIREBASE_PROJECT_ID=saborly-397b6
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@saborly-397b6.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

#### Option B: Use the Admin App Project (saborly)
```env
FIREBASE_PROJECT_ID=saborly
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@saborly.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Step 3: Get the Correct Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select the correct project (`saborly-397b6` or `saborly`)
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Download the JSON file
6. Extract the values:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY`

### Step 4: Handle Existing FCM Tokens

If users already have FCM tokens from the wrong project, they need to:
1. **Re-login** to the app (this will generate a new FCM token)
2. Or **clear app data** and reinstall the app

### Step 5: Verify the Fix

After updating the environment variables:
1. Restart your backend server
2. Check the logs - you should see:
   ```
   ✅ Firebase Admin initialized
   📋 Firebase Project ID: saborly-397b6 (or saborly)
   ```
3. Try sending a notification again
4. The error should be resolved

## Alternative: Support Multiple Projects

If you need to support both projects, you would need to:
1. Initialize multiple Firebase Admin instances
2. Detect which project a token belongs to
3. Route notifications to the correct project

This is more complex and usually not necessary if you can standardize on one project.

## Quick Check Commands

To verify your current backend configuration:
```bash
# Check what project ID is configured
echo $FIREBASE_PROJECT_ID

# Or check the .env file
cat soleybackend/.env | grep FIREBASE_PROJECT_ID
```

## Expected Client App Configurations

### saborly-frontend
- File: `saborly-frontend/lib/firebase_options.dart`
- Project: `saborly-397b6`
- Sender ID: `420029681993`

### soleyadinoe
- File: `soleyadinoe/lib/firebase_options.dart`
- Project: `saborly`
- Sender ID: `361344460853`

Make sure your backend matches the project that your users' apps are using!

