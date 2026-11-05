package com.nfckart.okuyucu.emv;

import java.util.ArrayList;
import java.util.List;

/**
 * Kaydedilen kartların metne çevrilmesi ve geri okunması. Android'den bağımsızdır; depolamayı
 * (SharedPreferences vb.) çağıran taraf yapar. Biçim: her kart bir satır, alanlar TAB ile ayrılır,
 * her alan {@code -} (null) ya da {@code +<kaçışlı değer>} şeklindedir.
 */
public final class CardStore {
    private static final char FIELD = '\t';
    private static final char RECORD = '\n';
    private static final int FIELD_COUNT = 9;

    private CardStore() {}

    public static String serialize(List<SavedCard> cards) {
        StringBuilder sb = new StringBuilder();
        for (SavedCard c : cards) {
            if (sb.length() > 0) {
                sb.append(RECORD);
            }
            sb.append(field(c.label))
                    .append(FIELD).append(field(c.pan))
                    .append(FIELD).append(field(c.expiry))
                    .append(FIELD).append(field(c.cardType))
                    .append(FIELD).append(field(c.holderName))
                    .append(FIELD).append(field(c.countryCode))
                    .append(FIELD).append(field(c.currencyCode))
                    .append(FIELD).append(field(c.aid))
                    .append(FIELD).append(field(Long.toString(c.savedAt)));
        }
        return sb.toString();
    }

    public static List<SavedCard> deserialize(String text) {
        List<SavedCard> out = new ArrayList<>();
        if (text == null || text.isEmpty()) {
            return out;
        }
        for (String line : text.split("\n", -1)) {
            if (line.isEmpty()) {
                continue;
            }
            String[] parts = line.split("\t", -1);
            if (parts.length != FIELD_COUNT) {
                continue;
            }
            String pan = parse(parts[1]);
            if (pan == null || pan.isEmpty()) {
                continue;
            }
            long savedAt;
            try {
                savedAt = Long.parseLong(parse(parts[8]));
            } catch (NumberFormatException e) {
                continue;
            }
            out.add(new SavedCard(parse(parts[0]), pan, parse(parts[2]), parse(parts[3]),
                    parse(parts[4]), parse(parts[5]), parse(parts[6]), parse(parts[7]), savedAt));
        }
        return out;
    }

    /** null → "-"; değer → "+" + kaçışlı. */
    private static String field(String value) {
        if (value == null) {
            return "-";
        }
        return "+" + escape(value);
    }

    /** "-" → null; "+..." → kaçışı çözülmüş değer. */
    private static String parse(String token) {
        if (token.equals("-")) {
            return null;
        }
        if (token.startsWith("+")) {
            return unescape(token.substring(1));
        }
        return "";
    }

    private static String escape(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '\t': sb.append("\\t"); break;
                case '\n': sb.append("\\n"); break;
                default: sb.append(c);
            }
        }
        return sb.toString();
    }

    private static String unescape(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\' && i + 1 < s.length()) {
                char n = s.charAt(++i);
                switch (n) {
                    case '\\': sb.append('\\'); break;
                    case 't': sb.append('\t'); break;
                    case 'n': sb.append('\n'); break;
                    default: sb.append(n);
                }
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
