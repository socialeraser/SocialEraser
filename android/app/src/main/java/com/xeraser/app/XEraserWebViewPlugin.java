package com.xeraser.app;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.PluginMethod;

public class XEraserWebViewPlugin extends Plugin {
    
    private WebView webView;
    private FrameLayout container;
    private String injectedScript = "";
    private boolean scriptInjected = false;
    private Handler mainHandler;

    @Override
    public void load() {
        super.load();
        mainHandler = new Handler(Looper.getMainLooper());
    }

    @PluginMethod
    public void loadX(PluginCall call) {
        mainHandler.post(() -> {
            try {
                // 创建 WebView
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
                
                // 创建容器
                container = new FrameLayout(getContext());
                container.addView(webView);
                
                // 设置 WebViewClient
                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);
                        
                        // 页面加载完成后注入脚本
                        if (!scriptInjected && !injectedScript.isEmpty()) {
                            injectScriptInternal(injectedScript);
                        }
                    }
                });
                
                webView.setWebChromeClient(new WebChromeClient());
                
                // 添加 JavaScript 接口
                webView.addJavascriptInterface(new XEraserBridge(), "XEraserNative");
                
                // 加载 x.com
                webView.loadUrl("https://x.com");
                
                // 在视图中显示 WebView
                if (getActivity() != null) {
                    getActivity().runOnUiThread(() -> {
                        View decorView = getActivity().getWindow().getDecorView();
                        FrameLayout rootView = (FrameLayout) decorView.findViewById(android.R.id.content);
                        rootView.addView(container);
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
        
        if (script.isEmpty()) {
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
    public void startCleanup(PluginCall call) {
        // 直接调用 injector.js 的 start 方法
        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(
                    "if(window.XEraser) XEraser.start();",
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
                    "if(window.XEraser) XEraser.stop();",
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
                    "if(window.XEraser) XEraser.pause();",
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
                    "if(window.XEraser) XEraser.resume();",
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

    // JavaScript Bridge 用于接收 injector.js 的消息
    class XEraserBridge {
        @JavascriptInterface
        public void postMessage(String data) {
            // 将消息发送回 JavaScript
            mainHandler.post(() -> {
                if (webView != null) {
                    String script = "window.dispatchEvent(new MessageEvent('message', {data: " + data + "}));";
                    webView.evaluateJavascript(script, null);
                }
            });
        }
    }
}