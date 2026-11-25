import fs from 'fs';
import path from 'path';

const pluginRoot = path.join(process.cwd(), 'node_modules', 'capacitor-sms-sender', 'android');
const gradlePath = path.join(pluginRoot, 'build.gradle');
const manifestPath = path.join(pluginRoot, 'src', 'main', 'AndroidManifest.xml');
const javaPath = path.join(
  pluginRoot,
  'src',
  'main',
  'java',
  'com',
  'iqbalfn',
  'capacitor',
  'smssender',
  'SmsSenderPlugin.java'
);

if (fs.existsSync(gradlePath)) {
  let content = fs.readFileSync(gradlePath, 'utf8');
  if (!content.includes('namespace "com.iqbalfn.capacitor.smssender"')) {
    content = content.replace('android {', 'android {\n    namespace "com.iqbalfn.capacitor.smssender"');
  }
  content = content
    .replace(/compileSdkVersion project\.hasProperty\('compileSdkVersion'\) \? rootProject\.ext\.compileSdkVersion : 32/g,
      "compileSdkVersion project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 34")
    .replace(/targetSdkVersion project\.hasProperty\('targetSdkVersion'\) \? rootProject\.ext\.targetSdkVersion : 32/g,
      "targetSdkVersion project.hasProperty('targetSdkVersion') ? rootProject.ext.targetSdkVersion : 34");
  fs.writeFileSync(gradlePath, content);
  console.log('Successfully updated capacitor-sms-sender build.gradle (namespace + SDK 34 defaults)');
} else {
  console.log('capacitor-sms-sender build.gradle not found, skipping fix');
}

if (fs.existsSync(manifestPath)) {
  const manifestContent = `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.iqbalfn.capacitor.smssender">

    <uses-feature android:name="android.hardware.telephony" android:required="false" />
    <uses-permission android:name="android.permission.SEND_SMS"/>
    <uses-permission android:name="android.permission.READ_PHONE_STATE"/>
</manifest>
`;
  fs.writeFileSync(manifestPath, manifestContent);
  console.log('Successfully updated capacitor-sms-sender AndroidManifest.xml');
}

if (fs.existsSync(javaPath)) {
  const modernPluginJava = `package com.iqbalfn.capacitor.smssender;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.telephony.SmsManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(
        name = "SmsSender",
        permissions = {
                @Permission(
                        alias = "send_sms",
                        strings = {Manifest.permission.SEND_SMS}
                ),
                @Permission(
                        alias = "read_phone_state",
                        strings = {Manifest.permission.READ_PHONE_STATE}
                )
        }
)
public class SmsSenderPlugin extends Plugin {

    private static final String SMS_SENT = "com.iqbalfn.capacitor.smssender.SMS_SENT";
    private static final String SMS_DELIVERED = "com.iqbalfn.capacitor.smssender.SMS_DELIVERED";

    private BroadcastReceiver sendBR;
    private BroadcastReceiver delvBR;
    private final ConcurrentHashMap<Integer, Integer> remainingSentParts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, Integer> remainingDelvParts = new ConcurrentHashMap<>();

    @Override
    public void load() {
        sendBR = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                Bundle extras = intent != null ? intent.getExtras() : null;
                if (extras == null) return;
                int id = extras.getInt("id", -1);
                if (id < 0) return;

                int resultCode = getResultCode();
                if (resultCode != Activity.RESULT_OK) {
                    remainingSentParts.remove(id);
                    JSObject ret = new JSObject();
                    ret.put("id", id);
                    ret.put("res_status", resultCode);
                    ret.put("status", "FAILED");
                    notifyListeners("smsSenderStatusUpdated", ret);
                    return;
                }

                Integer rem = remainingSentParts.get(id);
                if (rem != null && rem > 1) {
                    remainingSentParts.put(id, rem - 1);
                    return;
                }
                remainingSentParts.remove(id);

                JSObject ret = new JSObject();
                ret.put("id", id);
                ret.put("res_status", resultCode);
                ret.put("status", "SENT");
                notifyListeners("smsSenderStatusUpdated", ret);
            }
        };

        delvBR = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                Bundle extras = intent != null ? intent.getExtras() : null;
                if (extras == null) return;
                int id = extras.getInt("id", -1);
                if (id < 0) return;

                int resultCode = getResultCode();
                if (resultCode != Activity.RESULT_OK) {
                    remainingDelvParts.remove(id);
                    JSObject ret = new JSObject();
                    ret.put("id", id);
                    ret.put("res_status", resultCode);
                    ret.put("status", "FAILED");
                    notifyListeners("smsSenderStatusUpdated", ret);
                    return;
                }

                Integer rem = remainingDelvParts.get(id);
                if (rem != null && rem > 1) {
                    remainingDelvParts.put(id, rem - 1);
                    return;
                }
                remainingDelvParts.remove(id);

                JSObject ret = new JSObject();
                ret.put("id", id);
                ret.put("res_status", resultCode);
                ret.put("status", "DELIVERED");
                notifyListeners("smsSenderStatusUpdated", ret);
            }
        };

        Context ctx = getContext();
        IntentFilter sentFilter = new IntentFilter(SMS_SENT);
        IntentFilter delvFilter = new IntentFilter(SMS_DELIVERED);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.registerReceiver(sendBR, sentFilter, Context.RECEIVER_NOT_EXPORTED);
            ctx.registerReceiver(delvBR, delvFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            ctx.registerReceiver(sendBR, sentFilter);
            ctx.registerReceiver(delvBR, delvFilter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        Context ctx = getContext();
        if (ctx != null) {
            try {
                if (sendBR != null) ctx.unregisterReceiver(sendBR);
            } catch (Exception ignored) {}
            try {
                if (delvBR != null) ctx.unregisterReceiver(delvBR);
            } catch (Exception ignored) {}
        }
        sendBR = null;
        delvBR = null;
        remainingSentParts.clear();
        remainingDelvParts.clear();
        super.handleOnDestroy();
    }

    @SuppressLint("MissingPermission")
    private SmsManager resolveSmsManager(int simParam) {
        Context ctx = getContext();
        int targetSubId = SubscriptionManager.INVALID_SUBSCRIPTION_ID;

        if (simParam > 0) {
            // Check whether simParam matches a subscriptionId or SIM slot index if permission is available
            if (getPermissionState("read_phone_state") == PermissionState.GRANTED && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                try {
                    SubscriptionManager subMgr = SubscriptionManager.from(ctx);
                    List<SubscriptionInfo> infos = subMgr != null ? subMgr.getActiveSubscriptionInfoList() : null;
                    if (infos != null) {
                        for (SubscriptionInfo info : infos) {
                            if (info.getSubscriptionId() == simParam) {
                                targetSubId = info.getSubscriptionId();
                                break;
                            }
                        }
                        if (targetSubId == SubscriptionManager.INVALID_SUBSCRIPTION_ID && simParam <= infos.size()) {
                            targetSubId = infos.get(simParam - 1).getSubscriptionId();
                        }
                    }
                } catch (Exception ignored) {}
            }
            if (targetSubId == SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
                targetSubId = simParam;
            }
        } else {
            targetSubId = SubscriptionManager.getDefaultSmsSubscriptionId();
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            SmsManager sysMgr = ctx.getSystemService(SmsManager.class);
            if (sysMgr != null) {
                if (targetSubId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
                    return sysMgr.createForSubscriptionId(targetSubId);
                }
                return sysMgr;
            }
        }

        if (targetSubId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
            return SmsManager.getSmsManagerForSubscriptionId(targetSubId);
        }
        return SmsManager.getDefault();
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void getAvailableSims(PluginCall call) {
        JSArray sims = new JSArray();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1 &&
                getPermissionState("read_phone_state") == PermissionState.GRANTED) {
            try {
                SubscriptionManager subMgr = SubscriptionManager.from(getContext());
                List<SubscriptionInfo> infos = subMgr != null ? subMgr.getActiveSubscriptionInfoList() : null;
                if (infos != null) {
                    for (SubscriptionInfo info : infos) {
                        JSObject obj = new JSObject();
                        obj.put("subscriptionId", info.getSubscriptionId());
                        obj.put("simSlotIndex", info.getSimSlotIndex());
                        obj.put("displayName", info.getDisplayName() != null ? info.getDisplayName().toString() : "SIM " + (info.getSimSlotIndex() + 1));
                        obj.put("carrierName", info.getCarrierName() != null ? info.getCarrierName().toString() : "");
                        sims.put(obj);
                    }
                }
            } catch (Exception ignored) {}
        }
        JSObject ret = new JSObject();
        ret.put("sims", sims);
        call.resolve(ret);
    }

    @PluginMethod
    public void send(PluginCall call) {
        if (getPermissionState("send_sms") != PermissionState.GRANTED) {
            call.reject("SEND_SMS permission is not granted");
            return;
        }

        int sim = call.getInt("sim", 0);
        int id = call.getInt("id", (int) (System.currentTimeMillis() & 0x7fffffff));
        String text = call.getString("text");
        String phone = call.getString("phone");

        if (phone == null || phone.trim().isEmpty() || text == null || text.isEmpty()) {
            call.reject("Phone number and text message are required");
            return;
        }

        try {
            SmsManager manager = resolveSmsManager(sim);
            ArrayList<String> parts = manager.divideMessage(text);
            int partCount = parts != null ? parts.size() : 1;

            int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE;
            }

            Context ctx = getContext();
            String pkgName = ctx.getPackageName();
            int baseReqCode = Math.abs(id);

            remainingSentParts.put(id, Math.max(1, partCount));
            remainingDelvParts.put(id, Math.max(1, partCount));

            if (partCount > 1 && parts != null) {
                ArrayList<PendingIntent> sentIntents = new ArrayList<>(partCount);
                ArrayList<PendingIntent> delvIntents = new ArrayList<>(partCount);
                for (int i = 0; i < partCount; i++) {
                    int partReqCode = baseReqCode + i;
                    Intent iSent = new Intent(SMS_SENT);
                    iSent.setPackage(pkgName);
                    iSent.putExtra("id", id);
                    iSent.putExtra("partIndex", i);
                    sentIntents.add(PendingIntent.getBroadcast(ctx, partReqCode, iSent, flags));

                    Intent iDelv = new Intent(SMS_DELIVERED);
                    iDelv.setPackage(pkgName);
                    iDelv.putExtra("id", id);
                    iDelv.putExtra("partIndex", i);
                    delvIntents.add(PendingIntent.getBroadcast(ctx, partReqCode + 100000, iDelv, flags));
                }
                manager.sendMultipartTextMessage(phone.trim(), null, parts, sentIntents, delvIntents);
            } else {
                Intent iSMSSent = new Intent(SMS_SENT);
                iSMSSent.setPackage(pkgName);
                iSMSSent.putExtra("id", id);
                PendingIntent sentPI = PendingIntent.getBroadcast(ctx, baseReqCode, iSMSSent, flags);

                Intent iSMSDelivered = new Intent(SMS_DELIVERED);
                iSMSDelivered.setPackage(pkgName);
                iSMSDelivered.putExtra("id", id);
                PendingIntent delvPI = PendingIntent.getBroadcast(ctx, baseReqCode + 100000, iSMSDelivered, flags);

                manager.sendTextMessage(phone.trim(), null, text, sentPI, delvPI);
            }

            JSObject ret = new JSObject();
            ret.put("id", id);
            ret.put("parts", partCount);
            ret.put("status", "PENDING");
            call.resolve(ret);
        } catch (SecurityException secEx) {
            remainingSentParts.remove(id);
            remainingDelvParts.remove(id);
            call.reject("SMS permission rejected by Android OS: " + secEx.getMessage(), secEx);
        } catch (Exception ex) {
            remainingSentParts.remove(id);
            remainingDelvParts.remove(id);
            call.reject("Failed to dispatch SMS: " + ex.getMessage(), ex);
        }
    }
}
`;
  fs.writeFileSync(javaPath, modernPluginJava);
  console.log('Successfully patched SmsSenderPlugin.java for Android 12-15+ (explicit intents, RECEIVER_NOT_EXPORTED, multipart/Unicode, dual-SIM)');
} else {
  console.log('SmsSenderPlugin.java not found, skipping Java patch');
}
