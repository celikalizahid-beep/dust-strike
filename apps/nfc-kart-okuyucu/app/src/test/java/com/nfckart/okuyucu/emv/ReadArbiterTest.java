package com.nfckart.okuyucu.emv;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ReadArbiterTest {
    @Test
    public void firstReadIsCurrent() {
        ReadArbiter a = new ReadArbiter();
        int t = a.begin();
        assertTrue(a.isCurrent(t));
    }

    @Test
    public void newerReadSupersedesOlder() {
        ReadArbiter a = new ReadArbiter();
        int first = a.begin();
        int second = a.begin();
        assertFalse("eski okuma artık güncel olmamalı", a.isCurrent(first));
        assertTrue(a.isCurrent(second));
    }

    @Test
    public void tokensAreDistinct() {
        ReadArbiter a = new ReadArbiter();
        assertNotEquals(a.begin(), a.begin());
    }
}
