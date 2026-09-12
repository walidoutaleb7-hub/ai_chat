package com.weura.ai;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {

    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int CAMERA_PERMISSION_REQUEST = 1002;

    private WebView webView;

    private ValueCallback<Uri[]> filePathCallback;

    private PermissionRequest pendingPermissionRequest;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        setupWebView();

        // WEURA AI — Vercel
        webView.loadUrl(
                "https://ai-chat-nine-gamma.vercel.app"
        );
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {

        WebSettings settings =
                webView.getSettings();

        // JavaScript
        settings.setJavaScriptEnabled(true);

        // Local storage
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // Web content
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        // Responsive WebView
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);

        // Media
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Keep WEURA navigation inside the app
        webView.setWebViewClient(
                new WebViewClient()
        );

        // File picker + camera permissions
        webView.setWebChromeClient(
                new WebChromeClient() {

                    @Override
                    public boolean onShowFileChooser(
                            WebView webView,
                            ValueCallback<Uri[]> callback,
                            FileChooserParams params
                    ) {

                        if (filePathCallback != null) {
                            filePathCallback
                                    .onReceiveValue(null);
                        }

                        filePathCallback =
                                callback;

                        Intent intent;

                        try {
                            intent =
                                    params.createIntent();

                        } catch (Exception e) {

                            intent =
                                    new Intent(
                                            Intent.ACTION_GET_CONTENT
                                    );

                            intent.setType("*/*");

                            intent.addCategory(
                                    Intent.CATEGORY_OPENABLE
                            );
                        }

                        try {

                            startActivityForResult(
                                    intent,
                                    FILE_CHOOSER_REQUEST
                            );

                        } catch (Exception e) {

                            filePathCallback
                                    .onReceiveValue(null);

                            filePathCallback =
                                    null;

                            Toast.makeText(
                                    MainActivity.this,
                                    "Unable to open file picker",
                                    Toast.LENGTH_SHORT
                            ).show();
                        }

                        return true;
                    }

                    @Override
                    public void onPermissionRequest(
                            PermissionRequest request
                    ) {

                        runOnUiThread(() -> {

                            boolean needsCamera =
                                    false;

                            for (
                                    String resource :
                                    request.getResources()
                            ) {

                                if (
                                        PermissionRequest
                                                .RESOURCE_VIDEO_CAPTURE
                                                .equals(resource)
                                ) {
                                    needsCamera = true;
                                    break;
                                }
                            }

                            if (
                                    needsCamera &&
                                    ContextCompat.checkSelfPermission(
                                            MainActivity.this,
                                            Manifest.permission.CAMERA
                                    ) !=
                                            PackageManager.PERMISSION_GRANTED
                            ) {

                                pendingPermissionRequest =
                                        request;

                                ActivityCompat.requestPermissions(
                                        MainActivity.this,
                                        new String[]{
                                                Manifest.permission.CAMERA
                                        },
                                        CAMERA_PERMISSION_REQUEST
                                );

                                return;
                            }

                            request.grant(
                                    request.getResources()
                            );
                        });
                    }
                }
        );
    }

    @Override
    protected void onActivityResult(
            int requestCode,
            int resultCode,
            Intent data
    ) {

        super.onActivityResult(
                requestCode,
                resultCode,
                data
        );

        if (
                requestCode ==
                        FILE_CHOOSER_REQUEST
        ) {

            Uri[] results = null;

            if (
                    resultCode ==
                            Activity.RESULT_OK &&
                    data != null
            ) {

                // Multiple files
                if (
                        data.getClipData() != null
                ) {

                    int count =
                            data.getClipData()
                                    .getItemCount();

                    results =
                            new Uri[count];

                    for (
                            int i = 0;
                            i < count;
                            i++
                    ) {

                        results[i] =
                                data.getClipData()
                                        .getItemAt(i)
                                        .getUri();
                    }

                }

                // Single file
                else if (
                        data.getData() != null
                ) {

                    results =
                            new Uri[]{
                                    data.getData()
                            };
                }
            }

            if (
                    filePathCallback != null
            ) {

                filePathCallback
                        .onReceiveValue(results);

                filePathCallback =
                        null;
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults
    ) {

        super.onRequestPermissionsResult(
                requestCode,
                permissions,
                grantResults
        );

        if (
                requestCode ==
                        CAMERA_PERMISSION_REQUEST
        ) {

            boolean granted =
                    grantResults.length > 0 &&
                    grantResults[0] ==
                            PackageManager.PERMISSION_GRANTED;

            if (
                    granted &&
                    pendingPermissionRequest != null
            ) {

                pendingPermissionRequest
                        .grant(
                                pendingPermissionRequest
                                        .getResources()
                        );

            } else if (
                    pendingPermissionRequest != null
            ) {

                pendingPermissionRequest
                        .deny();
            }

            pendingPermissionRequest =
                    null;
        }
    }

    @Override
    public void onBackPressed() {

        if (
                webView != null &&
                webView.canGoBack()
        ) {

            webView.goBack();

        } else {

            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {

        if (webView != null) {

            webView.loadUrl(
                    "about:blank"
            );

            webView.stopLoading();

            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);

            webView.destroy();

            webView = null;
        }

        super.onDestroy();
    }
}