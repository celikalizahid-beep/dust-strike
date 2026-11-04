package com.nfckart.okuyucu.emv;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Komut önekine göre kayıtlı yanıtları döndüren sahte kart. Eşleşmeyen komut → 6A82. */
final class FakeCard implements Transceiver {
    final List<String> sent = new ArrayList<>();
    private final List<String[]> rules = new ArrayList<>();
    private final List<String> throwPrefixes = new ArrayList<>();

    FakeCard on(String cmdHexPrefix, String responseHex) {
        rules.add(new String[] {cmdHexPrefix, responseHex});
        return this;
    }

    FakeCard throwOn(String cmdHexPrefix) {
        throwPrefixes.add(cmdHexPrefix);
        return this;
    }

    @Override
    public byte[] transceive(byte[] apdu) throws IOException {
        String cmd = Hex.toHex(apdu);
        sent.add(cmd);
        for (String p : throwPrefixes) {
            if (cmd.startsWith(p)) {
                throw new IOException("Tag was lost.");
            }
        }
        for (String[] r : rules) {
            if (cmd.startsWith(r[0])) {
                return Hex.fromHex(r[1]);
            }
        }
        return Hex.fromHex("6A82");
    }

    /** Uzunluğu hesaplayarak TLV hex'i üretir. */
    static String tlv(String tagHex, String... valueHexParts) {
        String value = String.join("", valueHexParts);
        int len = value.length() / 2;
        String lenHex = len < 0x80 ? String.format("%02X", len)
                : len <= 0xFF ? String.format("81%02X", len)
                : String.format("82%04X", len);
        return tagHex + lenHex + value;
    }

    static String ascii(String s) {
        return Hex.toHex(s.getBytes(StandardCharsets.US_ASCII));
    }
}
