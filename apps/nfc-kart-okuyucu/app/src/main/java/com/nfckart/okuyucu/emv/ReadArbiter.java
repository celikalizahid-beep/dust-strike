package com.nfckart.okuyucu.emv;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Birbiriyle yarışan kart okumalarında yalnızca en son başlayan okumanın arayüzü güncellemesini sağlar.
 *
 * <p>NFC okuyucu modu, bir okuma bitmeden (kart kıpırdayıp yeniden algılanınca) {@code onTag}'i tekrar
 * çağırabilir; bu durumda geç biten eski bir okuma, daha yeni bir okumanın ekrandaki sonucunu ezmemelidir.
 * Her okuma {@link #begin()} ile bir belirteç alır ve ekranı güncellemeden önce {@link #isCurrent(int)}
 * ile hâlâ en güncel okuma olup olmadığını denetler.
 */
public final class ReadArbiter {
    private final AtomicInteger latest = new AtomicInteger();

    /** Yeni bir okuma başlatır ve bu okumaya ait belirteci döndürür. */
    public int begin() {
        return latest.incrementAndGet();
    }

    /** Verilen belirteç hâlâ en son başlayan okumaya mı ait? */
    public boolean isCurrent(int token) {
        return token == latest.get();
    }
}
