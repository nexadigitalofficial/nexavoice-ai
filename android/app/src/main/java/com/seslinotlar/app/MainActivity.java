package com.seslinotlar.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.seslinotlar.app.plugin.VoskVoicePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VoskVoicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
