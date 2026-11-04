package com.nfckart.okuyucu.emv;

import static com.nfckart.okuyucu.emv.FakeCard.ascii;
import static com.nfckart.okuyucu.emv.FakeCard.tlv;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.IOException;
import org.junit.Test;

public class EmvReaderTest {
    private static final String OK = "9000";
    private static final String MC_AID = "A0000000041010";
    private static final String MC_PDOL = "9F66049F02069F1A025F2A029A039C019F3704";
    private static final String MC_FCI = tlv("6F", tlv("84", MC_AID),
            tlv("A5", tlv("50", ascii("Debit Mastercard")), tlv("9F38", MC_PDOL)));

    private static String ppse(String... aids) {
        StringBuilder entries = new StringBuilder();
        for (int i = 0; i < aids.length; i++) {
            entries.append(tlv("61", tlv("4F", aids[i]), tlv("87", String.format("%02X", i + 1))));
        }
        return tlv("6F", tlv("84", ascii("2PAY.SYS.DDF01")), tlv("A5", tlv("BF0C", entries.toString()))) + OK;
    }

    /** Mastercard uygulamasının seçim, GPO ve kayıt yanıtları (PPSE hariç). */
    private static FakeCard withMastercardApp(FakeCard card) {
        return card
                .on("00A4040007" + MC_AID, MC_FCI + OK)
                .on("80A80000", tlv("77", tlv("82", "1980"), tlv("94", "08010100" + "10010200")) + OK)
                .on("00B2010C", tlv("70", tlv("9F6B", "5555555555554444D2912201")) + OK)
                .on("00B20114", tlv("70", tlv("5A", "5555555555554444"), tlv("5F24", "291231"),
                        tlv("5F20", ascii(" /")), tlv("5F28", "0792"), tlv("9F42", "0949")) + OK)
                .on("00B20214", tlv("70", tlv("8C", "9F0206")) + OK);
    }

    private static FakeCard mastercard() {
        return withMastercardApp(new FakeCard().on("00A404000E", ppse(MC_AID)));
    }

    @Test
    public void readsMastercard() throws Exception {
        CardInfo c = new EmvReader(mastercard()).read();
        assertEquals("5555555555554444", c.pan);
        assertEquals("12/29", c.expiry);
        assertEquals("Debit Mastercard", c.cardType);
        assertNull(c.holderName);
        assertEquals("792", c.countryCode);
        assertEquals("949", c.currencyCode);
        assertEquals(MC_AID, c.aid);
    }

    @Test
    public void gpoCommandFilledFromPdol() throws Exception {
        FakeCard card = mastercard();
        new EmvReader(card).read();
        String gpo = card.sent.stream().filter(s -> s.startsWith("80A8")).findFirst().get();
        assertTrue(gpo, gpo.startsWith("80A80000188316"));
        assertEquals(2 * 30, gpo.length());
        assertTrue(gpo.endsWith("00"));
        String data = gpo.substring(14, 14 + 44);
        assertEquals("36000000", data.substring(0, 8));     // 9F66 TTQ
        assertEquals("000000000000", data.substring(8, 20)); // 9F02 tutar
        assertEquals("0792", data.substring(20, 24));        // 9F1A ülke
        assertEquals("0949", data.substring(24, 28));        // 5F2A para birimi
        assertEquals("00", data.substring(34, 36));          // 9C işlem tipi
    }

    @Test
    public void noPdolSendsEmptyGpo() throws Exception {
        FakeCard card = new FakeCard()
                .on("00A404000E", ppse(MC_AID))
                .on("00A4040007" + MC_AID, tlv("6F", tlv("84", MC_AID), tlv("A5", tlv("50", ascii("Mastercard")))) + OK)
                .on("80A80000", tlv("77", tlv("82", "1980"), tlv("94", "08010100")) + OK)
                .on("00B2010C", tlv("70", tlv("5A", "5555555555554444")) + OK);
        new EmvReader(card).read();
        assertTrue(card.sent.toString(), card.sent.contains("80A8000002830000"));
    }

    @Test
    public void fallsBackToKnownAidsWhenPpseFails() throws Exception {
        FakeCard card = withMastercardApp(new FakeCard()); // PPSE kuralı yok → 6A82
        CardInfo c = new EmvReader(card).read();
        assertEquals("5555555555554444", c.pan);
        assertTrue(card.sent.get(0).startsWith("00A404000E"));
    }

    @Test
    public void triesNextAidWhenSelectFails() throws Exception {
        FakeCard card = withMastercardApp(new FakeCard()
                .on("00A404000E", ppse("A0000000043060", MC_AID))); // Maestro seçimi → 6A82
        CardInfo c = new EmvReader(card).read();
        assertEquals(MC_AID, c.aid);
        assertTrue(card.sent.contains("00A4040007A000000004306000"));
    }

    @Test
    public void panAndExpiryFromTrack2Only() throws Exception {
        FakeCard card = new FakeCard()
                .on("00A404000E", ppse("A0000000031010"))
                .on("00A4040007A0000000031010", tlv("6F", tlv("84", "A0000000031010")) + OK)
                .on("80A80000", tlv("77", tlv("82", "0000"), tlv("94", "08010100")) + OK)
                .on("00B2010C", tlv("70", tlv("57", "4111111111111111D27051010000000000000F")) + OK);
        CardInfo c = new EmvReader(card).read();
        assertEquals("4111111111111111", c.pan);
        assertEquals("05/27", c.expiry);
        assertEquals("Visa", c.cardType);
    }

    @Test
    public void stripsPanPadding() throws Exception {
        FakeCard card = new FakeCard()
                .on("00A404000E", ppse("A00000002501"))
                .on("00A4040006A00000002501", tlv("6F", tlv("84", "A00000002501"), tlv("A5", tlv("50", ascii("AMEX")))) + OK)
                .on("80A80000", tlv("77", tlv("94", "08010100")) + OK)
                .on("00B2010C", tlv("70", tlv("5A", "378282246310005F")) + OK);
        assertEquals("378282246310005", new EmvReader(card).read().pan);
    }

    @Test
    public void gpoFailureFallsBackToRecordScan() throws Exception {
        FakeCard card = new FakeCard()
                .on("00A404000E", ppse(MC_AID))
                .on("00A4040007" + MC_AID, tlv("6F", tlv("84", MC_AID)) + OK)
                .on("80A80000", "6985")
                .on("00B2010C", tlv("70", tlv("5A", "5555555555554444"), tlv("5F24", "291231")) + OK);
        CardInfo c = new EmvReader(card).read();
        assertEquals("5555555555554444", c.pan);
        assertEquals("12/29", c.expiry);
    }

    @Test
    public void followsGetResponseOn61xx() throws Exception {
        FakeCard card = withMastercardApp(new FakeCard()
                .on("00A404000E", ppse(MC_AID))
                .on("00A4040007" + MC_AID, "6120")
                .on("00C0000020", MC_FCI + OK));
        CardInfo c = new EmvReader(card).read();
        assertEquals("Debit Mastercard", c.cardType);
        assertTrue(card.sent.contains("00C0000020"));
    }

    @Test
    public void retriesWithLeOn6Cxx() throws Exception {
        FakeCard card = new FakeCard()
                .on("00A404000E", ppse(MC_AID))
                .on("00A4040007" + MC_AID, tlv("6F", tlv("84", MC_AID)) + OK)
                .on("80A80000", tlv("77", tlv("94", "08010100")) + OK)
                .on("00B2010C1A", tlv("70", tlv("5A", "5555555555554444")) + OK)
                .on("00B2010C00", "6C1A");
        assertEquals("5555555555554444", new EmvReader(card).read().pan);
    }

    @Test
    public void noPaymentAppThrows() throws Exception {
        try {
            new EmvReader(new FakeCard()).read();
            fail("EmvException bekleniyordu");
        } catch (EmvException e) {
            assertEquals("Kartta desteklenen bir ödeme uygulaması bulunamadı", e.getMessage());
        }
    }

    @Test
    public void missingPanThrows() throws Exception {
        FakeCard card = new FakeCard()
                .on("00A404000E", ppse(MC_AID))
                .on("00A4040007" + MC_AID, MC_FCI + OK)
                .on("80A80000", tlv("77", tlv("94", "08010100")) + OK)
                .on("00B2010C", tlv("70", tlv("5F24", "291231")) + OK);
        try {
            new EmvReader(card).read();
            fail("EmvException bekleniyordu");
        } catch (EmvException e) {
            assertEquals("Kart numarası okunamadı", e.getMessage());
        }
    }

    @Test(expected = IOException.class)
    public void ioExceptionPropagates() throws Exception {
        new EmvReader(mastercard().throwOn("00B2")).read();
    }
}
