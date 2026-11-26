package nx;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import java.util.Hashtable;

/** Jembatan JS -> native (window.NX). HTTP bebas-CORS, DownloadManager, clipboard. */
public class B {
    Activity a;
    Hashtable m = new Hashtable();

    public B(Activity a) { this.a = a; }

    /** packed = method \u0001 url \u0001 headers(\n) \u0001 body \u0001 timeoutMs ; hasil diambil lewat poll(id) */
    @JavascriptInterface public void req(String id, String packed) {
        new Thread(new H(m, id, packed)).start();
    }

    @JavascriptInterface public String poll(String id) { return (String) m.remove(id); }

    @JavascriptInterface public String dl(String url, String name, String mime, String hd) {
        try {
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            r.setTitle(name);
            r.setMimeType(mime);
            r.setNotificationVisibility(1);
            r.setDestinationInExternalPublicDir("Download", name);
            String[] hs = hd.split("\n");
            for (int i = 0; i < hs.length; i++) {
                int k = hs[i].indexOf(':');
                if (k > 0) r.addRequestHeader(hs[i].substring(0, k).trim(), hs[i].substring(k + 1).trim());
            }
            DownloadManager d = (DownloadManager) a.getSystemService("download");
            return String.valueOf(d.enqueue(r));
        } catch (Throwable t) { return ""; }
    }

    /** "status|bytes|total" ; status: 1 antre, 2 jalan, 4 jeda, 8 selesai, 16 gagal */
    @JavascriptInterface public String dlState(String id) {
        try {
            DownloadManager d = (DownloadManager) a.getSystemService("download");
            DownloadManager.Query q = new DownloadManager.Query();
            q.setFilterById(new long[]{Long.parseLong(id)});
            Cursor c = d.query(q);
            String r = "";
            if (c.moveToFirst()) {
                StringBuilder s = new StringBuilder();
                s.append(c.getInt(c.getColumnIndex("status")));
                s.append("|");
                s.append(c.getLong(c.getColumnIndex("bytes_so_far")));
                s.append("|");
                s.append(c.getLong(c.getColumnIndex("total_size")));
                r = s.toString();
            }
            c.close();
            return r;
        } catch (Throwable t) { return ""; }
    }

    @JavascriptInterface public void copy(String t) {
        try {
            ClipboardManager c = (ClipboardManager) a.getSystemService("clipboard");
            c.setPrimaryClip(ClipData.newPlainText("nx", t));
        } catch (Throwable e) { }
    }

    @JavascriptInterface public String paste() {
        try {
            ClipboardManager c = (ClipboardManager) a.getSystemService("clipboard");
            ClipData d = c.getPrimaryClip();
            if (d == null || d.getItemCount() == 0) return "";
            return d.getItemAt(0).coerceToText(a).toString();
        } catch (Throwable e) { return ""; }
    }

    @JavascriptInterface public void open(String u) {
        try {
            Intent i = new Intent("android.intent.action.VIEW", Uri.parse(u));
            i.addFlags(0x10000000);
            a.startActivity(i);
        } catch (Throwable e) { }
    }

    @JavascriptInterface public void downloads() {
        try {
            Intent i = new Intent("android.intent.action.VIEW_DOWNLOADS");
            i.addFlags(0x10000000);
            a.startActivity(i);
        } catch (Throwable e) { }
    }

    @JavascriptInterface public void exit() { a.finish(); }
}
