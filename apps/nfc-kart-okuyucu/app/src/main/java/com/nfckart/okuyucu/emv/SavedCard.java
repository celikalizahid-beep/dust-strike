package com.nfckart.okuyucu.emv;

/** Kullanıcının cihazına kaydettiği bir kart: okunan bilgiler + kullanıcı etiketi + kayıt zamanı. */
public final class SavedCard {
    /** Kullanıcının verdiği isim; boş olabilir ama {@code null} olmaz. */
    public final String label;
    public final String pan;
    public final String expiry;
    public final String cardType;
    public final String holderName;
    public final String countryCode;
    public final String currencyCode;
    public final String aid;
    /** Kayıt anı (epoch milisaniye). */
    public final long savedAt;

    public SavedCard(String label, String pan, String expiry, String cardType, String holderName,
            String countryCode, String currencyCode, String aid, long savedAt) {
        this.label = label == null ? "" : label;
        this.pan = pan;
        this.expiry = expiry;
        this.cardType = cardType;
        this.holderName = holderName;
        this.countryCode = countryCode;
        this.currencyCode = currencyCode;
        this.aid = aid;
        this.savedAt = savedAt;
    }

    /** Okunan bir karttan, verilen etiket ve zamanla kaydedilecek kart oluşturur. */
    public static SavedCard from(CardInfo info, String label, long savedAt) {
        return new SavedCard(label, info.pan, info.expiry, info.cardType, info.holderName,
                info.countryCode, info.currencyCode, info.aid, savedAt);
    }
}
