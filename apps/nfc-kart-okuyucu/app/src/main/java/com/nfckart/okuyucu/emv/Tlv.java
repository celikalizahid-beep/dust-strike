package com.nfckart.okuyucu.emv;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** EMV kartlarının kullandığı BER-TLV biçiminde tek bir öğe ve çözücüsü. */
public final class Tlv {
    /** Etiket, baytları birleştirilmiş tamsayı olarak (ör. {@code 0x9F38}). */
    public final int tag;
    public final byte[] value;
    /** Yapısal öğenin alt öğeleri; ilkel öğede boş. */
    public final List<Tlv> children;

    private final boolean constructed;

    private Tlv(int tag, boolean constructed, byte[] value) {
        this.tag = tag;
        this.constructed = constructed;
        this.value = value;
        this.children = constructed
                ? Collections.unmodifiableList(parse(value))
                : Collections.<Tlv>emptyList();
    }

    public boolean isConstructed() {
        return constructed;
    }

    /**
     * Veriyi TLV öğelerine çözer. Asla istisna fırlatmaz: bozuk ya da yarım veride o noktaya kadar
     * çözülenleri döndürür. Etiket konumundaki 0x00 / 0xFF dolgu baytları atlanır.
     */
    public static List<Tlv> parse(byte[] data) {
        List<Tlv> out = new ArrayList<>();
        int i = 0;
        while (i < data.length) {
            int first = data[i] & 0xFF;
            if (first == 0x00 || first == 0xFF) {
                i++;
                continue;
            }
            boolean constructed = (first & 0x20) != 0;
            int tag = first;
            i++;
            if ((first & 0x1F) == 0x1F) {
                int b;
                do {
                    if (i >= data.length) {
                        return out;
                    }
                    b = data[i++] & 0xFF;
                    tag = (tag << 8) | b;
                } while ((b & 0x80) != 0);
            }
            if (i >= data.length) {
                return out;
            }
            int len = data[i++] & 0xFF;
            if (len == 0x81) {
                if (i + 1 > data.length) {
                    return out;
                }
                len = data[i++] & 0xFF;
            } else if (len == 0x82) {
                if (i + 2 > data.length) {
                    return out;
                }
                len = ((data[i] & 0xFF) << 8) | (data[i + 1] & 0xFF);
                i += 2;
            } else if (len > 0x7F) {
                return out;
            }
            if (i + len > data.length) {
                return out;
            }
            byte[] value = new byte[len];
            System.arraycopy(data, i, value, 0, len);
            i += len;
            out.add(new Tlv(tag, constructed, value));
        }
        return out;
    }

    /** Derinlik öncelikli arama; bulunamazsa {@code null}. */
    public static Tlv find(List<Tlv> list, int tag) {
        for (Tlv t : list) {
            if (t.tag == tag) {
                return t;
            }
            Tlv inner = find(t.children, tag);
            if (inner != null) {
                return inner;
            }
        }
        return null;
    }

    /** Derinlik öncelikli, belge sırasında tüm eşleşmeler. */
    public static List<Tlv> findAll(List<Tlv> list, int tag) {
        List<Tlv> out = new ArrayList<>();
        collect(list, tag, out);
        return out;
    }

    private static void collect(List<Tlv> list, int tag, List<Tlv> out) {
        for (Tlv t : list) {
            if (t.tag == tag) {
                out.add(t);
            }
            collect(t.children, tag, out);
        }
    }
}
