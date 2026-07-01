package com.socialeraser.app;

import android.annotation.SuppressLint;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin()
public class SocialEraserWebViewPlugin extends Plugin {

    private WebView webView;
    private FrameLayout container;
    private String injectedScript = "";
    private boolean scriptInjected = false;
    private boolean isLoading = false;
    private Handler mainHandler;
    private SocialEraserBridge bridge;

    @Override
    public void load() {
        super.load();
        mainHandler = new Handler(Looper.getMainLooper());
    }

    @SuppressLint("SetJavaScriptEnabled")
    @PluginMethod
    public void loadX(PluginCall call) {
        if (webView != null && container != null) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "WebView already loaded");
            call.resolve(ret);
            return;
        }

        mainHandler.post(() -> {
            try {
                webView = new WebView(getContext());
                WebSettings settings = webView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);
                settings.setLoadWithOverviewMode(true);
                settings.setUseWideViewPort(true);
                settings.setBuiltInZoomControls(false);
                settings.setDisplayZoomControls(false);
                settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

                container = new FrameLayout(getContext());
                container.addView(webView);

                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                        super.onPageStarted(view, url, favicon);
                        isLoading = true;
                        notifyListeners("webViewLoading", new JSObject().put("loading", true).put("url", url));
                    }

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);
                        isLoading = false;
                        notifyListeners("webViewLoading", new JSObject().put("loading", false).put("url", url));

                        if (!scriptInjected && !injectedScript.isEmpty()) {
                            injectScriptInternal(injectedScript);
                            scriptInjected = true;
                        }
                    }

                    @Override
                    public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                        super.onReceivedError(view, errorCode, description, failingUrl);
                        notifyListeners("webViewError", new JSObject()
                            .put("errorCode", errorCode)
                            .put("description", description)
                            .put("url", failingUrl));
                    }
                });

                webView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onProgressChanged(WebView view, int newProgress) {
                        super.onProgressChanged(view, newProgress);
                        notifyListeners("webViewProgress", new JSObject().put("progress", newProgress));
                    }
                });

                bridge = new SocialEraserBridge();
                webView.addJavascriptInterface(bridge, "SocialEraserNative");

                webView.loadUrl("https://x.com");

                if (getActivity() != null) {
                    getActivity().runOnUiThread(() -> {
                        try {
                            View decorView = getActivity().getWindow().getDecorView();
                            FrameLayout rootView = (FrameLayout) decorView.findViewById(android.R.id.content);
                            if (rootView != null) {
                                rootView.addView(container);
                            }
                        } catch (Exception e) {
                            notifyListeners("webViewError", new JSObject().put("error", e.getMessage()));
                        }
                    });
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);

            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", e.getMessage());
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void injectScript(PluginCall call) {
        String script = call.getString("script", "");

        if (TextUtils.isEmpty(script)) {
            call.reject("Script is empty");
            return;
        }

        this.injectedScript = script;

        mainHandler.post(() -> {
            if (webView != null && webView.getUrl() != null && webView.getUrl().contains("x.com")) {
                injectScriptInternal(script);
                scriptInjected = true;
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    private void injectScriptInternal(String script) {
        if (webView != null) {
            String wrappedScript = "(function() {" + script + "})();";
            webView.evaluateJavascript(wrappedScript, null);
        }
    }

    @PluginMethod
    public void executeScript(PluginCall call) {
        String script = call.getString("script", "");

        if (TextUtils.isEmpty(script)) {
            call.reject("Script is empty");
            return;
        }

        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(script, value -> {
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("result", value);
                    call.resolve(ret);
                });
            } else {
                call.reject("WebView not initialized");
            }
        });
    }

    @PluginMethod
    public void startCleanup(PluginCall call) {
        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(
                    "if(window.SocialEraser && window.SocialEraser.start) window.SocialEraser.start();",
                    null
                );
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void stopCleanup(PluginCall call) {
        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(
                    "if(window.SocialEraser) SocialEraser.stop();",
                    null
                );
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void pauseCleanup(PluginCall call) {
        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(
                    "if(window.SocialEraser) SocialEraser.pause();",
                    null
                );
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void resumeCleanup(PluginCall call) {
        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(
                    "if(window.SocialEraser) SocialEraser.resume();",
                    null
                );
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void checkConnection(PluginCall call) {
        mainHandler.post(() -> {
            JSObject ret = new JSObject();
            if (webView != null && webView.getUrl() != null) {
                ret.put("connected", webView.getUrl().contains("x.com"));
                ret.put("url", webView.getUrl());
            } else {
                ret.put("connected", false);
            }
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        mainHandler.post(() -> {
            if (webView != null) {
                webView.stopLoading();
                webView.clearHistory();
                webView.clearCache(true);
                webView.loadUrl("about:blank");
                
                if (container != null && getActivity() != null) {
                    getActivity().runOnUiThread(() -> {
                        View decorView = getActivity().getWindow().getDecorView();
                        FrameLayout rootView = (FrameLayout) decorView.findViewById(android.R.id.content);
                        rootView.removeView(container);
                    });
                }
                
                webView = null;
                container = null;
                scriptInjected = false;
            }
            
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    class SocialEraserBridge {
        @JavascriptInterface
        public void postMessage(String data) {
            mainHandler.post(() -> {
                if (webView == null) return;

                try {
                    JSONObject jsonData = new JSONObject(data);
                    String source = jsonData.optString("source", "");
                    String type = jsonData.optString("type", "");
                    String message = jsonData.optString("message", "");
                    JSONObject payload = jsonData.optJSONObject("data");

                    if ("SocialEraser-Injector".equals(source)) {
                        JSObject event = new JSObject();
                        event.put("source", source);
                        event.put("type", type);
                        event.put("message", message);
                        if (payload != null) {
                            java.util.Iterator<String> keys = payload.keys();
                            while (keys.hasNext()) {
                                String key = keys.next();
                                event.put(key, payload.opt(key));
                            }
                        }

                        notifyListeners("xeEvent", event);

                        String script = "(function() {"
                            + "var event = new MessageEvent('message', {data: " + data + "});"
                            + "window.dispatchEvent(event);"
                            + "})();";
                        webView.evaluateJavascript(script, null);
                    }
                } catch (JSONException e) {
                    notifyListeners("xeEvent", new JSObject()
                        .put("source", "SocialEraser-Native")
                        .put("type", "error")
                        .put("message", "Failed to parse message: " + e.getMessage()));
                }
            });
        }

        @JavascriptInterface
        public void log(String level, String message) {
            mainHandler.post(() -> {
                notifyListeners("xeLog", new JSObject()
                    .put("level", level)
                    .put("message", message));
            });
        }
    }
}