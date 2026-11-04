package com.nfckart.okuyucu.emv;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class HexTest {
    @Test
    public void roundTrip() {
        assertEquals("00A4FF", Hex.toHex(Hex.fromHex("00 a4 ff")));
    }

    @Test(expected = IllegalArgumentException.class)
    public void oddLengthRejected() {
        Hex.fromHex("ABC");
    }
}
