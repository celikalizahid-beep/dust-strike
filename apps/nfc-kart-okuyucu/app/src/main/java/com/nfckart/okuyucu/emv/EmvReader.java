package com.nfckart.okuyucu.emv;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.Charset;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Temassız EMV kartından temel bilgileri okur:
 * PPSE → uygulama seçimi → GPO → kayıt okuma (READ RECORD).
 *
 * <p>{@link IOException} (ör. kart erken uzaklaştı) hiçbir yerde yakalanmaz, çağırana iletilir.
 */
public final class EmvReader {
    private static final Charset ASCII = Charset.forName("US-ASCII");
    private static final byte[] PPSE = "2PAY.SYS.DDF01".getBytes(ASCII);

    /** Yedek AID listesi ve adları, deneme sırasıyla. */
    private static final String[][] KNOWN_AIDS = {
        {"A0000000041010", "Mastercard"},
        {"A0000000043060", "Maestro"},
        {"A0000000031010", "Visa"},
        {"A0000000032010", "Visa Electron"},
        {"A0000006723010", "Troy"},
        {"A00000002501", "American Express"},
    };

    private static final int MAX_GET_RESPONSE = 16;
    private static final int SCAN_MAX_SFI = 10;
    private static final int SCAN_MAX_RECORD = 16;

    private final Transceiver card;
    private final SecureRandom random = new SecureRandom();

    public EmvReader(Transceiver card) {
        this.card = card;
    }

    public CardInfo read() throws IOException, EmvException {
        String aid = null;
        Response fci = null;
        for (String candidate : candidateAids()) {
            Response r = send(select(Hex.fromHex(candidate)));
            if (r.ok()) {
                aid = candidate;
                fci = r;
                break;
            }
        }
        if (aid == null) {
            throw new EmvException("Kartta desteklenen bir ödeme uygulaması bulunamadı");
        }

        List<Tlv> all = new ArrayList<>(Tlv.parse(fci.data));
        Tlv pdol = Tlv.find(all, 0x9F38);
        Response gpo = send(gpoCommand(pdol == null ? new byte[0] : pdolData(pdol.value)));
        byte[] afl = null;
        if (gpo.ok()) {
            List<Tlv> g = Tlv.parse(gpo.data);
            all.addAll(g);
            afl = afl(g);
        }
        if (afl != null && afl.length >= 4) {
            readAfl(afl, all);
        } else {
            scanRecords(all);
        }
        return extract(all, aid);
    }

    // ---- AID seçimi ----

    private List<String> candidateAids() throws IOException {
        List<String> out = new ArrayList<>();
        Response r = send(select(PPSE));
        if (r.ok()) {
            final List<int[]> order = new ArrayList<>();
            final List<String> aids = new ArrayList<>();
            for (Tlv entry : Tlv.findAll(Tlv.parse(r.data), 0x61)) {
                Tlv aid = Tlv.find(entry.children, 0x4F);
                if (aid == null || aid.value.length == 0) {
                    continue;
                }
                Tlv prio = Tlv.find(entry.children, 0x87);
                int p = prio != null && prio.value.length > 0 ? prio.value[0] & 0x0F : 0;
                order.add(new int[] {p == 0 ? 16 : p, aids.size()});
                aids.add(Hex.toHex(aid.value));
            }
            Collections.sort(order, new Comparator<int[]>() {
                @Override
                public int compare(int[] a, int[] b) {
                    return Integer.compare(a[0], b[0]);
                }
            });
            for (int[] o : order) {
                String aid = aids.get(o[1]);
                if (!out.contains(aid)) {
                    out.add(aid);
                }
            }
        }
        for (String[] known : KNOWN_AIDS) {
            if (!out.contains(known[0])) {
                out.add(known[0]);
            }
        }
        return out;
    }

    // ---- GPO ----

    private byte[] pdolData(byte[] dol) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int i = 0;
        while (i < dol.length) {
            int first = dol[i++] & 0xFF;
            int tag = first;
            if ((first & 0x1F) == 0x1F) {
                int b;
                do {
                    if (i >= dol.length) {
                        return out.toByteArray();
                    }
                    b = dol[i++] & 0xFF;
                    tag = (tag << 8) | b;
                } while ((b & 0x80) != 0);
            }
            if (i >= dol.length) {
                break;
            }
            int len = dol[i++] & 0xFF;
            byte[] v = defaultValue(tag);
            if (v == null || v.length != len) {
                v = new byte[len];
            }
            out.write(v, 0, v.length);
        }
        return out.toByteArray();
    }

    /** Spec'teki PDOL varsayılanları; tabloda olmayan etiket için {@code null} (sıfırla doldurulur). */
    private byte[] defaultValue(int tag) {
        switch (tag) {
            case 0x9F66: return Hex.fromHex("36000000");   // TTQ
            case 0x9F1A: return Hex.fromHex("0792");       // terminal ülke kodu: Türkiye
            case 0x5F2A: return Hex.fromHex("0949");       // işlem para birimi: TRY
            case 0x9C:   return Hex.fromHex("00");         // işlem tipi
            case 0x9F35: return Hex.fromHex("22");         // terminal tipi
            case 0x9F33: return Hex.fromHex("E0B0C8");     // terminal yetenekleri
            case 0x9A:   return today();                    // işlem tarihi YY AA GG
            case 0x9F37: {                                   // rastgele sayı
                byte[] un = new byte[4];
                random.nextBytes(un);
                return un;
            }
            default: return null;                            // 9F02, 9F03, 95 ve diğerleri: sıfır
        }
    }

    private static byte[] today() {
        Calendar c = Calendar.getInstance();
        return new byte[] {
            bcd(c.get(Calendar.YEAR) % 100), bcd(c.get(Calendar.MONTH) + 1), bcd(c.get(Calendar.DAY_OF_MONTH))
        };
    }

    private static byte bcd(int n) {
        return (byte) (((n / 10) << 4) | (n % 10));
    }

    private static byte[] gpoCommand(byte[] pdolData) {
        ByteArrayOutputStream data = new ByteArrayOutputStream();
        data.write(0x83);
        if (pdolData.length >= 0x80) {
            data.write(0x81);
        }
        data.write(pdolData.length);
        data.write(pdolData, 0, pdolData.length);
        return apdu(0x80, 0xA8, 0x00, 0x00, data.toByteArray());
    }

    /** GPO yanıtından AFL: biçim 1 (etiket 80: 2 bayt AIP + AFL) ya da biçim 2 (77 içinde 94). */
    private static byte[] afl(List<Tlv> gpo) {
        Tlv t94 = Tlv.find(gpo, 0x94);
        if (t94 != null) {
            return t94.value;
        }
        Tlv t80 = Tlv.find(gpo, 0x80);
        if (t80 != null && t80.value.length > 2) {
            byte[] out = new byte[t80.value.length - 2];
            System.arraycopy(t80.value, 2, out, 0, out.length);
            return out;
        }
        return null;
    }

    // ---- Kayıt okuma ----

    private void readAfl(byte[] afl, List<Tlv> all) throws IOException {
        for (int i = 0; i + 4 <= afl.length; i += 4) {
            int sfi = (afl[i] & 0xFF) >> 3;
            int first = Math.max(1, afl[i + 1] & 0xFF);
            int last = afl[i + 2] & 0xFF;
            for (int rec = first; rec <= last; rec++) {
                Response r = send(readRecord(rec, sfi));
                if (r.ok()) {
                    all.addAll(Tlv.parse(r.data));
                }
            }
        }
    }

    private void scanRecords(List<Tlv> all) throws IOException {
        for (int sfi = 1; sfi <= SCAN_MAX_SFI; sfi++) {
            for (int rec = 1; rec <= SCAN_MAX_RECORD; rec++) {
                Response r = send(readRecord(rec, sfi));
                if (!r.ok()) {
                    break;
                }
                all.addAll(Tlv.parse(r.data));
            }
        }
    }

    private static byte[] readRecord(int rec, int sfi) {
        return new byte[] {0x00, (byte) 0xB2, (byte) rec, (byte) ((sfi << 3) | 4), 0x00};
    }

    // ---- Bilgileri çıkarma ----

    private static CardInfo extract(List<Tlv> all, String aid) throws EmvException {
        String pan = null;
        String expiry = null;

        Tlv t5a = Tlv.find(all, 0x5A);
        if (t5a != null) {
            pan = digitsBeforePadding(Hex.toHex(t5a.value));
        }
        String track2 = null;
        for (int tag : new int[] {0x57, 0x9F6B}) {
            Tlv t = Tlv.find(all, tag);
            if (t != null && Hex.toHex(t.value).indexOf('D') > 0) {
                track2 = Hex.toHex(t.value);
                break;
            }
        }
        if (pan == null && track2 != null) {
            pan = digitsOnly(track2.substring(0, track2.indexOf('D')));
        }
        if (pan == null) {
            pan = panFromTrack1(Tlv.find(all, 0x56));
        }
        if (pan == null) {
            throw new EmvException("Kart numarası okunamadı");
        }

        Tlv t5f24 = Tlv.find(all, 0x5F24);
        if (t5f24 != null) {
            String ymd = Hex.toHex(t5f24.value);
            if (ymd.length() >= 4 && digitsOnly(ymd.substring(0, 4)) != null) {
                expiry = ymd.substring(2, 4) + "/" + ymd.substring(0, 2);
            }
        }
        if (expiry == null && track2 != null) {
            int d = track2.indexOf('D');
            if (track2.length() >= d + 5 && digitsOnly(track2.substring(d + 1, d + 5)) != null) {
                expiry = track2.substring(d + 3, d + 5) + "/" + track2.substring(d + 1, d + 3);
            }
        }

        String holder = text(Tlv.find(all, 0x5F20));
        if (holder == null || holder.equals("/")) {
            holder = text(Tlv.find(all, 0x9F0B));
        }
        if (holder != null && holder.equals("/")) {
            holder = null;
        }

        String cardType = text(Tlv.find(all, 0x9F12));
        if (cardType == null) {
            cardType = text(Tlv.find(all, 0x50));
        }
        if (cardType == null) {
            cardType = knownName(aid);
        }

        return new CardInfo(pan, expiry, cardType, holder,
                numericCode(Tlv.find(all, 0x5F28)), numericCode(Tlv.find(all, 0x9F42)), aid);
    }

    private static String knownName(String aid) {
        for (String[] known : KNOWN_AIDS) {
            if (known[0].equals(aid)) {
                return known[1];
            }
        }
        return "Ödeme kartı";
    }

    /** BCD kart numarası: ilk 'F' dolgusuna kadar olan rakamlar. */
    private static String digitsBeforePadding(String hex) {
        int f = hex.indexOf('F');
        return digitsOnly(f >= 0 ? hex.substring(0, f) : hex);
    }

    /** Metin boş değilse ve yalnızca 0–9 rakamlarından oluşuyorsa kendisi, değilse {@code null}. */
    private static String digitsOnly(String s) {
        if (s.isEmpty()) {
            return null;
        }
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c < '0' || c > '9') {
                return null;
            }
        }
        return s;
    }

    /** Track 1: "B<PAN>^AD^YYAA...". */
    private static String panFromTrack1(Tlv t56) {
        if (t56 == null) {
            return null;
        }
        String s = new String(t56.value, ASCII);
        int caret = s.indexOf('^');
        if (!s.startsWith("B") || caret < 0) {
            return null;
        }
        return digitsOnly(s.substring(1, caret).replace(" ", ""));
    }

    /** Yazdırılabilir ASCII metin, kırpılmış; boş ya da yazdırılamaz ise {@code null}. */
    private static String text(Tlv t) {
        if (t == null) {
            return null;
        }
        for (byte b : t.value) {
            if (b < 0x20 || b > 0x7E) {
                return null;
            }
        }
        String s = new String(t.value, ASCII).trim();
        return s.isEmpty() ? null : s;
    }

    /** BCD sayısal kod ("0792") → "792"; rakam değilse {@code null}. */
    private static String numericCode(Tlv t) {
        if (t == null || t.value.length == 0) {
            return null;
        }
        String hex = Hex.toHex(t.value);
        for (int i = 0; i < hex.length(); i++) {
            if (hex.charAt(i) > '9') {
                return null;
            }
        }
        return String.format(Locale.ROOT, "%03d", Integer.parseInt(hex));
    }

    // ---- APDU ----

    private static byte[] select(byte[] aid) {
        return apdu(0x00, 0xA4, 0x04, 0x00, aid);
    }

    /** CLA INS P1 P2 Lc veri Le(00). */
    private static byte[] apdu(int cla, int ins, int p1, int p2, byte[] data) {
        byte[] out = new byte[5 + data.length + 1];
        out[0] = (byte) cla;
        out[1] = (byte) ins;
        out[2] = (byte) p1;
        out[3] = (byte) p2;
        out[4] = (byte) data.length;
        System.arraycopy(data, 0, out, 5, data.length);
        return out;
    }

    /** Komutu gönderir; 6Cxx'te doğru Le ile yineler, 61xx'te GET RESPONSE ile devamını toplar. */
    private Response send(byte[] cmd) throws IOException {
        Response r = Response.of(card.transceive(cmd));
        if (r.sw1() == 0x6C) {
            byte[] retry = cmd.clone();
            retry[retry.length - 1] = (byte) r.sw2();
            r = Response.of(card.transceive(retry));
        }
        ByteArrayOutputStream data = new ByteArrayOutputStream();
        int rounds = 0;
        while (r.sw1() == 0x61 && rounds++ < MAX_GET_RESPONSE) {
            data.write(r.data, 0, r.data.length);
            r = Response.of(card.transceive(new byte[] {0x00, (byte) 0xC0, 0x00, 0x00, (byte) r.sw2()}));
        }
        if (data.size() == 0) {
            return r;
        }
        data.write(r.data, 0, r.data.length);
        return new Response(data.toByteArray(), r.sw);
    }

    private static final class Response {
        final byte[] data;
        final int sw;

        Response(byte[] data, int sw) {
            this.data = data;
            this.sw = sw;
        }

        static Response of(byte[] raw) {
            if (raw == null || raw.length < 2) {
                return new Response(new byte[0], 0);
            }
            byte[] data = new byte[raw.length - 2];
            System.arraycopy(raw, 0, data, 0, data.length);
            return new Response(data, ((raw[raw.length - 2] & 0xFF) << 8) | (raw[raw.length - 1] & 0xFF));
        }

        int sw1() {
            return sw >> 8;
        }

        int sw2() {
            return sw & 0xFF;
        }

        boolean ok() {
            return sw == 0x9000;
        }
    }
}
