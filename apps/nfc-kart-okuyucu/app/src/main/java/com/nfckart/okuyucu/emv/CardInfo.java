package com.nfckart.okuyucu.emv;

/** Karttan okunan temel bilgiler. */
public final class CardInfo {
    /** Yalnızca rakamlar. */
    public final String pan;
    /** "AA/YY" ya da bilinmiyorsa {@code null}. */
    public final String expiry;
    /** Hiçbir zaman {@code null} değil. */
    public final String cardType;
    /** Kartta yoksa {@code null}. */
    public final String holderName;
    /** ISO 3166 sayısal kod, ör. "792"; yoksa {@code null}. */
    public final String countryCode;
    /** ISO 4217 sayısal kod, ör. "949"; yoksa {@code null}. */
    public final String currencyCode;
    /** Seçilen uygulamanın AID'i (hex). */
    public final String aid;

    public CardInfo(String pan, String expiry, String cardType, String holderName,
            String countryCode, String currencyCode, String aid) {
        this.pan = pan;
        this.expiry = expiry;
        this.cardType = cardType;
        this.holderName = holderName;
        this.countryCode = countryCode;
        this.currencyCode = currencyCode;
        this.aid = aid;
    }
}
