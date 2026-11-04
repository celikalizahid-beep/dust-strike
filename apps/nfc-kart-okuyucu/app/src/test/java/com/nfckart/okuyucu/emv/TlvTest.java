package com.nfckart.okuyucu.emv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

public class TlvTest {
    @Test
    public void multiByteTagAndLongLength() {
        // 9F38: çok baytlı etiket; 5F20: 0x81 0x80 → 128 baytlık değer
        List<Tlv> l = Tlv.parse(Hex.fromHex("9F3803010203" + "5F2081" + "80" + "41".repeat(128)));
        assertEquals(0x9F38, l.get(0).tag);
        assertEquals("010203", Hex.toHex(l.get(0).value));
        assertEquals(0x5F20, l.get(1).tag);
        assertEquals(128, l.get(1).value.length);
    }

    @Test
    public void twoByteLength() {
        assertEquals(300, Tlv.parse(Hex.fromHex("5A82012C" + "00".repeat(300))).get(0).value.length);
    }

    @Test
    public void nestedFindAndFindAll() {
        // 6F{84, A5{BF0C{61{4F=A00001}, 61{4F=A0000002}}}}
        List<Tlv> l = Tlv.parse(Hex.fromHex(
                "6F17" + "8401AA" + "A512" + "BF0C0F" + "6105" + "4F03A00001" + "6106" + "4F04A0000002"));
        assertTrue(l.get(0).isConstructed());
        assertEquals("A00001", Hex.toHex(Tlv.find(l, 0x4F).value));
        assertEquals(2, Tlv.findAll(l, 0x4F).size());
        assertEquals("A0000002", Hex.toHex(Tlv.findAll(l, 0x4F).get(1).value));
        assertNull(Tlv.find(l, 0x50));
    }

    @Test
    public void skipsPaddingBytes() {
        assertEquals(0x5A, Tlv.parse(Hex.fromHex("0000FF5A0112")).get(0).tag);
    }

    @Test
    public void truncatedValueReturnsParsedPrefix() {
        // ikinci öğe 5 bayt diyor ama 2 bayt var
        List<Tlv> l = Tlv.parse(Hex.fromHex("5A0112" + "5F2405AABB"));
        assertEquals(1, l.size());
        assertEquals(0x5A, l.get(0).tag);
    }

    @Test
    public void halfTagReturnsParsedPrefix() {
        assertEquals(1, Tlv.parse(Hex.fromHex("5A0112" + "9F")).size());
    }
}
