package com.seslinotlar.app.plugin;

import android.Manifest;
import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "VoskVoicePlugin",
    permissions = {
        @Permission(
            alias = "audio",
            strings = {Manifest.permission.RECORD_AUDIO}
        )
    }
)
public class VoskVoicePlugin extends Plugin implements RecognitionListener {

    private static final String TAG = "VoskVoicePlugin";
    private static final float SAMPLE_RATE = 16000.0f;

    private Model model = null;
    private SpeechService speechService = null;
    private Recognizer recognizer = null;
    private boolean isModelInitializing = false;
    private boolean isListening = false;
    private String currentAudioPath = null;
    private StringBuilder fullTranscript = new StringBuilder();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final List<PluginCall> pendingInitCalls = new CopyOnWriteArrayList<>();

    @Override
    public void load() {
        super.load();
        // Uygulama başlar başlamaz arka planda modeli yüklemeye başla
        Log.i(TAG, "VoskVoicePlugin yüklendi, arka planda model başlatılıyor...");
        initModelInternal(null);
    }

    @PluginMethod
    public void isModelReady(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ready", model != null);
        ret.put("initializing", isModelInitializing);
        call.resolve(ret);
    }

    @PluginMethod
    public void checkAudioPermission(PluginCall call) {
        JSObject ret = new JSObject();
        boolean granted = getPermissionState("audio") == PermissionState.GRANTED;
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestAudioPermission(PluginCall call) {
        if (getPermissionState("audio") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("audio", call, "requestPermCallback");
    }

    @PermissionCallback
    public void requestPermCallback(PluginCall call) {
        JSObject ret = new JSObject();
        boolean granted = getPermissionState("audio") == PermissionState.GRANTED;
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void initModel(PluginCall call) {
        initModelInternal(call);
    }

    private synchronized void resolvePendingCalls(boolean success, String errorMsg) {
        for (PluginCall pendingCall : pendingInitCalls) {
            try {
                if (success) {
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("status", "ready");
                    pendingCall.resolve(ret);
                } else {
                    pendingCall.reject(errorMsg != null ? errorMsg : "Model yüklenemedi");
                }
            } catch (Exception ignored) {
            }
        }
        pendingInitCalls.clear();
    }

    private synchronized void initModelInternal(PluginCall call) {
        if (call != null) {
            if (model != null) {
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("status", "ready");
                call.resolve(ret);
                return;
            }
            pendingInitCalls.add(call);
        }

        if (model != null) {
            resolvePendingCalls(true, null);
            return;
        }

        if (isModelInitializing) {
            return;
        }

        isModelInitializing = true;
        Context context = getContext();

        // Daha önceden dahili belleğe açılmış model varsa doğrudan yükle (anında açılış)
        File internalDir = new File(context.getFilesDir(), "model-tr");
        File internalModelMdl = new File(internalDir, "final.mdl");
        if (internalModelMdl.exists() && internalModelMdl.length() > 0) {
            executor.execute(() -> {
                try {
                    model = new Model(internalDir.getAbsolutePath());
                    isModelInitializing = false;
                    Log.i(TAG, "Vosk modeli dahili bellekten anında yüklendi: " + internalDir.getAbsolutePath());

                    JSObject eventData = new JSObject();
                    eventData.put("status", "loaded");
                    notifyListeners("onModelLoaded", eventData);

                    resolvePendingCalls(true, null);
                } catch (Exception e) {
                    Log.w(TAG, "Dahili bellekten yükleme hatası, StorageService deneniyor: " + e.getMessage());
                    unpackViaStorageService(context, internalDir);
                }
            });
            return;
        }

        unpackViaStorageService(context, internalDir);
    }

    private void unpackViaStorageService(Context context, File internalDir) {
        StorageService.unpack(context, "model-tr", "model",
            (loadedModel) -> {
                model = loadedModel;
                isModelInitializing = false;
                Log.i(TAG, "Vosk Türkçe modeli StorageService ile yüklendi.");

                JSObject eventData = new JSObject();
                eventData.put("status", "loaded");
                notifyListeners("onModelLoaded", eventData);

                resolvePendingCalls(true, null);
            },
            (exception) -> {
                Log.w(TAG, "StorageService uyarısı, dahili bellek kopyalama devrede: " + exception.getMessage());
                executor.execute(() -> {
                    try {
                        copyAssetFolder(context.getAssets(), "model-tr", internalDir);
                        model = new Model(internalDir.getAbsolutePath());
                        isModelInitializing = false;
                        Log.i(TAG, "Vosk modeli dahili bellek kopyalamasıyla yüklendi: " + internalDir.getAbsolutePath());

                        JSObject eventData = new JSObject();
                        eventData.put("status", "loaded");
                        notifyListeners("onModelLoaded", eventData);

                        resolvePendingCalls(true, null);
                    } catch (Exception e) {
                        isModelInitializing = false;
                        Log.e(TAG, "Model kopyalama ve yükleme başarısız: " + e.getMessage(), e);

                        JSObject errData = new JSObject();
                        errData.put("error", e.getMessage());
                        notifyListeners("onError", errData);

                        resolvePendingCalls(false, "Model yüklenemedi: " + e.getMessage());
                    }
                });
            }
        );
    }

    private void copyAssetFolder(AssetManager assetManager, String fromAssetPath, File toDir) throws IOException {
        String[] files = assetManager.list(fromAssetPath);
        if (files == null || files.length == 0) {
            copyAssetFile(assetManager, fromAssetPath, toDir);
        } else {
            if (!toDir.exists()) {
                toDir.mkdirs();
            }
            for (String file : files) {
                String subAsset = fromAssetPath + "/" + file;
                File subTarget = new File(toDir, file);
                String[] subFiles = assetManager.list(subAsset);
                if (subFiles != null && subFiles.length > 0) {
                    copyAssetFolder(assetManager, subAsset, subTarget);
                } else {
                    copyAssetFile(assetManager, subAsset, subTarget);
                }
            }
        }
    }

    private void copyAssetFile(AssetManager assetManager, String fromAssetPath, File toFile) throws IOException {
        if (toFile.exists() && toFile.length() > 0) {
            return;
        }
        File parent = toFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        try (InputStream in = assetManager.open(fromAssetPath);
             OutputStream out = new FileOutputStream(toFile)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            out.flush();
        }
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        if (getPermissionState("audio") != PermissionState.GRANTED) {
            requestPermissionForAlias("audio", call, "audioPermCallback");
            return;
        }

        startListeningInternal(call);
    }

    @PermissionCallback
    public void audioPermCallback(PluginCall call) {
        if (getPermissionState("audio") == PermissionState.GRANTED) {
            startListeningInternal(call);
        } else {
            call.reject("Mikrofon izni verilmedi. Lütfen uygulama ayarlarından mikrofon iznini açın.");
        }
    }

    private void startListeningInternal(PluginCall call) {
        if (isListening) {
            JSObject ret = new JSObject();
            ret.put("listening", true);
            ret.put("audioPath", currentAudioPath);
            call.resolve(ret);
            return;
        }

        // Eğer model henüz yükleniyorsa 3.5 saniyeye kadar bekle
        if (model == null && isModelInitializing) {
            int waited = 0;
            while (model == null && isModelInitializing && waited < 3500) {
                try {
                    Thread.sleep(200);
                    waited += 200;
                } catch (InterruptedException ignored) {
                    break;
                }
            }
        }

        if (model == null) {
            if (isModelInitializing) {
                call.reject("Dil modeli henüz hazırlanıyor. Lütfen 2 saniye sonra tekrar basın.");
            } else {
                initModelInternal(null);
                call.reject("Dil modeli başlatılıyor. Lütfen 2 saniye sonra tekrar basın.");
            }
            return;
        }

        try {
            fullTranscript.setLength(0);
            recognizer = new Recognizer(model, SAMPLE_RATE);
            speechService = new SpeechService(recognizer, SAMPLE_RATE);
            speechService.startListening(this);
            isListening = true;

            File audioDir = new File(getContext().getFilesDir(), "audio_notes");
            if (!audioDir.exists()) {
                audioDir.mkdirs();
            }
            File audioFile = new File(audioDir, "ses_" + System.currentTimeMillis() + ".wav");
            currentAudioPath = audioFile.getAbsolutePath();

            JSObject stateObj = new JSObject();
            stateObj.put("state", "listening");
            notifyListeners("onStateChange", stateObj);

            JSObject ret = new JSObject();
            ret.put("listening", true);
            ret.put("audioPath", currentAudioPath);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Dinleme başlatılamadı: " + e.getMessage(), e);
            call.reject("Mikrofon donanımı başlatılamadı: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        if (!isListening || speechService == null) {
            JSObject ret = new JSObject();
            ret.put("stopped", true);
            ret.put("transcript", fullTranscript.toString().trim());
            ret.put("audioPath", currentAudioPath);
            call.resolve(ret);
            return;
        }

        speechService.stop();
        speechService = null;
        isListening = false;

        JSObject stateObj = new JSObject();
        stateObj.put("state", "idle");
        notifyListeners("onStateChange", stateObj);

        String finalOutput = fullTranscript.toString().trim();
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        ret.put("transcript", finalOutput);
        ret.put("audioPath", currentAudioPath);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancelListening(PluginCall call) {
        if (speechService != null) {
            speechService.cancel();
            speechService = null;
        }
        isListening = false;
        fullTranscript.setLength(0);

        JSObject stateObj = new JSObject();
        stateObj.put("state", "idle");
        notifyListeners("onStateChange", stateObj);

        JSObject ret = new JSObject();
        ret.put("cancelled", true);
        call.resolve(ret);
    }

    @Override
    public void onPartialResult(String hypothesis) {
        try {
            JSONObject json = new JSONObject(hypothesis);
            String partial = json.optString("partial", "");
            if (!partial.isEmpty()) {
                JSObject ret = new JSObject();
                ret.put("partial", partial);
                notifyListeners("onPartialResult", ret);
            }
        } catch (JSONException e) {
            Log.w(TAG, "Partial JSON parse hatası", e);
        }
    }

    @Override
    public void onResult(String hypothesis) {
        try {
            JSONObject json = new JSONObject(hypothesis);
            String text = json.optString("text", "");
            if (!text.isEmpty()) {
                if (fullTranscript.length() > 0) {
                    fullTranscript.append(" ");
                }
                fullTranscript.append(text);

                JSObject ret = new JSObject();
                ret.put("text", text);
                ret.put("accumulated", fullTranscript.toString());
                notifyListeners("onResult", ret);
            }
        } catch (JSONException e) {
            Log.w(TAG, "Result JSON parse hatası", e);
        }
    }

    @Override
    public void onFinalResult(String hypothesis) {
        try {
            JSONObject json = new JSONObject(hypothesis);
            String text = json.optString("text", "");
            if (!text.isEmpty()) {
                if (fullTranscript.length() > 0) {
                    fullTranscript.append(" ");
                }
                fullTranscript.append(text);
            }

            JSObject ret = new JSObject();
            ret.put("finalText", fullTranscript.toString().trim());
            notifyListeners("onFinalResult", ret);
        } catch (JSONException e) {
            Log.w(TAG, "FinalResult JSON parse hatası", e);
        }
    }

    @Override
    public void onError(Exception exception) {
        Log.e(TAG, "Vosk Recognition hatası", exception);
        JSObject ret = new JSObject();
        ret.put("error", exception.getMessage());
        notifyListeners("onError", ret);
    }

    @Override
    public void onTimeout() {
        Log.i(TAG, "Vosk dinleme zaman aşımı");
        JSObject ret = new JSObject();
        ret.put("timeout", true);
        notifyListeners("onTimeout", ret);
    }
}
