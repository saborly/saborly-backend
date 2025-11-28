# FCM Token Registration Fix

## Problem
FCM tokens were not being saved during customer registration (both manual and Google sign-in). Users had empty `fcmTokens` arrays, causing notifications to fail.

## Solution
Updated all authentication endpoints to accept and save FCM tokens during registration and login.

## Changes Made

### ✅ Updated Endpoints

1. **POST `/api/v1/auth/verify-registration`** (Manual Registration)
   - Now accepts optional `fcmToken`, `deviceId`, and `platform` parameters
   - Saves FCM token immediately after user creation

2. **POST `/api/v1/auth/google-signin`** (Google Sign-In Mobile)
   - Now accepts optional `fcmToken`, `deviceId`, and `platform` parameters
   - Saves FCM token for both new registrations and existing user logins

3. **POST `/api/v1/auth/google-signin-web`** (Google Sign-In Web)
   - Now accepts optional `fcmToken`, `deviceId`, and `platform` parameters
   - Saves FCM token for both new registrations and existing user logins

4. **POST `/api/v1/auth/login`** (Email/Password Login)
   - Now accepts optional `fcmToken`, `deviceId`, and `platform` parameters
   - Updates FCM token during login

## Customer App Requirements

The customer app (`saborly-frontend`) needs to send the FCM token during registration and login. Here's what needs to be updated:

### 1. Registration Flow
When calling `/api/v1/auth/verify-registration`, include:
```dart
{
  "email": "user@example.com",
  "otp": "123456",
  "fcmToken": "FCM_TOKEN_HERE",  // ✅ Add this
  "deviceId": "device_unique_id", // ✅ Add this (optional)
  "platform": "android"           // ✅ Add this (optional, defaults to 'android')
}
```

### 2. Google Sign-In Flow
When calling `/api/v1/auth/google-signin`, include:
```dart
{
  "idToken": "GOOGLE_ID_TOKEN",
  "fcmToken": "FCM_TOKEN_HERE",   // ✅ Add this
  "deviceId": "device_unique_id",  // ✅ Add this (optional)
  "platform": "android"            // ✅ Add this (optional)
}
```

### 3. Login Flow
When calling `/api/v1/auth/login`, include:
```dart
{
  "email": "user@example.com",
  "password": "password",
  "fcmToken": "FCM_TOKEN_HERE",    // ✅ Add this
  "deviceId": "device_unique_id",  // ✅ Add this (optional)
  "platform": "android"            // ✅ Add this (optional)
}
```

## Backend Behavior

- ✅ FCM token is saved immediately during registration/login
- ✅ If FCM token save fails, registration/login still succeeds (non-blocking)
- ✅ Errors are logged but don't prevent authentication
- ✅ Token is saved to both `fcmToken` (primary) and `fcmTokens` array

## Testing

After updating the customer app to send FCM tokens:

1. **Test Manual Registration:**
   - Register a new user
   - Check database: `user.fcmToken` should be populated
   - Check database: `user.fcmTokens` array should have one entry

2. **Test Google Sign-In:**
   - Sign in with Google (new user)
   - Check database: FCM token should be saved
   - Sign in with Google (existing user)
   - Check database: FCM token should be updated

3. **Test Login:**
   - Login with email/password
   - Check database: FCM token should be updated

4. **Test Notifications:**
   - Create an order
   - User should receive notification
   - Check logs: Should see "✅ Successfully sent notification" instead of "User has no FCM token"

## Notes

- All FCM token parameters are **optional** - existing apps will continue to work
- If FCM token is not provided, registration/login still works normally
- The separate `/api/v1/auth/fcm-token` endpoint still exists for updating tokens after login
- Multiple devices are supported via the `fcmTokens` array

