import fs from 'fs';
import path from 'path';

const androidAppDir = path.resolve(process.cwd(), 'android', 'app');

if (!fs.existsSync(androidAppDir)) {
  console.log('[configure-android] android/app not found yet, skipping.');
  process.exit(0);
}

// 1. Ensure WorkManager dependency in android/app/build.gradle
const appGradlePath = path.join(androidAppDir, 'build.gradle');
if (fs.existsSync(appGradlePath)) {
  let gradle = fs.readFileSync(appGradlePath, 'utf8');
  if (!gradle.includes('androidx.work:work-runtime')) {
    gradle = gradle.replace(
      /(implementation "androidx\.core:core-splashscreen:[^"]+"\r?\n)/,
      `$1    implementation "androidx.work:work-runtime:2.9.0"\n`
    );
    fs.writeFileSync(appGradlePath, gradle, 'utf8');
    console.log('[configure-android] Added androidx.work:work-runtime:2.9.0 to build.gradle');
  }
}

// 2. Ensure AndroidManifest.xml permissions & optional telephony hardware feature
const manifestPath = path.join(androidAppDir, 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  if (!manifest.includes('android.hardware.telephony')) {
    manifest = manifest.replace(
      '<application',
      '    <uses-feature android:name="android.hardware.telephony" android:required="false" />\n\n    <application'
    );
  }
  const requiredPermissions = [
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.WAKE_LOCK',
    'android.permission.SEND_SMS',
    'android.permission.READ_PHONE_STATE',
  ];
  for (const perm of requiredPermissions) {
    if (!manifest.includes(perm)) {
      manifest = manifest.replace(
        '</manifest>',
        `    <uses-permission android:name="${perm}" />\n</manifest>`
      );
    }
  }
  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log('[configure-android] Verified AndroidManifest.xml permissions & telephony feature');
}

// 3. Ensure MainActivity registers BackgroundSyncPlugin
const mainActivityPath = path.join(
  androidAppDir,
  'src',
  'main',
  'java',
  'com',
  'dugdhasetu',
  'app',
  'MainActivity.java'
);
if (fs.existsSync(mainActivityPath)) {
  const activitySrc = fs.readFileSync(mainActivityPath, 'utf8');
  if (!activitySrc.includes('BackgroundSyncPlugin')) {
    const updated = `package com.dugdhasetu.app;\n\nimport android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(BackgroundSyncPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}\n`;
    fs.writeFileSync(mainActivityPath, updated, 'utf8');
    console.log('[configure-android] Updated MainActivity.java to register BackgroundSyncPlugin');
  }
}

console.log('[configure-android] Native Android WorkManager & SMS configuration verified.');
