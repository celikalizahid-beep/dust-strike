package com.nfckart.okuyucu.emv;

import java.io.IOException;

/** Karta bir APDU komutu gönderip yanıtını (durum kodu dahil) döndürür. */
public interface Transceiver {
    byte[] transceive(byte[] apdu) throws IOException;
}
