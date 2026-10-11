# Vosk ve JNA Proguard Kuralları
-keep class org.vosk.** { *; }
-keep class com.sun.jna.** { *; }
-keepclassmembers class * extends com.sun.jna.Structure {
    public <fields>;
}

# Capacitor Kuralları
-keep class com.getcapacitor.** { *; }
-keep class com.seslinotlar.app.** { *; }
