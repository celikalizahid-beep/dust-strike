# NFC Kart Okuyucu

Temassız banka kartının (ör. Papara Mastercard kart ya da sticker) NFC ile okunabilen temel bilgilerini
gösteren küçük bir Android uygulaması. Kendi kartını kontrol etmek için yapıldı. Okunan kart, mavi-siyah
temalı bir kart görseliyle gösterilir; istersen cihazına kaydedip sonra tekrar bakabilirsin.

- **İnternet izni yok.** Okunan ya da kaydedilen bilgi telefondan dışarı çıkmaz, hiçbir yere gönderilmez.
- Ek kütüphane kullanmaz, Android 5.0 ve üzerinde çalışır. Telefonda NFC olmalı.

## İndirme

**APK:** <https://github.com/celikalizahid-beep/dust-strike/releases/download/nfc-kart-okuyucu/NFCKartOkuyucu.apk>

APK'yı GitHub Actions derler (`.github/workflows/nfc-kart-okuyucu.yml`). Bu klasörde bir değişiklik
gönderildiğinde ya da GitHub > Actions > "NFC Kart Okuyucu derle" > **Run workflow** ile elle
başlatıldığında yeniden derlenir ve yukarıdaki bağlantı en son sürümü verir.

## Kurulum

1. Bağlantıyı telefonda aç ve `NFCKartOkuyucu.apk` dosyasını indir.
2. İndirilen dosyaya dokun. "Bilinmeyen uygulamaları yükle" izni sorulursa, tarayıcın (ya da Dosyalar
   uygulaması) için izin ver.
3. Play Protect uyarı verirse **Yine de yükle**'ye dokun (uygulama Play Store'dan gelmediği için uyarır).

**Güncelleme:** Her derleme farklı bir geliştirici (debug) anahtarıyla imzalanır. Yeni sürüm "uygulama
yüklenmedi" hatası verirse önce eski sürümü kaldır, sonra yenisini kur.

## Kullanım

1. NFC'yi aç (Ayarlar > Bağlı cihazlar / Bağlantılar > NFC). Kapalıysa uygulama seni ayara götüren bir
   düğme gösterir.
2. Uygulamayı aç ve kartı telefonun **arkasına** yaklaştır. NFC anteni genelde kameranın altında ya da
   telefonun ortasındadır.
3. Kartı **2–3 saniye** kıpırdatmadan tut. Bilgiler ekrana gelir; **Kopyala** ile kart numarasını
   panoya alabilirsin (Android 13 ve üzerinde pano önizlemesinde gizlenir).

"Kart erken uzaklaştı" mesajı gelirse kartı biraz daha uzun ve sabit tut.

### Kartı kaydetme

Okuma sonrası kart görselinin altındaki **Kaydet** düğmesine dokun. İstersen karta kısa bir **isim**
ver (ör. "Papara", "Maaş kartı"); boş bırakabilirsin. Kaydedilenlere ana ekrandaki **Kayıtlı kartlar**
düğmesinden bakarsın; her kartın yanındaki **Sil** ile kaldırabilirsin.

- Kayıtlar telefonun **yalnızca bu uygulamaya ait** özel alanında tutulur; başka uygulamalar erişemez,
  internete gönderilmez. Uygulamayı kaldırınca kayıtlar da silinir.
- Kayıtlı listede kart numarası **tam** görünür. Telefonunu başkalarıyla paylaşıyorsan bunu göz önünde
  bulundur.
- Uygulama kartı **yalnızca okur ve senin için saklar**; kaydedilen kartı bir ödeme cihazına ya da başka
  bir telefona *karta benziyormuş gibi* okutmak mümkün değildir (ve bu uygulama bunu yapmaz).

### Sticker'ı okutmak

Telefona yapıştırılan ödeme stickerlarının arkasında, telefonun kendi NFC'sini etkilememesi için
genelde bir **kalkan (ferrit) katman** bulunur. Bu yüzden telefon, kendi kılıfındaki sticker'ı büyük
ihtimalle **okuyamaz**. Okutmak için:

- Kılıfı çıkar ve sticker'ın **ön yüzünü** (Papara/Mastercard yazan tarafı) telefonun arkasına tut, ya da
- Uygulamayı **başka bir telefona** kurup sticker'ı o telefona okut.

## Ne okunur, ne okunamaz

| Okunur | Okunamaz |
| --- | --- |
| Kart numarası | CVV / CVC (kartın arkasındaki 3 hane) |
| Son kullanma tarihi | PIN |
| Kart tipi (ör. Debit Mastercard) | Bakiye (Papara bakiyesi kartta değil, Papara'nın sunucusunda tutulur) |
| Ülke ve para birimi | |
| Kart sahibi adı (yalnızca kartta yazılıysa; Papara'da genelde yok) | |

## Geliştirme

EMV okuma mantığı `app/src/main/java/com/nfckart/okuyucu/emv/` altında, Android'den bağımsız düz Java'dır.
Testler ve APK (Android SDK gerekir):

```bash
./gradlew testDebugUnitTest assembleDebug
```
