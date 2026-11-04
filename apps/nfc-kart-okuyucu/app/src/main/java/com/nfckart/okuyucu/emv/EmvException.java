package com.nfckart.okuyucu.emv;

/** Kart okunabildi ama ödeme bilgisi çıkarılamadı; mesaj kullanıcıya gösterilecek Türkçe metindir. */
public final class EmvException extends Exception {
    private static final long serialVersionUID = 1L;

    public EmvException(String message) {
        super(message);
    }
}
