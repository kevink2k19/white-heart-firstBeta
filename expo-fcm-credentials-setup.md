# Expo Push Notifications — FCM V1 Credentials Setup (Step‑by‑Step)

This guide walks you through configuring **Android push notifications** for an Expo app using **Firebase Cloud Messaging (FCM) V1** credentials with EAS.

> Works with EAS Build/Submit and the Expo Push Service.

---

## Prerequisites
- An Expo project (`app.json` or `app.config.ts`).
- [EAS CLI](https://docs.expo.dev/eas/cli/) installed and authenticated: `npm i -g eas-cli` then `eas login`.
- Access to the **Firebase Console** for your app’s project.

---

## Option A — Create a new Google Service Account key (recommended)

1. **Create / choose a Firebase project**
   - Go to Firebase Console → create/select your project.

2. **Open Service Accounts**
   - Firebase Console → **Project settings** → **Service accounts**.

3. **Generate a private key**
   - Click **Generate new private key** → confirm.
   - A JSON file downloads. **Keep it secret** (do not commit to Git).

4. **Upload the key to EAS (Expo)**
   - **Using EAS CLI**
     ```sh
     eas credentials
     # Android > production > Google Service Account
     # Manage your Google Service Account Key for Push Notifications (FCM V1)
     # Set up a Google Service Account Key for Push Notifications (FCM V1)
     # Upload a new service account key (select the downloaded JSON)
     ```
     > Tip: If the JSON is in your project folder, EAS CLI will auto-detect it.
     Add the filename to `.gitignore`.

   - **Using expo.dev dashboard**
     1) Project **Settings** → **Credentials**  
     2) Android: add/select your **Application Identifier** (e.g. `com.yourcompany.app`)  
     3) Under **Service Credentials → FCM V1 service account key**, click **Add a service account key**  
     4) **Upload** the JSON and **Save**

5. **Add `google-services.json` to your project**
   - In Firebase Console, download **google-services.json** for your Android app.
   - Place it in your project (commonly the repo root or `./android/` as you prefer).
   - In `app.json`/`app.config`, reference it:
     ```json
     {
       "expo": {
         "android": {
           "googleServicesFile": "./path/to/google-services.json"
         }
       }
     }
     ```
     > You *may* commit `google-services.json` — it contains public identifiers (unlike the service account JSON).

6. **Done**
   - You can now send Android notifications via **Expo Push Notifications** using the **FCM V1** protocol.

---

## Option B — Use an existing Service Account key

1. **Grant the right role (if needed)**
   - Google Cloud Console → **IAM & Admin** → **Permissions**  
   - Edit the target **Principal** (service account) → **Add role** → **Firebase Messaging API Admin** → **Save**.

2. **Tell EAS which JSON to use**
   - **Using EAS CLI**
     ```sh
     eas credentials
     # Android > production > Google Service Account
     # Manage your Google Service Account Key for Push Notifications (FCM V1)
     # Set up a Google Service Account Key for Push Notifications (FCM V1)
     # Upload a new service account key (select your existing JSON)
     ```
   - **Using expo.dev dashboard**
     - Project **Settings** → **Credentials** → Android app →  
       **Service Credentials → FCM V1 service account key** → **Add a service account key** → **Upload** → **Save**.

3. **Ensure `google-services.json` is configured**
   - Download from Firebase if not already present.
   - Reference it in `app.json`/`app.config` as shown above.

4. **Done**
   - You can now send Android notifications via **Expo Push Notifications** using **FCM V1**.

---

## Verify your setup

- Build an Android app with EAS (`eas build -p android`), install it on a device, and register for push tokens.
- Send a test push via:
  - **Expo Push Service** (server/API) or
  - Your own server using FCM V1 with the uploaded service account.

If messages fail, re-check:
- The **FCM V1 service account key** is uploaded and linked to the **correct Android application identifier**.
- The app includes a valid **`google-services.json`** and the path is correct in `app.json`.
- The service account has **Firebase Messaging API Admin** permissions.

---

## Security notes
- **Never commit** the **service account JSON** to source control. Keep it in a safe location and reference it only during the EAS credentials upload.
- Limit service account permissions to what’s required (**Firebase Messaging API Admin**).
- Rotate keys if they are ever exposed.

---

## Frequently used commands
```sh
# Install EAS CLI (if needed)
npm i -g eas-cli

# Authenticate
eas login

# Manage Android credentials
eas credentials
```

---

*This summary follows the official Expo documentation flow for “Obtain Google Service Account Keys using FCM V1.”*

