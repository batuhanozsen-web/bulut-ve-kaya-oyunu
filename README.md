# ☁️ Bulut ve Kaya Macerası 🪨

5 yaş civarı çocuklar için, **kamerayla vücut hareketleri** algılanarak oynanan basit bir platform oyunu.
Telefon, tablet ve bilgisayar tarayıcısında çalışır; kurulum gerektirmez.

## Nasıl oynanır?

| Engel | Ne yapmalı? | Yapamazsa ne olur? |
|---|---|---|
| ☁️ **Bulut** (üstten gelir) | Aşağı **eğil** / çömel | Bulut fırtınaya döner (şimşek ve yağmur), sonra geçip gider. Oyun devam eder. |
| 🪨 **Kaya** (yerden gelir) | **Zıpla** ya da **tekme at** (tekme kayayı kırar) | Kaya karakterin üstünden yuvarlanarak geçer. Oyun devam eder. |

- Oyunda **kaybetmek yok**. Her başarı ⭐ kazandırır, her 10 yıldızda konfeti patlar.
- Engel yaklaşınca ekranda büyük bir uyarı çıkar ve Türkçe sesli yönlendirme yapılır ("Bulut geliyor, eğil!").
- Çocuk kadrajdan çıkarsa oyun onu bekler ("Seni göremiyorum 👀").
- Kamerasız oynamak için **Dokunarak Oyna** modu vardır (Eğil / Zıpla / Tekme düğmeleri).
- Klavye: `↓` eğil, `↑` / boşluk zıpla, `→` tekme, `P` mola.

## Çalıştırma

Kamera erişimi için tarayıcılar sayfanın **https** ya da **localhost** üzerinden açılmasını ister.

**Bilgisayarda (en kolayı):**

```bash
cd mobile-game
python3 -m http.server 8000
# tarayıcıda: http://localhost:8000
```

**Telefonda / tablette:** Klasörü https veren bir yerde yayınlayın. Örneğin GitHub Pages
(repo → Settings → Pages → dal ve klasör seçimi) ya da Netlify / Vercel'e sürükle-bırak.
Sonra adresi telefonda açıp **Kamerayla Oyna**'ya dokunun ve kamera iznini verin.

İnternet bağlantısı gerekir: hareket algılama kütüphanesi (MediaPipe) ve modeli ilk açılışta indirilir.

### Tek dosyalık sürüm

`bulut-ve-kaya-macerasi.html`, oyunun tüm CSS ve JS'i içine gömülü tek dosyalık halidir.
Paylaşmak ya da bir yere yüklemek için bu dosya yeterlidir. Bilgisayarda çift tıklayarak açılabilir.
Telefonda kamera için yine https bir adresten açılması gerekir.

Kaynak dosyalarda (`index.html`, `style.css`, `js/`) değişiklik yaptıktan sonra tek dosyayı yenileyin:

```bash
python3 tek_dosya_olustur.py
```

## Kurulum ipuçları (ebeveyn için)

1. Cihazı **yatay** ve bel hizasında sabitleyin, ön kamera çocuğa baksın.
2. Çocuk **2–3 adım** geride dursun; başından ayaklarına kadar görünsün.
3. İlk ekranda birkaç saniye dik durması yeterli; oyun kendi duruşuna göre ayar yapar.
4. Algılama kaçarsa sağ üstteki 🎯 düğmesiyle yeniden ayar yapabilirsiniz.
5. Kamera görüntüsü **cihazdan dışarı gönderilmez**; tüm işlem tarayıcı içinde yapılır.

## Hareket algılama nasıl çalışıyor?

`js/pose.js`, MediaPipe Pose Landmarker (lite model) ile her karede 33 vücut noktası bulur.
Başlangıçta çocuğun dik duruşu kaydedilir. Tüm eşikler, çocuğun **gövde boyuna** (omuz → kalça) oranla
hesaplanır. Böylece kameraya uzaklık fark etmez.

| Hareket | Kural |
|---|---|
| Eğilme | Omuzlar ya da burun, gövde boyunun ≈ %35'i kadar aşağı indi |
| Zıplama | Kalça **ve** omuzlar birlikte ≈ %15 yükseldi |
| Tekme | Bir diz kalçaya doğru kalktı ya da iki ayak bileği arasında büyük yükseklik farkı oluştu |

Eşikler `js/pose.js` dosyasının başındaki sabitlerden kolayca ayarlanabilir.

## Dosyalar

```
mobile-game/
├── bulut-ve-kaya-macerasi.html  tek dosyalık sürüm (otomatik üretilir)
├── tek_dosya_olustur.py         tek dosyalık sürümü üreten betik
├── index.html     ekranlar (başlangıç, ayar, mola) ve kontroller
├── style.css      arayüz stilleri
└── js/
    ├── game.js    oyun döngüsü, karakter/engel çizimi, kurallar ve efektler
    ├── pose.js    kameradan hareket algılama
    └── audio.js   ses efektleri (WebAudio) ve Türkçe sesli yönlendirme
```

Tüm grafikler kodla çizilir; ek görsel ya da ses dosyası yoktur.
