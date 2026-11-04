package com.nfckart.okuyucu;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Intent;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.os.Build;
import android.os.Bundle;
import android.os.PersistableBundle;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import com.nfckart.okuyucu.emv.CardInfo;
import com.nfckart.okuyucu.emv.EmvException;
import com.nfckart.okuyucu.emv.EmvReader;
import com.nfckart.okuyucu.emv.Labels;

import java.io.IOException;

/** NFC okuyucu modunu açar, yaklaştırılan kartı okur ve bilgilerini gösterir. Hiçbir veri kaydedilmez. */
public class MainActivity extends Activity {
    private static final int READER_FLAGS = NfcAdapter.FLAG_READER_NFC_A
            | NfcAdapter.FLAG_READER_NFC_B
            | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK;
    private static final int TIMEOUT_MS = 5000;

    private NfcAdapter nfc;
    private boolean readerEnabled;
    private String currentPan;

    private TextView status;
    private Button nfcSettings;
    private View result;
    private TextView pan;
    private TextView expiry;
    private TextView cardType;
    private View holderRow;
    private TextView holder;
    private TextView country;
    private TextView currency;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        status = findViewById(R.id.status);
        nfcSettings = findViewById(R.id.nfcSettings);
        result = findViewById(R.id.result);
        pan = findViewById(R.id.pan);
        expiry = findViewById(R.id.expiry);
        cardType = findViewById(R.id.cardType);
        holderRow = findViewById(R.id.holderRow);
        holder = findViewById(R.id.holder);
        country = findViewById(R.id.country);
        currency = findViewById(R.id.currency);

        nfcSettings.setOnClickListener(v -> openNfcSettings());
        findViewById(R.id.copy).setOnClickListener(v -> copyPan());

        nfc = NfcAdapter.getDefaultAdapter(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (nfc == null) {
            status.setText(R.string.no_nfc);
            nfcSettings.setVisibility(View.GONE);
            return;
        }
        if (!nfc.isEnabled()) {
            status.setText(R.string.nfc_off);
            nfcSettings.setVisibility(View.VISIBLE);
            return;
        }
        nfcSettings.setVisibility(View.GONE);
        if (result.getVisibility() != View.VISIBLE) {
            status.setText(R.string.hint);
        }
        nfc.enableReaderMode(this, this::onTag, READER_FLAGS, null);
        readerEnabled = true;
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (readerEnabled) {
            nfc.disableReaderMode(this);
            readerEnabled = false;
        }
    }

    /** Okuyucu iş parçacığında çağrılır (arayüz iş parçacığı değil). */
    private void onTag(Tag tag) {
        IsoDep isoDep = IsoDep.get(tag);
        if (isoDep == null) {
            showError(getString(R.string.not_payment_card));
            return;
        }
        runOnUiThread(() -> status.setText(R.string.reading));
        try {
            isoDep.connect();
            isoDep.setTimeout(TIMEOUT_MS);
            CardInfo info = new EmvReader(isoDep::transceive).read();
            runOnUiThread(() -> showCard(info));
        } catch (IOException e) {
            // TagLostException dahil: kart okuma bitmeden uzaklaştırıldı.
            showError(getString(R.string.tag_lost));
        } catch (EmvException e) {
            showError(e.getMessage());
        } catch (RuntimeException e) {
            showError(getString(R.string.read_failed, e.getClass().getSimpleName()));
        } finally {
            try {
                isoDep.close();
            } catch (IOException ignored) {
                // Bağlantı zaten kopmuş olabilir.
            }
        }
    }

    private void showCard(CardInfo info) {
        currentPan = info.pan;
        pan.setText(Labels.groupPan(info.pan));
        expiry.setText(info.expiry != null ? info.expiry : "—");
        cardType.setText(info.cardType);
        if (info.holderName != null) {
            holder.setText(info.holderName);
            holderRow.setVisibility(View.VISIBLE);
        } else {
            holderRow.setVisibility(View.GONE);
        }
        country.setText(Labels.country(info.countryCode));
        currency.setText(Labels.currency(info.currencyCode));
        result.setVisibility(View.VISIBLE);
        status.setText(R.string.read_ok);
    }

    private void showError(String message) {
        runOnUiThread(() -> {
            currentPan = null;
            result.setVisibility(View.GONE);
            status.setText(message);
        });
    }

    private void copyPan() {
        if (currentPan == null) {
            return;
        }
        ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        ClipData clip = ClipData.newPlainText(getString(R.string.clip_label), currentPan);
        if (Build.VERSION.SDK_INT >= 33) {
            // Android 13+: pano önizlemesinde numarayı gizler; sistem kendi "kopyalandı" bildirimini gösterir.
            PersistableBundle extras = new PersistableBundle();
            extras.putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true);
            clip.getDescription().setExtras(extras);
        }
        clipboard.setPrimaryClip(clip);
        if (Build.VERSION.SDK_INT < 33) {
            Toast.makeText(this, R.string.copied, Toast.LENGTH_SHORT).show();
        }
    }

    private void openNfcSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_NFC_SETTINGS));
        } catch (ActivityNotFoundException e) {
            startActivity(new Intent(Settings.ACTION_WIRELESS_SETTINGS));
        }
    }
}
