package com.nfckart.okuyucu.emv;

import java.util.HashMap;
import java.util.Map;

/** Ekranda gösterilecek Türkçe adlar ve biçimler. */
public final class Labels {
    private static final String NONE = "—";
    private static final Map<String, String> COUNTRIES = new HashMap<>();
    private static final Map<String, String> CURRENCIES = new HashMap<>();

    static {
        COUNTRIES.put("792", "Türkiye");
        COUNTRIES.put("840", "ABD");
        COUNTRIES.put("826", "Birleşik Krallık");
        COUNTRIES.put("276", "Almanya");
        COUNTRIES.put("250", "Fransa");
        COUNTRIES.put("528", "Hollanda");

        CURRENCIES.put("949", "TRY (Türk Lirası)");
        CURRENCIES.put("840", "USD (ABD Doları)");
        CURRENCIES.put("978", "EUR (Euro)");
        CURRENCIES.put("826", "GBP (İngiliz Sterlini)");
    }

    private Labels() {}

    /** "792" → "Türkiye (792)"; bilinmeyen → kodun kendisi; {@code null} → "—". */
    public static String country(String code) {
        if (code == null) {
            return NONE;
        }
        String name = COUNTRIES.get(code);
        return name == null ? code : name + " (" + code + ")";
    }

    /** "949" → "TRY (Türk Lirası)"; bilinmeyen → kodun kendisi; {@code null} → "—". */
    public static String currency(String code) {
        if (code == null) {
            return NONE;
        }
        String name = CURRENCIES.get(code);
        return name == null ? code : name;
    }

    /** Kart numarasını 4'lü gruplara ayırır; {@code null} → "—". */
    public static String groupPan(String pan) {
        if (pan == null) {
            return NONE;
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < pan.length(); i++) {
            if (i > 0 && i % 4 == 0) {
                sb.append(' ');
            }
            sb.append(pan.charAt(i));
        }
        return sb.toString();
    }
}
