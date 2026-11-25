package com.dugdhasetu.app;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

public class SyncWorker extends Worker {
    private static final String TAG = "DugdhaSetuSyncWorker";
    private static final String DB_FILENAME = "dugdhasetu_amcuSQLite.db";

    public SyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        if (BackgroundSyncPlugin.tryNotifyActiveBridge()) {
            Log.d(TAG, "Delegated background sync trigger to active Capacitor WebView bridge");
            return Result.success();
        }

        SharedPreferences prefs = getApplicationContext().getSharedPreferences(
            BackgroundSyncPlugin.PREFS_NAME,
            Context.MODE_PRIVATE
        );
        String serverUrl = prefs.getString(BackgroundSyncPlugin.KEY_SERVER_URL, "");
        String token = prefs.getString(BackgroundSyncPlugin.KEY_TOKEN, "");
        String databaseId = prefs.getString(BackgroundSyncPlugin.KEY_DATABASE_ID, "(default)");
        String appVersion = prefs.getString(BackgroundSyncPlugin.KEY_APP_VERSION, "1.4.3");

        if (serverUrl == null || serverUrl.isEmpty() || token == null || token.isEmpty()) {
            return Result.success();
        }

        String normalizedBase = serverUrl.endsWith("/") ? serverUrl.substring(0, serverUrl.length() - 1) : serverUrl;
        if (!normalizedBase.startsWith("http")) {
            return Result.success();
        }

        File dbFile = getApplicationContext().getDatabasePath(DB_FILENAME);
        if (!dbFile.exists()) {
            return Result.success();
        }

        SQLiteDatabase db = null;
        boolean shouldRetry = false;
        Set<String> blockedTempIds = new HashSet<>();

        try {
            db = SQLiteDatabase.openDatabase(dbFile.getPath(), null, SQLiteDatabase.OPEN_READWRITE);
            db.enableWriteAheadLogging();
            Cursor pragma = db.rawQuery("PRAGMA busy_timeout = 5000", null);
            if (pragma != null) pragma.close();

            long now = System.currentTimeMillis();
            try (Cursor cursor = db.rawQuery(
                "SELECT id, type, entity_type, entity_id, payload, idempotency_key, base_version, retry_count " +
                "FROM sync_queue WHERE status IN ('pending', 'failed') AND next_retry_at <= ? ORDER BY created_at ASC LIMIT 25",
                new String[]{String.valueOf(now)}
            )) {
                while (cursor.moveToNext()) {
                    String taskId = cursor.getString(0);
                    String type = cursor.getString(1);
                    String entityType = cursor.getString(2);
                    String entityId = cursor.getString(3);

                    // Re-read freshest row in case an earlier CREATE remapped temp IDs
                    String payloadStr = cursor.getString(4);
                    try (Cursor fresh = db.rawQuery("SELECT entity_id, payload FROM sync_queue WHERE id = ?", new String[]{taskId})) {
                        if (fresh.moveToFirst()) {
                            entityId = fresh.getString(0);
                            payloadStr = fresh.getString(1);
                        }
                    }

                    String idempotencyKey = cursor.getString(5);
                    Long baseVersion = cursor.isNull(6) ? null : cursor.getLong(6);
                    int retryCount = cursor.getInt(7);

                    EndpointSpec spec = resolveEndpoint(type, entityId, payloadStr, blockedTempIds);
                    if (spec == null) continue;

                    HttpResponse resp = executeHttp(
                        normalizedBase + spec.path,
                        spec.method,
                        spec.body,
                        token,
                        databaseId,
                        idempotencyKey,
                        baseVersion,
                        appVersion
                    );

                    if (resp.statusCode >= 200 && resp.statusCode < 300) {
                        db.beginTransactionNonExclusive();
                        try {
                            db.delete("sync_queue", "id = ?", new String[]{taskId});
                            if (spec.tableName != null && resp.responseBody != null && resp.responseBody.trim().startsWith("{")) {
                                JSONObject serverObj = new JSONObject(resp.responseBody);
                                String realId = serverObj.optString("id", serverObj.optString("_id", ""));
                                if (!realId.isEmpty() && entityId != null && !entityId.equals(realId)) {
                                    db.delete(spec.tableName, "id = ?", new String[]{entityId});
                                    remapPendingReferences(db, spec.tableName, entityId, realId);
                                }
                                if (!realId.isEmpty()) {
                                    ContentValues entUpd = new ContentValues();
                                    entUpd.put("sync_status", "synced");
                                    db.update(spec.tableName, entUpd, "id = ?", new String[]{realId});
                                }
                            } else if (spec.tableName != null && entityId != null) {
                                ContentValues entUpd = new ContentValues();
                                entUpd.put("sync_status", "synced");
                                db.update(spec.tableName, entUpd, "id = ?", new String[]{entityId});
                            }
                            db.setTransactionSuccessful();
                        } finally {
                            db.endTransaction();
                        }
                    } else if (resp.statusCode == 409) {
                        if (entityId != null && entityId.startsWith("temp_")) blockedTempIds.add(entityId);
                        ContentValues conflict = new ContentValues();
                        conflict.put("id", "conflict_bg_" + taskId);
                        conflict.put("entity_type", entityType != null ? entityType : "unknown");
                        conflict.put("entity_id", entityId != null ? entityId : taskId);
                        conflict.put("operation", spec.method.equals("POST") ? "create" : "update");
                        conflict.put("local_payload", payloadStr);
                        conflict.put("reason", "Background WorkManager sync conflict: HTTP 409");
                        conflict.put("status", "unresolved");
                        conflict.put("queue_task_id", taskId);
                        conflict.put("created_at", System.currentTimeMillis());
                        db.insertWithOnConflict("sync_conflicts", null, conflict, SQLiteDatabase.CONFLICT_REPLACE);

                        ContentValues qUpd = new ContentValues();
                        qUpd.put("status", "conflict");
                        qUpd.put("last_error", "HTTP 409 conflict");
                        qUpd.put("updated_at", System.currentTimeMillis());
                        db.update("sync_queue", qUpd, "id = ?", new String[]{taskId});
                    } else if (resp.statusCode == 401 || resp.statusCode == 403) {
                        break;
                    } else if (resp.statusCode >= 500 || resp.statusCode == 0) {
                        if (entityId != null && entityId.startsWith("temp_")) blockedTempIds.add(entityId);
                        shouldRetry = true;
                        int nextCount = retryCount + 1;
                        long backoff = Math.min(15 * 60 * 1000L, 5000L * (1L << Math.min(8, retryCount)));
                        ContentValues qUpd = new ContentValues();
                        qUpd.put("status", "failed");
                        qUpd.put("retry_count", nextCount);
                        qUpd.put("next_retry_at", System.currentTimeMillis() + backoff);
                        qUpd.put("last_error", resp.errorMessage != null ? resp.errorMessage : "HTTP " + resp.statusCode);
                        qUpd.put("updated_at", System.currentTimeMillis());
                        db.update("sync_queue", qUpd, "id = ?", new String[]{taskId});
                    }
                }
            }

            flushAuditOutbox(db, normalizedBase, token, databaseId, appVersion);
        } catch (Exception e) {
            Log.e(TAG, "WorkManager background sync exception", e);
            shouldRetry = true;
        } finally {
            if (db != null) {
                try {
                    db.close();
                } catch (Exception ignored) {}
            }
        }

        return shouldRetry ? Result.retry() : Result.success();
    }

    private void remapPendingReferences(SQLiteDatabase db, String parentTable, String tempId, String realId) {
        try (Cursor q = db.rawQuery("SELECT id, entity_id, payload FROM sync_queue", null)) {
            while (q.moveToNext()) {
                String qId = q.getString(0);
                String qEntId = q.getString(1);
                String qPayload = q.getString(2);
                boolean changed = tempId.equals(qEntId);
                String nextPayload = qPayload;
                if (qPayload != null && qPayload.contains(tempId)) {
                    nextPayload = qPayload.replace(tempId, realId);
                    changed = true;
                }
                if (changed) {
                    ContentValues cv = new ContentValues();
                    cv.put("entity_id", tempId.equals(qEntId) ? realId : qEntId);
                    cv.put("payload", nextPayload);
                    db.update("sync_queue", cv, "id = ?", new String[]{qId});
                }
            }
        }
        if ("farmers".equals(parentTable)) {
            for (String child : new String[]{"collections", "payments", "ledgers"}) {
                ContentValues cv = new ContentValues();
                cv.put("farmer_internal_id", realId);
                db.update(child, cv, "farmer_internal_id = ?", new String[]{tempId});
            }
        } else if ("sales_customers".equals(parentTable)) {
            for (String child : new String[]{"sales_records", "customer_payments"}) {
                ContentValues cv = new ContentValues();
                cv.put("customer_id", realId);
                db.update(child, cv, "customer_id = ?", new String[]{tempId});
            }
        }
    }

    private void flushAuditOutbox(
        SQLiteDatabase db,
        String normalizedBase,
        String token,
        String databaseId,
        String appVersion
    ) {
        try (Cursor c = db.rawQuery(
            "SELECT log_id, action, target_id, target_type, operation_status, error_details, sync_status, correlation_id, app_version, created_at " +
            "FROM audit_outbox WHERE synced = 0 ORDER BY created_at ASC LIMIT 50",
            null
        )) {
            JSONArray logs = new JSONArray();
            while (c.moveToNext()) {
                JSONObject obj = new JSONObject();
                obj.put("logId", c.getString(0));
                obj.put("action", c.getString(1));
                if (!c.isNull(2)) obj.put("targetId", c.getString(2));
                if (!c.isNull(3)) obj.put("targetType", c.getString(3));
                obj.put("operationStatus", c.getString(4));
                if (!c.isNull(5)) obj.put("errorDetails", c.getString(5));
                obj.put("syncStatus", c.getString(6));
                if (!c.isNull(7)) obj.put("correlationId", c.getString(7));
                if (!c.isNull(8)) obj.put("appVersion", c.getString(8));
                obj.put("createdAt", c.getLong(9));
                logs.put(obj);
            }
            if (logs.length() == 0) return;

            JSONObject body = new JSONObject();
            body.put("logs", logs);
            HttpResponse resp = executeHttp(
                normalizedBase + "/audit/sync",
                "POST",
                body.toString(),
                token,
                databaseId,
                "wm_audit_" + System.currentTimeMillis(),
                null,
                appVersion
            );
            if (resp.statusCode >= 200 && resp.statusCode < 300) {
                for (int i = 0; i < logs.length(); i++) {
                    String logId = logs.getJSONObject(i).optString("logId", "");
                    if (!logId.isEmpty()) {
                        ContentValues upd = new ContentValues();
                        upd.put("synced", 1);
                        upd.put("sync_status", "synced_from_offline");
                        db.update("audit_outbox", upd, "log_id = ?", new String[]{logId});
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Audit outbox flush skipped in background: " + e.getMessage());
        }
    }

    private static class EndpointSpec {
        final String method;
        final String path;
        final String body;
        final String tableName;
        EndpointSpec(String m, String p, String b, String t) {
            method = m;
            path = p;
            body = b;
            tableName = t;
        }
    }

    private JSONObject cleanCreatePayload(JSONObject src) {
        JSONObject copy = new JSONObject();
        try {
            copy = new JSONObject(src.toString());
            copy.remove("_id");
            copy.remove("_rev");
            copy.remove("_syncStatus");
            copy.remove("sync_status");
            String idVal = copy.optString("id", "");
            if (idVal.matches("^(temp_|cust_|coll_|sale_|cust_pay_|payment_|rate_|shift_|user_).*")) {
                copy.remove("id");
            }
        } catch (Exception ignored) {}
        return copy;
    }

    private EndpointSpec resolveEndpoint(String type, String entityId, String payloadStr, Set<String> blockedTempIds) {
        try {
            JSONObject obj = payloadStr != null && payloadStr.trim().startsWith("{") ? new JSONObject(payloadStr) : new JSONObject();
            String depFarmer = obj.optString("farmerInternalId", "");
            String depCustomer = obj.optString("customerId", "");
            if ((!depFarmer.isEmpty() && blockedTempIds.contains(depFarmer))
                || (!depCustomer.isEmpty() && blockedTempIds.contains(depCustomer))
                || (entityId != null && blockedTempIds.contains(entityId))) {
                return null;
            }
            switch (type) {
                case "CREATE_FARMER": return new EndpointSpec("POST", "/farmers", cleanCreatePayload(obj).toString(), "farmers");
                case "UPDATE_FARMER": return new EndpointSpec("PUT", "/farmers/" + obj.optString("id", entityId), obj.optJSONObject("data") != null ? obj.getJSONObject("data").toString() : obj.toString(), "farmers");
                case "DELETE_FARMER": return new EndpointSpec("DELETE", "/farmers/" + (entityId != null ? entityId : obj.optString("id")), "", "farmers");
                case "CREATE_COLLECTION": return new EndpointSpec("POST", "/collections", cleanCreatePayload(obj).toString(), "collections");
                case "UPDATE_COLLECTION": return new EndpointSpec("PUT", "/collections/" + obj.optString("id", entityId), obj.optJSONObject("data") != null ? obj.getJSONObject("data").toString() : obj.toString(), "collections");
                case "RECORD_PAYMENT": return new EndpointSpec("POST", "/payments", cleanCreatePayload(obj).toString(), "ledgers");
                case "CREATE_SALE_CUSTOMER": return new EndpointSpec("POST", "/customers", cleanCreatePayload(obj).toString(), "sales_customers");
                case "UPDATE_CUSTOMER": return new EndpointSpec("PUT", "/customers/" + obj.optString("id", entityId), obj.optJSONObject("data") != null ? obj.getJSONObject("data").toString() : obj.toString(), "sales_customers");
                case "DELETE_CUSTOMER": return new EndpointSpec("DELETE", "/customers/" + (entityId != null ? entityId : obj.optString("id")), "", "sales_customers");
                case "RECORD_SALE": return new EndpointSpec("POST", "/sales", cleanCreatePayload(obj).toString(), "sales_records");
                case "RECORD_CUSTOMER_PAYMENT": return new EndpointSpec("POST", "/customer-payments", cleanCreatePayload(obj).toString(), "customer_payments");
                case "SAVE_SHIFT_SUMMARY":
                case "CREATE_SHIFT": return new EndpointSpec("POST", "/shifts/summary", cleanCreatePayload(obj).toString(), "shifts");
                default: return null;
            }
        } catch (Exception e) {
            return null;
        }
    }

    private static class HttpResponse {
        int statusCode;
        String responseBody;
        String errorMessage;
    }

    private HttpResponse executeHttp(
        String urlStr,
        String method,
        String jsonBody,
        String token,
        String databaseId,
        String idempotencyKey,
        Long baseVersion,
        String appVersion
    ) {
        HttpResponse out = new HttpResponse();
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod(method);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(25000);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("x-database-id", databaseId);
            conn.setRequestProperty("Idempotency-Key", idempotencyKey);
            conn.setRequestProperty("X-Offline-Sync", "true");
            conn.setRequestProperty("X-Platform", "android");
            conn.setRequestProperty("X-App-Version", appVersion);
            if (baseVersion != null) {
                conn.setRequestProperty("X-Expected-Version", String.valueOf(baseVersion));
            }
            if (!method.equals("GET") && !method.equals("DELETE")) {
                conn.setDoOutput(true);
                byte[] bytes = jsonBody.getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bytes);
                }
            }
            out.statusCode = conn.getResponseCode();
            InputStream stream = out.statusCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (stream != null) {
                try (BufferedReader br = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                    if (out.statusCode >= 400) out.errorMessage = sb.toString();
                    else out.responseBody = sb.toString();
                }
            }
        } catch (Exception e) {
            out.statusCode = 0;
            out.errorMessage = e.getMessage();
        } finally {
            if (conn != null) conn.disconnect();
        }
        return out;
    }
}
