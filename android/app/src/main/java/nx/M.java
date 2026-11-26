package nx;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

/** Activity tunggal: WebView yang memuat assets/index.html + jembatan native "NX". */
public class M extends Activity {
    WebView w;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        requestWindowFeature(1);                       // tanpa title bar
        getWindow().setStatusBarColor(0xFF0C1020);
        getWindow().setNavigationBarColor(0xFF0C1020);
        requestPermissions(new String[]{"android.permission.WRITE_EXTERNAL_STORAGE"}, 0); // hanya berefek di Android <= 9
        w = new WebView(this);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        w.setBackgroundColor(0xFF0C1020);
        w.addJavascriptInterface(new B(this), "NX");
        setContentView(w);
        Intent i = getIntent();
        String u = "file:///android_asset/index.html";
        if ("android.intent.action.SEND".equals(i.getAction())) {
            String t = i.getStringExtra("android.intent.extra.TEXT");
            if (t != null) u = u + "?s=" + Uri.encode(t);
        }
        w.loadUrl(u);
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        String t = i.getStringExtra("android.intent.extra.TEXT");
        if (t != null) w.evaluateJavascript("window.__share&&__share(decodeURIComponent(\"" + Uri.encode(t) + "\"))", null);
    }

    @Override public void onBackPressed() {
        if (w.getUrl() == null) { super.onBackPressed(); return; }
        w.evaluateJavascript("window.__back&&__back()", null);
    }
}
