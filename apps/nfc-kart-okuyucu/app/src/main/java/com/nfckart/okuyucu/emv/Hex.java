package com.nfckart.okuyucu.emv;

/** Bayt dizisi ile onaltılık metin arasında dönüşüm. */
public final class Hex {
    private static final char[] DIGITS = "0123456789ABCDEF".toCharArray();

    private Hex() {}

    /** Büyük harfli, boşluksuz onaltılık metin. */
    public static String toHex(byte[] bytes) {
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            out[i * 2] = DIGITS[(bytes[i] >> 4) & 0x0F];
            out[i * 2 + 1] = DIGITS[bytes[i] & 0x0F];
        }
        return new String(out);
    }

    /** Boşlukları yok sayar; tek sayıda hane ya da geçersiz karakterde {@link IllegalArgumentException}. */
    public static byte[] fromHex(String hex) {
        String s = hex.replaceAll("\\s", "");
        if (s.length() % 2 != 0) {
            throw new IllegalArgumentException("Tek sayıda onaltılık hane: " + hex);
        }
        byte[] out = new byte[s.length() / 2];
        for (int i = 0; i < out.length; i++) {
            int hi = Character.digit(s.charAt(i * 2), 16);
            int lo = Character.digit(s.charAt(i * 2 + 1), 16);
            if (hi < 0 || lo < 0) {
                throw new IllegalArgumentException("Geçersiz onaltılık karakter: " + hex);
            }
            out[i] = (byte) ((hi << 4) | lo);
        }
        return out;
    }
}
