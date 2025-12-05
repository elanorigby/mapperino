# Firebase Setup Guide

This guide will help you set up Firebase for the Mapperino app.

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Name it (e.g., "mapperino")
4. Follow the setup wizard (you can disable Google Analytics if not needed)

## 2. Register Your Web App

1. In your Firebase project, click the web icon (`</>`) to add a web app
2. Register the app with a nickname (e.g., "mapperino-web")
3. Copy the Firebase configuration object and add the values to your .env / github secrets

```

## 3. Enable Firestore

1. In the Firebase Console, go to **Build** > **Firestore Database**
2. Click **Create database**
3. Choose **Start in production mode** (we'll add rules next)
4. Select a location (choose one close to your users, e.g., `europe-west2` for UK)

## 4. Set Up Firestore Security Rules

1. In Firestore, go to the **Rules** tab
2. Copy the contents of `firestore.rules` from this repo
3. Paste into the Firebase console and click **Publish**

The rules currently allow all reads/writes since authentication is handled by the client-side password gate. For stronger security, you could:
- Add Firebase Authentication
- Restrict writes to authenticated users only
- Add more granular rules

## 5. Configure Environment Variables

1. Copy `.env.example` to `.env`
2. Fill in your Firebase config values from step 2:

```bash
VITE_APP_PASSWORD=your_password_here

VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

## 6. Test Locally

```bash
npm run dev
```

Navigate to `/brent/` and test:
1. Enter the password
2. Click a segment to change color
3. Open in another browser/tab
4. Changes should sync in real-time!

## 7. Deploy

When deploying to GitHub Pages (or any static host):
1. Make sure your `.env` values are set in GitHub Secrets
2. Configure your build process to inject them
3. Or manually set them in your hosting provider's environment variables

## Firestore Data Structure

```
segments (collection)
  └── brent (document)
      ├── segment_0: "#FF0000"
      ├── segment_1: "#00FF00"
      └── ... (all segment IDs with their colors)
```

## Security Notes

- The current setup uses open Firestore rules with client-side password protection
- This is suitable for internal tools with low security requirements
- For production apps with sensitive data, implement Firebase Authentication
- Consider rate limiting if you expect high traffic
