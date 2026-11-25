package com.dugdhasetu.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "BackgroundSync")
public class BackgroundSyncPlugin extends Plugin {
    public static final String PREFS_NAME = "DugdhaSetuSyncPrefs";
    public static final String KEY_SERVER_URL = "serverUrl";
    public static final String KEY_TOKEN = "authToken";
    public static final String KEY_DATABASE_ID = "databaseId";
    public static final String KEY_APP_VERSION = "appVersion";

    private static final String WORK_PERIODIC = "dugdhasetu_periodic_sync";
    private static final String WORK_IMMEDIATE = "dugdhasetu_immediate_sync";

    private static volatile WeakReference<BackgroundSyncPlugin> activePluginRef = new WeakReference<>(null);
    private static volatile boolean bridgeActive = false;

    @Override
    public void load() {
        super.load();
        activePluginRef = new WeakReference<>(this);
        bridgeActive = true;
    }

    @Override
    protected void handleOnDestroy() {
        bridgeActive = false;
        activePluginRef.clear();
        super.handleOnDestroy();
    }

    public static boolean tryNotifyActiveBridge() {
        BackgroundSyncPlugin plugin = activePluginRef.get();
        if (plugin != null && bridgeActive && plugin.getBridge() != null) {
            JSObject payload = new JSObject();
            payload.put("source", "workmanager");
            payload.put("timestamp", System.currentTimeMillis());
            plugin.notifyListeners("nativeSyncRequested", payload);
            return true;
        }
        return false;
    }

    @PluginMethod
    public void configure(PluginCall call) {
        String serverUrl = call.getString("serverUrl", "");
        String token = call.getString("token", "");
        String databaseId = call.getString("databaseId", "(default)");
        String appVersion = call.getString("appVersion", "1.4.3");

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString(KEY_SERVER_URL, serverUrl)
            .putString(KEY_TOKEN, token)
            .putString(KEY_DATABASE_ID, databaseId)
            .putString(KEY_APP_VERSION, appVersion)
            .apply();

        JSObject res = new JSObject();
        res.put("configured", true);
        call.resolve(res);
    }

    @PluginMethod
    public void clearCredentials(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove(KEY_TOKEN).apply();
        JSObject res = new JSObject();
        res.put("cleared", true);
        call.resolve(res);
    }

    @PluginMethod
    public void notifyBridgeActive(PluginCall call) {
        bridgeActive = Boolean.TRUE.equals(call.getBoolean("active", true));
        call.resolve();
    }

    @PluginMethod
    public void ensurePeriodicSync(PluginCall call) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        PeriodicWorkRequest periodicRequest = new PeriodicWorkRequest.Builder(
            SyncWorker.class,
            15,
            TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build();

        WorkManager.getInstance(getContext().getApplicationContext()).enqueueUniquePeriodicWork(
            WORK_PERIODIC,
            ExistingPeriodicWorkPolicy.KEEP,
            periodicRequest
        );

        JSObject res = new JSObject();
        res.put("scheduled", true);
        call.resolve(res);
    }

    @PluginMethod
    public void scheduleImmediateSync(PluginCall call) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        OneTimeWorkRequest immediateRequest = new OneTimeWorkRequest.Builder(SyncWorker.class)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build();

        WorkManager.getInstance(getContext().getApplicationContext()).enqueueUniqueWork(
            WORK_IMMEDIATE,
            ExistingWorkPolicy.REPLACE,
            immediateRequest
        );

        JSObject res = new JSObject();
        res.put("scheduled", true);
        call.resolve(res);
    }
}
