package com.nfckart.okuyucu;

import android.view.View;
import android.widget.TextView;

import com.nfckart.okuyucu.emv.Labels;

/** view_card.xml içindeki alanları doldurur. Hem okuma ekranı hem kayıtlı liste aynı yardımcıyı kullanır. */
final class CardViews {
    private CardViews() {}

    /** {@code root}, view_card düzenini içeren bir görünümdür (okuma ekranının kendisi ya da bir liste öğesi). */
    static void bind(View root, String cardType, String pan, String expiry, String holderName) {
        ((TextView) root.findViewById(R.id.cardType)).setText(cardType != null ? cardType : "");
        ((TextView) root.findViewById(R.id.pan)).setText(Labels.groupPan(pan));
        ((TextView) root.findViewById(R.id.expiry)).setText(expiry != null ? expiry : "—");
        View holderBox = root.findViewById(R.id.holderBox);
        if (holderName != null) {
            ((TextView) root.findViewById(R.id.holder)).setText(holderName);
            holderBox.setVisibility(View.VISIBLE);
        } else {
            holderBox.setVisibility(View.GONE);
        }
    }
}
