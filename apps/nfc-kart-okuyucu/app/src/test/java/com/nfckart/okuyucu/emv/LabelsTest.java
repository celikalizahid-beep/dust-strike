package com.nfckart.okuyucu.emv;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class LabelsTest {
    @Test
    public void country() {
        assertEquals("Türkiye (792)", Labels.country("792"));
        assertEquals("999", Labels.country("999"));
        assertEquals("—", Labels.country(null));
    }

    @Test
    public void currency() {
        assertEquals("TRY (Türk Lirası)", Labels.currency("949"));
        assertEquals("EUR (Euro)", Labels.currency("978"));
        assertEquals("—", Labels.currency(null));
    }

    @Test
    public void groupPan() {
        assertEquals("5555 5555 5555 4444", Labels.groupPan("5555555555554444"));
        assertEquals("3782 8224 6310 005", Labels.groupPan("378282246310005"));
        assertEquals("—", Labels.groupPan(null));
    }
}
