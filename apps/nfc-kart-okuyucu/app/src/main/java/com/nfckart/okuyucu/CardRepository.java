package com.nfckart.okuyucu;

import android.content.Context;
import android.content.SharedPreferences;

import com.nfckart.okuyucu.emv.CardStore;
import com.nfckart.okuyucu.emv.SavedCard;

import java.util.List;

/**
 * Kaydedilen kartları telefonun yalnızca bu uygulamaya ait (MODE_PRIVATE) alanında saklar.
 * İnternet kullanılmaz; veriler cihazdan çıkmaz ve uygulama silinince gider.
 */
final class CardRepository {
    private static final String PREFS = "nfc_kart_okuyucu";
    private static final String KEY = "cards";

    private final SharedPreferences prefs;

    CardRepository(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    List<SavedCard> all() {
        return CardStore.deserialize(prefs.getString(KEY, ""));
    }

    void add(SavedCard card) {
        List<SavedCard> cards = all();
        cards.add(card);
        save(cards);
    }

    void deleteAt(int index) {
        List<SavedCard> cards = all();
        if (index >= 0 && index < cards.size()) {
            cards.remove(index);
            save(cards);
        }
    }

    private void save(List<SavedCard> cards) {
        prefs.edit().putString(KEY, CardStore.serialize(cards)).apply();
    }
}
