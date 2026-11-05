package com.nfckart.okuyucu.emv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class CardStoreTest {
    private static SavedCard sample() {
        return new SavedCard("Papara", "5555555555554444", "12/29", "Debit Mastercard",
                null, "792", "949", "A0000000041010", 1730000000000L);
    }

    @Test
    public void roundTripAllFields() {
        SavedCard c = new SavedCard("Maaş", "4111111111111111", "05/27", "Visa",
                "ALI VELI", "792", "949", "A0000000031010", 1730000001234L);
        List<SavedCard> back = CardStore.deserialize(CardStore.serialize(Collections.singletonList(c)));
        assertEquals(1, back.size());
        SavedCard r = back.get(0);
        assertEquals("Maaş", r.label);
        assertEquals("4111111111111111", r.pan);
        assertEquals("05/27", r.expiry);
        assertEquals("Visa", r.cardType);
        assertEquals("ALI VELI", r.holderName);
        assertEquals("792", r.countryCode);
        assertEquals("949", r.currencyCode);
        assertEquals("A0000000031010", r.aid);
        assertEquals(1730000001234L, r.savedAt);
    }

    @Test
    public void nullableFieldsStayNull() {
        SavedCard c = new SavedCard("", "5555555555554444", null, "Mastercard",
                null, null, null, "A0000000041010", 1730000000000L);
        SavedCard r = CardStore.deserialize(CardStore.serialize(Collections.singletonList(c))).get(0);
        assertEquals("", r.label);
        assertNull(r.expiry);
        assertNull(r.holderName);
        assertNull(r.countryCode);
        assertNull(r.currencyCode);
    }

    @Test
    public void labelWithDelimitersAndTurkishRoundTrips() {
        String tricky = "Ev\tkartı\nşÇĞ \\ işareti";
        SavedCard c = new SavedCard(tricky, "5555555555554444", "12/29", "Mastercard",
                null, "792", "949", "A0000000041010", 1L);
        SavedCard r = CardStore.deserialize(CardStore.serialize(Collections.singletonList(c))).get(0);
        assertEquals(tricky, r.label);
        assertEquals("5555555555554444", r.pan);
    }

    @Test
    public void multipleCardsKeepOrder() {
        SavedCard a = sample();
        SavedCard b = new SavedCard("İkinci", "4111111111111111", "05/27", "Visa",
                null, null, null, "A0000000031010", 2L);
        List<SavedCard> back = CardStore.deserialize(CardStore.serialize(Arrays.asList(a, b)));
        assertEquals(2, back.size());
        assertEquals("Papara", back.get(0).label);
        assertEquals("İkinci", back.get(1).label);
    }

    @Test
    public void emptyStringGivesEmptyList() {
        assertTrue(CardStore.deserialize("").isEmpty());
        assertTrue(CardStore.deserialize(null).isEmpty());
    }

    @Test
    public void malformedLinesAreSkipped() {
        String good = CardStore.serialize(Collections.singletonList(sample()));
        List<SavedCard> back = CardStore.deserialize("bozuk satır\n" + good + "\neksik\tiki\talan");
        assertEquals(1, back.size());
        assertEquals("5555555555554444", back.get(0).pan);
    }

    @Test
    public void recordWithEmptyPanIsSkipped() {
        SavedCard empty = new SavedCard("x", "", "12/29", "Mastercard", null, null, null, "A0", 1L);
        assertTrue(CardStore.deserialize(CardStore.serialize(Collections.singletonList(empty))).isEmpty());
    }
}
