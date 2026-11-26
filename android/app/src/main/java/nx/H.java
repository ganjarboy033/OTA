package nx;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Hashtable;

/** Worker HTTP: hasil = status \u0001 urlAkhir \u0001 header(\n) \u0001 body ; gagal = "0\u0001ERR\u0001\u0001pesan" */
public class H implements Runnable {
    Hashtable m; String i; String p;

    public H(Hashtable m, String i, String p) { this.m = m; this.i = i; this.p = p; }

    public void run() {
        String r;
        try {
            String[] q = p.split("\u0001", 5);
            HttpURLConnection c = (HttpURLConnection) new URL(q[1]).openConnection();
            int to = Integer.parseInt(q[4]);
            c.setConnectTimeout(to);
            c.setReadTimeout(to);
            c.setRequestMethod(q[0]);
            String[] hs = q[2].split("\n");
            for (int n = 0; n < hs.length; n++) {
                int k = hs[n].indexOf(':');
                if (k > 0) c.setRequestProperty(hs[n].substring(0, k).trim(), hs[n].substring(k + 1).trim());
            }
            if (q[3].length() != 0) {
                c.setDoOutput(true);
                OutputStream o = c.getOutputStream();
                o.write(q[3].getBytes("UTF-8"));
                o.close();
            }
            int st = c.getResponseCode();
            InputStream in = st >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            if (in != null) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                in.close();
            }
            StringBuilder s = new StringBuilder();
            s.append(st);
            s.append("\u0001");
            s.append(c.getURL().toString());
            s.append("\u0001");
            for (int n = 0; ; n++) {
                String k = c.getHeaderFieldKey(n), v = c.getHeaderField(n);
                if (k == null) { if (v == null) break; continue; }
                s.append(k); s.append(": "); s.append(v); s.append("\n");
            }
            s.append("\u0001");
            s.append(new String(bo.toByteArray(), "UTF-8"));
            r = s.toString();
        } catch (Throwable t) {
            StringBuilder s = new StringBuilder();
            s.append("0\u0001ERR\u0001\u0001");
            s.append(t);
            r = s.toString();
        }
        m.put(i, r);
    }
}
