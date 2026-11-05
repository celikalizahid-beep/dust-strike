package com.nfckart.okuyucu;

import android.app.Activity;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.nfckart.okuyucu.emv.Labels;
import com.nfckart.okuyucu.emv.SavedCard;

import java.text.DateFormat;
import java.util.Date;
import java.util.List;

/** Cihaza kaydedilmiş kartları kart görseliyle listeler; her birinde Sil düğmesi vardır. */
public class SavedCardsActivity extends Activity {
    private CardRepository repo;
    private LinearLayout list;
    private TextView empty;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_saved);
        repo = new CardRepository(this);
        list = findViewById(R.id.list);
        empty = findViewById(R.id.empty);
    }

    @Override
    protected void onResume() {
        super.onResume();
        render();
    }

    private void render() {
        // empty dışındaki tüm kart öğelerini temizle, sonra yeniden kur.
        for (int i = list.getChildCount() - 1; i >= 0; i--) {
            if (list.getChildAt(i) != empty) {
                list.removeViewAt(i);
            }
        }
        List<SavedCard> cards = repo.all();
        empty.setVisibility(cards.isEmpty() ? View.VISIBLE : View.GONE);

        LayoutInflater inflater = getLayoutInflater();
        DateFormat fmt = DateFormat.getDateInstance(DateFormat.MEDIUM);
        for (int i = 0; i < cards.size(); i++) {
            SavedCard c = cards.get(i);
            View item = inflater.inflate(R.layout.item_saved_card, (ViewGroup) list, false);

            TextView label = item.findViewById(R.id.itemLabel);
            if (c.label.isEmpty()) {
                label.setVisibility(View.GONE);
            } else {
                label.setText(c.label);
            }
            CardViews.bind(item, c.cardType, c.pan, c.expiry, c.holderName);
            String meta = Labels.country(c.countryCode) + " · " + Labels.currency(c.currencyCode);
            ((TextView) item.findViewById(R.id.savedAt)).setText(fmt.format(new Date(c.savedAt)) + " · " + meta);

            final int index = i;
            item.findViewById(R.id.delete).setOnClickListener(v -> {
                repo.deleteAt(index);
                Toast.makeText(this, R.string.deleted, Toast.LENGTH_SHORT).show();
                render();
            });
            list.addView(item);
        }
    }
}
